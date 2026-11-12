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

/**
 * **The scene harness, public in development and test ONLY.**
 *
 * `/scene` renders the wall with synthesised records — no database, no login —
 * so the geometry can be LOOKED AT. Every geometry defect this project has found
 * was invisible to arithmetic and obvious in an image, and reaching the wall
 * previously meant logging in and manipulating a real collection into each state.
 *
 * **Deliberately not an entry in PUBLIC_PATHS.** That set is the §3 auth
 * boundary, and a permanently public page that renders app components is a hole
 * in it. This exemption evaporates in production, where the route falls back to
 * session auth like any other — verified by a test that fails against the
 * obvious `PUBLIC_PATHS.add('/scene')` implementation.
 *
 * Read at call time rather than captured at module load, so a test can vary it.
 */
/* No dev-only public routes remain: /scene retired with the lit wall (8a §11). */
const DEV_ONLY_PUBLIC_PATHS = new Set<string>();

/**
 * **The e2e server's embeddings stub, public only where the probes are open (Q22's control, 12 Nov).** The server
 * calls it itself, from the ask route, with no session to carry, so behind the session boundary it answered its own
 * call 401. Open exactly as the probe pages are (`E2E_PROBES=1` off production; the route answers not-found besides),
 * and a session route everywhere else. Deliberately not in PUBLIC_PATHS, for the reason /scene was not.
 */
const PROBE_PUBLIC_PATHS = new Set(['/api/e2e-openai/v1/embeddings']);

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
export function routeAuthMode(pathname: string, source: Record<string, string | undefined> = process.env): AuthMode {
  const path = normalize(pathname);

  if (PUBLIC_PATHS.has(path)) return 'public';
  if (DEV_ONLY_PUBLIC_PATHS.has(path) && process.env.NODE_ENV !== 'production') {
    return 'public';
  }
  /*
    Read from the env OBJECT, never the `process.env.NODE_ENV` literal: a build inlines the literal as "production"
    into every bundle whatever `next start` is given, which is how the probe pages were found closed under the first
    build-served run (probes.ts, Q39) and how the stub answered 401 under the capture's build (12 Nov).
  */
  if (PROBE_PUBLIC_PATHS.has(path) && source.E2E_PROBES === '1' && source.NODE_ENV !== 'production') {
    return 'public';
  }
  if (CRON_PATHS.has(path)) return 'cron';
  return 'session';
}
