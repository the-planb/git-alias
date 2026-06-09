import {branch, consoleIO, pipeline, stash} from '../utils/index.js';

export async function runSwitchTo(targetBranch) {

    await pipeline()
        .do(async () => {
            return await branch.askForTarget(targetBranch);
        })
        .do(async (ctx) => {
            return await stash.secure(async () => {
                return await branch.moveTo(ctx.target, true)
            }, ({branch, created}) => {
                if (created) {
                    consoleIO.milestone(`Nueva rama local creada y activa: ${branch}`);
                } else {
                    consoleIO.milestone(`Cambio de rama completado. Rama actual: ${branch}`);
                }
            })
        })
        .onSuccess(() => {
            consoleIO.success();
        })
        .onError(async (error, ctx) => {
            await stash.cancel(ctx);
            consoleIO.error(error.message, error.code);
        })
        .run();
}