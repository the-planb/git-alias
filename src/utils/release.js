import { execa } from 'execa';
import semver from 'semver';
import { Failure, Success } from './index.js';

export class Release {
    /**
     * Obtiene la versión proyectada por release-it y deduce el mapa semántico real.
     */
    async getVersions() {
        try {
            // Ejecutamos release-it de forma oculta para capturar su estimación de patch por defecto
            const { stdout } = await execa('npx', ['release-it', '--release-version'], {
                stdio: 'pipe'
            });

            // Limpiamos espacios y saltos de línea del string resultante
            const patchVersion = stdout.trim();

            // Si es la versión inicial de fallback de release-it (0.1.0)
            if (patchVersion === '0.1.0') {
                return Success({
                    current: 'v0.0.0',
                    patch: 'v0.1.0',
                    minor: 'v0.1.0',
                    major: 'v1.0.0'
                });
            }

            // En base al patch devuelto, calculamos la versión actual restando un parche
            const currentVersion = semver.inc(patchVersion, 'patch')
                ? semver.clean(patchVersion).split('.').map((num, i) => i === 2 ? Number(num) - 1 : num).join('.')
                : patchVersion;

            const prefix = 'v';
            const current = `${prefix}${currentVersion}`;
            const patch = `${prefix}${patchVersion}`;
            const minor = `${prefix}${semver.inc(currentVersion, 'minor')}`;
            const major = `${prefix}${semver.inc(currentVersion, 'major')}`;

            return Success({ current, patch, minor, major });
        } catch (error) {
            return Failure(1, `Error al consultar la versión con release-it: ${error.message}`);
        }
    }

    async create(increment) {
        try {
            await execa('npx', ['release-it', increment], {
                stdio: 'inherit'
            });
            return Success();
        } catch (error) {
            return Failure(1, error.message);
        }
    }
}

export const release = new Release();