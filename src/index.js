#!/usr/bin/env node

import {log} from '@clack/prompts';
import {runSwitchTo} from './commands/switch-to.js';
import {runClean} from "./commands/clean.js";

const [, , subcommand, ...args] = process.argv;

switch (subcommand) {
    case 'switch-to':
        await runSwitchTo(args[0]);
        break;
    case 'clean':
        await runClean(args[0]);
        break;

    default:
        log.error(`Subcomando no reconocido: "${subcommand || ''}"`);
        log.info('Uso disponible: npx git-alias switch-to [<rama>]');
        process.exit(1);
}