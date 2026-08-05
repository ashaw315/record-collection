import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE_NAME = 'rc_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const ALGORITHM = 'HS256';

/**
 * Binds a token to this specific purpose. Verification requires it, so a token
 * signed with the same secret for anything else — a share link, a reset token —
 * is not accepted as a session.
 */
const SUBJECT = 'app';

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

interface CreateOptions {
  expiresAt?: Date;
}

export async function createSessionToken(
  secret: string,
  options: CreateOptions = {},
): Promise<string> {
  const expiresAt =
    options.expiresAt ?? new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(SUBJECT)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key(secret));
}

/**
 * Returns false rather than throwing for every failure mode — bad signature,
 * expired, malformed, absent. Callers treat "not a valid session" uniformly and
 * an exception here would turn a routine logged-out request into a 500.
 *
 * `algorithms` is pinned so an `alg: none` token cannot bypass verification.
 *
 * `subject` and `requiredClaims` are pinned too. Without them any token signed
 * with SESSION_SECRET counted as a session regardless of what it was minted
 * for, and a token carrying no `exp` never expired — defeating SPEC.md §3's
 * 30-day limit. Harmless while this secret signs only sessions; a silent
 * privilege escalation the moment it signs anything else.
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (token === undefined || token === '') return false;

  try {
    await jwtVerify(token, key(secret), {
      algorithms: [ALGORITHM],
      subject: SUBJECT,
      requiredClaims: ['exp'],
    });
    return true;
  } catch {
    return false;
  }
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

export function sessionCookieOptions(nodeEnv?: string): SessionCookieOptions {
  const environment = nodeEnv ?? process.env.NODE_ENV;
  return {
    httpOnly: true,
    // Off in development so the cookie works over plain http on localhost.
    secure: environment === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
