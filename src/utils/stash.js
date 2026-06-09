import {Cancel, consoleIO, Failure, git, Success} from './index.js';

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
}

export const stash = new Stash();