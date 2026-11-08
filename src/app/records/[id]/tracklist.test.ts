import { describe, expect, it } from 'vitest';
import { tracklistModel } from './tracklist';

/*
  Step 173a (§65 as ruled by "Credits fold", 7 Nov): the section's model, from the release-text rows in the order
  `releaseTextFor` returns them (tracks, credits, companies, each in the release's order) and the names the page
  already shows for the pressing.
*/
type Row = { kind: 'track' | 'credit' | 'company'; text: string; detail: string | null };
const track = (position: string, title: string): Row => ({ kind: 'track', text: title, detail: position });
const credit = (name: string, detail: string | null): Row => ({ kind: 'credit', text: name, detail });
const company = (name: string, role: string): Row => ({ kind: 'company', text: name, detail: role });

const ROWS: Row[] = [
  track('A1', 'Morning'),
  track('A2', 'Noon'),
  track('B1', 'Night'),
  credit('Ann Producer', 'Producer'),
  credit('Bob Engineer (2)', 'Engineer'),
  credit('Cy Producer', 'Producer'),
  credit('Dee Bass', 'Bass, A2'),
  credit('Eve Vocals', 'Vocals, A2'),
  credit('Flo Bass', 'Bass, A2'),
  credit('Gus Writer', 'Written-By, B1'),
  company('Columbia (2)', 'Phonographic Copyright (p)'),
  company('Columbia Records Pressing Plant, Pitman', 'Pressed By'),
  company('Sterling Sound', 'Mastered At'),
  company('Pitman Pressing', 'Pressed By'),
];
const SHOWN = ['Columbia', 'pitman pressing'];

describe('the tracks are drawn whole, by position and title, in the reason line’s words', () => {
  it('lists every track in the release’s order as "position · title"', () => {
    expect(tracklistModel(ROWS, SHOWN)?.tracks).toEqual(['A1 · Morning', 'A2 · Noon', 'B1 · Night']);
  });
});

describe('opened, the release’s credits come first, one line to a role, its names in the release’s order', () => {
  it('groups the release-level credits by role in first-seen order, Discogs’ (n) dropped from names', () => {
    expect(tracklistModel(ROWS, SHOWN)?.release).toEqual(['Ann Producer, Cy Producer · Producer', 'Bob Engineer · Engineer']);
  });

  it('then each track’s credits beneath that track’s position and title, one line to a role, and only tracks that have any', () => {
    expect(tracklistModel(ROWS, SHOWN)?.byTrack).toEqual([
      { track: 'A2 · Noon', lines: ['Dee Bass, Flo Bass · Bass', 'Eve Vocals · Vocals'] },
      { track: 'B1 · Night', lines: ['Gus Writer · Written-By'] },
    ]);
  });

  it('reads a track credit with no role by its position alone, and keeps a release role that has a comma in it whole', () => {
    const m = tracklistModel([track('1', 'One'), credit('Hal', '1'), credit('Ida', 'Bass, Vocals')], []);
    expect(m?.release).toEqual(['Ida · Bass, Vocals']);
    expect(m?.byTrack).toEqual([{ track: '1 · One', lines: ['Hal'] }]);
  });
});

describe('a company is drawn among the credits only where the page shows no name the same as it', () => {
  it('suppresses a company equal to a shown name, folded for case and Discogs’ (n), and draws one that only contains it', () => {
    const m = tracklistModel(ROWS, SHOWN);
    expect(m?.companies).toEqual(['Columbia Records Pressing Plant, Pitman · Pressed By', 'Sterling Sound · Mastered At']);
    expect(m?.suppressed).toEqual(['Columbia (2)', 'Pitman Pressing']);
  });

  it('draws every company where the page shows no name', () => {
    expect(tracklistModel(ROWS, [])?.suppressed).toEqual([]);
    expect(tracklistModel(ROWS, [])?.companies).toHaveLength(4);
  });
});

describe('the count line counts what the fold holds', () => {
  it('counts release credits, track credits and the companies drawn, by entry and not by line, and reads "Credits · n"', () => {
    const m = tracklistModel(ROWS, SHOWN);
    expect(m?.count).toBe(3 + 4 + 2);
    expect(m?.countLine).toBe('Credits · 9');
  });

  it('moves with the shown names: the same release counts two more where the page shows neither name', () => {
    expect(tracklistModel(ROWS, [])?.count).toBe(11);
  });

  it('draws no count line where the fold would hold nothing', () => {
    const m = tracklistModel([track('A1', 'Only'), company('Columbia', 'Label')], ['Columbia']);
    expect(m?.count).toBe(0);
    expect(m?.countLine).toBeNull();
  });
});

describe('no cached release, no section', () => {
  it('returns null for a release with no rows', () => {
    expect(tracklistModel([], ['Columbia'])).toBeNull();
  });
});
