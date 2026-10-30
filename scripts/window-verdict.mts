/**
 * **§W.8's verdict re-read from the logs of runs already taken:**
 *
 *     npm run window:verdict -- docs/measurements/window-160/run-a-<time>.jsonl [run-b-<time>.jsonl]
 *
 * A run prints the verdict of the code it started with, and the bound is taken
 * across both runs. Makes no load. The margin's shortfall is stated for the
 * smallest number of loads a file gives a cell, the larger shortfall.
 */
import { readFileSync } from 'node:fs';
import { loadsOfLog, verdict } from './window-measure';

const files = process.argv.slice(2);
if (files.length === 0) {
  process.stderr.write('window-verdict: name at least one log\n');
  process.exit(2);
}
const logs = files.map((file) => loadsOfLog(readFileSync(file, 'utf8')));
const perCell = Math.min(...logs.map((loads) => Math.max(...[...new Set(loads.map((l) => l.cell))].map((cell) => loads.filter((l) => l.cell === cell).length))));
const v = verdict(logs.flat(), perCell);
process.stdout.write(`${v.sentence}\n${v.broken} load(s) broken after their retakes, left out.\n`);
