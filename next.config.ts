import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
   * Scoped to this one host rather than a wildcard. It is a private-network
   * address, and the point of the check is that any origin able to reach the
   * dev server can otherwise read its source; a wildcard would hand that to
   * anything else on the same Wi-Fi. Step 15 needs a phone on the wall (§10b:
   * the wall "will be judged at 390px"), and this is the narrowest thing that
   * allows it.
   *
   * **If the LAN address changes, this stops working and the symptom is the
   * credential-leaking one above.** DHCP can reassign it. The tell is 403s on
   * `/_next/static/*` in the network tab; the fix is to update this list.
   */
  allowedDevOrigins: ['192.168.86.95'],
};

export default nextConfig;
