import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A spec that types a declared number encodes a ruling rather than checking
 * one — and it fails on the day the ruling changes, not the day the code
 * breaks.**
 *
 * Four tests in one unit failed this way. `record-bands.spec.ts` asserted
 * `identity === 500` and `tail === 47`; the identity band took the tail
 * (547 / 0) and the spec failed for having been superseded. The failure message
 * is identical to a real break — `Expected: 500, Received: 547` is what a
 * broken layout says too — so three of the four were nearly fixed in the
 * component.
 *
 * Against `BANDS`, that spec fails only when the RENDERING disagrees with the
 * declaration, which is the claim it is actually for.
 *
 * **Scoped to the distinctive values.** 900 and 1728 are 8a's budget and cap;
 * 284 is the extended grid's content edge; 547 is the identity band. A spec
 * using one of these is talking about that ruling — unlike 34 or 44, which
 * appear as coordinates, timeouts and counts throughout.
 *
 * A viewport of `1280 × 900` on the WALL is not this defect: there 900 is a
 * chosen window, not 8a's budget. So the rule applies to specs that already
 * drive the record screen, listed by name — a spec joining that list adds
 * itself here, which is the point at which someone reads this note.
 */

const GOVERNED = [
  'e2e/record-bands.spec.ts',
  'e2e/record-page-8a.spec.ts',
  'e2e/extended-grid.spec.ts',
  'e2e/identity-cell.spec.ts',
  'e2e/page8a-marks.spec.ts',
  'e2e/colour-distribution.spec.ts',
  'e2e/capture/page8a.capture.ts',
  /*
    Added by the enumeration check below rather than by hand — it found four
    specs driving the record screen that the list had missed, which is what a
    list of names is always one commit away from.
  */
  'e2e/record-page-28.spec.ts',
  'e2e/flat-sizing-29.spec.ts',
  'e2e/capture/built-page.capture.ts',
  'e2e/capture/colour-budget.capture.ts',
  'e2e/capture/viewport-widths.capture.ts',
  'e2e/row-rules-33.spec.ts',
  'e2e/row-regroup-38.spec.ts',
  'e2e/record-band-41.spec.ts',
  'e2e/record-band-43.spec.ts',
  'e2e/floor-ceiling-measure.spec.ts',
  'e2e/title-ladder-45.spec.ts',
  'e2e/row-clip-29h.spec.ts',
  'e2e/page-fills-viewport.spec.ts',
  'e2e/title-ladder-33.spec.ts',
  'e2e/layout-sweep.spec.ts',
  'e2e/capture/breakpoints.capture.ts',
  'e2e/capture/about-lines.capture.ts',
  'e2e/capture/step29.capture.ts',
  'e2e/capture/real-captures.capture.ts',
  'e2e/real-records-paint.spec.ts',
  'e2e/about-row-36.spec.ts',
  'e2e/record-detail.spec.ts',
  'e2e/record-form.spec.ts',
  'e2e/frame-planes.spec.ts',
  'e2e/genres-collapse.spec.ts',
  /* §12's pass: the line set, the clipping band, and §8.1's deleted link. */
  'e2e/record-lines.spec.ts',
  'e2e/record-narrow.spec.ts',
  'e2e/record-back-route.spec.ts',
  'e2e/identity-band-holds.spec.ts',
  'e2e/identity-measure.spec.ts',
  'e2e/record-controls.spec.ts',
  /* §G.1 (step 80): the label system's tracking and the slot's type, read on the record screen. */
  'e2e/label-tracking-80.spec.ts',
  /* §33 (step 83): the cover's bounded crop, read as pixels on fixtures. */
  'e2e/cover-fit-83.spec.ts',
  'e2e/cover-wait-85.spec.ts',
  /* §33 (step 87): a photograph that fails is the no-cover frame. */
  'e2e/cover-fail-87.spec.ts',
  /* §M.4 to §M.6 (step 88): the gatefold's opening. */
  'e2e/gatefold-88.spec.ts',
  /* §M.6 (step 89): the cover's focus ring inside the square. */
  'e2e/trigger-ring-89.spec.ts',
  /* §M.3 (step 90): the modal's plain back on the record's field. */
  'e2e/plain-back-90.spec.ts',
  /* §M.7 (step 92): the cover's travel. */
  'e2e/cover-travel-92.spec.ts',
  /* §M.4 (step 93): the sleeve re-measured when the viewport settles. */
  'e2e/modal-resize-93.spec.ts',
  /* §M.1 (step 81): the record modal's view, opened from the cover. */
  'e2e/record-modal-81.spec.ts',
  /* §M.2 (step 82): the newest back, on the wall and in the modal. */
  'e2e/back-newest-82.spec.ts',
  /* §T.4 (step 98): a table row is one link to its record, and the test follows it there. */
  'e2e/table-98.spec.ts',
  /* §T.5 (step 99): a grid cell is one link to its record, and the test follows it there. */
  'e2e/grid-99.spec.ts',
  /* §T.6 (step 103a): the record page, its confirmation and its modal read for a rounded corner. */
  'e2e/radius-103.spec.ts',
  'e2e/colour-103.spec.ts',
  'e2e/screens-103.ts',
  'e2e/sheet/cover-boxes.sheet.ts',
  'e2e/sheet/record-modal.sheet.ts',
  'e2e/sheet/record-modal-92.sheet.ts',
  'e2e/sheet/collection-survey.sheet.ts',
  /* The five screens' survey reaches a record's edit form by its id. */
  'e2e/sheet/screens-survey.sheet.ts',
  /*
    Found by the enumeration's fourth pattern (6 Oct): specs that reach the
    record screen through a path handed to a helper. Five of them typed 900.
  */
  'e2e/every-page-has-nav.spec.ts',
  'e2e/nav-menu-76.spec.ts',
  'e2e/nav-menu-84.spec.ts',
  'e2e/nav-type-74.spec.ts',
  'e2e/record-panel.spec.ts',
  'e2e/sheet/header.sheet.ts',
  'e2e/sheet/nav-menu-cover.sheet.ts',
  'e2e/sheet/nav-menu.sheet.ts',
  'e2e/shelf-narrow.spec.ts',
  'e2e/shelf.spec.ts',
  'e2e/identity-band-23.spec.ts',
  'e2e/identity-extremes.spec.ts',
  'e2e/images.spec.ts',
  'e2e/lookup-flows.spec.ts',
  'e2e/snippet.spec.ts',
  /* §54 (step 62): the no-cover record on the probe page and on the route. */
  'e2e/no-cover-54.spec.ts',
  /* The contact sheet against the real collection: a separate config, the same screen. */
  'e2e/sheet/contact-sheet.sheet.ts',
  /* §57 (step 67): figures against type, on seeded records and on the real collection. */
  'e2e/figures-type-57.spec.ts',
  'e2e/sheet/figures-57.sheet.ts',
  /* §56 (step 66): the images row with one to six images, the disc against the one-image host. */
  'e2e/images-row-56.spec.ts',
  /* §59 (step 69): the disc yields to its caption; contrast on the real collection. */
  'e2e/sheet/disc-59.sheet.ts',
  /* Step 71: the tile's Delete control over the tile's top-right corner. */
  'e2e/delete-control-71.spec.ts',
];

