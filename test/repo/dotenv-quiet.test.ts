import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every `dotenv` `config()` call in this repo must pass `quiet: true`.
 *
 * dotenv 17 announces itself on **STDOUT**, not stderr:
 *
 *   ◇ injected env (6) from .env.test // tip: ⌘ override existing { override: true }
 *
 * That is banner output on the data stream. Any command substitution around a
 * script that loads env — `OUT=$(node script.mjs)` — captures the banner as if
 * it were the script's result, and `2>/dev/null` does not help because it is
 * the wrong stream. Found by hand during the step 7 Discogs token check, where
 * it contaminated a captured value and produced an empty result with NO ERROR:
 * the absence-as-success shape, in the tooling this time.
 *
 * Asserted across the repo rather than on the one file that was missing it,
 * because the defect is a FUTURE caller omitting the flag. A test naming
 * today's four callers would pass forever while the fifth reintroduces it.
 */

/** Every tracked file that calls dotenv's `config`, found rather than listed. */
function filesCallingDotenvConfig(): string[] {
  const tracked = execFileSync('git', ['ls-files', '*.ts', '*.mts', '*.js', '*.mjs'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((line) => line !== '');

  return tracked.filter((file) => {
    const source = readFileSync(file, 'utf8');
    return /from ['"]dotenv['"]/.test(source) && /\bconfig\s*\(/.test(source);
  });
}

describe('dotenv is silent everywhere it is loaded', () => {
  it('finds the callers, so the assertion cannot pass vacuously', () => {
    // Guards the guard: if the search breaks, every assertion below becomes a
    // loop over nothing and reports green.
    expect(filesCallingDotenvConfig().length).toBeGreaterThanOrEqual(4);
  });

  it.each(filesCallingDotenvConfig())('%s passes quiet to every config() call', (file) => {
    const source = readFileSync(file, 'utf8');

    /**
     * Matches `config(` through its closing paren on the same line, which is
     * how every call in this repo is written. A multi-line call would escape
     * this — acceptable, because the count assertion above and code review
     * both cover the shape, and a regex that parses TypeScript is worse than
     * the problem.
     */
    const calls = source.match(/\bconfig\s*\([^)]*\)/g) ?? [];

    expect(calls.length, `${file} has a config() call`).toBeGreaterThan(0);

    for (const call of calls) {
      expect(call, `${file}: ${call}`).toMatch(/quiet:\s*true/);
    }
  });
});

describe('the banner is real, and it is on stdout', () => {
  /**
   * The premise, asserted rather than assumed — it is the whole reason for the
   * rule above, and if dotenv ever goes quiet by default the rule can go.
   *
   * NOTES: "probes are code too, and a verified-by-execution claim still needs
   * its premise checked." My first probe of this ran from a scratchpad
   * directory, where `import 'dotenv'` cannot resolve — so it printed nothing
   * and looked like proof that dotenv was silent. It was proof that the script
   * had crashed. This runs with the repo as cwd.
   */
  const stdoutOf = (options: string): string => {
    const script = `import {config} from 'dotenv'; config({path:'.env.test'${options}});`;

    // stderr is piped separately and discarded, so what comes back is stdout
    // alone — which is the stream the claim is about.
    return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
  };

  it('prints to stdout without quiet', () => {
    expect(stdoutOf(''), 'dotenv announces itself on the data stream').toMatch(/injected env/);
  });

  it('prints nothing with quiet: true', () => {
    expect(stdoutOf(', quiet: true')).toBe('');
  });
});
