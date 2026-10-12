import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

/**
 * **The request client keeps no connection from one request to the next.**
 *
 * A spec's seed POST has been reset eight times, and the two the reporter
 * caught came 6032 and 6063ms after the worker's last request, against the
 * dev server's five idle seconds: a connection kept by Playwright's request
 * client and reused as the server closed it. `e2e/no-kept-connections.ts`
 * takes the kept connection away, which is the experiment as well as the
 * fix: if the resets go on, the hypothesis is wrong and `[reset]` will say
 * so.
 *
 * Read from a server of the test's own, which can see the socket each
 * request arrived on; the app's cannot say. One project: the client is
 * Node's in the worker and is the same under every browser.
 */
test('each page.request call arrives on a connection of its own', async ({ page }) => {
  const ports: number[] = [];
  const server = createServer((req, res) => {
    ports.push(req.socket.remotePort ?? -1);
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/seed`;
    for (let i = 0; i < 3; i += 1) expect((await page.request.post(url, { data: { i } })).status()).toBe(200);
    expect(ports).toHaveLength(3);
    expect(new Set(ports).size, `the three requests arrived on ports ${ports.join(', ')}`).toBe(3);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
