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
    /* §56: the quarter-disc is sized against the section as it stands with one image, so the grid is marked out of the host's height and the note's row is kept, blank. */
    expect(html, 'the grid is excluded from the disc’s host height').toMatch(/data-image-grid[^>]*data-not-host-height|data-not-host-height[^>]*data-image-grid/);
    expect(html, 'the cover note’s row stays as height, not as a sentence').toMatch(/data-testid="gallery-note-row"[^>]*aria-hidden="true"[^>]*visibility:hidden/);
    expect(html, 'the stale sentence is not shown').not.toContain('data-testid="gallery-cover-note"');
  });

  it('§56: without a cover there is no note row to keep, so none is rendered beside the tiles', () => {
    const html = renderToStaticMarkup(
      <ImageGallery recordId="r1" images={[image('b', 'back')]} base="oklch(0.7 0.06 60)" />,
    );
    expect(html).not.toContain('gallery-note-row');
    expect(html).toContain('data-image-grid');
  });

  it('never renders the cover itself', () => {
    /* The repetition this whole pass exists to remove, asserted on the markup. */
    const html = renderToStaticMarkup(
      <ImageGallery recordId="r1" images={[image('c', 'cover'), image('b', 'back')]} base="oklch(0.7 0.06 60)" />,
    );

    expect(html).not.toContain('/c.jpg');
    expect(html).toContain('/b.jpg');
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
