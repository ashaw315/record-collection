import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { RecordPage8a, type PageRecord } from '@/app/records/[id]/RecordPage8a';

/**
 * 8a assembled, on three real records — the assembly IS the measurement.
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
    note: 'Classic pressing with the original inner sleeve.',
    imageCount: 1,
    coverUrl: COVER,
    spineColour: '#a25829',
  },
  /* 16 of 17 render this: no journal, no price, no source. */
  modal: {
    id: 'e73e1de1-3686-4a81-8544-ca2300e187bb',
    title: 'The Hurdy Gurdy Man',
    artistName: 'Donovan',
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
    note: null,
    imageCount: 1,
    coverUrl: COVER,
    spineColour: '#44946b',
  },
  /* The emptiest: no Discogs release, so the market mark is CROSSED. */
  emptiest: {
    id: '158a3163-6a56-4673-8f88-27e7b2aec724',
    title: 'Grave New World',
    artistName: 'Discharge',
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
    note: null,
    imageCount: 0,
    coverUrl: COVER,
    spineColour: '#363129',
  },
};

export default async function Page8aProbe({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { case: which } = await searchParams;
  const record = CASES[which ?? 'richest'] ?? CASES.richest;

  return (
    <>
      <AppHeader />
      <RecordPage8a record={record} />
    </>
  );
}
