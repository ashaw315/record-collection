import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **`process.env.NODE_ENV` in src is a build-time constant, not a runtime
 * read.** `next build` inlines it as "production" into every bundle, the
 * server ones included, whatever `next start` is given; `next dev` leaves it
 * "development". So a gate on the literal answers differently under the two
 * servers the suite can run against, and on 5 Nov the first build-served
 * run found eight probe pages closed (109 tests, 18 files), `error.tsx`'s
 * client branch gone, and the no-live-calls guard's belt inlined to false
 * (Q39). The parsed env object (`getEnv()`, `parseEnv(process.env)`) reads
 * the runtime value, and is what the login route already used, which is why
 * its cookie came out right under the build while the pages 404'd beside it.
 *
 * The sweep that found the twelve is this test now, so the next literal is
 * refused by name rather than found by a run. Two are tolerated, each with
 * its reason beside it; adding a third here needs the same sentence.
 *
 * A text proxy, named as one: it reads the source and cannot see what a read
 * does. The behaviour under a build is held by the build-served e2e run
 * (E2E_SERVER=build) and, for the production deployment, by the curl of the
 * nine paths recorded in NOTES.
 */
const LITERAL = 'process.env.NODE_ENV';

const TOLERATED: Record<string, { count: number; because: string }> = {
  /* Dead: `DEV_ONLY_PUBLIC_PATHS` is empty since /scene retired, so the branch is unreachable under every server and the inlined value changes nothing. */
  'src/lib/auth/routes.ts': { count: 1, because: 'the dev-only public set is empty; the branch is unreachable' },
  /* A fallback no caller in src reaches (login and logout pass `getEnv().NODE_ENV`). Under a build it answers "production", and a Secure cookie over http fails to be set, loudly. */
  'src/lib/auth/session.ts': { count: 1, because: 'a fallback every caller bypasses; under a build it fails loud, not silent' },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Code only: a comment that names the literal to say why it is not read is not a read. Block comments go by span, line comments by line. */
function codeLines(text: string): string[] {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trim().startsWith('//'));
}

function literalReads(): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of walk('src')) {
    const count = codeLines(readFileSync(file, 'utf8')).join('\n').split(LITERAL).length - 1;
    if (count > 0) found[relative('.', file)] = count;
  }
  return found;
}

describe('reads of the NODE_ENV literal in src, which a build inlines', () => {
  /* Fails against any new `process.env.NODE_ENV` in src, naming the file; and against a tolerated one that grew. */
  it('are exactly the tolerated two, each with its reason written beside it', () => {
    const expected = Object.fromEntries(Object.entries(TOLERATED).map(([file, { count }]) => [file, count]));
    expect(literalReads(), `read NODE_ENV through the parsed env (getEnv) instead; a build inlines the literal. Tolerated: ${Object.entries(TOLERATED).map(([f, t]) => `${f} (${t.because})`).join('; ')}`).toEqual(expected);
  });

  /* Fails against a tolerated entry whose file no longer reads the literal: the list would overstate what is tolerated. */
  it('tolerate nothing that is not there', () => {
    for (const file of Object.keys(TOLERATED)) {
      expect(codeLines(readFileSync(file, 'utf8')).join('\n').includes(LITERAL), `${file} is tolerated but no longer reads the literal; remove it from the list`).toBe(true);
    }
  });
});
