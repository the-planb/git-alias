import pc from 'picocolors';
import { stage } from '../utils/stage.js';
import { consoleIO, Failure, Success } from '../utils/index.js';

export async function runStageBoard(args = []) {
    consoleIO.step('Iniciando panel interactivo del Área de Preparación (Stage Board)...');

    while (true) {
        const statusRes = await stage.getStatusGroups();
        if (statusRes.error) {
            consoleIO.error(statusRes.message);
            process.exit(1);
        }

        const groups = statusRes.data;
        const totalFiles = Object.values(groups).flat().length;

        if (totalFiles === 0) {
            consoleIO.success('El área de trabajo y el área de preparación están completamente limpias.');
            break;
        }

        const { canceled, selected } = await consoleIO.groupMultiselect({
            message: 'Seleccione los ficheros que desea gestionar (Espacio para marcar, Enter para confirmar):',
            options: groups
        });

        // La cancelación voluntaria en la lista actúa como salida natural del comando interactivo
        if (canceled) {
            consoleIO.success('Saliendo del Área de Preparación. ¡Modificaciones guardadas!');
            break;
        }

        if (!selected || selected.length === 0) {
            consoleIO.error('Debe seleccionar al menos un fichero para poder realizar una acción.');
            continue;
        }

        const { canceled: actionCanceled, selected: action } = await consoleIO.select({
            message: `¿Qué acción desea aplicar sobre los ${selected.length} ficheros seleccionados?`,
            options: [
                { value: 'stage', label: 'Stage', hint: 'Añadir al index para el commit (git add)' },
                { value: 'unstage', label: 'Unstage', hint: 'Quitar del index temporalmente (git restore --staged)' },
                { value: 'discard', label: 'Discard', hint: 'Descartar cambios de forma permanente (¡Irreversible!)' },
                { value: 'ignore', label: 'Ignore', hint: 'Añadir nombres y rutas al final de .gitignore' },
                { value: 'unignore', label: 'Unignore', hint: 'Quitar las líneas declaradas del fichero .gitignore' }
            ]
        });

        if (actionCanceled) {
            continue; // Re-evaluar y volver al selector de ficheros sin alterar nada
        }

        let actionError = false;

        switch (action) {
            case 'stage': {
                consoleIO.step(`Preparando (Stage) ${selected.length} fichero(s)...`);
                const res = await stage.stage(selected);
                if (res.error) {
                    consoleIO.error(res.message);
                    actionError = true;
                }
                break;
            }

            case 'unstage': {
                consoleIO.step(`Retirando (Unstage) ${selected.length} fichero(s)...`);
                const res = await stage.unstage(selected);
                if (res.error) {
                    consoleIO.error(res.message);
                    actionError = true;
                }
                break;
            }

            case 'discard': {
                // Separamos entre tracked y untracked para operar con precisión quirúrgica
                const untrackedSelected = selected.filter(f =>
                    groups.Untracked && groups.Untracked.some(item => item.value === f)
                );
                const trackedSelected = selected.filter(f =>
                    !untrackedSelected.includes(f)
                );

                const { confirm } = await consoleIO.confirm(
                    pc.red(`ATENCIÓN: ¿Seguro que desea descartar los cambios en estos ${selected.length} fichero(s)? Esta acción es destructiva e irreversible.`),
                    false
                );

                if (confirm) {
                    consoleIO.step('Descartando cambios del espacio de trabajo...');

                    if (trackedSelected.length > 0) {
                        const res = await stage.discard(trackedSelected, false);
                        if (res.error) {
                            consoleIO.error(res.message);
                            actionError = true;
                        }
                    }
                    if (untrackedSelected.length > 0) {
                        const res = await stage.discard(untrackedSelected, true);
                        if (res.error) {
                            consoleIO.error(res.message);
                            actionError = true;
                        }
                    }
                } else {
                    consoleIO.step('Operación de descarte abortada.');
                }
                break;
            }

            case 'ignore': {
                consoleIO.step(`Añadiendo ${selected.length} fichero(s) a .gitignore...`);
                const res = await stage.ignore(selected);
                if (res.error) {
                    consoleIO.error(res.message);
                    actionError = true;
                } else {
                    // Si los ficheros se ignoran pero estaban en el Staged Area, Git requiere hacerles unstage
                    const stagedToUnstage = selected.filter(f =>
                        groups.Staged && groups.Staged.some(item => item.value === f)
                    );
                    if (stagedToUnstage.length > 0) {
                        consoleIO.step('Retirando ficheros recién ignorados del área de preparación...');
                        await stage.unstage(stagedToUnstage);
                    }
                }
                break;
            }

            case 'unignore': {
                consoleIO.step(`Quitando ${selected.length} de .gitignore...`);
                const res = await stage.unignore(selected);
                if (res.error) {
                    consoleIO.error(res.message);
                    actionError = true;
                }
                break;
            }
        }

        if (!actionError) {
            consoleIO.success('Operación completada con éxito.');
        }
        console.log(''); // Margen visual estético antes de pintar la actualización del status
    }

    return Success();
}
