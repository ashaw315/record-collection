import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import { verifyCronSecret } from '@/lib/auth/password';
import { routeAuthMode } from '@/lib/auth/routes';
import { parseEdgeEnv } from '@/lib/env/edge';
import { logger } from '@/lib/logger';

/**
 * SPEC.md §3: protects every route except /login and /api/auth/login. The cron
 * endpoint stays behind this middleware and authenticates by bearer token.
 *
 * Env vars are validated through the Edge-safe schema rather than getEnv(),
 * because middleware runs in the Edge runtime where the `server-only` import
 * guarding src/env.ts is not resolvable. They are validated all the same: an
 * unvalidated read here previously turned a missing SESSION_SECRET into an
 * infinite redirect loop instead of an error anyone could act on.
 */
export async function middleware(request: NextRequest) {
  const mode = routeAuthMode(request.nextUrl.pathname);

  if (mode === 'public') {
    return NextResponse.next();
  }

  // Validated before any auth decision, and for every non-public route, so a
  // misconfigured deploy fails loudly and identically everywhere rather than
  // presenting as "the password does not work".
  let env;
  try {
    env = parseEdgeEnv(process.env);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Invalid environment configuration';
    // Deliberately surfaced: this is an operator error, not a user error, and
    // it names only variables, never values (see parseEdgeEnv).
    logger.error('middleware', detail);
    return NextResponse.json(
      {
        error: {
          message: 'Server is misconfigured. See server logs for the offending variable.',
          code: 'CONFIGURATION_ERROR',
        },
      },
      { status: 500 },
    );
  }

  if (mode === 'cron') {
    if (!verifyCronSecret(request.headers.get('authorization'), env.CRON_SECRET)) {
      return NextResponse.json(
        { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (await verifySessionToken(token, env.SESSION_SECRET)) {
    return NextResponse.next();
  }

  // API callers get a JSON 401; browsers get redirected to the login screen.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next internals and static assets. The pattern and the
  // predicate that tests it live together in @/lib/auth/routes so they cannot
  // drift; see MIDDLEWARE_MATCHER for why image extensions are not excluded.
  //
  // Inlined rather than referenced because Next.js parses this object
  // statically at build time and cannot resolve an imported identifier. A test
  // asserts the two stay identical.
  matcher: ['/((?!_next/static/|_next/image|favicon\\.ico$).*)'],
};
