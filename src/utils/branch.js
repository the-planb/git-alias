import {Cancel, consoleIO, Failure, git, Success} from './index.js';

export class Branch {

    async info(branchName = null) {
        try {
            const info = await git.branch();
            const target = branchName ?? info.current;

            const current = info.current;
            const all = info.all;
            const others = info.all.filter(b => b !== target);
            const exists = all.includes(target);

            return Success({current, all, others, exists});
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async list(exclude = [], includeRemote = false) {
        try {
            const res = await this.info();
            if (res.error) return res;

            const { all, current } = res;

            const list = all.filter(b => {
                if (b === current) return false;

                // Si no se solicita el remoto, filtramos cualquier rama remota
                if (!includeRemote && b.startsWith('remotes/')) return false;

                const baseName = b.replace(/^remotes\/[^/]+\//, '');
                return !exclude.includes(baseName);
            });

            return Success({ branches: list });
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async delete(branches) {
        try {
            for (const fullName of branches) {
                const isRemote = fullName.startsWith('remotes/');
                if (isRemote) {
                    const parts = fullName.replace(/^remotes\//, '').split('/');
                    const remote = parts[0];
                    const name = parts.slice(1).join('/');

                    try {
                        await git.push([remote, '--delete', name]);
                    } catch {
                    }

                } else {
                    await git.branch(['-D', fullName]);
                }
            }

            try {
                await git.raw(['remote', 'prune', 'origin']);
            } catch {
            }

            return Success();
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async moveTo(targetBranch, force = false) {
        try {
            const res = await this.info(targetBranch);
            if (res.error) return res;

            const {exists} = res;

            if (!exists && force) {
                await git.checkoutLocalBranch(targetBranch);
                return Success({branch: targetBranch, created: true});
            }

            if (!exists) {
                return Failure(1, `La rama "${targetBranch}" no existe.`);
            }

            await git.checkout(targetBranch);
            return Success({branch: targetBranch, created: false});
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async askForTarget(target) {
        try {

            const res = await this.info(target);
            if (res.error) return res;

            const {exists, others, current} = res;

            if (target) {
                return Success({target});
            }

            if (others.length === 0) {
                return Cancel('No existen otras ramas en este repositorio.');
            }

            const {canceled, selected} = await consoleIO.select({
                message: `Seleccione la rama de destino (Actual: ${current}):`,
                options: others.map(b => ({value: b, label: b}))
            });

            return canceled
                ? Cancel()
                : Success({target: selected});

        } catch (error) {
            return Failure(1, error.message);
        }
    }
}

export const branch = new Branch();