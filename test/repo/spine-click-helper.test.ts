import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A spec clicks a spine through `clickSpine` and no other way (28 Oct).**
 *
 * The wall-route Escape test clicked a spine as soon as the labelled wall
 * was visible, before the wall had hydrated and landed, and flaked in two
 * consecutive gates. Three tests in the same file already waited on the
 * right condition with a helper, and nothing required its use, so the
 * fourth test was simply the one that got found. The condition now lives
 * in `e2e/wall-ready.ts`, and this refuses a spec that clicks a `[data-spine]`
 * locator directly: a `.click(` on a line that names `data-spine`, or a
 * `.click(` on a name assigned from one.
 */
const E2E = join(import.meta.dirname, '..', '..', 'e2e');

export function directSpineClicksIn(text: string, file: string): string[] {
  const lines = text.split('\n');
  /* A locator named from a spine, then clicked by its name. */
  const spineNames = new Set(lines.flatMap((line) => { const m = /\b(?:const|let)\s+(\w+)\s*=.*data-spine/.exec(line); return m === null ? [] : [m[1]]; }));
  const found: string[] = [];
  lines.forEach((line, i) => {
    /* The allowed exceptions say so on their line: the fallback with JavaScript disabled, where no mark can be set, and §W.8's hold tests, which click inside the window on purpose. */
    if (!/\.click\(/.test(line) || /clickSpine\(/.test(line) || /spine-click: (javascript disabled|before hydration, §W\.8)/.test(line)) return;
    const receiver = /\b(\w+)(?:\.(?:first|last|nth)\([^)]*\))?\.click\(/.exec(line)?.[1];
    if (/data-spine/.test(line) || (receiver !== undefined && spineNames.has(receiver))) found.push(`${file}:${i + 1}`);
  });
  return found;
}

const directSpineClicks = (file: string) => directSpineClicksIn(readFileSync(join(E2E, file), 'utf8'), file);

describe('a spec clicks a spine only through clickSpine', () => {
  /* Fails against the tree before the helper: twelve specs clicked spines directly. */
  it('finds no spec clicking a [data-spine] locator directly', () => {
    const offenders = readdirSync(E2E)
      .filter((f) => f.endsWith('.spec.ts'))
      .flatMap(directSpineClicks);
    expect(offenders, `specs clicking a spine without waiting for the wall to be at rest:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  /* Fails against a scan that reads the click's own line only: a spine named and clicked by its name; and against one that reads a window of lines, which flagged the turn control clicked two lines after a spine. */
  it('reads a spine clicked by the name it was given, lets clickSpine through, and leaves a later click on another control alone', () => {
    const built = "const spine = page.locator('[data-seat] [data-spine]').first();\nawait expect(spine).toBeVisible();\nawait spine.click();\nawait page.getByTestId('action-turn').click();\n";
    expect(directSpineClicksIn(built, 'x.spec.ts')).toEqual(['x.spec.ts:3']);
    expect(directSpineClicksIn("await clickSpine(page, page.locator('[data-seat] [data-spine]').first());\n", 'x.spec.ts')).toEqual([]);
    expect(directSpineClicksIn("await page.getByRole('button').click();\n", 'x.spec.ts')).toEqual([]);
    expect(directSpineClicksIn("await plain.locator('[data-seat] [data-spine]').click(); /* spine-click: javascript disabled */\n", 'x.spec.ts')).toEqual([]);
    expect(directSpineClicksIn("await spine(page, ids[2]).click(); /* spine-click: before hydration, §W.8 */\n", 'x.spec.ts')).toEqual([]);
  });
});
