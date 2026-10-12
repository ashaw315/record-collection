import { Agent } from 'node:http';

/**
 * **No HTTP connection made from a Playwright process is kept for reuse.**
 *
 * Playwright's request client sends every `page.request` call through
 * process-wide agents made with `keepAlive: true`, so a worker's seed POST
 * can ride a connection left idle since an earlier test; Next's dev server
 * closes an idle connection after five seconds, and a request that meets
 * the close is `read ECONNRESET`. The agents are not reachable to
 * configure, and a `Connection: close` header in the config's `use` would
 * reach the browsers' own requests too (measured: each of a page's loads
 * then opens a connection of its own). So the agent's own hook is
 * answered no: a socket is closed when its response ends.
 *
 * Imported by `playwright.config.ts`, which every worker loads. The
 * browsers are separate processes and keep their connections as before.
 * Held by `e2e/request-connections.spec.ts`. Not a retry: a reset that
 * still arrives is still a failure, and `e2e/reset-evidence.ts` prints it.
 */
Agent.prototype.keepSocketAlive = () => false;
