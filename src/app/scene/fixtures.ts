import type { ShelfRecord } from '@/lib/db/queries/shelf';

/**
 * Synthesised records for the scene harness.
 *
 * **Deterministic, so two loads of the same count render the same wall** — the
 * spine width is hashed from the id (`spine.ts`), so stable ids are what make
 * a screenshot comparable with the one before it.
 *
 * Colours are drawn from a fixed list spanning the range real covers produce:
 * near-black through mid-saturation to near-white, because the wall's contrast
 * behaviour differs across that range and a harness of mid-greys would hide it.
 * One record in every set has a null colour, which is §10b's honest absence and
 * renders as a plain spine.
 */
const COLOURS = [
  '#6b6f76', '#3a3a3a', '#8d7b6a', '#a8a29a', '#4a5b6b',
  '#7d6b8d', '#5f7a66', '#c9c3b8', '#2e2e33', '#8a6b4d',
  '#b5ad9f', '#4d5a4a', '#6e5a5a', '#9aa3ad', '#3f4a55',
];

const ARTISTS = [
  'Discharge', 'The Doors', 'Miles Davis', 'Steely Dan', 'Dire Straits',
  'John Lennon', 'Luther Vandross', 'Death Grips', 'MGMT', 'Donovan',
  'Jeff Beck', 'Buddy Rich', 'Simon & Garfunkel', 'Darkside', 'Smerz',
];

const TITLES = [
  'Grave New World', 'The Soft Parade', 'Bitches Brew', 'Gaucho', 'Dire Straits',
  'Mind Games', 'Never Too Much', 'The Money Store', 'Loss Of Life', 'The Hurdy Gurdy Man',
  'Wired', 'Super Rich', 'Bridge Over Troubled Water', 'Psychic', 'Believer',
];

export function sceneFixtures(count: number): ShelfRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `scene-${String(i).padStart(4, '0')}`,
    title: TITLES[i % TITLES.length],
    artistName: ARTISTS[i % ARTISTS.length],
    releaseYear: 1967 + (i % 40),
    labelName: 'Harness',
    catalogNumber: `HRN-${1000 + i}`,
    // Every eighth record has no colour: §10b's plain spine.
    spineColour: i % 8 === 7 ? null : COLOURS[i % COLOURS.length],
    snippet: null,
    snippetEditedAt: null,
    coverUrl: null,
    backUrl: null,
    gatefoldLeftUrl: null,
    gatefoldRightUrl: null,
    matrixRunout: null,
    yearPressed: null,
    countryPressed: null,
    pressingPlant: null,
    vinylWeightGrams: null,
    colorVariant: null,
    isReissue: false,
    conditionMedia: null,
    conditionSleeve: null,
    purchasePrice: null,
    purchaseDate: null,
    storeName: null,
  }));
}

/** The counts §10b's reasoning turns on: one, this collection, and a large one. */
export const SCENE_COUNTS = [1, 17, 125] as const;
