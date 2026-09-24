import 'server-only';

/**
 * Points `@neondatabase/serverless` at a LOCAL Postgres through Neon's own
 * WebSocket proxy, so the production driver can be exercised with no remote
 * branch and no network.
 *
 * **Why this exists.** CLAUDE.md §2 requires transactional code to be verified
 * against the real Neon driver rather than local `pg` alone, because the two
 * differ exactly where correctness is hardest to test. That verification used
 * to need a throwaway Neon branch, whose credential expired on a weekly cycle;
 * between rotations `neon-transactions.test.ts` failed with `28P01 password
 * authentication failed` and the guarantees went unverified. Regenerating the
 * branch was a recurring chore, and the chore was the problem rather than any
 * one expiry.
 *
 * The driver speaks Postgres over a WebSocket instead of a TCP socket, so it
 * cannot reach a local server directly. `ghcr.io/neondatabase/wsproxy`
 * terminates the WebSocket and forwards to plain Postgres — it is Neon's own
 * proxy, the same one their docs give for local development, so what runs is
 * the genuine driver rather than a substitute for it.
 *
 * **What is still not covered**, and it is worth stating because the point of
 * this file is honest verification: the driver's wire protocol, its
 * transaction handling and its session semantics are exercised for real, but
 * Neon's SERVER side is not. Connection pooling at their proxy, compute
 * suspend and resume, and their own timeouts are absent. This closes the gap
 * CLAUDE.md §2 names — driver-versus-`pg` behaviour — and not the one about
 * the hosted service's operational behaviour.
 */
import { neonConfig } from '@neondatabase/serverless';

/** Host and port of the `wsproxy` service in `docker-compose.yml`. */
export const PROXY_ORIGIN = 'localhost:5434';

/**
 * The proxy's WebSocket path.
 *
 * **`/v1`, not `/v2`.** Measured rather than assumed: `/v2` answers 404 and
 * `/v1` upgrades with 101 on this image. The driver's own default targets
 * Neon's hosted endpoint, which is a different service.
 */
export const PROXY_PATH = 'v1';

export function proxyUrl(host: string, port: number | string): string {
  return `${PROXY_ORIGIN}/${PROXY_PATH}?address=${host}:${port}`;
}

/**
 * Configures the driver for the local proxy. Call once before opening a pool.
 *
 * Every flag here turns OFF a protection that exists for the public internet
 * and cannot work against a plaintext local proxy:
 *
 * - `useSecureWebSocket` / `pipelineTLS`: the proxy speaks `ws:`, not `wss:`.
 * - `forceDisablePgSSL`: Postgres in Docker has no certificate.
 * - `pipelineConnect`: an optimisation that assumes Neon's endpoint.
 *
 * **This is safe HERE and nowhere else**, which is why the module is
 * test-only by convention and the connection string it is used with addresses
 * a container. Pointing it at a remote database would send credentials
 * unencrypted.
 */
export function configureNeonForLocalProxy(webSocketConstructor: unknown): void {
  neonConfig.webSocketConstructor = webSocketConstructor as typeof neonConfig.webSocketConstructor;
  neonConfig.wsProxy = (host, port) => proxyUrl(host, port);
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
  neonConfig.forceDisablePgSSL = true;
}
