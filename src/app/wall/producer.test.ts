import { describe, expect, it } from 'vitest';
import { wallSeats, wallSummaries } from './producer';
import type { ShelfRecord } from '@/lib/db/queries/shelf';
import { spineLabel } from './spine-text';

/**
 * The wall on the database (§11.7 step 5): `shelfRecords` is the producer of
 * both the seats and the panel's summaries, so the two cannot drift — one
 * order for the keyboard, the arrows and the links.
 */
const record = (over: Partial<ShelfRecord>): ShelfRecord => ({
  id: 'r1',
  title: 'Wired',
  artistName: 'Jeff Beck',
  releaseYear: 1976,
  labelName: 'Epic',
  catalogNumber: 'PE 33849',
  spineColour: '#31788a',
  snippet: null,
  snippetEditedAt: null,
  coverUrl: 'https://c/w.jpg',
  backUrl: null,
  gatefoldLeftUrl: null,
  gatefoldRightUrl: null,
  matrixRunout: null,
  yearPressed: 1976,
  countryPressed: 'US',
  pressingPlant: null,
  vinylWeightGrams: null,
  colorVariant: null,
  isReissue: false,
  conditionMedia: 'VG+',
  conditionSleeve: null,
  purchasePrice: null,
  purchaseDate: null,
  storeName: null,
  sectionIndex: 0,
  ...over,
});

describe('wallSeats', () => {
  it('maps a shelf record to a seat: id, section ordinal, label, title, artist, colour, cover, back, label and catalogue', () => {
    const [seat] = wallSeats([record({ backUrl: 'https://c/b.jpg', sectionIndex: 3 })]);
    expect(seat).toEqual({
      id: 'r1',
      section: '3',
      label: spineLabel('Jeff Beck', 'Wired'),
      title: 'Wired',
      artist: 'Jeff Beck',
      spineColour: '#31788a',
      coverUrl: 'https://c/w.jpg',
      backUrl: 'https://c/b.jpg',
      labelName: 'Epic',
      catalogNumber: 'PE 33849',
    });
  });

  it('keeps the producer’s order — the one order the keyboard, the arrows and the links share', () => {
    const seats = wallSeats([record({ id: 'b' }), record({ id: 'a' }), record({ id: 'c' })]);
    expect(seats.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('wallSummaries', () => {
  it('builds §10b’s panel summary per record, keyed by id, with the record’s route', () => {
    const summaries = wallSummaries([record({ snippet: 'A note.', snippetEditedAt: null })]);
    const s = summaries.r1;
    expect(s.title).toBe('Wired');
    expect(s.artist).toBe('Jeff Beck');
    expect(s.year).toBe(1976);
    expect(s.href).toBe('/records/r1');
    expect(s.snippet).toEqual({ text: 'A note.', generated: true });
    expect(s.furtherFacts).toBeGreaterThan(0);
  });
});
