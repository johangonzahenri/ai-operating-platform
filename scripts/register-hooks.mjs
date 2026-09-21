import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-hooks.mjs', pathToFileURL('./scripts/'));
