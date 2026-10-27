import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseBullets, shippedComment } from '../../scripts/withdrawals.mjs';

/**
 * `scripts/build-clause.mjs`: Code's half of WITHDRAWALS.md, the Build clause
 * on an entry, written by entry id. Design writes entries; Code writes and
 * corrects their Build clauses and derives the comment (the coordinator,
 * 27 Oct). It replaces an ad-hoc edit whose "exactly once" guard was wrong:
 * after a derive every clause stands twice, in the bullet and in the
 * machine-readable comment, so the guard refused every legitimate edit made
 * after a derive (1d69cb0, whose message claimed edits it did not carry).
 */
const FILE = [
  '# Withdrawals',
  '',
  '- **`P.9/one`**: §P.9, withdrawn by §P.9. The first claim. Build: believed to follow; not yet run.',
  '  > Withdrawn within §P.9: the first claim.',
  '- **`P.9/two`**: §P.9, withdrawn by §P.9. The second claim, with no clause yet.',
  '  > Withdrawn within §P.9: the second claim.',
  '',
].join('\n');

let dir: string | null = null;
const fileWith = (content: string) => {
  dir = mkdtempSync(join(tmpdir(), 'build-clause-'));
  const path = join(dir, 'WITHDRAWALS.md');
  writeFileSync(path, content);
  return path;
};
afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

const run = (path: string, ...args: string[]) => spawnSync('node', ['scripts/build-clause.mjs', '--file', path, ...args], { encoding: 'utf8' });

describe('build-clause.mjs', () => {
  it('replaces an entry’s existing Build clause in the bullet, and leaves the other entry alone', () => {
    const path = fileWith(FILE);
    const r = run(path, 'P.9/one', 'followed it, confirmed by running.');
    expect(r.status, r.stderr).toBe(0);
    const entries = parseBullets(readFileSync(path, 'utf8'));
    expect(entries.find((e) => e.id === 'P.9/one')?.what).toBe('The first claim. Build: followed it, confirmed by running.');
    expect(entries.find((e) => e.id === 'P.9/two')?.what).toBe('The second claim, with no clause yet.');
  });

  it('adds a Build clause where the entry has none', () => {
    const path = fileWith(FILE);
    expect(run(path, 'P.9/two', 'nothing to follow; not built.').status).toBe(0);
    expect(parseBullets(readFileSync(path, 'utf8')).find((e) => e.id === 'P.9/two')?.what).toBe('The second claim, with no clause yet. Build: nothing to follow; not built.');
  });

  it('edits after a derive, when the clause also stands in the machine-readable comment, and re-derives it', () => {
    const path = fileWith(FILE);
    expect(run(path, 'P.9/one', 'first clause.').status).toBe(0);
    const once = readFileSync(path, 'utf8');
    expect(shippedComment(once), 'the precondition: the comment carries the clause too').toContain('first clause.');
    expect(run(path, 'P.9/one', 'second clause.').status, 'the second edit, with the clause standing twice').toBe(0);
    const twice = readFileSync(path, 'utf8');
    expect(parseBullets(twice).find((e) => e.id === 'P.9/one')?.what).toBe('The first claim. Build: second clause.');
    expect(shippedComment(twice)).toContain('second clause.');
    expect(shippedComment(twice)).not.toContain('first clause.');
    expect(twice.split('first clause.').length - 1, 'the old clause is gone from bullet and comment alike').toBe(0);
  });

  it('refuses an id the file does not hold, and writes nothing', () => {
    const path = fileWith(FILE);
    const r = run(path, 'P.9/none', 'anything.');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('P.9/none');
    expect(readFileSync(path, 'utf8')).toBe(FILE);
  });

  it('refuses a clause that does not end a sentence, since the quote line must follow a finished description', () => {
    const path = fileWith(FILE);
    expect(run(path, 'P.9/one', 'no full stop').status).toBe(1);
    expect(readFileSync(path, 'utf8')).toBe(FILE);
  });
});
