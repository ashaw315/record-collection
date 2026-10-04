/**
 * §G.4: which nav section a screen belongs to, by the link's href, or null
 * when no section owns it. "The record detail, record edit and new record
 * belong to Collection ... Suggestions is reached from the want list, so
 * Want list is current there."
 *
 * A section owns its own path and everything under it, matched on a segment
 * boundary: `/stats-archive` is not Stats. The old rule was the link's own
 * path as a bare prefix, which marked nothing on the record screens or on
 * Suggestions and had no boundary at all.
 */
const OWNERS: ReadonlyArray<readonly [string, string]> = [
  ['/records', '/'],
  ['/want-list', '/want-list'],
  ['/suggestions', '/want-list'],
  ['/lookup', '/lookup'],
  ['/stats', '/stats'],
  ['/manage', '/manage'],
];

export function currentSection(pathname: string): string | null {
  if (pathname === '/') return '/';
  for (const [base, section] of OWNERS) {
    if (pathname === base || pathname.startsWith(`${base}/`)) return section;
  }
  return null;
}
