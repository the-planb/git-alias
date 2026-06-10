import { git, Success, Failure } from './index.js';
import fs from 'fs';

export class StageArea {
    /**
     * Obtiene el estado del repositorio categorizado para el groupMultiselect.
     */
    async getStatusGroups() {
        try {
            const raw = await git.raw(['status', '--porcelain']);
            const lines = raw.split('\n').filter(Boolean);

            const groups = {
                'Staged': [],
                'Modified': [],
                'Untracked': []
            };

            lines.forEach(line => {
                const status = line.substring(0, 2);
                const file = line.substring(3).trim();

                // Clasificación según estado porcelain
                if (status.startsWith(' ') || status.startsWith('M') || status.startsWith('A') || status.startsWith('D')) {
                    if (status[0] !== ' ') groups['Staged'].push({ value: file, label: file });
                    if (status[1] === 'M' || status[1] === 'D') groups['Modified'].push({ value: file, label: file });
                } else if (status === '??') {
                    groups['Untracked'].push({ value: file, label: file });
                }
            });

            const clean = Object.entries(groups).filter(([_, items]) => items.length > 0)
            const data = Object.fromEntries(clean)

            return Success({data});
        } catch (error) {
            return Failure(1, `Error al obtener estado de Git: ${error.message}`);
        }
    }

    async stage(files) {
        try {
            await git.raw(['add', ...files]);
            return Success();
        } catch (error) {
            return Failure(1, `Error al hacer stage: ${error.message}`);
        }
    }

    async unstage(files) {
        try {
            await git.raw(['restore', '--staged', ...files]);
            return Success();
        } catch (error) {
            return Failure(1, `Error al hacer unstage: ${error.message}`);
        }
    }

    async discard(files, isUntracked = false) {
        try {
            if (isUntracked) {
                for (const file of files) await fs.promises.unlink(file);
            } else {
                await git.raw(['restore', ...files]);
            }
            return Success();
        } catch (error) {
            return Failure(1, `Error al descartar cambios: ${error.message}`);
        }
    }

    /**
     * Añade de manera segura las rutas especificadas al archivo .gitignore.
     */
    async ignore(files) {
        try {
            const ignorePath = '.gitignore';
            let prefix = '';

            try {
                const stats = await fs.promises.stat(ignorePath);
                if (stats.size > 0) {
                    const content = await fs.promises.readFile(ignorePath, 'utf8');
                    if (!content.endsWith('\n')) {
                        prefix = '\n';
                    }
                }
            } catch (err) {
                // El archivo no existe, se creará de cero
            }

            const contentToAppend = prefix + files.map(f => f).join('\n') + '\n';
            await fs.promises.appendFile(ignorePath, contentToAppend);
            return Success();
        } catch (error) {
            return Failure(1, `Error al añadir a .gitignore: ${error.message}`);
        }
    }

    /**
     * Remueve de manera precisa las rutas del archivo .gitignore si se encontraran allí declaradas.
     */
    async unignore(files) {
        try {
            const ignorePath = '.gitignore';

            try {
                await fs.promises.access(ignorePath);
            } catch {
                return Success(); // No hay archivo .gitignore que procesar
            }

            const rawContent = await fs.promises.readFile(ignorePath, 'utf8');
            const lines = rawContent.split(/\r?\n/);

            // Filtrar las líneas del archivo original omitiendo los ficheros que queremos des-ignorar
            const filteredLines = lines.filter(line => {
                const trimmed = line.trim();
                return !files.includes(trimmed);
            });

            // Reconstruir el archivo normalizando saltos de línea finales
            let newContent = filteredLines.join('\n');
            if (newContent.trim() && !newContent.endsWith('\n')) {
                newContent += '\n';
            }

            await fs.promises.writeFile(ignorePath, newContent, 'utf8');
            return Success();
        } catch (error) {
            return Failure(1, `Error al eliminar de .gitignore: ${error.message}`);
        }
    }
}

export const stage = new StageArea();