import pc from 'picocolors';
import fs from 'fs';
import { execa } from 'execa';
import {
    git,
    fixupService,
    consoleIO,
    Success,
    Failure,
    Cancel,
    pipeline
} from '../utils/index.js';

export async function runSmartFixup() {
    consoleIO.step('Iniciando asistente inteligente de unificación (Smart Fixup)...');

    const rollbackStage = async () => {
        try {
            await git.raw(['add', '.']);
        } catch {}
    };

    const handleCancel = async (message) => {
        consoleIO.step(message || 'Restaurando cambios al Stage...');
        await rollbackStage();
    };

    const handleError = async (error) => {
        if (error.message === 'conflict_paused') {
            console.log('');
            console.log(pc.yellow('⚠ El rebase automático se ha pausado debido a conflictos de código.'));
            consoleIO.step('Por favor, resuelva los conflictos manualmente en su editor de código.');
            consoleIO.step(`Al terminar, ejecute ${pc.yellow('git rebase --continue')} para finalizar la unificación.`);
        } else {
            consoleIO.error(error.message, error.code);
            await rollbackStage();
        }
    };

    await pipeline()
        // ==========================================
        // FASE 1: Análisis del Stage y Clasificación
        // ==========================================
        .do(async () => {
            const stageRes = await fixupService.getStagedFiles();
            if (stageRes.error) return stageRes;

            const stagedFiles = stageRes.data;
            if (stagedFiles.length === 0) {
                return Failure(1, 'No hay archivos preparados (staged) en el repositorio. Asegúrese de hacer staging de los cambios que desea unificar.');
            }

            const filesToFix = [];
            const pendingNewFiles = [];
            const deletedFiles = [];

            for (const file of stagedFiles) {
                if (file.type === 'D') {
                    deletedFiles.push(file.path);
                } else if (file.type === 'A') {
                    pendingNewFiles.push(file.path);
                } else {
                    const searchPath = file.type === 'R' ? file.originPath : file.path;
                    const historyRes = await fixupService.getCommitsForFile(searchPath);

                    if (historyRes.error) return historyRes;

                    filesToFix.push({
                        path: file.path,
                        type: file.type,
                        originPath: file.originPath,
                        commits: historyRes.data
                    });
                }
            }

            return Success({ filesToFix, pendingNewFiles, deletedFiles });
        })

        // ==========================================
        // FASE 2: Vaciado del Índice
        // ==========================================
        .do(async () => {
            try {
                await git.raw(['restore', '--staged', '.']);
                return Success();
            } catch (err) {
                return Failure(1, `Error al vaciar temporalmente el índice: ${err.message}`);
            }
        })

        // ==========================================
        // FASE 3: Resolución de Destinos e Interrogatorio
        // ==========================================
        .do(async (ctx) => {
            const { filesToFix, pendingNewFiles } = ctx;
            const commitsToFix = {};

            for (const file of filesToFix) {
                let selectedCommit = null;

                if (file.commits.length === 0) {
                    consoleIO.step(`No se encontró historial previo para: ${pc.cyan(file.path)}. Se tratará como archivo nuevo.`);
                    pendingNewFiles.push(file.path);
                    continue;
                }

                if (file.commits.length === 1) {
                    selectedCommit = file.commits[0];
                    //consoleIO.step(`Auto-asignando ${pc.cyan(file.path)} al único commit candidato: ${pc.yellow(selectedCommit.hash)} (${pc.dim(selectedCommit.message)})`);
                } else {
                    const options = file.commits.map(c => ({
                        value: c.hash,
                        label: `${pc.yellow(c.hash)} (${c.date})`,
                        hint: c.message
                    }));

                    const prompt = await consoleIO.select({
                        message: `Seleccione el commit de destino para unificar los cambios de ${pc.cyan(file.path)}:`,
                        options
                    });

                    if (prompt.canceled) {
                        return Cancel('Operación cancelada por el usuario.');
                    }

                    selectedCommit = file.commits.find(c => c.hash === prompt.selected);
                }

                if (selectedCommit) {
                    if (!commitsToFix[selectedCommit.hash]) {
                        commitsToFix[selectedCommit.hash] = {
                            message: selectedCommit.message,
                            date: selectedCommit.date,
                            files: []
                        };
                    }
                    commitsToFix[selectedCommit.hash].files.push({
                        path: file.path,
                        originPath: file.originPath,
                        type: file.type
                    });
                }
            }

            const activeTargets = Object.keys(commitsToFix);

            for (const newFile of pendingNewFiles) {
                if (activeTargets.length === 0) {
                    consoleIO.step(`El archivo nuevo ${pc.cyan(newFile)} se conservará en el Stage para un commit posterior al no haber commits destino activos.`);
                    continue;
                }

                const options = [
                    { value: 'keep_staged', label: 'Conservar en el Stage', hint: 'Mantener fuera de este rebase para comitear de forma independiente posterior' },
                    ...activeTargets.map(hash => ({
                        value: hash,
                        label: `Unificar en commit destino: ${pc.yellow(hash)}`,
                        hint: commitsToFix[hash].message
                    }))
                ];

                const prompt = await consoleIO.select({
                    message: `¿Qué desea hacer con el archivo nuevo ${pc.cyan(newFile)}?`,
                    options
                });

                if (prompt.canceled) {
                    return Cancel('Operación cancelada por el usuario.');
                }

                if (prompt.selected !== 'keep_staged') {
                    commitsToFix[prompt.selected].files.push({
                        path: newFile,
                        originPath: null,
                        type: 'A'
                    });
                }
            }

            const targetHashes = Object.keys(commitsToFix);

            if (targetHashes.length === 0 && ctx.deletedFiles.length === 0) {
                return Cancel('No se han definido destinos de unificación. Abortando.');
            }

            let rootCommit = null;
            let isRoot = false;

            if (targetHashes.length > 0) {
                const orderRes = await fixupService.getTopologicalOrder(targetHashes);
                if (orderRes.error) return orderRes;

                rootCommit = orderRes.data[0];

                const isRootRes = await fixupService.isRootCommit(rootCommit);
                if (isRootRes.error) return isRootRes;
                isRoot = isRootRes.data;
            }

            return Success({ commitsToFix, targetHashes, rootCommit, isRoot });
        })

        // ==========================================
        // FASE 4: Confirmación y Ejecución de Commits
        // ==========================================
        .do(async (ctx) => {
            const { targetHashes, commitsToFix, pendingNewFiles, deletedFiles } = ctx;

            consoleIO.step('Resumen del plan de unificación (Smart Fixup):');
            for (const hash of targetHashes) {
                const details = commitsToFix[hash];
                console.log(`  ${pc.yellow(`[${hash}]`)} (${details.date}) ${pc.bold(details.message)}`);
                details.files.forEach(f => {
                    const isNew = pendingNewFiles.includes(f.path);
                    if (f.type === 'R') {
                        console.log(`    └─ ${pc.dim(f.originPath)} → ${pc.cyan(f.path)} ${pc.yellow('(Renombrado)')}`);
                    } else {
                        console.log(`    └─ ${pc.cyan(f.path)} ${isNew ? pc.green('(Archivo Nuevo)') : ''}`);
                    }
                });
            }

            if (deletedFiles.length > 0) {
                console.log(`  ${pc.red('[Borrados retroactivos]')} (Se limpiarán del historial durante el rebase usando --exec)`);
                deletedFiles.forEach(f => {
                    console.log(`    └─ ${pc.red(f)}`);
                });
            }
            console.log('');

            const confirmPrompt = await consoleIO.confirm('¿Desea proceder con la ejecución del plan?', true);
            if (confirmPrompt.canceled || !confirmPrompt.confirm) {
                return Cancel('Unificación abortada por el usuario.');
            }

            // Indexamos globalmente todos los archivos para congelar el árbol de cambios reales y renombrados
            try {
                await git.raw(['add', '.']);
            } catch (err) {
                return Failure(1, `Error al preparar el espacio de trabajo global: ${err.message}`);
            }

            // Generamos de forma aislada los commits de fixup
            for (const hash of targetHashes) {
                const fileObjects = commitsToFix[hash].files;
                const filesToStage = [];

                for (const f of fileObjects) {
                    filesToStage.push(f.path);
                    if (f.originPath) {
                        filesToStage.push(f.originPath);
                    }
                }

                try {
                    // git commit --only fuerza una transacción atómica que ignora el resto del Stage global
                    await git.raw([
                        'commit',
                        '--only',
                        `-m`,
                        `fixup! ${hash}`,
                        '--no-verify',
                        '--',
                        ...filesToStage
                    ]);
                } catch (err) {
                    return Failure(1, `Error al realizar el commit de fixup para ${hash}: ${err.message}`);
                }
            }

            // Una vez generados todos los commits de fixup con éxito,
            // liberamos del Stage los archivos que hayamos decidido no meter en esta tanda (como los 'keep_staged')
            try {
                await git.raw(['restore', '--staged', '.']);
            } catch {}

            // Procesar los archivos borrados del índice
            if (deletedFiles.length > 0) {
                try {
                    await git.raw(['rm', '--cached', '--ignore-unmatch', ...deletedFiles]);
                } catch {}
            }

            return Success();
        })

        // ==========================================
        // FASE 5: El Rebase Inteligente
        // ==========================================
        .do(async (ctx) => {
            const { rootCommit, isRoot, deletedFiles } = ctx;

            const rebasePrompt = await consoleIO.confirm('¿Desea iniciar el rebase interactivo automático ahora?', true);
            if (rebasePrompt.canceled || !rebasePrompt.confirm) {
                consoleIO.success('Commits de tipo fixup creados con éxito. Puede ejecutar el rebase manualmente cuando guste.');
                return Success({ rebaseExecuted: false });
            }

            consoleIO.step('Iniciando proceso de rebase automático...');

            // Se añade el flag de configuración '-c merge.directoryRenames=false' para mitigar falsos positivos heurísticos de Git
            const baseArgs = [
                '-c', 'sequence.editor=true',
                '-c', 'merge.directoryRenames=false',
                'rebase', '-i', '--autosquash', '--rebase-merges', '--autostash'
            ];
            const target = isRoot ? '--root' : `${rootCommit}~1`;
            baseArgs.push(target);

            if (deletedFiles.length > 0) {
                const fileList = deletedFiles.join(' ');
                const execCommand = `git rm --cached --ignore-unmatch ${fileList} && git commit --amend --no-edit`;
                baseArgs.push('-exec', execCommand);
            }

            try {
                await execa('git', baseArgs, { stdio: 'inherit' });

                if (deletedFiles.length > 0) {
                    for (const f of deletedFiles) {
                        try {
                            await fs.promises.unlink(f);
                        } catch {}
                    }
                }
                return Success({ rebaseExecuted: true });
            } catch (err) {
                return Failure(1, 'conflict_paused');
            }
        })
        .onSuccess(async (ctx) => {
            if (ctx.error && ctx.error.code === -1) {
                await handleCancel(ctx.error.message);
                return;
            }

            if (ctx.rebaseExecuted) {
                consoleIO.success('Historial unificado y re-estructurado con éxito.');
            }
        })
        .onError(async (error) => {
            await handleError(error);
        })
        .run({ filesToFix: [], pendingNewFiles: [], deletedFiles: [], commitsToFix: {} });
}