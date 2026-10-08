import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A test that reads a value the CLIENT computes waits for the client's own
 * settled signal, never for something the server's markup already
 * satisfies (8 Oct).**
 *
 * `shelf.spec.ts` counted the wall's pieces after waiting for the wall to
 * be attached and for the count's text. The server's markup satisfies
 * both. Before the client measures the viewport that markup holds two
 * fixtures (`e2e/wall-measured.ts`), so on a slow machine the test read 12
 * pieces for 6 and failed a gate. The page already published the signal
 * the test needed and the test did not use it.
 *
 * **What this can check, and it is named for that.** Whether a read is of
 * a client-computed value is not decidable from source text. One case is:
 * the fixture's pieces and furniture are in the markup twice until the
 * wall measures, so any spec that reads them on the live wall must wait.
 * The probe page (`/wall/probe`) has no measured state and is exempt by
 * what it loads. Other client-computed reads, scroll positions among
 * them, are not covered here.
 */
const FIXTURE = /data-piece|data-furniture/;

describe('a spec that reads the wall’s fixture waits for the wall to have measured', () => {
  const specs = readdirSync('e2e').filter((name) => name.endsWith('.spec.ts'));
  const readers = specs.filter((name) => FIXTURE.test(readFileSync(join('e2e', name), 'utf8')));

  it('finds the specs that read the fixture', () => {
    expect(readers).toContain('shelf.spec.ts');
  });

  it.each(readers)('%s', (name) => {
    const source = readFileSync(join('e2e', name), 'utf8');
    const live = /goto\((?:'|`)\/(?:\?|'|`)/.test(source);
    const probeOnly = !live && source.includes('/wall/probe');
    if (probeOnly) return;
    expect(source, `${name} reads the fixture on the live wall and never waits for it to measure`).toMatch(/import \{[^}]*\bwallMeasured\b[^}]*\} from '\.\/wall-measured'/);
    /* Every test that reads the fixture calls the wait itself: a wait in one test says nothing for the next. */
    const starts = [...source.matchAll(/^test\(/gm)].map((m) => m.index);
    const reads = [...source.matchAll(/^.*(?:data-piece|data-furniture).*$/gm)].map((m) => m.index);
    for (const read of reads) {
      const start = Math.max(...starts.filter((at) => at <= read));
      const end = Math.min(...starts.filter((at) => at > read), source.length);
      const block = source.slice(start, end);
      expect(block.includes('wallMeasured(page'), `${name}: a test reads the fixture and never calls wallMeasured:\n${block.slice(0, 120)}`).toBe(true);
    }
  });
});
