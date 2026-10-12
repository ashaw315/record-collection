import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * **A capture under a coarse pointer is not taken with `fullPage: true`.**
 *
 * Chromium's full-page screenshot drops the touch emulation while it draws
 * and leaves it dropped until the next navigation (measured 11 Oct: coarse
 * and 957 tall before, fine and 844 after; a window screenshot changes
 * nothing). So every full-page capture taken with touch on was a picture of
 * the fine pointer's drawing on a sheet as long as the coarse pointer's
 * page: stats at 390 came out with 508 of blank paper beneath By store,
 * which Design read as a defect in the page and ruled a step to remove.
 * The numbers beside those pictures were read before the screenshot and
 * were right; the pictures were not what they were named.
 *
 * `e2e/whole-page.ts` takes the whole page as a window screenshot of a
 * window as tall as the page, and stops if the pointer changed under it.
 * This is the check for the next sheet, which will not know.
 */
function files(dir: string): string[] {
  return readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []));
}

describe('captures under a coarse pointer', () => {
  it('no file that turns touch on takes a full-page screenshot', () => {
    const offenders = files('e2e').filter((path) => {
      const body = readFileSync(join(REPO_ROOT, path), 'utf8');
      return /hasTouch/.test(body) && /fullPage:\s*true/.test(body);
    });
    expect(offenders, `these turn touch on and screenshot with fullPage, which draws the fine pointer’s page; use wholePage from e2e/whole-page.ts:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
