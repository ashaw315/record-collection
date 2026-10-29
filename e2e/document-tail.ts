import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

/**
 * **The page still loading, staged for real (§W.8, 29 Oct): a proxy that
 * holds back the end of the document.**
 *
 * §W.8 holds a press on a spine while the page is still loading. The state
 * is the document still arriving after the wall's markup and the hold script
 * have been read: the scripts are separate requests, so they load and React
 * attaches while `document.readyState` is still `loading` and the page's
 * payload chunks, which come inline after the markup, have not arrived. On a
 * production build with cached scripts this measured 0 to 15ms wide (NOTES,
 * 29 Oct 16:40); here it is held open for as long as a test asks.
 *
 * Unlike `holdHydration` in `hold-window.ts`, nothing here reaches into
 * Next: every request passes through unchanged except the wall's document,
 * which is streamed up to the first payload chunk after the wall's container
 * and held there until `release()`. If a Next upgrade moves the payload
 * ahead of the markup, the split is not found and the document passes whole,
 * so `stillLoading` reads false and a test's precondition fails by name.
 */
export type DocumentTail = {
  /** The proxy's origin; navigate here instead of the dev server. */
  origin: string;
  /** Send the held tail and end the document. */
  release: () => void;
  /** Whether a document's tail is being held now. */
  holding: () => boolean;
  close: () => Promise<void>;
};

const SPLIT_AFTER = 'data-wall-container';
const SPLIT_AT = '<script>self.__next_f.push(';

export async function holdDocumentTail(upstream: string): Promise<DocumentTail> {
  const target = new URL(upstream);
  let releaseHeld: (() => void) | null = null;
  let released = false;
  const server = http.createServer((req, res) => {
    const headers = { ...req.headers, host: target.host };
    /* Uncompressed, so the split can be found in the text. */
    delete headers['accept-encoding'];
    const isDocument = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html') && (req.url ?? '').startsWith('/?');
    const upstreamReq = http.request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, (up) => {
      if (!isDocument || released) {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
        return;
      }
      const outHeaders = { ...up.headers };
      delete outHeaders['content-length'];
      res.writeHead(up.statusCode ?? 502, outHeaders);
      let text = '';
      let split = -1;
      let sent = 0;
      let ended = false;
      const flushTail = () => {
        res.write(text.slice(sent));
        sent = text.length;
        if (ended) res.end();
      };
      up.setEncoding('utf8');
      up.on('data', (chunk: string) => {
        text += chunk;
        if (split === -1) {
          const wall = text.indexOf(SPLIT_AFTER);
          const at = wall === -1 ? -1 : text.indexOf(SPLIT_AT, wall);
          if (at !== -1) {
            split = at;
            res.write(text.slice(sent, split));
            sent = split;
            releaseHeld = () => { releaseHeld = null; flushTail(); };
          }
          return;
        }
        if (releaseHeld === null) flushTail();
      });
      up.on('end', () => {
        ended = true;
        if (split === -1) { res.end(text.slice(sent)); return; }
        if (releaseHeld === null) flushTail();
      });
    });
    upstreamReq.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstreamReq);
  });
  /* The dev client's HMR socket: without it the dev server's page never hydrates (29 Oct, every test timed out after release). Piped raw. */
  const upgraded = new Set<Duplex>();
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(Number(target.port), target.hostname, () => {
      const lines = [`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        lines.push(`${name}: ${name.toLowerCase() === 'host' ? target.host : req.rawHeaders[i + 1]}`);
      }
      up.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length > 0) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    upgraded.add(socket).add(up);
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  /* Every interface, so `localhost` reaches it whichever address the browser tries first; cookies are the dev server's, since a cookie is not scoped by port. */
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://localhost:${port}`,
    release: () => { released = true; releaseHeld?.(); },
    holding: () => releaseHeld !== null,
    /* An upgraded socket has left the server's connections, so it is ended here or close waits on it. */
    close: () => new Promise<void>((resolve) => { for (const s of upgraded) s.destroy(); server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
