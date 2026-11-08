import type { ReleaseTextKind } from '../../../lib/discogs/release-text';
import { releaseTextWords } from '../../../lib/discogs/release-text-words';

/**
 * **§65's TRACKLIST section, as a model (step 173a; "Credits fold", 7 Nov).** The tracks whole; the credits folded
 * behind one line that counts them; opened, the release's credits one line to a role, then each track's beneath its
 * position and title; a company drawn only where the page shows no name the same as it. Pure, so what the section
 * draws and counts is decided and tested here; the section (173b) only lays it out.
 *
 * Every line is in the reason line's words (`releaseTextWords`), so a match reads the same in a result and here. A
 * line holding several names under one role keeps those words' order, the names and then the role.
 */
type Row = { kind: ReleaseTextKind; text: string; detail: string | null };

export type TracklistModel = {
  /** "position · title", in the release's order. */
  tracks: string[];
  /** The release's own credits, one line to a role, roles in first-seen order. */
  release: string[];
  /** The tracks that have credits, each with its credits one line to a role. */
  byTrack: { track: string; lines: string[] }[];
  /** The companies drawn, in the release's order, in the reason line's words. */
  companies: string[];
  /** The companies not drawn, by their stored names, because the page already shows a name the same as each. */
  suppressed: string[];
  /** What the fold holds: release credits, track credits and companies drawn, counted by entry and not by line. */
  count: number;
  /** "Credits · n", or null where the fold would hold nothing. The wording is Code's proposal, provisional. */
  countLine: string | null;
};

const DISAMBIGUATOR = /\s\(\d+\)$/;
/* "The same": case and Discogs' "(n)" do not make two names different; a name inside another does (§65: "Columbia Records Pressing Plant, Pitman" contains "Columbia Records" and is drawn, because it says where). */
const fold = (name: string) => name.replace(DISAMBIGUATOR, '').trim().toLowerCase();

/** Groups name-and-role pairs into one line a role, roles in first-seen order, names in the release's order. */
function byRole(entries: { name: string; role: string | null }[]): string[] {
  const roles = new Map<string | null, string[]>();
  for (const e of entries) {
    if (!roles.has(e.role)) roles.set(e.role, []);
    roles.get(e.role)?.push(e.name);
  }
  return [...roles].map(([role, names]) => releaseTextWords({ kind: 'credit', text: names.map((n) => n.replace(DISAMBIGUATOR, '')).join(', '), detail: role }));
}

/**
 * @param rows a release's rows as `releaseTextFor` returns them.
 * @param shown the company-like names the page already draws for this pressing (its label, its pressing plant).
 */
export function tracklistModel(rows: Row[], shown: string[]): TracklistModel | null {
  if (rows.length === 0) return null;
  const tracks = rows.filter((r) => r.kind === 'track');
  const positions = tracks.map((t) => t.detail).filter((p): p is string => p !== null);

  /*
    A track's credit is stored with the detail "role, position", or the position alone where it has no role
    (`releaseText`). A release credit's role can itself hold a comma ("Bass, Vocals"), so the split is by a trailing
    position the tracklist holds, never by the first comma: the rule 172's inventory checked against the payloads,
    agreeing on 55 of 55.
  */
  const release: { name: string; role: string | null }[] = [];
  const perTrack = new Map<string, { name: string; role: string | null }[]>();
  for (const c of rows.filter((r) => r.kind === 'credit')) {
    const position = c.detail === null ? undefined : positions.find((p) => c.detail === p || (c.detail as string).endsWith(`, ${p}`));
    if (position === undefined) { release.push({ name: c.text, role: c.detail }); continue; }
    const role = c.detail === position ? null : (c.detail as string).slice(0, -(`, ${position}`.length));
    if (!perTrack.has(position)) perTrack.set(position, []);
    perTrack.get(position)?.push({ name: c.text, role });
  }

  const folded = new Set(shown.map(fold));
  const companies = rows.filter((r) => r.kind === 'company');
  const drawn = companies.filter((c) => !folded.has(fold(c.text)));
  const trackCredits = [...perTrack.values()].reduce((n, list) => n + list.length, 0);
  const count = release.length + trackCredits + drawn.length;

  return {
    tracks: tracks.map((t) => releaseTextWords(t)),
    release: byRole(release),
    byTrack: tracks
      .filter((t) => t.detail !== null && perTrack.has(t.detail))
      .map((t) => ({ track: releaseTextWords(t), lines: byRole(perTrack.get(t.detail as string) ?? []) })),
    companies: drawn.map((c) => releaseTextWords(c)),
    suppressed: companies.filter((c) => !drawn.includes(c)).map((c) => c.text),
    count,
    countLine: count === 0 ? null : `Credits · ${count}`,
  };
}
