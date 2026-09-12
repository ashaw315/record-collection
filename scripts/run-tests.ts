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

import { spawn } from 'node:child_process';
import { readRunResult, summarise } from './run-result';

const USAGE = `usage: run-tests.ts [--expect-at-least N] <command> [args...]

Runs the command, parses its summary line and exits non-zero unless the
summary says the run passed. A run that reports nothing is NOT a pass.`;

async function main(argv: string[]): Promise<number> {
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
    **Teed, not buffered.** Every chunk goes straight to our stdout as the child
    writes it AND into `output` for the parse at the end.

    `spawnSync` did the parse correctly and showed nothing until the child
    exited, so a fifteen-minute suite reported nothing for fifteen minutes.
    That is the concealment family this whole file is about: an instrument that
    reports nothing is not evidence, and "still running, I cannot see" is not a
    status. The judgement below is unchanged -- only the shell.
  */
  const child = spawn(command, rest, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });

  let output = '';
  const tee = (stream: NodeJS.ReadableStream, to: NodeJS.WritableStream) => {
    stream.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      to.write(text);
    });
  };

  tee(child.stdout, process.stdout);
  /* stderr is teed to stderr but joins the same buffer: suites report to both. */
  tee(child.stderr, process.stderr);

  const exitCode = await new Promise<number>((resolve, reject) => {
    /*
      The command never ran. That is a broken environment, not an absent result,
      and it must be as loud as a failing suite rather than skipped.
    */
    child.on('error', (error) => reject(error));
    child.on('close', (code) => resolve(code ?? 1));
  }).catch((error: Error) => {
    process.stdout.write(`${command}: ${error.message}\n`);
    return null;
  });

  if (exitCode === null) {
    process.stdout.write(`\n${summarise(readRunResult({ output: '', exitCode: 1 }))}\n`);
    return 1;
  }

  const result = readRunResult({ output, exitCode, expectAtLeast });

  process.stdout.write(`\n${summarise(result)}\n`);

  return result.ok ? 0 : 1;
}

/*
  `.then` rather than top-level await: this file is transformed to CJS, where
  top-level await is a build error rather than a runtime one — it failed every
  invocation, not just the async path.
*/
void main(process.argv.slice(2)).then((code) => {
  process.exit(code);
});
