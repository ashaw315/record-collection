import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { WantListRow, type WantListItem } from './WantListRow';
import { listWantList } from '@/lib/db/queries/want-list';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import type { Offset } from '@/lib/api/query-params';
import { cn } from '@/lib/utils';

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

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              {showAcquired ? 'Acquired' : 'Want list'}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {total === 1 ? '1 record' : `${total} records`}
              {showAcquired ? ' acquired' : ' still wanted'}
            </p>
          </div>
        </header>

        {/*
          §7.3: acquired items are reachable rather than hidden. The want list
          IS the acquisition history, and a screen that dropped them would lose
          the half of the record that says what the hunt was for.
        */}
        <nav aria-label="View" className="mb-4 flex gap-1">
          {[
            { label: 'Still wanted', href: '/want-list', active: !showAcquired },
            { label: 'Acquired', href: '/want-list?acquired=true', active: showAcquired },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                'rounded-xs border px-2 py-1 text-xs transition-colors',
                tab.active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:bg-accent',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {hydrated.length === 0 ? (
          <div className="border border-border px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {showAcquired ? 'Nothing acquired yet.' : 'Nothing on the want list.'}
            </p>
          </div>
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
