import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **Every component on the record screen speaks one type vocabulary.**
 *
 * `grid-type.ts` already declares itself the single definition for the screen's
 * labels, and five of the six sections below the fold import `LABEL` from it.
 * `MarketPanel` imports nothing and sets `text-xs` / `text-sm` /
 * `text-muted-foreground` directly — sizes outside the scale entirely, on a
 * component rendered on this screen AND on `/want-list`, where every other
 * element uses the scale.
 *
 * §8 puts the sections below the fold on the frame's type, ink and hairlines.
 * A component using Tailwind's default scale cannot be on that type by
 * accident: `text-xs` is 12px and `text-sm` is 14px, and neither is a role the
 * scale names.
 *
 * **Asserted on the source rather than on a rendering** because the claim is
 * about which vocabulary the file speaks, and a rendering would only show the
 * one state that happened to be on screen — `MarketPanel` returns `null` for a
 * record with no Discogs release, which is most of them.
 */

/** Tailwind's default sizes. Off-scale by construction: the scale names roles. */
const OFF_SCALE = /\btext-(xs|sm|base|lg|xl|2xl|3xl)\b/g;

/** Every component rendered on `/records/[id]`, frame and below the fold. */
const SCREEN = [
  'src/app/records/[id]/page.tsx',
  'src/app/records/[id]/RecordPage8a.tsx',
  'src/app/records/[id]/IdentityCell.tsx',
  'src/app/records/[id]/RecordDetail.tsx',
  'src/app/records/[id]/ImageGallery.tsx',
  'src/app/records/[id]/AboutCell.tsx',
  'src/app/records/[id]/PriceHistory.tsx',
  'src/app/records/[id]/RecordJournal.tsx',
  'src/app/records/[id]/DeleteRecord.tsx',
  'src/app/market/MarketPanel.tsx',
  /*
    `/` — the page around the wall takes the record screen's system: type
    scale and roles, hairlines, mono-data and sans-prose, the control and field
    specifications. The wall DRAWING keeps its own geometry and is not listed;
    the chrome around it is application rather than design.
  */
  'src/app/page.tsx',
  'src/app/CollectionFilters.tsx',
  'src/app/WallRail.tsx',
  'src/app/CollectionList.tsx',
  'src/app/CollectionPagination.tsx',
];

describe('the record screen speaks one type vocabulary', () => {
  it('uses no off-scale size class anywhere on the screen', () => {
    /*
      **Scanned inside class strings, not across the whole source.** The first
      version matched the raw file and flagged the COMMENT recording what a
      value used to be — so writing down the defect reintroduced it. A rule
      that fires on its own explanation cannot be left in place.
    */
    const offenders: string[] = [];

    for (const file of SCREEN) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const classes = match[1] ?? match[2] ?? '';
        for (const hit of classes.matchAll(OFF_SCALE)) {
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${file}:${line} ${hit[0]}`);
        }
      }
    }

    expect(offenders, `off-scale sizes:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('labels every section through one definition, not six', () => {
    /**
     * **The rule survived; its subject moved.**
     *
     * This asserted that each of six components imported `LABEL` from
     * `grid-type`, because each labelled itself and six copies of a label
     * style is A61's fifteen-places defect.
     *
     * §9.1 then made the label a property of the SECTION: `Section.tsx`
     * renders it in the rail, and `SnippetPanel`, `PriceHistory` and
     * `RecordJournal` stopped importing `LABEL` because they no longer label
     * anything. The old assertion failed — and it failed for having been
     * superseded, not for anything being wrong, which is the shape recorded in
     * NOTES this round.
     *
     * So it asserts the claim rather than the old mechanism: **every component
     * that renders a label gets it from the one definition.** A component that
     * does not label is not required to import a label.
     */
    const LABELLING = [
      'src/app/records/[id]/Section.tsx',
      /* §53 (step 60a): the About cell labels its own control line, in the label's 11px mono. */
      'src/app/records/[id]/AboutCell.tsx',
      'src/app/records/[id]/RecordDetail.tsx',
      'src/app/records/[id]/ImageGallery.tsx',
      'src/app/market/MarketPanel.tsx',
    ];

    for (const file of LABELLING) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} imports the shared label`).toMatch(
        /from '(\.\/|@\/app\/records\/\[id\]\/)grid-type'/,
      );
    }

    /*
      And nothing defines a second one: the treatment appears in `grid-type`
      and nowhere else. This is the half that would catch a component
      hand-rolling `text-label font-mono uppercase` instead of importing it.
    */
    const SCREEN_SOURCES = SCREEN.map((file) => [file, readFileSync(file, 'utf8')] as const);
    const handRolled = SCREEN_SOURCES.filter(
      ([file, source]) =>
        file !== 'src/app/records/[id]/grid-type.ts' &&
        /text-label[^'"`]*font-mono[^'"`]*uppercase/.test(source),
    ).map(([file]) => file);

    expect(handRolled, `these rebuild the label instead of importing it:\n${handRolled.join('\n')}`).toEqual(
      [],
    );
  });

  it('sets no uppercase label in the sans face', () => {
    /**
     * §4's label is mono, uppercase, tracked. `ImageGallery`'s per-image
     * headings were uppercase INTER — the only uppercase sans on the page, and
     * a second label treatment standing beside the real one.
     *
     * Matched as `uppercase` without `font-mono` in the same class string,
     * which is what the defect looked like.
     */
    const offenders: string[] = [];

    for (const file of SCREEN) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const classes = match[1] ?? match[2] ?? '';
        if (!classes.includes('uppercase')) continue;
        /* LABEL carries the mono itself, so an interpolation of it is fine. */
        if (classes.includes('font-mono') || classes.includes('LABEL')) continue;
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${file}:${line} ${classes.trim().slice(0, 70)}`);
      }
    }

    expect(offenders, `uppercase without mono:\n${offenders.join('\n')}`).toEqual([]);
  });
});
