import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
/* Supplies the router context the component calls; never a value under test. */
import '../../../../test/component/next-navigation';
import { ImageGallery } from './ImageGallery';
import type { GalleryImage } from './gallery-order';
import { recordLadder } from '@/lib/colour/record-ladder';

/**
 * **"No images yet" is false when the record has a cover.**
 *
 * The frame owns the cover, so `groupImages` excludes it — which makes a record
 * whose only image IS a cover produce no groups, exactly like a record with no
 * images at all. `gallery-order.test.ts` asserts those two are identical at
 * that layer, on purpose: the grouping function cannot tell them apart and must
 * not try.
 *
 * The component can, because it receives every image. And it has to, because
 * the two states want opposite sentences: one invites a first photograph, the
 * other says where the photograph already is.
 *
 * **Every record in the collection is in the second state** — seventeen of
 * seventeen have exactly one image and it is a cover — so the wrong sentence
 * here is what the whole collection would render.
 */

const image = (id: string, imageType: GalleryImage['imageType']): GalleryImage => ({
  id,
  url: `https://example.test/${id}.jpg`,
  imageType,
  caption: null,
  createdAt: '2024-01-01T00:00:00Z',
});

describe('the gallery says which kind of empty it is', () => {
  it('invites a first photograph when the record has no images at all', () => {
    const html = renderToStaticMarkup(<ImageGallery recordId="r1" images={[]} base="oklch(0.7 0.06 60)" />);

    expect(html).toContain('No images yet');
  });

  it('does not say "no images yet" when the cover is the only image', () => {
    /*
      The load-bearing one. This is what all seventeen records render, and the
      sentence it must not say is a claim the reader can see is untrue — the
      cover is on the same screen, six columns wide.
    */
    const html = renderToStaticMarkup(
      <ImageGallery recordId="r1" images={[image('c', 'cover')]} base="oklch(0.7 0.06 60)" />,
    );

    expect(html).not.toContain('No images yet');
  });

  it('says where the cover is, rather than saying nothing', () => {
    /**
     * Nothing at all would be honest but unhelpful: the reader has no way to
     * know the gallery is for the OTHER photographs, and "add an image" sitting
     * above an empty region reads as a failed upload.
     */
    const html = renderToStaticMarkup(
      <ImageGallery recordId="r1" images={[image('c', 'cover')]} base="oklch(0.7 0.06 60)" />,
    );

    /*
      **Located by handle, not by the word.** The first version matched
      /cover/i, which passed on the `<option>Cover</option>` in the upload
      control that is present in every state — a check that could not fail.
    */
    expect(html).toContain('data-testid="gallery-cover-note"');
  });

  it('§56: flows every non-cover image in one grid, each tile badged with its type, with no group heading and no empty sentence', () => {
    const html = renderToStaticMarkup(
      <ImageGallery recordId="r1" images={[image('c', 'cover'), image('l', 'label'), image('b', 'back')]} base="oklch(0.7 0.06 60)" />,
    );

    expect(html).not.toContain('No images yet');
    expect(html.match(/data-image-grid/g), 'one grid').toHaveLength(1);
    expect(html, 'no group heading').not.toMatch(/<h3/);
    /* The badge names the type on the tile, in the fixed order: back before label. */
    const badges = Array.from(html.matchAll(/data-testid="image-badge"[^>]*>([^<]*)</g)).map((m) => m[1]);
    expect(badges).toEqual(['Back', 'Label']);
    /* §60: the disc's reference is a stated height, so nothing in the rendering is kept or marked for it: no blank note row, no exclusion mark on the grid. */
    expect(html, 'no blank row stands in for the cover note').not.toContain('gallery-note-row');
    expect(html, 'the stale sentence is not shown').not.toContain('data-testid="gallery-cover-note"');
    expect(html, 'the grid is not marked out of a host measure').not.toContain('data-not-host-height');
  });

  it('never renders the cover as a gallery tile: it is in the covers group only (§56, then §62)', () => {
    /*
      §56's repetition stays removed from the GRID; since §62 (step 165) the
      cover is drawn once more, in the group of covers the section now keeps.
      Until step 165 this asserted the cover's URL absent from the whole
      markup, which §62's group makes false by ruling.
    */
    const html = renderToStaticMarkup(
      <ImageGallery recordId="r1" images={[image('c', 'cover'), image('b', 'back')]} base="oklch(0.7 0.06 60)" />,
    );

    const grid = html.slice(html.indexOf('data-image-grid'), html.indexOf('</ul>', html.indexOf('data-image-grid')));
    expect(grid).not.toContain('/c.jpg');
    expect(grid).toContain('/b.jpg');
  });
});

/**
 * **§62 (step 165): the covers group.** "The group lists every cover the
 * record holds, newest first, and the cover the page shows is first and
 * marked as the one shown." Each has a delete control, as a tile has. With no
 * cover there is no group (§54).
 */
