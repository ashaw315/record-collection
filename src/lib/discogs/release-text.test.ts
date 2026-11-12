import { describe, expect, it } from 'vitest';
import { releaseText } from './release-text';

/**
 * The free-text unit (the coordinator, 4 Nov): the Discogs text the cache
 * already holds, as rows a search can match. One row per thing a reader
 * might search for, each with its kind and, where it has one, a detail the
 * result can say the match by: a track's position, a credit's or a
 * company's role. Fails against `releaseText` returning nothing, or folding
 * a kind into another, or keeping a blank.
 */
const PAYLOAD = {
  id: 11029111,
  title: 'Hear Nothing See Nothing Say Nothing',
  tracklist: [
    { position: 'A1', title: 'The Blood Runs Red', duration: '2:52', extraartists: [{ name: 'Cal', role: 'Vocals' }] },
    { position: 'A2', title: 'The Price Of Silence', duration: '' },
    { position: '', title: '', duration: '' },
  ],
  extraartists: [
    { name: 'Mike Stone (2)', role: 'Producer', tracks: '' },
    { name: 'BilBo (3)', role: 'Lacquer Cut By', tracks: '' },
    { name: '  ', role: 'Photography By', tracks: '' },
  ],
  companies: [
    { name: 'Clay Records', entity_type_name: 'Phonographic Copyright (p)' },
    { name: 'Orlake Records Ltd.', entity_type_name: 'Pressed By' },
  ],
  notes: 'Includes a lyric sheet.\n\nMatrix on the runout.',
};

/*
  §66 (Design, 11 Nov; step 179): "Search reaches the barcode, compared by its digits alone", through a record's
  current pressing. A barcode row's text is the digits and its detail the value as Discogs gives it; two identifiers
  with the same digits (printed and scanned) are one row. Fails against a derivation that keeps the spaces in the
  text, lists the same barcode twice, or takes a matrix identifier for one.
*/
describe('releaseText: the barcode (§66)', () => {
  const withBarcodes = {
    ...PAYLOAD,
    identifiers: [
      { type: 'Barcode', value: '8 43563 19772 1', description: 'Printed' },
      { type: 'Barcode', value: '843563197721', description: 'Scanned' },
      { type: 'Matrix / Runout', value: 'SBR373 A', description: 'Runout' },
      { type: 'Barcode', value: '5 012345 678900', description: 'Sticker' },
    ],
  };

  it('lists each distinct barcode once by its digits, with the value as given as the detail', () => {
    expect(releaseText(withBarcodes).filter((row) => row.kind === 'barcode')).toEqual([
      { kind: 'barcode', ordinal: 0, text: '843563197721', detail: '8 43563 19772 1' },
      { kind: 'barcode', ordinal: 1, text: '5012345678900', detail: '5 012345 678900' },
    ]);
  });

  it('lists none for a release with no barcode identifier', () => {
    expect(releaseText(PAYLOAD).filter((row) => row.kind === 'barcode')).toEqual([]);
  });
});

describe('releaseText: the searchable text of a cached release', () => {
  it('lists every track by title with its position as the detail', () => {
    const tracks = releaseText(PAYLOAD).filter((row) => row.kind === 'track');
    expect(tracks).toEqual([
      { kind: 'track', ordinal: 0, text: 'The Blood Runs Red', detail: 'A1' },
      { kind: 'track', ordinal: 1, text: 'The Price Of Silence', detail: 'A2' },
    ]);
  });

  it('lists every credit by name with the role as the detail, a track’s credits with the track’s position in the role', () => {
    const credits = releaseText(PAYLOAD).filter((row) => row.kind === 'credit');
    expect(credits).toEqual([
      { kind: 'credit', ordinal: 0, text: 'Mike Stone (2)', detail: 'Producer' },
      { kind: 'credit', ordinal: 1, text: 'BilBo (3)', detail: 'Lacquer Cut By' },
      { kind: 'credit', ordinal: 2, text: 'Cal', detail: 'Vocals, A1' },
    ]);
  });

  it('lists every company by name with its role as the detail, every role and not only the manufacturing ones', () => {
    const companies = releaseText(PAYLOAD).filter((row) => row.kind === 'company');
    expect(companies).toEqual([
      { kind: 'company', ordinal: 0, text: 'Clay Records', detail: 'Phonographic Copyright (p)' },
      { kind: 'company', ordinal: 1, text: 'Orlake Records Ltd.', detail: 'Pressed By' },
    ]);
  });

  it('stores no release notes: Adam ruled they are not kept, and §W.24 says search reaches none (4 Nov)', () => {
    expect(releaseText(PAYLOAD).some((row) => row.text.includes('lyric sheet'))).toBe(false);
    expect(releaseText(PAYLOAD).map((row) => row.kind)).not.toContain('notes');
  });

  it('returns nothing for a payload with none of the four, and nothing for a payload that is not a release', () => {
    expect(releaseText({ id: 1, title: 'Bare' })).toEqual([]);
    expect(releaseText(null)).toEqual([]);
    expect(releaseText('not a release')).toEqual([]);
    expect(releaseText({ tracklist: 'wrong shape', notes: 7 })).toEqual([]);
  });

  it('orders the rows kind by kind, tracks first, in the payload’s order within a kind', () => {
    expect(releaseText(PAYLOAD).map((row) => `${row.kind}:${row.ordinal}`)).toEqual([
      'track:0', 'track:1', 'credit:0', 'credit:1', 'credit:2', 'company:0', 'company:1',
    ]);
  });
});
