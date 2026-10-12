import { WantListEmpty } from './WantListEmpty';
import { EmptyFigure } from '../EmptyFigure';
import { figureSource } from '../figure-source';
import { HAIRLINE, INK, LABEL_TYPE } from '../records/[id]/grid-type';
import { listRecordAges, spineColoursOf } from '@/lib/db/queries/records';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { WantListRow, type WantListItem } from './WantListRow';
import { listWantList } from '@/lib/db/queries/want-list';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import type { Offset } from '@/lib/api/query-params';
import { cn } from '@/lib/utils';
import { SCREEN_FRAME } from '@/app/screen-frame';
import { HIT_ALONE } from '@/app/hit-area';
import { wantListCountLine } from './want-list-format';

/**
 * SPEC.md §10 `/want-list`.
 *
 * Sorted by priority ascending, because §4.2 makes 1 the highest — a want list
 * sorted the other way is useless at a glance.
 *
 * Acquired items are OUT of the default view but reachable, per §7.3: the list
 * doubles as acquisition history, so they must not be hidden entirely.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Want list · Record Collection' };

const PAGE = { limit: 200, offset: 0 as Offset };

export default async function WantListPage({ searchParams }: PageProps<'/want-list'>) {
  const raw = await searchParams;
  const showAcquired = raw.acquired === 'true';

  const { rows, total } = await listWantList({
    ...PAGE,
    filters: { isAcquired: showAcquired },
  });

  /**
   * The target pressing and genres need hydrating per row. Done in parallel:
   * the page is bounded at 200 and awaiting them in sequence would make it as
   * slow as their sum.
   */
  const items = await Promise.all(rows.map((row) => hydrateWantListItem(row.id)));
  const hydrated = items.filter((item): item is NonNullable<typeof item> => item !== undefined);
  /* §T.6's one source record, asked for only where the empty state will draw it. */
  const source = hydrated.length === 0 ? figureSource(await listRecordAges()) : null;
  const tint = source === null ? null : ((await spineColoursOf([source.id]))[0] ?? null);

  return (
    <>
      <AppHeader />

      <main data-screen-frame="" className={`${SCREEN_FRAME} py-6`}>
        <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-headline font-semibold tracking-tight">
              {/* The pass (step 132): "The heading stays Want list in both views, because the nav and the view name already say Acquired." */}
              Want list
            </h1>
            <p data-want-list-count="" className="mt-0.5 text-lede text-muted-foreground">
              {wantListCountLine(total, showAcquired)}
            </p>
          </div>

          {/*
            §10's `/suggestions` is reached from HERE rather than from the header
            nav, and that is a decision with a measurement behind it (NOTES, step
            14 unit 3): at 390px the nav already hides two of its five links
            behind a scroll with no affordance, so a sixth makes a measured
            problem worse.

            This is also simply where it belongs. The suggestion screen's entire
            output is want-list rows, so the want list is where a user is when
            they want more of them.
          */}
          <div className="flex shrink-0 flex-col items-end gap-2 pointer-coarse:gap-0">
            {/*
              §T.6: "The want list carries LOOK UP A RECORD, a §9.3 control
              in its heading's row, in both states... A want-list item comes
              from looking a record up, so the want list's way in is the
              screen that makes one. It links to look up, which exists, and
              opens no new way into the form."
            */}
            <Link
              data-want-list-lookup=""
              href="/lookup"
              className={`${LABEL_TYPE} ${INK} box-border flex h-[44px] items-center justify-center border ${HAIRLINE} px-[18px] decoration-1 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`}
            >
              Look up a record
            </Link>
            <Link
              href="/suggestions"
              /*
                A row of its own 44 tall, not an overlay: below the width
                where the heading wraps it stands between look up's box and
                the two views with 41 for all three, the handoff's "row
                height where controls stack with no gap". One rule at every
                width, so the box and this stack with nothing between.
                Under a coarse pointer only (step 127): with a mouse it is
                its word, 8 below the box, as it was.
              */
              className="relative text-label underline underline-offset-2 before:absolute before:inset-y-0 before:-left-[9px] before:-right-[9px] hover:text-foreground pointer-coarse:flex pointer-coarse:h-[44px] pointer-coarse:items-center before:hidden before:content-[''] pointer-coarse:before:block"
            >
              Suggestions
            </Link>
          </div>
        </header>

        {/*
          §7.3: acquired items are reachable rather than hidden. The want list
          IS the acquisition history, and a screen that dropped them would lose
          the half of the record that says what the hunt was for.
        */}
        <nav aria-label="View" className="mb-4 flex gap-[18px]">
          {[
            { label: 'Still wanted', href: '/want-list', active: !showAcquired },
            { label: 'Acquired', href: '/want-list?acquired=true', active: showAcquired },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              /*
                The pass (step 132): "view names, set as SHELF, TABLE and
                GRID are, 11 mono uppercase with the current one underlined
                and no box. Built, each carries a box and an underline, two
                marks for one state." The underline is §3's mark for a
                choice, 2px and 7 below. Each reaches 9, half the 18 between
                the two and the figure past an end with no neighbour.
              */
              className={cn(
                `${HIT_ALONE} ${LABEL_TYPE}`,
                tab.active ? `${INK} underline decoration-2 underline-offset-[7px]` : `text-[oklch(0.44_0.008_70)] hover:underline`,
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {hydrated.length === 0 ? (
          <WantListEmpty
            acquired={showAcquired}
            figure={<EmptyFigure source={source} tint={tint} />}
          />
        ) : (
          <ul className="border-t border-border">
            {hydrated.map((item) => (
              <WantListRow key={item.id} item={item as WantListItem} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
