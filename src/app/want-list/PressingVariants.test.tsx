import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PressingVariants } from './PressingVariants';

/**
 * SPEC.md §12b (A55) — the rendered variant panel.
 *
 * Component layer because the claim is about what reaches the SCREEN: the
 * pure function is tested separately, and a component that received the panel
 * and rendered none of it would pass every one of those tests.
 */
const render = (props: Parameters<typeof PressingVariants>[0]) =>
  renderToStaticMarkup(<PressingVariants {...props} />);

describe('the rendered variant panel (A55)', () => {
  /** The Halcyon Digest case, as it would read with the pressing attached. */
  it('renders the descriptor and runout verbatim', () => {
    const html = render({
      pressing: {
        catalogNumber: 'CAD 3X38',
        matrixRunout: 'Salt',
        countryPressed: 'UK',
        colorVariant: 'White, Early fadeout (Desire Lines)',
        pressingPlant: null,
        yearPressed: null,
      },
    });

    expect(html).toContain('CAD 3X38');
    expect(html).toContain('Salt');
    expect(html).toContain('White, Early fadeout (Desire Lines)');
  });

  /**
   * Fails against a panel that renders nothing for the no-pressing case. The
   * empty state must SAY which empty it is — "no pressing attached" and "this
   * pressing has no variant data" suggest different actions.
   */
  it('says which empty it is when no pressing is attached', () => {
    const html = render({ pressing: null });

    expect(html).toMatch(/no target pressing/i);
  });

  it('says something different when a pressing carries no detail', () => {
    const html = render({
      pressing: {
        catalogNumber: null,
        matrixRunout: null,
        countryPressed: null,
        colorVariant: null,
        pressingPlant: null,
        yearPressed: 2010,
      },
    });

    expect(html).toMatch(/no identifying details/i);
    expect(html).not.toMatch(/no target pressing/i);
  });

  /**
   * **The load-bearing assertion of this unit.** Fails against a panel that
   * generates, summarises or interprets. These values are relayed from Discogs
   * and the user's own entry — the panel must not add a claim the app cannot
   * support, which is the fabrication A55 exists to replace.
   */
  it('asserts nothing beyond the values it was given', () => {
    const html = render({
      pressing: {
        catalogNumber: 'CAD 3X38',
        matrixRunout: 'Salt',
        countryPressed: 'UK',
        colorVariant: 'White, Early fadeout (Desire Lines)',
        pressingPlant: null,
        yearPressed: null,
      },
    });

    // No verdict vocabulary, no ranking, no recommendation.
    expect(html).not.toMatch(/original|reissue|repress|sounds better|best|seek|worth/i);
    expect(html).not.toMatch(/gatefold/i);
  });

  /** Fails against a panel rendering an em-dash for fields it does not have. */
  it('omits absent fields rather than dashing them', () => {
    const html = render({
      pressing: {
        catalogNumber: 'CAD 3X38',
        matrixRunout: null,
        countryPressed: null,
        colorVariant: null,
        pressingPlant: null,
        yearPressed: null,
      },
    });

    /*
     * Scoped to the FIELD LIST. An earlier version asserted the em-dash was
     * absent from the whole markup and failed on the caption's own prose — a
     * decorative assertion that would have rejected correct code, which is the
     * shape this project keeps recording. The claim is about placeholders in the
     * list, so the assertion looks there.
     */
    const list = html.slice(html.indexOf('<dl'), html.indexOf('</dl>'));

    expect(list).not.toContain('—');
    expect(list).not.toMatch(/Matrix/i);
    expect(list).toContain('CAD 3X38');
  });
});
