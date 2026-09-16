/**
 * The seventeen records' spine colours, before and after A75.
 *
 * **Two sources, joined by title.** The `mean` column is the pre-A75 averaged
 * value — the fill 5b drew each spine with, read off the drawing's SVG and
 * paired to its label. The `resampled` column is what A75's dominant-chromatic-
 * region rule stores now, from that commit's own before/after table. Nine
 * moved; seven kept their mean because no region cleared the chroma floor.
 *
 * The seventeenth record has no cover and no colour: 5b draws it unfilled.
 *
 * **This is the collection as of 2026-09-12**, not a live read. The dev
 * database was not consulted — its `DATABASE_URL` reached a database with no
 * `records` table — so anything derived here is derived from the values the
 * design and the derivation each committed to, which is the honest basis for a
 * measurement meant to compare them.
 */
export type SpineRow = {
  artist: string;
  title: string;
  /** Pre-A75: the linear-light mean. What 5b drew. */
  mean: string | null;
  /** Post-A75: the dominant chromatic region, or the mean where none cleared the floor. */
  resampled: string | null;
};

export const COLLECTION_SPINES: readonly SpineRow[] = [
  { artist: 'Buddy Rich', title: 'Super Rich', mean: '#745e34', resampled: '#755f34' },
  { artist: 'Darkside', title: 'Psychic', mean: '#6e636a', resampled: '#6e636a' },
  { artist: 'Death Grips', title: 'The Money Store', mean: '#9b9b9a', resampled: '#9b9b9a' },
  { artist: 'Dire Straits', title: 'Dire Straits', mean: '#d8cbb8', resampled: '#d8cbb8' },
  { artist: 'Discharge', title: 'Grave New World', mean: '#363129', resampled: '#363129' },
  { artist: 'Donna Summer', title: 'On The Radio: Greatest Hits Vol. 1 & 2', mean: '#94698a', resampled: '#bc4889' },
  { artist: 'Donovan', title: 'The Hurdy Gurdy Man', mean: '#64866e', resampled: '#44946b' },
  { artist: 'Jeff Beck', title: 'Wired', mean: '#3b5259', resampled: '#31788a' },
  { artist: 'John Lennon', title: 'Mind Games', mean: '#80868a', resampled: '#89adc0' },
  { artist: 'Luther Vandross', title: 'Never Too Much', mean: '#92603d', resampled: '#a25829' },
  { artist: 'MGMT', title: 'Loss Of Life', mean: '#473e35', resampled: '#473e35' },
  { artist: 'Miles Davis', title: 'Bitches Brew', mean: '#787e6f', resampled: '#adad85' },
  { artist: 'Simon & Garfunkel', title: 'Bridge Over Troubled Water', mean: '#63695e', resampled: '#816f4c' },
  { artist: 'Smerz', title: 'Believer', mean: '#7e8285', resampled: '#7e8285' },
  { artist: 'Steely Dan', title: 'Gaucho', mean: '#93a99d', resampled: '#afae51' },
  { artist: 'The Doors', title: 'The Soft Parade', mean: '#5b707b', resampled: '#7bb1c5' },
  { artist: 'The Blues Project', title: 'The Best Of The Blues Project', mean: null, resampled: null },
];
