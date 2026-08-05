export type AuthMode = 'public' | 'cron' | 'session';

/**
 * The path pattern middleware is registered against (SPEC.md §3: everything is
 * protected except /login and /api/auth/login).
 *
 * Only genuine static-asset prefixes are excluded, and the exclusion is
 * ANCHORED to the start of the path. The previous pattern excluded
 * `.*\.(svg|png|jpg|jpeg|gif|webp)$` against the whole path, so
 * `/api/records/x.png` and `/api/records/2024-photo.jpeg` never reached
 * middleware at all. Nothing was mounted there yet — which is precisely why it
 * would have shipped unnoticed into SPEC.md §5.9's image endpoints, where a
 * user-supplied filename ending in an image extension is the normal case.
 *
 * `_next/data` is deliberately NOT excluded: it carries page payloads, not
 * assets, and must be authenticated like the page it serves.
 *
 * Next.js parses this at build time, so it must stay a literal pattern — no
 * interpolation, no computed value.
 */
export const MIDDLEWARE_MATCHER = '/((?!_next/static/|_next/image|favicon\\.ico$).*)';

/**
 * Whether middleware runs for a path, modelling MIDDLEWARE_MATCHER exactly.
 *
 * Exists so the matcher is testable: a path the matcher excludes never reaches
 * routeAuthMode, so every auth rule in this file is irrelevant for it. An
 * untested matcher is an untested auth boundary.
 */
export function middlewareRuns(pathname: string): boolean {
  return new RegExp(`^${MIDDLEWARE_MATCHER}$`).test(pathname);
}

/** Exact matches only — a prefix rule would make /login-as-admin public. */
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login']);

const CRON_PATHS = new Set(['/api/discogs/refresh-prices']);

function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/**
 * SPEC.md §3. The cron endpoint is deliberately not public: it stays behind
 * middleware and authenticates by CRON_SECRET bearer token, because exempting
 * it wholesale would leave it reachable by anyone.
 */
export function routeAuthMode(pathname: string): AuthMode {
  const path = normalize(pathname);

  if (PUBLIC_PATHS.has(path)) return 'public';
  if (CRON_PATHS.has(path)) return 'cron';
  return 'session';
}
