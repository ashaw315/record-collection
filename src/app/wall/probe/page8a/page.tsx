import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { RecordPage8a, type PageRecord } from '@/app/records/[id]/RecordPage8a';

/**
 * 8a assembled, on three real records — the assembly IS the measurement.
 *
 * **The real screen has landed: `/records/[id]` renders `RecordPage8a`.** This
 * probe is therefore no longer the only place 8a exists, and the removal
 * condition in `e2e/every-page-has-nav.spec.ts` applies to it — route,
 * exemption and guard come out together.
 *
 * **It does not come out yet, and the reason is stated so its absence cannot be
 * mistaken for an omission.** Two specs and three captures still drive it, and
 * one of them is `?case=nocover` — §5.3's record with no cover at all, where
 * every mark falls back to ink. On the real route that case needs a record with
 * no cover image row, which `e2e/record-page-8a.spec.ts` cannot create through
 * the API it uses; the probe supplies it as a literal.
 *
 * So the sequence is: move those five onto the real route, then delete the
 * route, the exemption and the guard together. Deleting it now would take the
 * no-cover case with it.
 */

/**
 * (original note)
 *
 * Every piece has been measured in isolation. This is the first view of all of
 * it at once: the richest record, the modal one with its two diagonals, and the
 * emptiest.
 *
 * `?case=richest|modal|emptiest`. 404s in production.
 */
export const dynamic = 'force-dynamic';

const COVER =
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/e73e1de1-3686-4a81-8544-ca2300e187bb/43ecded3-cce0-48c2-9cbc-dc29df091cde.jpg';

/** Field-for-field from the real collection, measured 2026-09-12. */
const CASES: Record<string, PageRecord> = {
  richest: {
    id: 'd7047c62-149e-42fa-8cda-fac3f90c47cc',
    title: 'Never Too Much',
    artistName: 'Luther Vandross',
    artistId: 'a-luther',
    pressingLine: 'Epic · FE 36811 · United States, 1981',
    formatLine: 'Vinyl, LP, Album',
    matrixRunout: 'FE 36811-1A / FE 36811-1B <stamped>',
    releaseYear: 1981,
    yearPressed: 1981,
    genres: [
      { id: 'g1', name: 'Soul' },
      { id: 'g2', name: 'Disco' },
    ],
    purchasePrice: '18.00',
    storeName: 'Academy Records',
    conditionMedia: 'VG+',
    conditionSleeve: 'VG',
    marketMedian: '24.00',
    marketLow: '9.99',
    marketHigh: '61.00',
    hasDiscogsRelease: true,
    journalEntry: { entry: 'Bought for the B-side. Sleeve has a split at the bottom seam.', entryDate: '2024-03-14' },
    about: 'Classic pressing with the original inner sleeve.',
    imageCount: 1,
    coverUrl: COVER,
    spineColour: '#a25829',
  },
  /* 16 of 17 render this: no journal, no price, no source. */
  modal: {
    id: 'e73e1de1-3686-4a81-8544-ca2300e187bb',
    title: 'The Hurdy Gurdy Man',
    artistName: 'Donovan',
    artistId: 'a-donovan',
    pressingLine: 'Epic · BN 26420 · United States, 1968',
    formatLine: 'Vinyl, LP, Album',
    matrixRunout: 'BN 26420-1A / BN 26420-1B',
    releaseYear: 1968,
    yearPressed: 1968,
    genres: [
      { id: 'g3', name: 'Folk Rock' },
      { id: 'g4', name: 'Psychedelic Rock' },
    ],
    purchasePrice: null,
    storeName: null,
    conditionMedia: null,
    conditionSleeve: null,
    marketMedian: '24.00',
    marketLow: '18.50',
    marketHigh: '24.00',
    hasDiscogsRelease: true,
    journalEntry: null,
    about: null,
    imageCount: 1,
    coverUrl: COVER,
    spineColour: '#44946b',
  },
  /* The emptiest: no Discogs release, so the market mark is CROSSED. */
  emptiest: {
    id: '158a3163-6a56-4673-8f88-27e7b2aec724',
    title: 'Grave New World',
    artistName: 'Discharge',
    artistId: 'a-discharge',
    pressingLine: 'Clay Records · United Kingdom',
    formatLine: null,
    matrixRunout: null,
    releaseYear: 1986,
    yearPressed: null,
    genres: [],
    purchasePrice: null,
    storeName: null,
    conditionMedia: null,
    conditionSleeve: null,
    marketMedian: null,
    marketLow: null,
    marketHigh: null,
    hasDiscogsRelease: false,
    journalEntry: null,
    about: null,
    imageCount: 0,
    coverUrl: COVER,
    spineColour: '#363129',
  },
};

/*
  §5.3's record: one of seventeen has no cover, so there is no derivation and
  every mark falls back to INK — filled, not outlined, not omitted. Omitting them
  would let a missing image change the composition's structure.
*/
/*
  §35: the About cell's middle state -- a journal entry and no About -- which
  the real collection holds on one record (Never Too Much). The extremes
  fixture carries a record for every state a cell can be in.
*/
CASES.entryOnly = {
  ...CASES.emptiest,
  id: 'd7047c62-149e-42fa-8cda-fac3f90c47cc',
  title: 'Never Too Much',
  artistName: 'Luther Vandross',
  artistId: 'a-vandross',
  releaseYear: 1981,
  journalEntry: { entry: 'This record slaps like crazy.', entryDate: '2026-08-12' },
};

CASES.nocover = {
  ...CASES.emptiest,
  id: '4a1e2b7c-0000-4000-8000-000000000005',
  title: 'The Best Of The Blues Project',
  artistName: 'The Blues Project',
  artistId: 'a-blues-project',
  pressingLine: 'Verve Forecast · United States, 1969',
  releaseYear: 1969,
  coverUrl: null,
  spineColour: null,
};

export default async function Page8aProbe({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; configured?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { case: which, configured } = await searchParams;
  const name = which ?? 'richest';
  const record = CASES[name];

  /*
    **An unknown case throws rather than falling back.**

    The fallback returned `richest` for any unrecognised `?case=`, so a mistyped
    or renamed case silently rendered the WRONG RECORD and every assertion
    against it passed. That is how §5.3's no-cover test came to report verified
    against a record that has a cover — and the exposure was every case-specific
    assertion in this probe, not just that one. Only §5.3 surfaced it because it
    asserted something the fallback record happened not to satisfy.

    A fallback that hides a typo is the same shape as a check that cannot fail.
  */
  if (record === undefined) {
    throw new Error(
      `Unknown case "${name}". Available: ${Object.keys(CASES).join(', ')}. ` +
        'This throws rather than falling back, because a silent default renders ' +
        'the wrong record and every assertion against it passes.',
    );
  }

  return (
    <>
      <AppHeader />
      <RecordPage8a record={record} writingConfigured={configured === '1'} />
    </>
  );
}
