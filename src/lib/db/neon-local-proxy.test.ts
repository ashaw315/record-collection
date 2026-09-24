import { describe, expect, it } from 'vitest';
import { PROXY_PATH, proxyUrl } from './neon-local-proxy';

/**
 * **The path is asserted because it was wrong and the failure was opaque.**
 *
 * `/v2` is what the driver's hosted endpoint uses, and it returns 404 on the
 * local proxy image — surfacing as `Unexpected server response: 404` buried in
 * a WebSocket ErrorEvent dump rather than as anything naming a path. Measured
 * against the running container: `/v1` upgrades with 101, `/v2` and `/` return
 * 404.
 */
describe('the local proxy address the Neon driver dials', () => {
  it('uses the path the proxy actually serves', () => {
    expect(PROXY_PATH, '/v2 answers 404 on this image').toBe('v1');
  });

  /**
   * **The address is passed once, not appended.**
   *
   * The compose service first set `APPEND_PORT`, which appends a target to the
   * address the client already sends, producing
   * `postgres:5432postgres:5432` and `too many colons in address` in the
   * proxy's log. The driver supplies host and port, so the URL carries them
   * exactly once.
   */
  it('carries the host and port exactly once', () => {
    const url = proxyUrl('postgres', 5432);
    expect(url).toBe('localhost:5434/v1?address=postgres:5432');
    expect(url.match(/postgres:5432/g), 'the address appears once').toHaveLength(1);
  });
});
