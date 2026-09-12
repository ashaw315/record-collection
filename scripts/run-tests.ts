/**
 * **Run a test command and judge what it REPORTED, not what it exited with.**
 *
 * `run-result.ts` holds the judgement and is thoroughly tested. What was
 * missing was a way to invoke it: as a library it has no entry point, so
 * `npx tsx scripts/run-result.ts npm test` evaluates a module of exports, runs
 * nothing, prints nothing and exits 0 — the exact concealment it exists to
 * prevent, reachable by misusing the instrument itself.
 *
 * That was the fourth wrapper in one session to report success about nothing,
 * and the only one reachable by ACCIDENT rather than by a race or a pipe. This
 * file removes it.
 *
 *     npx tsx scripts/run-tests.ts npm test
 *     npx tsx scripts/run-tests.ts npx playwright test
 *     npx tsx scripts/run-tests.ts --expect-at-least 3555 npm test
 *
 * Exits 0 only when the summary line says so.
 */

import { spawnSync } from 'node:child_process';
import { readRunResult, summarise } from './run-result';

const USAGE = `usage: run-tests.ts [--expect-at-least N] <command> [args...]

Runs the command, parses its summary line and exits non-zero unless the
summary says the run passed. A run that reports nothing is NOT a pass.`;

function main(argv: string[]): number {
  const args = [...argv];
  let expectAtLeast: number | undefined;

  if (args[0] === '--expect-at-least') {
    const value = Number(args[1]);
    if (!Number.isInteger(value) || value < 0) {
      process.stderr.write(`--expect-at-least needs a whole number\n\n${USAGE}\n`);
      return 2;
    }
    expectAtLeast = value;
    args.splice(0, 2);
  }

  const [command, ...rest] = args;

  /*
    **No command is not an empty pass.** This is the defect that produced this
    file: silence plus a zero read as green.
  */
  if (command === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  /*
    Output is captured so it can be parsed AND echoed. A wrapper that swallows
    the run's own output makes a failure unreadable — which is how the buffered
    pipe became a 0-byte log — so everything the child printed goes through.
  */
  const child = spawnSync(command, rest, { encoding: 'utf8', shell: false });

  if (child.error !== undefined) {
    /*
      The command never ran. That is a broken environment, not an absent
      result, and it must be as loud as a failing suite rather than skipped.
    */
    process.stdout.write(`${command}: ${child.error.message}\n`);
    process.stdout.write(`\n${summarise(readRunResult({ output: '', exitCode: 1 }))}\n`);
    return 1;
  }

  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  process.stdout.write(output);

  const result = readRunResult({
    output,
    exitCode: child.status ?? 1,
    expectAtLeast,
  });

  process.stdout.write(`\n${summarise(result)}\n`);

  return result.ok ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
