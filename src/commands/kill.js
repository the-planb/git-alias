import {parseArgs} from 'node:util';
import {branch, Skip, Cancel, consoleIO, pipeline, Success, tag} from '../utils/index.js';
import pc from 'picocolors';

export async function runKill(args = {}) {
    const {values} = parseArgs({
        args,
        options: {
            'include-remote': {
                type: 'boolean',
                short: 'r'
            }
        },
        allowPositionals: true,
        strict: true
    });

    const includeRemote = !!values['include-remote'];

    consoleIO.help('--include-remote', 'Analiza y recupera las ramas y etiquetas directamente desde el servidor remoto.');

    await pipeline()
        .do(async () => {
            return await tag.list(includeRemote);
        })
        .do(async () => {
            return await branch.list();
        })
        .do(async (ctx) => {
            const hasBranches = ctx.branches && ctx.branches.length > 0;
            const hasTags = ctx.tags && ctx.tags.length > 0;

            if (!hasBranches && !hasTags) {
                return Skip('', {skipped: true});
            }

            const groups = {};

            if (hasBranches) {
                const filteredBranches = includeRemote
                    ? ctx.branches
                    : ctx.branches.filter(b => !b.remote);

                const localBranches = filteredBranches.filter(b => !b.remote && !b.current);
                const remoteBranches = filteredBranches.filter(b => b.remote);

                const localOptions = [];

                localBranches.forEach(b => {
                    const labelDecoration = b.upstream ? ` -> ${pc.blue(b.upstream)}` : '';
                    localOptions.push({
                        label: `${b.label}${labelDecoration}`,
                        value: { type: 'branch', name: b.name, label: b.label, hasUpstream: !!b.upstream }
                    });
                });

                if (localOptions.length > 0) {
                    groups['Ramas Locales (Local Branches)'] = localOptions;
                }

                if (remoteBranches.length > 0) {
                    groups['Ramas Remotas (Remote Branches)'] = remoteBranches.map(b => ({
                        label: b.label,
                        value: { type: 'branch', name: b.name, label: b.label, hasUpstream: false }
                    }));
                }
            }

            if (hasTags) {
                const localTags = ctx.tags.filter(name => !name.startsWith('refs/tags/'));
                const remoteTags = ctx.tags.filter(name => name.startsWith('refs/tags/'));

                if (localTags.length > 0) {
                    groups['Etiquetas Locales (Local Tags)'] = localTags.map(name => ({
                        label: name,
                        value: { type: 'tag', name, label: name }
                    }));
                }

                if (remoteTags.length > 0) {
                    groups['Etiquetas Remotas (Remote Tags)'] = remoteTags.map(name => ({
                        label: name.replace(/^refs\/tags\//, ''),
                        value: { type: 'tag', name, label: name.replace(/^refs\/tags\//, '') }
                    }));
                }
            }

            if (Object.keys(groups).length === 0) {
                return Skip('', {skipped: true});
            }

            const {canceled, selected} = await consoleIO.groupMultiselect({
                message: 'Seleccione los elementos que desea eliminar:',
                options: groups,
                required: true
            });

            if (canceled) return Cancel();
            return Success({initialTargets: selected, skipped: false});
        })
        .do(async (ctx) => {
            const reviewGroups = {};
            const branchesForReview = ctx.initialTargets.filter(t => t.type === 'branch');
            const tagsForReview = ctx.initialTargets.filter(t => t.type === 'tag');

            // Array donde recolectaremos las referencias de los objetos que deben nacer marcados
            const preSelectedValues = [];

            if (branchesForReview.length > 0) {
                reviewGroups['Ramas a eliminar'] = branchesForReview.map(b => {
                    const warning = b.hasUpstream ? ` ${pc.red('[ALERTA: TIENE UPSTREAM REMOTO]')} ` : '';

                    // Si NO tiene upstream, lo añadimos a los valores pre-seleccionados
                    if (!b.hasUpstream) {
                        preSelectedValues.push(b);
                    }

                    return {
                        label: `${b.label}${warning}`,
                        value: b
                    };
                });
            }

            if (tagsForReview.length > 0) {
                reviewGroups['Etiquetas a eliminar'] = tagsForReview.map(t => {
                    // Las etiquetas siempre se pre-seleccionan
                    preSelectedValues.push(t);

                    return {
                        label: t.label,
                        value: t
                    };
                });
            }


            // Invocamos el prompt inyectando 'initialValues'
            const {canceled, selected} = await consoleIO.groupMultiselect({
                message: 'Confirme el listado final (desmarque para conservar referencias o pulse Enter para borrar):',
                options: reviewGroups,
                required: false,
                initialValues: preSelectedValues
            });

            if (canceled) return Cancel('Operación de limpieza cancelada por el usuario.');

            if (selected.length === 0) {
                return Skip('No se confirmó ningún elemento para eliminar.', {skipped: true});
            }

            return Success({targets: selected});
        })
        .do(async (ctx) => {
            const targetBranches = ctx.targets
                .filter(({type}) => type === 'branch')
                .map(({name}) => name);

            if (targetBranches.length > 0) {
                consoleIO.step('Eliminando referencias de ramas locales y remotas...');
                const responseBranches = await branch.delete(targetBranches);
                if (responseBranches.error) return responseBranches;
            }

            const targetTags = ctx.targets
                .filter(({type}) => type === 'tag')
                .map(({name}) => name);

            if (targetTags.length > 0) {
                consoleIO.step('Eliminando etiquetas locales y referencias remotas...');
                const responseTags = await tag.delete(targetTags);
                if (responseTags.error) return responseTags;
            }

            return Success();
        })
        .onSuccess((ctx) => {
            if (ctx.skipped) {
                consoleIO.success('El repositorio se encuentra actualizado. No se realizó ninguna acción de eliminación.');
                return;
            }

            const total = ctx.targets.length;
            const suffix = total === 1 ? 'elemento' : 'elementos';

            consoleIO.success(`Proceso de depuración finalizado. Se eliminaron ${total} ${suffix} correctamente.`);
        })
        .onError((error) => {
            consoleIO.error(error.message, error.code);
        })
        .run({includeRemote});
}