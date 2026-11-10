import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../../test/component/next-navigation';
import { TracklistSection } from './TracklistSection';
import { RecordDetail } from './RecordDetail';
import type { TracklistModel } from './tracklist';
import type { HydratedRecord } from '@/lib/db/queries/records';

/**
 * **173b: the TRACKLIST section (§65, "Credits fold" 7 Nov, "Credits by role and the count line" 8 Nov).** The tracks
 * drawn whole by position and title, in two columns from 960; the credits folded beneath them behind one line that
 * counts them, closed on every load, at every count, no line where the fold would hold nothing; opened, the release's
 * credits first, one line to a role, then each track's beneath its position and title. The section is placed in its own
 * row directly after Pressing detail's (§26), and a record with no cached release draws no section (§65, §38). The
 * model (173a) decides what is drawn; this draws it, so each test here fails against the component and not the model.
 */
const render = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

const model: TracklistModel = {
  tracks: ['A1 · Hear Nothing', 'A2 · The Nightmare Continues', 'A3 · The Final Bloodbath', 'B1 · Protest And Survive', 'B2 · I Won’t Subscribe'],
  release: ['Written-By · Discharge', 'Producer · Mike Stone'],
  byTrack: [{ track: 'A1 · Hear Nothing', lines: ['Vocals · Cal'] }, { track: 'B2 · I Won’t Subscribe', lines: ['Bass · Rainy', 'Drums · Garry'] }],
  companies: ['Pressed By · Orlake Records'],
  suppressed: ['Clay Records'],
  count: 7,
  countLine: 'Credits · 7',
};

describe('the TRACKLIST section at rest', () => {
  it('draws nothing for a record with no cached release', () => {
    expect(render(<TracklistSection model={null} base={null} ladder={null} />)).toBe('');
  });

  it('is the section named tracklist, headed Tracklist, and lists every track whole by position and title, in order', () => {
    const html = render(<TracklistSection model={model} base={null} ladder={null} />);
    expect(html).toContain('data-section="tracklist"');
    expect(html).toContain('>Tracklist<');
    const at = model.tracks.map((t) => html.indexOf(t));
    expect(at.every((i) => i > -1), 'every track is drawn').toBe(true);
    expect([...at].sort((a, b) => a - b), 'in the release’s order').toEqual(at);
  });

  it('splits the tracks across two columns, the first half then the second, so the order reads down each column', () => {
    const html = render(<TracklistSection model={model} base={null} ladder={null} />);
    const grid = /<[^>]*data-tracks[^>]*>([\s\S]*?)<\/(?:div|section)>\s*<details/.exec(html);
    expect(grid, 'the tracks grid stands before the fold').not.toBeNull();
    const columns = [...(grid?.[1] ?? '').matchAll(/<ol[^>]*>([\s\S]*?)<\/ol>/g)].map((m) => m[1]);
    expect(columns, 'two columns').toHaveLength(2);
    expect(columns[0]).toContain('A3 · The Final Bloodbath');
    expect(columns[0]).not.toContain('B1 · Protest And Survive');
    expect(columns[1]).toContain('B1 · Protest And Survive');
  });
});

describe('the credits fold', () => {
  it('stands closed beneath the tracks behind the count line, whenever the page loads', () => {
    const html = render(<TracklistSection model={model} base={null} ladder={null} />);
    const details = /<details([^>]*)>([\s\S]*?)<\/details>/.exec(html);
    expect(details, 'one fold').not.toBeNull();
    expect(details?.[1] ?? '', 'closed: no open attribute').not.toMatch(/\bopen\b/);
    const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(details?.[2] ?? '');
    expect(summary?.[1] ?? '', 'the count line is what the fold shows at rest').toContain('Credits · 7');
    expect(html.indexOf('data-tracks'), 'beneath the tracks').toBeLessThan(html.indexOf('<details'));
  });

  it('draws no fold and no count line where the fold would hold nothing: the tracks alone', () => {
    const html = render(<TracklistSection model={{ ...model, release: [], byTrack: [], companies: [], count: 0, countLine: null }} base={null} ladder={null} />);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('Credits');
    expect(html).toContain('A1 · Hear Nothing');
  });

  /*
    §65 b2.s27 (10 Nov): "The companies the fold draws stand with the release's credits, after its last role and before the
    first track's position and title, never after the last track." Until then this test pinned 173b's default, the
    companies after the tracks' credits; it encoded the build, not a ruling, so the ruling moves it.
  */
  it('opened, the release’s credits come first, one line to a role, then the companies drawn with them, then each track’s beneath its position and title', () => {
    const html = render(<TracklistSection model={model} base={null} ladder={null} />);
    const inside = /<details[^>]*>([\s\S]*?)<\/details>/.exec(html)?.[1] ?? '';
    const order = ['Written-By · Discharge', 'Producer · Mike Stone', 'Pressed By · Orlake Records', 'A1 · Hear Nothing', 'Vocals · Cal', 'B2 · I Won’t Subscribe', 'Bass · Rainy', 'Drums · Garry'].map((t) => inside.indexOf(t));
    expect(order.every((i) => i > -1), 'every line the fold holds is drawn').toBe(true);
    expect([...order].sort((a, b) => a - b), 'release, companies, then the tracks (§65 b2.s27)').toEqual(order);
    expect(inside, 'a suppressed company is not drawn').not.toContain('Clay Records');
    expect(inside.match(/A1 · Hear Nothing/g)?.length, 'the track’s heading inside the fold, once').toBe(1);
  });

  it('with no release credits, the companies still stand before the first track’s heading, never after the last track', () => {
    const html = render(<TracklistSection model={{ ...model, release: [], count: 5, countLine: 'Credits · 5' }} base={null} ladder={null} />);
    const inside = /<details[^>]*>([\s\S]*?)<\/details>/.exec(html)?.[1] ?? '';
    expect(inside).not.toContain('data-credits="release"');
    expect(inside.indexOf('Pressed By · Orlake Records'), 'before the first track’s heading').toBeLessThan(inside.indexOf('A1 · Hear Nothing'));
    expect(inside.indexOf('Pressed By · Orlake Records'), 'never after the last track').toBeLessThan(inside.indexOf('B2 · I Won’t Subscribe'));
  });
});

describe('its place in the record page', () => {
  /* A pressing with facts the grid does not carry, so Pressing detail's section renders and the order is a real one. */
  const record = {
    pressing: { catalogNumber: null, matrixRunout: 'CLAY LP 3 A1', pressingPlant: 'Orlake Records', yearPressed: null, countryPressed: null, vinylWeightGrams: 180, colorVariant: null, isReissue: false, discogsReleaseId: null },
    tags: [],
    latestPrice: null,
  } as unknown as HydratedRecord;

  it('stands directly after Pressing detail’s section, and is absent without a model', () => {
    const withIt = render(<RecordDetail record={record} base={null} ladder={null} tracklist={model} />);
    const sections = [...withIt.matchAll(/data-section="([a-z-]+)"/g)].map((m) => m[1]);
    expect(sections, 'the precondition: Pressing detail’s section renders').toContain('pressing-detail');
    expect(sections.indexOf('tracklist'), 'directly after pressing-detail').toBe(sections.indexOf('pressing-detail') + 1);
    const without = render(<RecordDetail record={record} base={null} ladder={null} tracklist={null} />);
    expect(without).not.toContain('data-section="tracklist"');
  });
});
