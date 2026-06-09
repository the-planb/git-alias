import {Failure, git, Success} from './index.js';

export class Tag {

    async info(tagName = null) {
        try {
            const info = await git.tags();
            const all = info.all;
            const exists = tagName && all.includes(tagName);

            return Success({all, exists});
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async list(includeRemote = false) {
        try {
            const res = await this.info();
            if (res.error) return res;
            const localTags = res.all;

            let remoteTags = [];

            // Solo se ejecuta la petición de red si el flag está activo
            if (includeRemote) {
                try {
                    const remoteRaw = await git.listRemote(['--tags', 'origin']);
                    if (remoteRaw) {
                        remoteTags = remoteRaw
                            .split('\n')
                            .filter(Boolean)
                            .map(line => {
                                const match = line.match(/(refs\/tags\/.+)$/);
                                return match ? match[1] : null;
                            })
                            .filter(t => t && !t.endsWith('^{}'));
                    }
                } catch {
                    // Silenciamos fallos de red
                }
            }

            const unifiedList = [...localTags, ...remoteTags];
            return Success({ tags: unifiedList });
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async delete(tagNames) {
        try {
            for (const fullName of tagNames) {
                // Si empieza por "refs/", es una referencia remota explícita
                const isRemote = fullName.startsWith('refs/');

                if (isRemote) {
                    const cleanTagName = fullName.replace(/^refs\/tags\//, '');

                    try {
                        await git.push(['origin', '--delete', cleanTagName]);
                    } catch {
                    }
                } else {
                    try {
                        await git.tag(['-d', fullName]);
                    } catch {
                    }
                }
            }
            return Success();
        } catch (error) {
            return Failure(1, error.message);
        }
    }
}

export const tag = new Tag();