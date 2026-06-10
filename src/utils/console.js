import {confirm, groupMultiselect, log, multiselect, note, select} from '@clack/prompts';
import pc from 'picocolors';

class Console {
    async confirm(message, initialValue = true) {
        const result = await confirm({message, initialValue});
        if (typeof result === 'symbol') {
            return {canceled: true, confirm: null};
        }
        return {canceled: false, confirm: result};
    }

    async select({message, options = []}) {
        const selected = await select({message, options});


        if (typeof selected === 'symbol') {
            return {canceled: true, selected: null};
        }
        return {canceled: false, selected};
    }

    async multiselect({message, options = [], required = false}) {
        const selected = await multiselect({message, options, required});

        if (typeof selected === 'symbol') {
            return {canceled: true, selected: null};
        }
        return {canceled: false, selected};
    }

    async groupMultiselect({message, options = {}, required = false, initialValues = []}) {
    
        const selected = await groupMultiselect({message, options, required, initialValues});

        if (typeof selected === 'symbol') {
            return {canceled: true, selected: null};
        }
        return {canceled: false, selected};
    }

    note(message) {
        note(message);
    }

    help(title, description) {
        // Usamos log.message con un símbolo vacío para mantener la línea vertical intacta
        log.message(`${pc.yellow(title)} ${pc.dim('→')} ${description}`, { symbol: pc.dim('▪') });
    }


    /**
     * Informa sobre un paso procedimental o mecánico en curso.
     * Utiliza el símbolo de bloque informativo (◆) de Clack en color gris/atenuado.
     */
    step(message) {
        log.step(message);
    }

    info(message) {
        log.step(pc.bgYellow(pc.black(message)));
    }

    /**
     * Destaca un hito o logro intermedio relevante durante la transacción.
     * Utiliza el mismo símbolo decorativo pero resalta el mensaje en un tono cian/azul eléctrico.
     */
    milestone(message) {
        log.step(pc.blue(pc.bold(message)));
    }

    /**
     * Cierra el proceso imprimiendo un mensaje de éxito definitivo.
     * Renderiza un check verde (✔) en la terminal.
     */
    success(message = 'Operación terminada con éxito.') {
        log.success(pc.green(message));
        process.exit(0);
    }

    /**
     * Aborta el proceso imprimiendo un mensaje de error crítico.
     * Renderiza una cruz roja (✖) en la terminal.
     */
    error(message, code = 1) {
        log.error(pc.red(message));

        process.exit(code);
    }
}

export const consoleIO = new Console();