import {parseArgs} from 'node:util';
import pc from 'picocolors';
import {branch, Break, Cancel, consoleIO, pipeline, Success, tag} from '../utils/index.js';

export async function runClean(args = {}) {
    const {values} = parseArgs({
        options: {
            'include-remote': {
                type: 'boolean',
                short: 'r'
            }
        },
        strict: false
    });

    const includeRemote = !!values['include-remote'];

    consoleIO.help('--include-remote', 'Analiza y trae las ramas y etiquetas directamente desde el servidor remoto.');

    await pipeline()
        .do(async () => {
            return await tag.list(includeRemote);
        })
        .do(async () => {
            // Pasamos las exclusiones y el flag al lector de ramas
            return await branch.list(['main', 'master', 'develop'], includeRemote);
        })
        .do(async (ctx) => {
            const hasBranches = ctx.branches && ctx.branches.length > 0;
            const hasTags = ctx.tags && ctx.tags.length > 0;

            if (!hasBranches && !hasTags) {
                return Break('', {skipped: true});
            }

            const groups = {};

            if (hasBranches) {
                groups['Ramas (Branches)'] = ctx.branches.map(name => ({
                    label: name,
                    value: {type: 'branch', name}
                }));
            }

            if (hasTags) {
                groups['Etiquetas (Tags)'] = ctx.tags.map(name => ({
                    label: name,
                    value: {type: 'tag', name}
                }));
            }

            const {canceled, selected} = await consoleIO.groupMultiselect({
                message: 'Seleccione los objetos que desea eliminar permanentemente:',
                options: groups,
                required: true
            });

            if (canceled) return Cancel();
            return Success({targets: selected, skipped: false});
        })
        .do(async (ctx) => {
            const {canceled, confirm} = await consoleIO.confirm(
                `¿Está seguro de que desea eliminar ${ctx.targets.length} objetos de forma irreversible?`,
                false
            );

            if (canceled || !confirm) return Cancel('Operación de limpieza abortada por el usuario.');
            return Success();
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
                consoleIO.step('Eliminando etiquetas locales y del servidor...');
                const responseTags = await tag.delete(targetTags);
                if (responseTags.error) return responseTags;
            }

            return Success();
        })
        .onSuccess((ctx) => {
            if (ctx.skipped) {
                consoleIO.success('El repositorio ya está depurado. No se requería ninguna acción.');
            }

            const total = ctx.targets.length;
            const suffix = total === 1 ? 'objeto' : 'objetos';

            consoleIO.success(`Depuración finalizada correctamente. Se eliminaron ${total} ${suffix}.`);
        })
        .onError((error) => {
            consoleIO.error(error.message, error.code);
        })
        // Inyectamos el flag en el contexto inicial del pipeline por consistencia técnica
        .run({includeRemote});
}