import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { RecordPanel } from './RecordPanel';
import type { RecordSummary } from './summary';

/**
 * §11.19: the panel's order is the record screen's, not a summary of it —
 * artist, title, year, then the note, then the fact groups on their
 * hairlines, then Open the full record and the two verbs. Turn over and Put
 * back sit together at the foot because they are the two things you can do
 * to the object; Open the full record sits above them because it leaves
 * this surface (§3's rule, a departure separated from an interaction).
 */
const summary: RecordSummary = {
  title: 'Bitches Brew',
  artist: 'Miles Davis',
  year: 1970,
  href: '/records/r',
  furtherFacts: 3,
  snippet: { text: 'A note.', generated: true },
  factGroups: [
    { kind: 'pressing', rows: [{ label: 'Country', value: 'UK' }, { label: 'Pressed', value: '1970' }, { label: 'Label', value: 'CBS' }] },
    { kind: 'provenance', rows: [{ label: 'Paid', value: '£18' }, { label: 'Bought', value: 'Sounds of the Universe' }] },
  ],
};
const render = (over: Partial<RecordSummary> = {}) =>
  renderToStaticMarkup(<RecordPanel summary={{ ...summary, ...over }} alwaysExpanded onTurnOver={() => undefined} onPutBack={() => undefined} />);
const at = (html: string, marker: string) => {
  const index = html.indexOf(marker);
  expect(index, marker).toBeGreaterThan(-1);
  return index;
};

describe('the panel’s order is the record screen’s (§11.19)', () => {
  it('runs artist, title, year, note, fact groups, the link, then the two verbs together at the foot', () => {
    const html = render();
    const order = [
      'data-testid="panel-artist"',
      'data-testid="summary-title"',
      'data-testid="panel-year"',
      'data-testid="panel-snippet"',
      'data-testid="panel-facts"',
      'data-testid="panel-detail-link"',
      'data-testid="action-turn"',
      'data-testid="action-put"',
    ].map((marker) => at(html, marker));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('>Miles Davis<');
    expect(html).toContain('>Bitches Brew<');
    expect(html).toContain('>1970<');
  });

  it('sets each fact group on its own hairline, labelled by its kind, its values run together with middle dots', () => {
    const html = render();
    const facts = html.slice(at(html, 'data-testid="panel-facts"'), at(html, 'data-testid="panel-detail-link"'));
    const pressing = facts.slice(facts.indexOf('data-group="pressing"'), facts.indexOf('data-group="provenance"'));
    expect(pressing).toContain('border-t');
    expect(pressing).toMatch(/>PRESSING<|>Pressing</);
    expect(pressing).toContain('UK · 1970 · CBS');
    const provenance = facts.slice(facts.indexOf('data-group="provenance"'));
    expect(provenance).toContain('£18 · Sounds of the Universe');
  });

  it('carries no count of further facts and no truncation — the facts themselves are here', () => {
    const html = render();
    expect(html).not.toContain('summary-further');
    expect(html).not.toContain('more facts');
    expect(html).not.toContain('truncate');
  });

  it('omits the year and the note when there are none, keeping the rest in order', () => {
    const html = render({ year: null, snippet: null, factGroups: [] });
    expect(html).not.toContain('data-testid="panel-year"');
    expect(html).not.toContain('data-testid="panel-snippet"');
    expect(html).not.toContain('data-testid="panel-facts"');
    expect(at(html, 'data-testid="panel-detail-link"')).toBeLessThan(at(html, 'data-testid="action-turn"'));
  });
});
