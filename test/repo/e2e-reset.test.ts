import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The E2E database reset must stay WIRED IN, not merely present.
 *
 * A global-setup file that exists but is not referenced by the config is worse
 * than none: it reads as a guarantee while doing nothing, which is the hollow
 * -check shape this project keeps finding (see NOTES.md on the Neon gate).
 *
 * Asserted against the config's own text rather than by importing Playwright's
 * config machinery, which would drag the whole test runner into a unit test.
 */
describe('the Playwright E2E database reset', () => {
  const config = readFileSync('playwright.config.ts', 'utf8');
  const setup = readFileSync('e2e/global-setup.ts', 'utf8');

  it('is registered as globalSetup in playwright.config.ts', () => {
    expect(config).toMatch(/globalSetup:\s*'\.\/e2e\/global-setup\.ts'/);
  });

  it('reuses truncateAll rather than reimplementing the truncate', () => {
    /**
     * `truncateAll` carries the local-host guard that makes reaching a remote
     * database structurally impossible, and it excludes the seeded `formats`
     * rows. A hand-rolled TRUNCATE here would have to repeat both — and the one
     * that gets forgotten is the guard, which is the one that matters.
     */
    expect(setup).toContain('truncateAll');
    expect(setup).not.toMatch(/TRUNCATE\s+TABLE/i);
  });

  it('does not truncate between specs, only once per run', () => {
    // Specs run in parallel across two projects against one database. A
    // mid-run truncate would delete another spec's fixtures — the defect
    // `fileParallelism: false` fixed on the vitest side.
    expect(config).not.toMatch(/globalTeardown/);
    expect(setup).not.toContain('beforeEach');
  });
});
