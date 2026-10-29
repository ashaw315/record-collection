import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The two hand-run moods scripts have npm names (the coordinator, 29 Oct), so
 * Adam runs `npm run moods:tag` and `npm run moods:override -- --record <id>
 * --moods "…"` rather than copying a node line with three flags out of a
 * file header. The flags are the scripts' own: `--conditions=react-server`
 * lets `server-only` load outside Next, `--import tsx` runs `.mts`, and
 * `--env-file=.env.local` is where the model's key is. Fails against a
 * package.json without them.
 */
describe('the moods scripts are npm scripts', () => {
  const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;
  it.each([
    ['moods:tag', 'scripts/tag-moods.mts'],
    ['moods:override', 'scripts/override-moods.mts'],
  ])('%s runs %s with the flags the file header names', (name, file) => {
    expect(scripts[name], name).toBeDefined();
    expect(scripts[name]).toContain(file);
    for (const flag of ['--env-file=.env.local', '--conditions=react-server', '--import tsx']) expect(scripts[name], flag).toContain(flag);
  });
});
