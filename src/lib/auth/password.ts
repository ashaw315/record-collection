import bcrypt from 'bcryptjs';

/**
 * Fails closed on a malformed hash. A misconfigured APP_PASSWORD_HASH should
 * deny access, not throw a 500 that hints at which env var is wrong.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (password === '' || hash === '') return false;

  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Length-independent comparison. `===` on secrets leaks a prefix match through
 * timing; this compares every byte regardless of where the first difference is.
 * Written by hand because node:crypto.timingSafeEqual is unavailable in the
 * Edge runtime where middleware runs.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  let mismatch = left.length === right.length ? 0 : 1;
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return mismatch === 0;
}

const BEARER_PREFIX = 'Bearer ';

/**
 * SPEC.md §3: Vercel Cron authenticates to /api/discogs/refresh-prices with a
 * CRON_SECRET bearer token instead of a session cookie.
 */
export function verifyCronSecret(
  authorizationHeader: string | null,
  cronSecret: string,
): boolean {
  if (authorizationHeader === null) return false;
  if (!authorizationHeader.startsWith(BEARER_PREFIX)) return false;

  return constantTimeEquals(authorizationHeader.slice(BEARER_PREFIX.length), cronSecret);
}
