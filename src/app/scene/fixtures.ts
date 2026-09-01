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

/**
 * **The REAL cover art, from the developer's own collection.**
 *
 * Adam: *"I have been judging 'does it pop' against the wrong thing. The
 * /scene fixtures have coverUrl: null, so every pulled record is the
 * plain-sleeve fallback — a flat coloured rectangle. My real records have
 * artwork, and artwork against dimmed spines separates far better than a flat
 * rectangle does."*
 *
 * **This is the seeded-wall finding again**: a stand-in was being used to judge
 * the real thing. Two effects — the wall blur and the cast shadow — were built
 * and abandoned to make a flat grey rectangle separate from its background, a
 * problem that may only exist in the harness.
 *
 * The artists and titles here were ALREADY this collection; only the artwork
 * was missing, which is what made the gap invisible. URLs are public blob
 * storage, so they load without auth — the harness has no database access and
 * is not gaining any.
 *
 * In fixture order, aligned with `ARTISTS` and `TITLES` above.
 */
/**
 * **The REAL spine colours**, which are derived from the covers in the app and
 * therefore cannot be guessed by a fixture.
 *
 * Supplied for the same reason as `COVERS`: the wall's overall TONE is what
 * `dimFloor` and every separation judgement are made against, and a hand-picked
 * palette spanning "near-black to near-white" is a different wall from this
 * collection's actual one (which clusters in mid greens, greys and browns).
 *
 * Aligned with `ARTISTS`/`TITLES`/`COVERS` above. `null` for a record without
 * one, which is §10b's honest absence and renders as a plain spine.
 */
const REAL_SPINES: Array<string | null> = [
  '#363129',
  '#5b707b',
  '#787e6f',
  '#93a99d',
  '#d8cbb8',
  '#80868a',
  '#92603d',
  '#9b9b9a',
  '#473e35',
  '#64866e',
  '#3b5259',
  '#745e34',
  '#63695e',
  '#6e636a',
  '#7e8285',
];

const COVERS: Array<string | null> = [
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/158a3163-6a56-4673-8f88-27e7b2aec724/79680f81-8dda-4775-9632-ff6097781441.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/9a514311-ad88-4205-a37a-a5a4cdd231d2/3eff8df1-5454-4be8-add6-d58c1b1368c1.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/2be8579e-2ee7-44fa-81e8-9713a6aaa714/f22ca3c7-f3e5-4b15-a7b8-e24f67d1c018.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/b19cd530-f2d9-4936-b55d-3893b9f74420/e307a3d2-5f6d-4a9b-9128-8d9c15e51c5a.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/fadd5c0e-5146-4421-aebc-cd53eed2f8b1/6c6eb2a8-e07b-4650-8727-1f95b742c19a.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/ce57a185-6182-4a9d-9af1-37bae019db10/21f0878f-bb6e-4e5c-83d8-2acd64188ff3.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/d7047c62-149e-42fa-8cda-fac3f90c47cc/8b447a1d-b54c-4208-beb8-4de216f39469.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/7a333685-81d3-4a8a-8515-cf29f4d587a7/f6dbb433-699d-404e-8f81-bf684ead1380.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/c8bc3a1d-e5ba-4794-a4b9-bcfe89d6fbed/5db2f9ab-0303-4463-9527-d4600dd4fc3d.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/e73e1de1-3686-4a81-8544-ca2300e187bb/43ecded3-cce0-48c2-9cbc-dc29df091cde.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/48461309-e0e0-42a8-b903-f60642c923ca/6bea5241-fdd8-4915-aebd-b29e8681d708.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/1d4a4107-3153-4e98-b48a-d00a28266f94/228aec3a-34c7-4cdb-af68-854ac401619b.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/cdcf94cb-7c7f-45f5-ad04-584a1fb0b30a/23f1bb7a-5be1-40de-8706-3bd1584be3c9.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/bac64213-9673-4ae7-862f-fc5b17dc16d3/ee3bcfe1-66f8-4b80-8f70-196a7ea88c4b.jpg',
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/de2ad140-86af-44e1-84a4-977324346cca/d561ab81-5881-4457-aff7-60dc0dc877f9.jpg',
];

export function sceneFixtures(count: number, withCovers = false): ShelfRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `scene-${String(i).padStart(4, '0')}`,
    title: TITLES[i % TITLES.length],
    artistName: ARTISTS[i % ARTISTS.length],
    releaseYear: 1967 + (i % 40),
    labelName: 'Harness',
    catalogNumber: `HRN-${1000 + i}`,
    // Every eighth record has no colour: §10b's plain spine.
    /*
      With real artwork the spine colours must be real too: they are derived
      from the covers, so a synthetic palette would describe a different wall.
      The plain-spine case (§10b's honest absence) is preserved either way.
    */
    spineColour:
      i % 8 === 7
        ? null
        : withCovers
          ? (REAL_SPINES[i % REAL_SPINES.length] ?? null)
          : COLOURS[i % COLOURS.length],
    snippet: null,
    snippetEditedAt: null,
    coverUrl: withCovers ? (COVERS[i % COVERS.length] ?? null) : null,
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
