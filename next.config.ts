import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * **A separate build directory under test, so the E2E server and the
   * developer's dev server can run at once.**
   *
   * Next holds a lock at `<distDir>/dev/lock` scoped to the DIRECTORY, not the
   * port — so a second `next dev` from this repo is refused however it is
   * addressed, and starting the suite killed whatever was serving the phone.
   * That happened three times in one session and cost a restart each time.
   *
   * Giving the test server `.next-test` gives it its own lock. The two are
   * independent: the suite runs on 3100 out of `.next-test` while the phone
   * keeps talking to 3000 out of `.next`.
   *
   * Keyed on `NODE_ENV=test`, which `playwright.config.ts` already sets on its
   * `webServer` command for an unrelated reason (loading `.env.test` rather
   * than the developer's `.env.local`). Nothing else sets it, so a normal
   * `npm run dev` and `npm run build` are untouched.
   */
  distDir: process.env.NODE_ENV === 'test' ? '.next-test' : '.next',

  /**
   * **Lets a phone on the LAN load the dev server's own assets.**
   *
   * Next 16 blocks cross-origin requests to dev resources (`/_next/static/*`,
   * `/_next/hmr`, `/__nextjs_font/*`) unless the requesting origin is allowed.
   * Reaching the dev server at `http://192.168.86.95:3000` makes every one of
   * those requests cross-origin, so they 403 — measured, and confirmed by the
   * server's own log naming the blocked chunks.
   *
   * **The failure is dangerous rather than merely broken**, which is why this
   * carries a comment rather than being a one-line config. The login page still
   * rendered — only its JavaScript was missing — so the form fell back to a
   * native GET submit and put the password in the query string, the browser
   * history, and the dev request log. A 403 on a script became a credential
   * disclosure, and the login page looked normal throughout.
   *
   * `allowedDevOrigins` is read ONLY by `next dev`. It has no effect on `next
   * build` or `next start`, so it cannot widen anything in production — the
   * reason it is safe to commit rather than keep as a local-only edit.
   *
   * Step 15 needs a phone on the wall (§10b: the wall "will be judged at
   * 390px"), and this is the narrowest thing that allows it.
   *
   * **The address is the private /24 this machine sits on, not one host.**
   *
   * It was pinned to a single IP and DHCP reassigned it overnight
   * (192.168.86.95 -> .98). The symptom was the credential-leaking one above:
   * `/login` renders 200, its chunks 403, the form falls back to a native GET
   * submit and the password lands in the URL and the history. A comment
   * predicting that failure did not prevent it — the second time this session
   * a known hazard was written down and then met.
   *
   * A `/24` on a private RFC1918 range is the smallest thing that survives a
   * lease change. It is wider than one host and much narrower than a wildcard:
   * it admits only devices already on this LAN, which is the same trust
   * boundary the dev server is exposed on by `--hostname 0.0.0.0` anyway.
   *
   * **Dev only.** `allowedDevOrigins` is read by `next dev` and ignored by
   * `next build` and `next start`, so nothing here widens production.
   */
  allowedDevOrigins: ['192.168.86.*', 'localhost', '127.0.0.1'],
};

export default nextConfig;
