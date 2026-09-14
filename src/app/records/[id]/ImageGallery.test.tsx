import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
/* Supplies the router context the component calls; never a value under test. */
import '../../../../test/component/next-navigation';
import { ImageGallery } from './ImageGallery';
import type { GalleryImage } from './gallery-order';

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

  it('shows the groups when there is a non-cover image, and no empty sentence', () => {
    const html = renderToStaticMarkup(
      <ImageGallery recordId="r1" images={[image('c', 'cover'), image('b', 'back')]} base="oklch(0.7 0.06 60)" />,
    );

    expect(html).not.toContain('No images yet');
    expect(html).toContain('Back');
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
