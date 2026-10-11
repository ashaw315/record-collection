import { describe, expect, it } from 'vitest';
import { RequestLog } from '../../scripts/reset-evidence';

/**
 * **A connection reset on a seed request arrives with its own evidence.**
 *
 * Six times a spec's first seed POST has failed with `read ECONNRESET` and
 * passed on retry, and none of the six said anything about the connection it
 * rode. The hypothesis is that Playwright's request client, which keeps
 * connections alive for the whole worker, reused one the dev server was
 * closing after its five idle seconds. What would test it is how long the
 * worker's requests had been quiet and how many had gone before; so the
 * suite's reporter keeps that for each worker and prints it when a request
 * is reset. A proxy, and named as one: the reporter sees requests, not
 * sockets, so it is the worker's quiet time and not a socket's age.
 */
describe('what a reset request is logged with', () => {
  it('says how long the worker’s requests had been quiet, and how many had gone before', () => {
    const log = new RequestLog();
    log.request(0, 1_000);
    log.request(0, 1_400);
    log.request(1, 2_000);
    expect(log.reset(0, 6_420, 'POST /api/artists')).toBe('[reset] worker 0: POST /api/artists reset 5020ms after the worker’s last request, its 3rd; 2 had gone before');
  });

  it('says so where it was the worker’s first request', () => {
    expect(new RequestLog().reset(3, 500, 'POST /api/artists')).toBe('[reset] worker 3: POST /api/artists reset on the worker’s first request');
  });

  it('counts the reset request itself, so the next one is measured from it', () => {
    const log = new RequestLog();
    log.request(0, 1_000);
    log.reset(0, 2_000, 'POST /api/artists');
    expect(log.reset(0, 2_300, 'POST /api/artists')).toBe('[reset] worker 0: POST /api/artists reset 300ms after the worker’s last request, its 3rd; 2 had gone before');
  });
});
