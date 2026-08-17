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
 * Only the built screens appear. A nav advertising a screen before it exists is
 * a dead link, and a disabled item that never enables reads as broken — the
 * remaining §10 routes are added by the steps that build them, and a retired
 * one leaves here with the screen.
 */

const LINKS = [
  { href: '/', label: 'Collection' },
  { href: '/want-list', label: 'Want list' },
  // §10 calls /lookup "the in-store screen", so it belongs in reach on a
  // phone rather than behind a URL somebody has to remember.
  { href: '/lookup', label: 'Look up' },
  // Linked, not just routable: a screen nothing navigates to is the
  // unreachable-path shape that cost this build §6's genre mapping (NOTES).
  { href: '/stats', label: 'Stats' },
  // `/graph` was here until §10b retired the screen. The DATA it drew --
  // artist_memberships, artist_influences, record_genres -- survives and feeds
  // §9's suggestions, which is what it was actually useful for; drawing it
  // added a picture that told the user what they already knew.
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
