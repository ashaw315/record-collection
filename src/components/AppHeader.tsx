'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * The application's one piece of persistent chrome.
 *
 * Until now nothing linked anywhere: `/manage` was reachable only by typing
 * the URL. §10 lists ten screens, so a shell that names them has to exist
 * before the second one ships.
 *
 * Only the built screens appear. A nav advertising `/graph` before step 10
 * builds it is a dead link, and a disabled item that never enables reads as
 * broken — the remaining §10 routes are added by the steps that build them.
 */

const LINKS = [
  { href: '/', label: 'Collection' },
  { href: '/want-list', label: 'Want list' },
  { href: '/manage', label: 'Manage' },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl items-baseline gap-6 px-4 py-3">
        {/* The wordmark is not a link to itself when already home; it stays a
            link regardless so its position never shifts between screens. */}
        <Link
          href="/"
          className="font-heading text-sm font-semibold tracking-tight whitespace-nowrap"
        >
          Record Collection
        </Link>

        <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            // `/manage` must not light up on `/manage/anything`, and `/` would
            // prefix-match everything, so home is compared exactly.
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-xs px-2 py-1 text-sm whitespace-nowrap transition-colors',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
