import {Failure, git, Success} from './index.js';

export class FixupService {
    /**
     * Obtiene los archivos que están actualmente en el Stage analizando status --porcelain.
     * Identifica rutas de origen y destino para los renombrados (R).
     */
    async getStagedFiles() {
        try {
            const raw = await git.raw(['status', '--porcelain']);
            const lines = raw.split('\n').filter(Boolean);
            const files = [];

            lines.forEach(line => {
                const status = line.substring(0, 2);
                const rest = line.substring(3).trim();

                // Solo procesamos elementos que tengan cambios indexados (primer carácter != espacio o ?)
                if (status[0] !== ' ' && status[0] !== '?') {
                    let type = status[0]; // M, A, D, R
                    let path = rest;
                    let originPath = null;

                    if (type === 'R') {
                        // El formato de un rename indexado es: "origen -> destino"
                        const parts = rest.split(' -> ');
                        originPath = parts[0].trim();
                        path = parts[1].trim();
                    }

                    files.push({path, type, originPath});
                }
            });

            return Success({data: files});
        } catch (error) {
            return Failure(1, `Error al analizar el Stage: ${error.message}`);
        }
    }

    /**
     * Obtiene el historial de commits válidos para un archivo específico.
     * Excluye de forma proactiva commits de tipo fixup! o squash!.
     */
    async getCommitsForFile(filePath) {
        try {
            // --follow asegura mantener el rastro si el archivo cambió de nombre en el pasado
            const raw = await git.raw([
                'log',
                '--follow',
                '--format=%h|%s|%ar',
                '--',
                filePath
            ]);

            const lines = raw.split('\n').filter(Boolean);
            const commits = [];

            lines.forEach(line => {
                const [hash, message, date] = line.split('|');

                // Ignorar commits que ya sean fixups o squashes transitorios
                if (!/^text!(fixup|squash)!/i.test(message)) {
                    commits.push({hash, message, date});
                }
            });

            return Success({data: commits});
        } catch (error) {
            return Failure(1, `Error al obtener historial de ${filePath}: ${error.message}`);
        }
    }

    /**
     * Ordena una lista de hashes de forma topológica para determinar cuál es el más antiguo.
     * El primer elemento de la lista resultante será el rootCommit de la operación.
     */
    async getTopologicalOrder(hashes) {
        try {
            if (!hashes || hashes.length === 0) return Success([]);

            // --topo-order ordena por jerarquía del árbol de Git, --reverse pone el más antiguo primero
            const uniqueHashes = [...new Set(hashes)];
            const ordered = await git.raw(['rev-list', '--no-walk', '--topo-order', '--reverse', ...uniqueHashes]);

            const data = ordered.split('\n').filter(Boolean)
            return Success({data});
        } catch (error) {
            return Failure(1, `Error al ordenar topológicamente los commits: ${error.message}`);
        }
    }

    /**
     * Verifica si un commit concreto es el commit inicial (raíz) del repositorio de Git.
     */
    async isRootCommit(hash) {
        try {
            // Un commit raíz no tiene padres (salida vacía en rev-list con --parents)
            const raw = await git.raw(['rev-list', '--parents', '-n', '1', hash]);
            const parts = raw.trim().split(' ');
            return Success(parts.length === 1);
        } catch (error) {
            return Failure(1, `Error al verificar ancestros del commit: ${error.message}`);
        }
    }
}

export const fixupService = new FixupService();