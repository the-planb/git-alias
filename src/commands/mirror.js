import {parseArgs} from 'node:util';
import {branch, consoleIO, Failure, pipeline, stash, Success} from '../utils/index.js';

async function executeMirror(ctx) {
    await pipeline()
        .do(async ({target}) => {
            // El método askForTarget interno ya se encarga de aislar la rama actual (current)
            return await branch.askForTarget(target);
        })
        .do(async ({target, current, direction}) => {
            const {from, to} = direction === 'from'
                ? {from: target, to: current}
                : {from: current, to: target}

            return Success({from, to})
        })
        .do(async ({direction, from}) => {
            if (direction === 'to') {
                return Success()
            }

            const {exists} = await branch.info(from)

            return exists
                ? Success()
                : Failure(1, `La rama ${from} no existe`)
        })
        .do(async (ctx) => {
            return await stash.secure(async () => {

                return pipeline()
                    .do(async ({to, current}) => {
                        if (to === current) return Success()
                        const res = await branch.moveTo(to, true)
                        if (res.error) return res

                        return Success()
                    })
                    .do(async ({from}) => {
                        return await branch.mirror(from)
                    })
                    .do(async ({current, move, to}) => {
                        // Evitamos saltos redundantes si el destino final coincide con la posición actual
                        if (!move && to !== current) {
                            return await branch.moveTo(current)
                        }
                        return Success()
                    })
                    .run(ctx)

            }, ({from, to}) => {
                consoleIO.milestone(`Rama ${from} replicada en ${to}`)
            })
        })
        .onSuccess(() => {
            consoleIO.success();
        })
        .onError(async (error, ctx) => {
            await stash.cancel(ctx);
            consoleIO.error(error.message, error.code);
        })
        .run(ctx);
}

function manageArgs(args = []) {
    const {values, positionals} = parseArgs({
        args,
        options: {
            'switch': {
                type: 'boolean',
                short: 's'
            }
        },
        allowPositionals: true,
        strict: true
    });

    return {
        move: values.switch,
        target: positionals[0]
    }
}

export async function runMirrorTo(args = []) {
    return await executeMirror({direction: 'to', ...manageArgs(args)});
}

export async function runMirrorFrom(args = []) {
    return await executeMirror({direction: 'from', ...manageArgs(args)});
}