describe('§62: the covers group in the Images section', () => {
  const cover = (id: string, createdAt: string): GalleryImage => ({ ...image(id, 'cover'), createdAt });

  it('lists every cover newest first, marks the first as shown, and gives each a delete control', () => {
    const html = renderToStaticMarkup(
      <ImageGallery
        recordId="r1"
        images={[cover('old', '2026-01-01T00:00:00Z'), image('b', 'back'), cover('new', '2026-01-03T00:00:00Z'), cover('mid', '2026-01-02T00:00:00Z')]}
        base="oklch(0.7 0.06 60)"
      />,
    );
    expect(html.match(/data-cover-group/g), 'one group').toHaveLength(1);
    const tiles = Array.from(html.matchAll(/<li[^>]*data-cover-tile[^>]*>/g)).map((m) => m[0]);
    expect(tiles, 'three covers').toHaveLength(3);
    expect(tiles.map((t) => /data-shown/.test(t)), 'the first is marked, the others not').toEqual([true, false, false]);
    /* Newest first: the order of the URLs in the markup. */
    const order = ['new', 'mid', 'old'].map((id) => html.indexOf(`/${id}.jpg`));
    expect(order.every((at) => at > 0), 'every cover is drawn').toBe(true);
    expect([...order].sort((a, b) => a - b), 'in that order').toEqual(order);
    expect(html.match(/aria-label="Delete this cover image"/g), 'a delete on each').toHaveLength(3);
    /* The mark is readable, not only an attribute. */
    expect(html).toMatch(/data-cover-tile[^>]*data-shown[\s\S]*?Shown/);
  });

  it('draws no group for a record with no cover (§54)', () => {
    const html = renderToStaticMarkup(<ImageGallery recordId="r1" images={[image('b', 'back')]} base={null} />);
    expect(html).not.toContain('data-cover-group');
  });
});

/**
 * **§53 (step 61): the base quarter-disc moves to Images.** "The base
 * quarter-disc moves to the rendered section that now ends the snippet's row
 * at the page's right edge, bounded by §29 against that host." The section
 * primitive draws the flat whose `beside` names it, when it has the ladder;
 * the gallery never received one, because the disc sat beside the row below.
 */
describe('§53: the Images section hosts the base quarter-disc', () => {
  const ladder = recordLadder('#a25829');
  it('draws the quarter-disc in its section when given the record’s ladder', () => {
    const html = renderToStaticMarkup(<ImageGallery recordId="r1" images={[]} base={ladder?.base ?? null} ladder={ladder} />);
    expect(html).toContain('data-section="images"');
    expect(html, 'the flat, in the section').toMatch(/data-ornament="flat"[^>]*data-flat="quarterDisc"|data-flat="quarterDisc"[^>]*data-ornament="flat"/);
  });
  /* §54 (step 62): re-pointed. The gate this asserted dropped a §5.1 mark on the no-cover record; the disc now draws at ink without a ladder. */
  it('draws the quarter-disc at ink without a ladder (§54)', () => {
    const html = renderToStaticMarkup(<ImageGallery recordId="r1" images={[]} base={null} />);
    expect(html).toContain('data-flat="quarterDisc"');
    expect(html).toContain('background:oklch(0.19 0.008 60)');
  });
});

/**
 * **The form's default type is the one whose upload shows.** Cover was the
 * default, and a cover upload is invisible on this screen: the sleeve shows
 * the oldest cover, the gallery leaves every cover out, and the spine colour
 * is set only once. On 1 Oct the collection's owner uploaded the same cover
 * three times in fifty seconds, each stored, none shown. Back is the next
 * type in examination order and the first the gallery draws.
 */
describe('the upload form’s default type is one the gallery will show', () => {
  it('selects Back, not Cover, before the reader touches the control', () => {
    const html = renderToStaticMarkup(
      <ImageGallery recordId="r1" images={[image('c', 'cover')]} base="oklch(0.7 0.06 60)" />,
    );
    const select = html.slice(html.indexOf('<select'), html.indexOf('</select>'));
    expect(select, 'Back is the selected option').toMatch(/<option[^>]*\bselected=""[^>]*value="back"|<option[^>]*value="back"[^>]*\bselected=""/);
    expect(select, 'and Cover is not').not.toMatch(/<option[^>]*\bselected=""[^>]*value="cover"|<option[^>]*value="cover"[^>]*\bselected=""/);
    /* Cover stays available: the type is legal, only the default moves. */
    expect(select).toContain('value="cover"');
  });
});

/*
  Design's review of Q5 (8 Nov): the covers group's Delete was drawn in the browser's default button, a grey box in
  the system font, beside actions in the app's label type: §63's mistake, the machine's type and not the app's. The
  grid's tile Delete is the same element. Asserted on the class strings the app's controls share, so the type comes
  from `grid-type.ts` and cannot drift back to a component library's default.
*/
describe('every tile Delete is drawn in the app’s label type, in ink, in a hairline box', () => {
  it('gives the covers group’s and the grid’s Delete the label type, the ink and the hairline, and none of the button library’s outline', async () => {
    const { LABEL_TYPE, INK, HAIRLINE } = await import('./grid-type');
    const covers = [image('c1', 'cover'), image('c2', 'cover'), image('b1', 'back')];
    const html = renderToStaticMarkup(<ImageGallery recordId="r1" images={covers} base="oklch(0.7 0.06 60)" />);
    const deletes = [...html.matchAll(/<button[^>]*aria-label="Delete this [a-z ]+ image"[^>]*>/g)].map((m) => m[0]);
    expect(deletes, 'two covers and one back').toHaveLength(3);
    for (const b of deletes) {
      for (const cls of `${LABEL_TYPE} ${INK} ${HAIRLINE}`.split(' ')) expect(b, cls).toContain(cls);
      expect(b, 'not the library’s rounded box').not.toContain('rounded-lg');
      expect(b, 'not the library’s own type').not.toMatch(/text-sm|font-medium/);
    }
  });
});
