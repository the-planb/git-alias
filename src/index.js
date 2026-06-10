#!/usr/bin/env node

import {log} from '@clack/prompts';
import {runSwitchTo} from './commands/switch-to.js';
import {runKill} from "./commands/kill.js";
import {runRelease} from "./commands/release.js";
import {runMirrorFrom, runMirrorTo} from "./commands/mirror.js";
import {runStashBoard} from "./commands/stash-board.js";
import {runStageBoard} from "./commands/stage-board.js";
import {runSmartFixup} from "./commands/smart-fixup.js";

const [, , subcommand, ...args] = process.argv;

switch (subcommand) {
    case 'switch-to':
        await runSwitchTo(args[0]);
        break;
    case 'kill':
        await runKill(args);
        break;
    case 'release':
        await runRelease(args[0]);
        break;
    case 'mirror-to':
        await runMirrorTo(args);
        break;
    case 'mirror-from':
        await runMirrorFrom(args);
        break;

    case 'stash-board':
        await runStashBoard(args);
        break;

    case 'stage-board':
        await runStageBoard(args);
        break;

    case 'smart-fixup':
        await runSmartFixup(args);
        break;

    default:
        log.error(`Subcomando no reconocido: "${subcommand || ''}"`);
        log.info('Uso disponible: npx git-alias switch-to [<rama>]');
        process.exit(1);
}


