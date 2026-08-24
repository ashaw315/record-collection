import { describe, expect, it } from 'vitest';
import { discogsErrorResponse } from './errors';
import { DiscogsError } from './client';

/**
 * The mapping from a Discogs failure to a response that says WHOSE failure it
 * was (§5, §6).
 *
 * These exist because the 401 case had no branch: it fell to the default and
 * told the user "Could not reach Discogs. Try again shortly." — retry advice
 * for a credential that will never self-correct. R5 fixed exactly this shape
 * for the Anthropic client (`isAuthFailure` → 502 LLM_UNAUTHORIZED, no retry
 * advice) and R6 found Discogs had never been given the same treatment.
 */

async function bodyOf(response: Response) {
  return (await response.json()) as { error: { message: string; code: string } };
}

describe('discogsErrorResponse', () => {
  describe('an authentication failure is named, not called an outage', () => {
    /**
     * Both fail against the two-branch version in errors.ts, which handles 429
     * and 404 and sends everything else to the UPSTREAM_ERROR default.
     */
    it.each([401, 403])('maps %i to a distinct code rather than UPSTREAM_ERROR', async (status) => {
      const response = discogsErrorResponse(new DiscogsError('failed', { status }));
      const body = await bodyOf(response);

      expect(body.error.code).toBe('DISCOGS_UNAUTHORIZED');
      expect(response.status).toBe(502);
    });

    it('does not tell the user to try again, because retrying cannot help', async () => {
      const body = await bodyOf(discogsErrorResponse(new DiscogsError('failed', { status: 401 })));

      expect(body.error.message).not.toMatch(/try again|shortly|moment/i);
    });

    it('says the credential was rejected, without naming the variable', async () => {
      // §5: no deployment detail in a response body. The operator gets the
      // variable name from the logs; the user gets a sentence that is true.
      const body = await bodyOf(discogsErrorResponse(new DiscogsError('failed', { status: 403 })));

      expect(body.error.message).toMatch(/credential/i);
      expect(body.error.message).not.toContain('DISCOGS_TOKEN');
    });
  });

  describe('the cases that already worked keep working', () => {
    it('maps 429 to RATE_LIMITED, which IS worth retrying', async () => {
      const response = discogsErrorResponse(new DiscogsError('failed', { status: 429 }));
      const body = await bodyOf(response);

      expect(response.status).toBe(429);
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.message).toMatch(/try again/i);
    });

    it('passes a 404 through as NOT_FOUND', async () => {
      const response = discogsErrorResponse(new DiscogsError('failed', { status: 404 }));
      const body = await bodyOf(response);

      expect(response.status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('still calls a genuine outage an outage', async () => {
      const response = discogsErrorResponse(new DiscogsError('failed', { status: 503 }));
      const body = await bodyOf(response);

      expect(response.status).toBe(502);
      expect(body.error.code).toBe('UPSTREAM_ERROR');
      expect(body.error.message).toMatch(/try again/i);
    });

    it('treats an error with no status as an outage', async () => {
      // A network failure never reached Discogs, so there is no status. That is
      // genuinely "could not reach", which is what the default says.
      const response = discogsErrorResponse(new DiscogsError('network down'));
      const body = await bodyOf(response);

      expect(response.status).toBe(502);
      expect(body.error.code).toBe('UPSTREAM_ERROR');
    });
  });

  it('never echoes the error message, which can carry a URL', async () => {
    const body = await bodyOf(
      discogsErrorResponse(
        new DiscogsError('GET https://api.discogs.com/x?token=SECRET failed', { status: 401 }),
      ),
    );

    expect(body.error.message).not.toContain('SECRET');
  });
});
