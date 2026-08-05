import { describe, expect, it } from 'vitest';
import type { SignJWT as JoseSignJWT } from 'jose';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from './session';

const SECRET = 'a-test-session-secret-at-least-32-chars-long';
const OTHER_SECRET = 'a-different-secret-also-at-least-32-characters';

describe('session tokens', () => {
  it('round-trips a token it just signed', async () => {
    const token = await createSessionToken(SECRET);

    await expect(verifySessionToken(token, SECRET)).resolves.toBe(true);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken(OTHER_SECRET);

    await expect(verifySessionToken(token, SECRET)).resolves.toBe(false);
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken(SECRET);
    const tampered = token.slice(0, -4) + 'AAAA';

    await expect(verifySessionToken(tampered, SECRET)).resolves.toBe(false);
  });

  it('rejects a syntactically invalid token', async () => {
    await expect(verifySessionToken('not-a-jwt', SECRET)).resolves.toBe(false);
  });

  it('rejects an empty token', async () => {
    await expect(verifySessionToken('', SECRET)).resolves.toBe(false);
  });

  it('rejects an undefined token', async () => {
    await expect(verifySessionToken(undefined, SECRET)).resolves.toBe(false);
  });

  it('rejects an expired token', async () => {
    const expired = await createSessionToken(SECRET, { expiresAt: new Date(Date.now() - 1000) });

    await expect(verifySessionToken(expired, SECRET)).resolves.toBe(false);
  });

  it('accepts a token that has not yet expired', async () => {
    const token = await createSessionToken(SECRET, {
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(verifySessionToken(token, SECRET)).resolves.toBe(true);
  });

  it('rejects a token signed with a different HMAC algorithm', async () => {
    // Algorithm confusion: a token validly signed with the same secret but a
    // different alg must still be refused, because `algorithms` is pinned.
    // This is the case the alg:none test cannot cover — jose refuses "none"
    // outright, so that test passes with or without the pin.
    const { SignJWT } = await import('jose');
    const hs512 = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('app')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(hs512, SECRET)).resolves.toBe(false);
  });

  /**
   * H3: verification pinned `algorithms` but checked no claims, so any token
   * signed with SESSION_SECRET was a valid session regardless of what it was
   * minted for, and a token with no `exp` never expired.
   *
   * Today SESSION_SECRET signs nothing else, so these were latent rather than
   * exploitable. They stop being latent the moment a second token type shares
   * the secret — a share link, a password-reset token — at which point that
   * token silently becomes a full session.
   */
  describe('claim binding', () => {
    async function signWith(
      claims: Record<string, unknown>,
      configure: (builder: JoseSignJWT) => JoseSignJWT = (builder) => builder,
    ): Promise<string> {
      const { SignJWT } = await import('jose');
      return configure(
        new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt(),
      ).sign(new TextEncoder().encode(SECRET));
    }

    it('rejects a validly signed token minted for a different purpose', async () => {
      // Correct secret, correct algorithm, unexpired — but not a session token.
      const other = await signWith({ purpose: 'password-reset' }, (b) =>
        b.setSubject('password-reset').setExpirationTime(Math.floor(Date.now() / 1000) + 3600),
      );

      await expect(verifySessionToken(other, SECRET)).resolves.toBe(false);
    });

    it('rejects a token with no subject at all', async () => {
      const noSub = await signWith({}, (b) =>
        b.setExpirationTime(Math.floor(Date.now() / 1000) + 3600),
      );

      await expect(verifySessionToken(noSub, SECRET)).resolves.toBe(false);
    });

    it('rejects a token carrying no exp claim, which would never expire', async () => {
      // SPEC.md §3 requires a 30-day expiry. A token without `exp` is valid
      // forever, which defeats that outright.
      const noExp = await signWith({}, (b) => b.setSubject('app'));

      await expect(verifySessionToken(noExp, SECRET)).resolves.toBe(false);
    });

    it('still accepts a genuine session token', async () => {
      await expect(verifySessionToken(await createSessionToken(SECRET), SECRET)).resolves.toBe(
        true,
      );
    });
  });

  it('does not accept the algorithm being downgraded to none', async () => {
    // An "alg": "none" token is the classic JWT forgery. Verification must
    // reject it rather than trusting the header.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'app', exp: 9999999999 })).toString(
      'base64url',
    );
    const forged = `${header}.${payload}.`;

    await expect(verifySessionToken(forged, SECRET)).resolves.toBe(false);
  });
});

describe('session cookie', () => {
  it('expires in 30 days, per SPEC.md §3', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it('applies that 30-day expiry to the token it actually signs', async () => {
    // The constant assertion above compares a value to its own literal and
    // cannot fail. This checks the constant is genuinely what createSessionToken
    // puts in `exp` — if the two ever diverge, this is what catches it.
    const { decodeJwt } = await import('jose');
    const before = Math.floor(Date.now() / 1000);
    const token = await createSessionToken(SECRET);
    const { exp } = decodeJwt(token);

    expect(exp).toBeDefined();
    const lifetime = (exp ?? 0) - before;
    expect(lifetime).toBeGreaterThan(SESSION_MAX_AGE_SECONDS - 5);
    expect(lifetime).toBeLessThanOrEqual(SESSION_MAX_AGE_SECONDS);
  });

  it('is httpOnly and sameSite=lax', () => {
    const options = sessionCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it('is secure in production', () => {
    expect(sessionCookieOptions('production').secure).toBe(true);
  });

  it('is not secure in development, so local http works', () => {
    expect(sessionCookieOptions('development').secure).toBe(false);
  });

  it('has a stable cookie name', () => {
    expect(SESSION_COOKIE_NAME).toBe('rc_session');
  });
});
