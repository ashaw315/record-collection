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
  'src/app/records/[id]/SnippetPanel.tsx',
  'src/app/records/[id]/PriceHistory.tsx',
  'src/app/records/[id]/RecordJournal.tsx',
  'src/app/records/[id]/DeleteRecord.tsx',
  'src/app/market/MarketPanel.tsx',
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

  it('labels every section through the shared definition', () => {
    /*
      The six sections below the fold all label themselves, and six copies of a
      label style is A61's fifteen-places defect. `grid-type.ts` names itself
      the one definition; this asserts the files it names actually import it.
    */
    /*
      `RecordJournal` is deliberately absent: 8a's journal cell carries the
      label, so the section below it has no heading of its own to share a
      definition with. A file listed here that stops labelling itself should
      leave this list rather than keep an unused import to satisfy it.
    */
    const LABELLED = [
      'src/app/records/[id]/RecordDetail.tsx',
      'src/app/records/[id]/ImageGallery.tsx',
      'src/app/records/[id]/SnippetPanel.tsx',
      'src/app/records/[id]/PriceHistory.tsx',
      'src/app/market/MarketPanel.tsx',
    ];

    for (const file of LABELLED) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} imports the shared label`).toMatch(
        /from '(\.\/|@\/app\/records\/\[id\]\/)grid-type'/,
      );
    }
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
