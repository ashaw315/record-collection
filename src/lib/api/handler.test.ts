import { afterEach, describe, expect, it, vi } from 'vitest';
import { withErrorHandling } from './handler';
import { badRequest } from './errors';
import { logger } from '@/lib/logger';

/**
 * SPEC.md §5: "Server error: 500, same shape, no stack traces in the response
 * body." Nothing implemented that until now — an unanticipated throw escaped as
 * an unshaped Next.js error whose message embedded the full SQL statement.
 *
 * These cover the wrapper in isolation; tags.test.ts covers it against a real
 * forced database failure and a real constraint violation, which is the case
 * that actually matters — a synthetic `throw new Error()` does not resemble a
 * driver error and would not have caught the SQL leak.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function silenceLogger() {
  return vi.spyOn(logger, 'error').mockImplementation(() => {});
}

describe('withErrorHandling', () => {
  it('passes a successful response through untouched', async () => {
    const handler = withErrorHandling('test', async (): Promise<Response> => Response.json({ ok: true }));
    const response = await handler(new Request('https://x.test/'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('passes a deliberate error response through without reshaping it', async () => {
    // A 400 built by a handler must not be swallowed and reissued as a 500.
    const handler = withErrorHandling('test', async (): Promise<Response> => badRequest('Nope', 'NOPE'));
    const response = await handler(new Request('https://x.test/'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('NOPE');
  });

  it('converts an uncaught throw into the §5 500 shape', async () => {
    silenceLogger();
    const handler = withErrorHandling('test', async (): Promise<Response> => {
      throw new Error('boom');
    });
    const response = await handler(new Request('https://x.test/'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
    });
  });

  it('leaks neither the thrown message nor a stack trace to the client', async () => {
    silenceLogger();
    const handler = withErrorHandling('test', async (): Promise<Response> => {
      throw new Error('connection string postgres://user:hunter2@db.internal/prod');
    });
    const response = await handler(new Request('https://x.test/'));

    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('db.internal');
    expect(serialized).not.toContain('postgres://');
    expect(serialized).not.toMatch(/\bat\s+\w+.*:\d+:\d+/);
  });

  it('never lets a SQL statement reach the client', async () => {
    silenceLogger();
    // Shaped like the real driver error observed before this existed: the
    // message embedded the whole statement.
    const handler = withErrorHandling('test', async (): Promise<Response> => {
      throw new Error(
        'Failed query: select "id", "name" from "tags" order by "tags"."name" asc limit $1 offset $2',
      );
    });
    const response = await handler(new Request('https://x.test/'));

    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('tags');
    expect(serialized).not.toContain('Failed query');
  });

  it('logs the real error server-side so it is not merely swallowed', async () => {
    const spy = silenceLogger();
    await withErrorHandling('tags.GET', async (): Promise<Response> => {
      throw new Error('the real cause');
    })(new Request('https://x.test/'));

    expect(spy).toHaveBeenCalledOnce();
    const [scope, message] = spy.mock.calls[0];
    expect(scope).toBe('tags.GET');
    expect(message).toContain('the real cause');
  });

  it('handles a thrown non-Error without throwing again', async () => {
    // `throw 'string'` and `throw undefined` are legal JS. A wrapper that
    // assumes Error and reads .message would itself throw here, defeating the
    // whole point.
    silenceLogger();
    for (const thrown of ['a string', undefined, null, 42, { weird: true }]) {
      const response = await withErrorHandling('test', async (): Promise<Response> => {
        throw thrown;
      })(new Request('https://x.test/'));

      expect(response.status).toBe(500);
      expect((await response.json()).error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('passes through the request and context arguments unchanged', async () => {
    const handler = withErrorHandling(
      'test',
      async (request: Request, context: { params: Promise<{ id: string }> }) => {
        const { id } = await context.params;
        return Response.json({ url: request.url, id });
      },
    );

    const response = await handler(new Request('https://x.test/api/tags/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });

    expect(await response.json()).toEqual({ url: 'https://x.test/api/tags/abc', id: 'abc' });
  });

  it('catches a rejected promise, not only a synchronous throw', async () => {
    silenceLogger();
    const handler = withErrorHandling('test', (): Promise<Response> => Promise.reject(new Error('async boom')));
    const response = await handler(new Request('https://x.test/'));

    expect(response.status).toBe(500);
  });
});

describe('the logged detail includes the cause chain', () => {
  /**
   * Same defect as the cover path, one layer up and affecting every route: a
   * wrapped error reaching `withErrorHandling` logged its own message and stack
   * but never the `cause` — so the sentence explaining WHY was dropped at the
   * only place anyone would look for it.
   *
   * The stack still matters (it says where); the cause says why, and a 500 with
   * neither is the least actionable thing a log can contain.
   */
  it('logs the underlying reason, not just the wrapper', async () => {
    const logged: string[] = [];
    vi.spyOn(logger, 'error').mockImplementation((_scope, message) => {
      logged.push(message);
    });

    const handler = withErrorHandling('TEST /thing', async () => {
      throw new Error('The image could not be stored.', {
        cause: new Error('Access denied, please provide a valid token'),
      });
    });

    const response = await handler(new Request('http://test/thing'));

    expect(response.status, 'still a 500 — this is about the LOG, not the body').toBe(500);
    expect(logged.join('\n'), 'the actionable half reaches the log').toContain('Access denied');
  });

  it('still logs the stack, which says WHERE', async () => {
    const logged: string[] = [];
    vi.spyOn(logger, 'error').mockImplementation((_scope, message) => {
      logged.push(message);
    });

    const handler = withErrorHandling('TEST /thing', async () => {
      throw new Error('plain failure');
    });
    await handler(new Request('http://test/thing'));

    expect(logged.join('\n')).toContain('plain failure');
    expect(logged.join('\n'), 'the stack is not lost to the change').toMatch(/at |no stack/);
  });

  it('never puts the cause in the RESPONSE', async () => {
    // §5's shape reaches a client. A cause chain there leaks deployment detail
    // — the same reason the 503 for an unconfigured store names no variable.
    const handler = withErrorHandling('TEST /thing', async () => {
      throw new Error('wrapper', { cause: new Error('vercel_blob_rw_secret_detail') });
    });

    const body = await (await handler(new Request('http://test/thing'))).json();

    expect(JSON.stringify(body)).not.toContain('vercel_blob_rw_secret_detail');
  });
});
