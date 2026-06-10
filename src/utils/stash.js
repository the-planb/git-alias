import {Cancel, consoleIO, Failure, git, Success} from './index.js';
import { execa } from 'execa';

export const StashAction = {
    STORED: 'stored',
    NONE: 'none',
    ABORTED: 'aborted'
};

export class Stash {
    _generateUniqueMessage() {
        const timestamp = Date.now();
        return `[gsh-session-${timestamp}]`;
    }

    async _findStashIndexByMessage(message) {
        const listData = await git.stash(['list']);
        if (!listData) return null;

        const lines = listData.split('\n').filter(Boolean);
        for (const line of lines) {
            if (line.includes(message)) {
                const match = line.match(/(stash@\{\d+\})/);
                return match ? match[1] : null;
            }
        }
        return null;
    }

    async _ask(message = 'Se han detectado cambios no confirmados en el espacio de trabajo:') {
        const status = await git.status();

        if (status.files.length === 0) {
            return StashAction.NONE;
        }

        const {canceled, selected} = await consoleIO.select({
            message,
            options: [
                {value: 'none', label: 'Omitir (Mantener cambios en el directorio actual)'},
                {value: 'stash', label: 'Resguardar (Ejecutar Git Stash transaccional)'},
                {value: 'cancel', label: 'Cancelar la operación'}
            ]
        });

        if (canceled) {
            return StashAction.ABORTED;
        }

        return selected === 'stash' ? StashAction.STORED : StashAction.NONE;
    }

    async prepare() {
        try {
            const action = await this._ask();
            if (action === StashAction.ABORTED) {
                return Cancel();
            }

            if (action === StashAction.NONE) {
                return Success({action, hash: null});
            }

            const hash = this._generateUniqueMessage();

            await git.stash(['push', '-u', '-m', hash]);

            return Success({action, hash});
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async finalize({action, hash}) {
        try {
            if (action !== StashAction.STORED || !hash) {
                return Success();
            }

            // ... dentro de finalize()
            const {canceled, selected} = await consoleIO.select({
                message: 'Gestión de cambios locales guardados (Stash):',
                options: [
                    {value: 'recovery', label: 'Aplicar y restaurar cambios en el espacio de trabajo'},
                    {value: 'none', label: 'Mantener en la pila (sin aplicar)'},
                    {value: 'delete', label: 'Descartar cambios permanentemente (Drop)'}
                ]
            });

            if (canceled || selected === 'none') {
                return Success();
            }

            const target = await this._findStashIndexByMessage(hash);
            if (!target) {
                return Failure(1, `No se encontró el stash de la sesión con ID: ${hash}`);
            }

            if (selected === 'delete') {
                await git.stash(['drop', target]);
                return Success();
            }

            await git.stash(['pop', target]);
            return Success();

        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async cancel({action, hash}) {
        try {
            if (!hash) {
                return Success();
            }

            const target = await this._findStashIndexByMessage(hash);

            if (target) {
                await git.stash(['pop', target]);
            }

            return Success();
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    async secure(callback, onSuccess = null) {
        try {
            const prepare = await this.prepare();
            if (prepare.error) return prepare;

            const {action, hash} = prepare;

            const res = await callback();
            if (res.error) {
                return res;
            }

            if (typeof onSuccess === 'function') {
                await onSuccess(res);
            }

            const finalize = await this.finalize({action, hash});
            if (finalize.error) return finalize;

            return Success({action, hash, ...res});
        } catch (error) {
            return Failure(1, error.message);
        }
    }

    /**
     * Recupera y procesa la lista actual del stash.
     */
    async list() {
        try {
            const rawList = await git.raw(['stash', 'list']);
            if (!rawList || !rawList.trim()) {
                return Success({ stashes: [] });
            }

            const lines = rawList.trim().split('\n');
            const stashes = lines.map(line => {
                // Formato estándar: stash@{0}: WIP on master: hash commit_msg
                const match = line.match(/^stash@\{(\d+)\}: (.*)$/);
                if (!match) {
                    return {
                        index: null,
                        ref: line,
                        label: line
                    };
                }

                const index = parseInt(match[1], 10);
                const ref = `stash@{${index}}`;
                const content = match[2];

                // Extraemos detalles adicionales para mejorar la presentación visual
                let branch = 'unknown';
                let message = content;

                const branchMatch = content.match(/On ([^:]+):/);
                if (branchMatch) {
                    branch = branchMatch[1];
                    message = content.split(`${branchMatch[0]} `)[1] || content;
                } else if (content.startsWith('WIP on ')) {
                    const wipMatch = content.match(/WIP on ([^:]+):/);
                    if (wipMatch) {
                        branch = wipMatch[1];
                        message = content.split(`${wipMatch[0]} `)[1] || content;
                    }
                }

                return {
                    index,
                    ref,
                    branch,
                    message,
                    label: line
                };
            });

            return Success({ stashes });
        } catch (error) {
            return Failure(1, `Error al leer la lista de stash: ${error.message}`);
        }
    }

    /**
     * Muestra el diff patch del stash seleccionado.
     */
    async inspect(index) {
        try {
            const diff = await git.raw(['stash', 'show', '-p', `stash@{${index}}`]);
            return Success({ diff });
        } catch (error) {
            return Failure(1, `Error al inspeccionar el stash: ${error.message}`);
        }
    }

    /**
     * Aplica los cambios del stash indicado sin borrarlo del listado.
     */
    async apply(index) {
        try {
            await git.raw(['stash', 'apply', `stash@{${index}}`]);
            return Success();
        } catch (error) {
            return Failure(1, `Error al aplicar el stash: ${error.message}`);
        }
    }

    /**
     * Aplica los cambios del stash indicado y lo elimina de la lista.
     */
    async pop(index) {
        try {
            await git.raw(['stash', 'pop', `stash@{${index}}`]);
            return Success();
        } catch (error) {
            return Failure(1, `Error al extraer (pop) el stash: ${error.message}`);
        }
    }

    /**
     * Elimina de forma definitiva un stash concreto.
     */
    async drop(index) {
        try {
            await git.raw(['stash', 'drop', `stash@{${index}}`]);
            return Success();
        } catch (error) {
            return Failure(1, `Error al descartar el stash: ${error.message}`);
        }
    }

    /**
     * Limpia de forma destructiva y masiva todo el almacén de stash.
     */
    async clean() {
        try {
            await git.raw(['stash', 'clear']);
            return Success();
        } catch (error) {
            return Failure(1, `Error al vaciar el almacén de stash: ${error.message}`);
        }
    }

    /**
     * Ejecuta la creación de un stash parcial interactivo.
     * Requiere heredar stdio debido al proceso interactivo de selección de líneas de Git.
     */
    async pushInteractive() {
        try {
            await execa('git', ['stash', 'push', '-p'], { stdio: 'inherit' });
            return Success();
        } catch (error) {
            return Failure(1, `Error durante el stash interactivo: ${error.message}`);
        }
    }
}

export const stash = new Stash();