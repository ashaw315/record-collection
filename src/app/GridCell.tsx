import Link from 'next/link';
import { GridCover } from './GridCover';
import { LABEL } from './records/[id]/grid-type';

/**
 * **§T.5's cell: the cover, its title and artist beneath it, and the whole
 * cell one link to its record.** The grid draws one per record, and the
 * pick's answer off the shelf is this cell (target §P.4), so the two are one
 * component and cannot drift. The link covers the cell by its `::after`, so
 * the element holding the cell is `relative`.
 */
export function GridCell({ id, title, artist, cover }: { id: string; title: string; artist: string; cover: string | null }) {
  return (
    <>
      <GridCover url={cover} />
      <Link
        data-grid-title=""
        data-ring="after"
        href={`/records/${id}`}
        className="mt-2 block text-detail after:absolute after:inset-0 after:box-border after:content-['']"
      >
        {title}
      </Link>
      <div data-grid-artist="" className={LABEL}>
        {artist}
      </div>
    </>
  );
}
