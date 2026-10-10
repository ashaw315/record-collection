import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WantListEmpty } from './WantListEmpty';

/**
 * §T.6: "The want list carries LOOK UP A RECORD, a §9.3 control in its
 * heading's row, in both states, and its empty state adds none." The empty
 * state's sentence, as ruled: "Nothing on the want list yet. Look up a
 * record to add one." Its figure follows look up's: the source record's
 * construction at its clearing height, where there is one.
 *
 * An empty want list cannot be staged in the browser tests, whose database
 * the other worker fills; so the empty state is a component and is held
 * here.
 */
const figure = <svg data-probe-figure="" />;

describe('the want list’s empty state', () => {
  /* Fails against the sentence as built, "Nothing on the want list.", in a box with no figure. */
  it('still wanted: the figure, then the ruled sentence, and no control of its own', () => {
    const html = renderToStaticMarkup(<WantListEmpty acquired={false} figure={figure} />);
    expect(html).toContain('Nothing on the want list yet. Look up a record to add one.');
    expect(html.indexOf('data-probe-figure')).toBeGreaterThan(-1);
    expect(html.indexOf('data-probe-figure'), 'the figure is above the sentence').toBeLessThan(html.indexOf('Nothing on the want list yet.'));
    expect(html, 'no control in the empty state').not.toMatch(/<(a|button|input|select)\b/);
  });

  /* The Acquired view's sentence is not ruled and is kept; its whole list is empty too, so it has the figure. */
  it('acquired: its own sentence, with the figure, and no control', () => {
    const html = renderToStaticMarkup(<WantListEmpty acquired figure={figure} />);
    expect(html).toContain('Nothing acquired yet.');
    expect(html).not.toContain('Look up a record to add one');
    expect(html).toContain('data-probe-figure');
    expect(html).not.toMatch(/<(a|button|input|select)\b/);
  });

  /* "An empty collection has no figure": there is no source record to draw. */
  it('with no figure to draw, the sentence stands alone', () => {
    const html = renderToStaticMarkup(<WantListEmpty acquired={false} figure={null} />);
    expect(html).toContain('Nothing on the want list yet. Look up a record to add one.');
    expect(html).not.toContain('<svg');
  });
});
