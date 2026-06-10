import { release, consoleIO, pipeline, Cancel, Success } from '../utils/index.js';

export async function runRelease() {
    consoleIO.help('release', 'Lanza el asistente interactivo para empaquetar y subir una nueva versión.');

    await pipeline()

        .do(async () => {
            const versionRes = await release.getVersions();
            if (versionRes.error) return versionRes;
            consoleIO.step(`Current: ${versionRes.current}`)

            return Success({ versions: versionRes });
        })

        .do(async (ctx) => {
            const { current, patch, minor, major } = ctx.versions;

            const allOptions = [
                { value: 'patch', label: `Patch (${current} → ${patch})`, hint: 'Corrección de errores' },
                { value: 'minor', label: `Minor (${current} → ${minor})`, hint: 'Nueva funcionalidad retrocompatible' },
                { value: 'major', label: `Major (${current} → ${major})`, hint: 'Cambio rupturista o no retrocompatible' }
            ];

            // Condición: Si estamos en v0.0.0, filtramos el 'patch' para forzar minor o major
            const options = current === 'v0.0.0'
                ? allOptions.filter(opt => opt.value !== 'patch')
                : allOptions;


            const { canceled, selected } = await consoleIO.select({
                message: '¿Qué tipo de incremento de versión desea aplicar?',
                options
            });

            if (canceled) return Cancel();
            return Success({ increment: selected });
        })
        .do(async (ctx) => {
            consoleIO.step(`Iniciando el proceso de publicación para: ${ctx.increment}...`);

            const response = await release.create(ctx.increment);
            if (response.error) return response;

            return Success();
        })
        .onSuccess(() => {
            consoleIO.success('Ciclo de lanzamiento y publicación completado con éxito.');
        })
        .onError((error) => {
            consoleIO.error(error.message, error.code);
        })
        .run();
}