/** The values a record-screen spec must not type. */
const DECLARED: Record<number, string> = {
  900: 'NO_SCROLL_HEIGHT',
  1728: 'MAX_GRID_WIDTH',
  547: 'BANDS.identity',
  284: 'CONTENT_X',
};

/**
 * Comments and STRING LITERALS may name a number.
 *
 * **The literals matter as much as the comments**, and the first version of
 * this rule missed them: it flagged `test('spends exactly 900px, measured
 * rather than summed')` and the message `'53 + 547 + 300 + 0, as RENDERED'`.
 * Those are documentation — a number in a test name cannot go stale in the way
 * this rule exists to catch, because nothing compares against it.
 *
 * Rewriting those names to interpolate constants would have made six good test
 * names worse to satisfy a rule aimed at something else, which is the rule
 * governing its own convenience rather than the defect.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    /* Strings, template literals and their contents. */
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('record-screen specs check the declaration rather than restating it', () => {
  it.each(GOVERNED)('%s types no declared constant', (path) => {
    const body = code(readFileSync(path, 'utf8'));
    const offenders: string[] = [];

    for (const [value, name] of Object.entries(DECLARED)) {
      /*
        Word-bounded, so 1728 does not match inside 17280 and 900 not in 1900 —
        and not inside `900_000` either: a numeric separator is part of the
        literal, and `lookup-flows` uses one for a Discogs id. The first version
        flagged it the moment that spec was governed.
      */
      const pattern = new RegExp(`(?<![\\d._])${value}(?![\\d._])`, 'g');
      const count = [...body.matchAll(pattern)].length;
      if (count > 0) offenders.push(`${value} (${name}) ×${count}`);
    }

    expect(
      offenders,
      `${path} types values it should import:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('names every spec that drives the record screen', () => {
    /**
     * **The list is the weak part, so it is checked.** A spec added later that
     * drives `/records/[id]` and types 900 would be invisible to the rule
     * above — the same enumeration defect this repo has recorded seven times.
     *
     * So: any spec mentioning the record page's testid must be in `GOVERNED`.
     * That is a property of the file rather than a judgement about it.
     */
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.ts')) {
          const source = readFileSync(path, 'utf8');
          /*
            Three ways a spec can drive the record screen. The third was added
            when `genres-collapse.spec.ts` navigated to `/records/` and read the
            identity cell without either handle — a spec the list missed and the
            enumeration could not see, which is the gap the enumeration exists
            to close.
          */
          if (
            source.includes('record-page-8a') ||
            source.includes('data-band="identity"') ||
            /goto\(`\/records\/\$\{/.test(source) ||
            /*
              A fourth, added 6 Oct: a record path built anywhere and handed
              to a helper that navigates. `nav-type-74` and `nav-menu-76` keep
              their screens in a table of paths and call one `goto(path)`, so
              the third pattern, which wants the template inside the `goto`,
              never saw them; that gap was recorded on 5 Oct and left open.
              Any template that builds `/records/<an id>` is a spec that can
              reach the screen. Not `/api/records/<id>`, which is a request
              and not a visit: the first version of this pattern caught
              `cleanup.ts` and `seventeen.ts` by it.
            */
            /`[^`]*(?<!\/api)\/records\/\$\{/.test(source)
          ) {
            found.push(path);
          }
        }
      }
    };
    walk('e2e');

    const missing = found.filter((path) => !GOVERNED.includes(path));

    expect(missing, `these drive the record screen but are not governed:\n${missing.join('\n')}`).toEqual(
      [],
    );
  });
});
