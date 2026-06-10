import pc from 'picocolors';
import {Cancel, consoleIO, Failure, pipeline, Skip, stash, Success} from '../utils/index.js'; // Importación desde el índice de utilidades que contiene tu clase Stash

export async function runStashBoard(args = []) {
    const validActions = ['pop', 'apply', 'drop', 'clean', 'inspect'];
    const passedAction = args[0];

    const passedIndex = args[1] !== undefined ? parseInt(args[1], 10) : null;

    if (passedIndex !== null && isNaN(passedIndex)) {
        consoleIO.error(`El índice del stash debe ser un número entero válido.`);
        process.exit(1);
    }

    await pipeline()
        .do(async () => {
            const listRes = await stash.list();
            if (listRes.error) return listRes;
            return Success({stashes: listRes.stashes});
        })
        .do(async (ctx) => {

            consoleIO.step('Stash Area:');
            ctx.stashes.forEach(s => {
                console.log(`  ${pc.yellow(`stash@{${s.index}}`)} [${pc.blue(s.branch)}]: ${pc.dim(s.message)}`);
            });

            const isEmpty = ctx.stashes.length === 0;
            if (isEmpty) {
                return Skip('El stash está vacio. Nada que hacer');
            }
            return Success();
        })
        .do(async (ctx) => {

            if (!validActions.includes(ctx.action)) {
                consoleIO.info(`Acción no reconocida: "${ctx.action}". Opciones válidas: ${validActions.join(', ')}`);
                ctx.action = null;
            }

            if (ctx.action !== null) {

                return Success()
            }


            const {canceled, selected} = await consoleIO.select({
                message: 'Seleccione la operación que desea realizar:',
                options: [
                    {value: 'inspect', label: 'Inspect', hint: 'Inspeccionar los cambios de un stash específico'},
                    {value: 'apply', label: 'Apply', hint: 'Aplicar modificaciones y conservar la copia'},
                    {value: 'pop', label: 'Pop', hint: 'Aplicar modificaciones y eliminarlas del stash'},
                    {value: 'drop', label: 'Drop', hint: 'Eliminar un stash específico de forma permanente'},
                    {value: 'clean', label: 'Clean', hint: 'Vaciar por completo el almacén de stash'}
                ]
            });

            if (canceled) return Cancel();
            return Success({action: selected});
        })
        .do(async (ctx) => {
            if (ctx.targetIndex !== null) {
                return Success()
            }

            // if(ctx.stashes.length === 1){
            //     const index = ctx.stashes[0].index
            //     return Success({targetIndex: index});
            // }

            const options = ctx.stashes.map(s => ({
                value: s.index,
                label: `stash@{${s.index}}`,
                hint: `[${pc.blue(s.branch)}]: ${pc.dim(s.message)}`
            }));

            const {canceled, selected} = await consoleIO.select({
                message: `Seleccione el stash para aplicar la acción [${ctx.action.toUpperCase()}]:`,
                options
            });

            if (canceled) return Cancel();
            return Success({targetIndex: selected});
        })
        .do(async (ctx) => {
            if (ctx.action === 'clean') {
                return Success();
            }

            if (ctx.targetIndex !== null) {
                const targetExists = ctx.stashes.some(s => s.index === ctx.targetIndex);
                if (!targetExists) {
                    return Failure(1, `No existe la referencia de stash con el índice: stash@{${ctx.targetIndex}}`);
                }
            }

            return Success()
        })
        .do(async (ctx) => {
            return Success()
        })
        .do(async (ctx) => {
            const {action, targetIndex} = ctx;

            switch (action) {
                case 'inspect': {
                    const inspectRes = await stash.inspect(targetIndex);
                    if (inspectRes.error) return inspectRes;

                    consoleIO.step(`Historial de diferencias (Diff Patch) de stash@{${targetIndex}}:`);
                    console.log(inspectRes.diff);
                    return Success();
                }
                case 'apply':
                    consoleIO.step(`Aplicando modificaciones de stash@{${targetIndex}}...`);
                    return await stash.apply(targetIndex);
                case 'pop':
                    consoleIO.step(`Extrayendo cambios (pop) de stash@{${targetIndex}}...`);
                    return await stash.pop(targetIndex);
                case 'drop':
                    consoleIO.step(`Borrando permanentemente stash@{${targetIndex}}...`);
                    return await stash.drop(targetIndex);
                case 'clean':
                    const {canceled, confirm} = await consoleIO.confirm(
                        pc.red('ATENCIÓN: Se eliminará por completo el stash de este repositorio. ¿Confirmar acción destructiva?'),
                        false
                    );
                    if (canceled || !confirm) return Cancel();

                    consoleIO.step('Vaciando el stash...');
                    return await stash.clean();


                default:
                    return Failure(1, 'Flujo de acción no resuelto.');
            }
        })
        .onSuccess((ctx) => {
            if (ctx.skipped) return;
            const msg = ctx.exit === -1
                ? ctx.error.message
                : 'Operación sobre el stash finalizada correctamente.'

            consoleIO.success(msg);
        })
        .onError((error) => {
            consoleIO.error(error.message, error.code);
        })
        .run({stashes: [], action: passedAction, targetIndex: passedIndex, validActions});
}