import {Cancel, consoleIO, Failure, git, Success} from './index.js';

export class Branch {

    async info(branchName = null) {
        try {
            const info = await git.branch(['-vv', '-a']);
            const target = branchName ?? info.current;

            const currentBranchName = info.current;
            const exists = info.all.includes(target);

            const detailedBranches = Object.keys(info.branches).map(name => {
                const b = info.branches[name];

                // 1. Identificar si es una rama remota
                const isRemote = name.startsWith('remotes/') || b.isRemote;

                // 2. Extraer el label (nombre limpio) según si es remota o local
                const label = isRemote
                    ? name.replace(/^remotes\/[^/]+\//, '')
                    : name;

                // 3. Extraer el upstream si existe en el metadato de simple-git
                let upstream = false;
                if (b.label && b.label.includes('origin/')) {
                    const match = b.label.match(/origin\/[^\s,\]]+/);
                    if (match) upstream = match[0];
                }

                // 4. Determinar si es la rama activa actual en el espacio de trabajo
                const isCurrent = name === currentBranchName;

                return {
                    name,      // Path completo: ej. 'remotes/origin/feature' o 'main'
                    label,     // Nombre limpio: ej. 'feature' o 'main'
                    remote: isRemote,
                    upstream,
                    current: isCurrent
                };
            });

            return Success({
                current: currentBranchName,
                all: detailedBranches,
                exists
            });
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async list() {
        try {
            const res = await this.info();
            if (res.error) return res;

            // Retornamos la lista completa sin filtrar nada (incluye remotas y current)
            return Success({branches: res.all});
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
                    } catch {}
                } else {
                    await git.branch(['-D', fullName]);
                }
            }

            try {
                await git.raw(['remote', 'prune', 'origin']);
            } catch {}

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

    async mirror(source) {
        try {
            await git.reset(['--hard', source]);
            return Success();
        } catch (error) {
            return Failure(1, `Error al replicar la rama: ${error.message}`);
        }
    }

    async askForTarget(target) {
        try {
            const infoRes = await this.info(target);
            if (infoRes.error) return infoRes;
            const {current, all} = infoRes;

            if (target) {
                return Success({target, current});
            }

            const selectableBranches = all.filter(b => !b.current && !b.remote);

            if (selectableBranches.length === 0) {
                return Cancel('No existen otras ramas en este repositorio.');
            }

            const {canceled, selected} = await consoleIO.select({
                message: `Seleccione la rama de destino (Actual: ${current}):`,
                options: selectableBranches.map(b => ({value: b.name, label: b.name}))
            });

            return canceled
                ? Cancel()
                : Success({target: selected, current});

        } catch (error) {
            return Failure(1, error.message);
        }
    }
}

export const branch = new Branch();