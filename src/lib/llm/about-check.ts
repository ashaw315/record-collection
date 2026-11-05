import type { DiscographyEntry, ReleaseFacts } from './about-grounding';
import type { SnippetSubject } from './snippet-client';

/**
 * The check after the note (the coordinator, 4 Nov): grounding reduces
 * errors rather than ending them, so every note is read against the data it
 * was given and the conflicts stand beside it, never suppressed; Adam
 * decides. Four kinds of checkable claim: sequence ("their debut", "before
 * the full-length"), dates and date-ish phrasing ("early-2020s", a bare
 * year), the label, and personnel. Descriptive claims are neither true nor
 * false and are left alone.
 *
 * Heuristic by design: it names what it can read, and a conflict is a thing
 * for a person to look at, not a verdict. The records a note is most likely
 * wrong about are the ones a reader is least equipped to check, and this
 * does not care how well anyone knows the record.
 */
/*
  `unchecked` is the third outcome beside a conflict and silence: the data holds an earlier release
  whose format the endpoint does not give (it gives none for masters), so a full-length claim can
  be neither confirmed nor refuted against it. Named, since a claim the checker could not read is
  still one for a person to look at, and never suppressed into a pass.
*/
/*
  `track` (5 Nov): the fact-check pass on the 45 found two errors the checker missed, both in the
  tracklist the cache held for every release and the checker never read. A song the note presents
  as on this record that the tracklist does not hold is one; the other, an order among tracks
  referred to by description, is a class the checker cannot reach, and gets a pointer (below).
*/
export type Conflict = { kind: 'sequence' | 'date' | 'label' | 'personnel' | 'track' | 'unchecked'; claim: string; fact: string };

export type CheckSubject = { subject: SnippetSubject; year: number | null; facts: ReleaseFacts; discography: DiscographyEntry[] };

const sentencesOf = (note: string) => note.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s !== '');

/*
  An album is one the endpoint calls an LP or an Album. A blank format is unknown, not an album: the
  first grounded run counted a 2021 entry titled "... EP" with no format as the band's first album
  and flagged a true sentence. Where no entry carries a format at all, the first entry stands in.
*/
const isAlbum = (entry: DiscographyEntry) => /\b(LP|Album)\b/i.test(entry.format) && !/\bEP\b/i.test(entry.format);
const saysEp = (entry: DiscographyEntry) => /\b(EP|single)\b/i.test(entry.format) || /\b(EP|single)\b/i.test(entry.title);
/**
 * The artist's first album as the data can tell it: known where an entry's format says LP or
 * Album; otherwise the first entry whose title does not say EP or single, and then `known` is
 * false, since the releases endpoint gives no format for a master and the entry may be an EP.
 */
const firstAlbumOf = (discography: DiscographyEntry[]): { entry: DiscographyEntry; known: boolean } | undefined => {
  const known = discography.filter(isAlbum);
  if (known.length > 0) return { entry: known[0], known: true };
  const candidate = discography.find((d) => !saysEp(d));
  return candidate === undefined ? undefined : { entry: candidate, known: false };
};
/* Languages, nationalities and the like, capitalised in prose and never a person. */
const NOT_A_PERSON = /^(Norwegian|English|French|German|Swedish|Danish|Finnish|Scandinavian|American|British|Australian|Japanese|Brazilian|Spanish|Italian|Icelandic|Dutch|Irish|Scottish|Welsh|Canadian|European|Latin|Manchester|London|Brisbane|Oslo|Berlin|Leeds|Record Store|Whispered|Sung|Spoken|Side|Disc|Vinyl|Track|Album|Single)\b/;

export function checkNote(note: string, about: CheckSubject): Conflict[] {
  const conflicts: Conflict[] = [];
  const sentences = sentencesOf(note);
  const year = about.year ?? about.facts.year;
  const firstAlbum = firstAlbumOf(about.discography);
  const thisEntry = about.discography.find((d) => d.title.toLowerCase() === about.subject.title.toLowerCase());

  /* Sequence: a debut claim, or "before the full-length", on a record later than the artist's first album. */
  for (const s of sentences) {
    /*
      A debut claim about THIS record: "their debut", "Debut album", "the first full-length". Not a
      reference to the debut as another record ("if the debut was…", "after their debut", "since
      the first album"), which the grounded URGH note made truly and the first checker flagged.
    */
    const asserts = /(^|\b(is|was|remains|stands as|counts as|marks|makes)\s+)(their|the band’s|the band's|the duo’s|the duo's|a|the)?\s*(debut|first (album|record|LP|full-length))\b/i.test(s) || /^(their |the )?(debut|first (album|record|LP|full-length))\b/i.test(s);
    const refers = /\b(if|after|since|following|before|than|from|where|when|with|like|unlike)\s+(their|the band’s|the band's|the duo’s|the duo's|the|a)?\s*(debut|first (album|record|LP|full-length))\b/i.test(s) || /\b(debut|first (album|record|LP|full-length))\s+(was|had|were|came|did|arrived)\b/i.test(s);
    const debut = asserts && !refers && !/\b(EP|single)s?\b/i.test(s.slice(0, s.search(/\bdebut\b|\bfirst\b/i)));
    const beforeFull = /\bbefore the (full-length|debut|first album)\b/i.test(s);
    if ((debut || beforeFull) && firstAlbum !== undefined && year !== null) {
      const first = firstAlbum.entry;
      const thisIsFirst = thisEntry !== undefined ? thisEntry.year <= first.year && thisEntry.title === first.title : year <= first.year;
      if (thisIsFirst) continue;
      if (firstAlbum.known) conflicts.push({ kind: 'sequence', claim: s, fact: `the artist's first album in the data is ${first.title} (${first.year}); this record is ${year}` });
      else conflicts.push({ kind: 'unchecked', claim: s, fact: `the data holds an earlier release, ${first.title} (${first.year}), whose format the endpoint does not give; whether it is an album or an EP decides this claim` });
    }
  }

  /* Dates: a decade phrase the year falls outside, or a bare year the data does not hold. */
  const known = new Set<number>([...(year === null ? [] : [year]), ...(about.facts.year === null ? [] : [about.facts.year]), ...about.discography.map((d) => d.year)]);
  for (const s of sentences) {
    for (const m of s.matchAll(/\b(early|mid|late)?[- ]?(\d{3})0s\b/gi)) {
      if (year === null) continue;
      const decade = Number(m[2]) * 10;
      const part = (m[1] ?? '').toLowerCase();
      const lo = decade + (part === 'mid' ? 3 : part === 'late' ? 6 : 0);
      const hi = part === 'early' ? decade + 3 : part === 'mid' ? decade + 6 : decade + 9;
      if (year < lo || year > hi) conflicts.push({ kind: 'date', claim: m[0], fact: `this record is ${year}` });
    }
    for (const m of s.matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)) {
      const y = Number(m[1]);
      if (!known.has(y)) conflicts.push({ kind: 'date', claim: `${y} in "${s}"`, fact: `no year ${y} in the data (this record ${year ?? '?'}; the artist's releases ${[...known].sort().join(', ')})` });
    }
  }

  /* The label: a claim of who issued it that does not name the label in the data. */
  if (about.facts.label !== null) {
    const labelWords = about.facts.label.toLowerCase().replace(/\b(records|recordings|music|ltd\.?|inc\.?)\b/g, '').trim();
    for (const s of sentences) {
      /* The verb in either case, since "Issued on XL" opens a sentence; the label name capitalised, since a label is a name. */
      const m = s.match(/\b(?:[Ii]ssued|[Rr]eleased|[Pp]ut out|[Cc]ame out) (?:on|by|via|through) ([A-Z0-9][\w&'’.-]*(?: [A-Z0-9][\w&'’.-]*)*)/);
      if (m === null) continue;
      const named = m[1].toLowerCase();
      if (!(named.includes(labelWords) || labelWords.includes(named))) conflicts.push({ kind: 'label', claim: s, fact: `issued by ${about.facts.label}` });
    }
  }

  /*
    Personnel: a two-word proper name the credits, the artist, the title, the tracklist and the
    discography do not hold. Rule 1 of 5 Nov: five of the eight personnel flags on the 45 were
    titles near "by" or "with" (Big Yellow Taxi, Tuxedo Junction, Bad Girls on tracklists; Blow By
    Blow in the discography), read as a person because the tracks were never read. A band named
    as an influence (the Beach Boys) is held by no data and stays for a person to look at.
  */
  const held = [about.subject.artist, about.subject.title, ...about.facts.credits.map((c) => c.name), ...about.facts.companies.map((c) => c.name), ...about.facts.tracks.map((t) => t.title), ...about.discography.map((d) => d.title)].map((n) => n.toLowerCase().replace(/\s*\(\d+\)$/, ''));
  for (const m of note.matchAll(/\b([A-Z][a-z]+(?:[-'’][A-Z]?[a-z]+)?) ([A-Z][a-z]+(?:[-'’][A-Z]?[a-z]+)?)\b/g)) {
    const name = `${m[1]} ${m[2]}`;
    const lower = name.toLowerCase();
    if (held.some((h) => h.includes(lower) || lower.includes(h))) continue;
    if (/^(The|This|Away|Music|Debut|Issued|Recorded|Produced)\b/.test(name) || NOT_A_PERSON.test(name)) continue;
    /* A pair that opens a sentence is a sentence's first words in their capitals, not a name: "Whispered Norwegian and English" was read as a person. */
    const before = note.slice(0, m.index ?? 0);
    if (before === '' || /[.!?]\s*$/.test(before)) continue;
    if (!/\b(by|with|producer|produced|featuring|drums|guitar|bass|vocals|mixed|engineered|wrote|written)\b/i.test(note.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + name.length + 40))) continue;
    if (!conflicts.some((c) => c.kind === 'personnel' && c.claim === name)) conflicts.push({ kind: 'personnel', claim: name, fact: `not in the credits: ${about.facts.credits.map((c) => c.name).join(', ') || 'none in the data'}` });
  }

  /*
    Rule 2 (5 Nov): a song the note presents as on this record that the tracklist does not hold.
    The defect: 999's note said "Boys In The Gang, Trouble and Found Out Too Late carry it", and
    Found Out Too Late is the 1999 CD's bonus track, not on the 1980 LP. A sentence presents a
    phrase as a song when it talks of tracks, sides, the hit, what opens or closes, what carries
    it; a capitalised run of two or more words in such a sentence is read against the tracklist.
    Where no tracklist is cached the claim is unchecked, never a conflict: absent is not broken.
    Limit: a one-word title (Trouble) is not told from a word, so it is not read.
  */
  const tracks = about.facts.tracks;
  const norm = (s: string) => s.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  const titleHolds = (phrase: string) => {
    const p = norm(phrase);
    return p.length >= 4 && tracks.some((t) => norm(t.title).includes(p) || p.includes(norm(t.title)));
  };
  /*
    Held for a song claim: the artist, the title, the credits and the companies, and NOT the
    discography. The first build held the discography too, and 999's "Found Out Too Late" was
    the artist's 1979 single, so the one defect the rule was built for passed; a release of the
    artist's that is not on this record is the fact to say, not a reason to stay quiet. A person
    the personnel rule already flagged is read as a person, not as a song (Mick Jagger stood as
    both); a phrase after "a" or "an" is not a title; a sentence's opening words are not one.
  */
  const heldForSong = [about.subject.artist, about.subject.title, ...about.facts.credits.map((c) => c.name), ...about.facts.companies.map((c) => c.name)].map((n) => n.toLowerCase().replace(/\s*\(\d+\)$/, ''));
  const heldElsewhere = (phrase: string) => {
    const p = norm(phrase);
    return heldForSong.some((h) => h.includes(p) || p.includes(h)) || NOT_A_PERSON.test(phrase) || /^(The|This|Side|Record Store|Greatest Hits|Not|What|Where|Here|Play|Put|Ten|Two|Three|Four|Five|Six|Seven|Eight|Nine|Twelve|Thirty)\b/.test(phrase) || conflicts.some((c) => c.kind === 'personnel' && c.claim === phrase);
  };
  const inDiscography = (phrase: string) => about.discography.find((d) => norm(d.title) === norm(phrase) || norm(d.title).includes(norm(phrase)));
  /* "the closer", not "closer": "closer to rock'n'roll than to sloganeering" read as song context and put a singer on the tracklist. */
  const SONG_CONTEXT = /\b(tracks?|songs?|singles?|cuts?|side (one|two|three|four|a|b)|opens|closes|the closer|the opener|carry it|carries it|the hit|title track|runs from|[ab]-side)\b/i;
  const RUN = /\b[A-Z][\w'’!?-]*(?: (?:[A-Z][\w'’!?-]*|of|the|a|an|in|to|on|at|for|my|your))+/g;
  for (const s of sentences) {
    if (!SONG_CONTEXT.test(s)) continue;
    const runs = [...s.matchAll(RUN)]
      .filter((m) => !/\b(a|an) $/i.test(s.slice(0, m.index ?? 0)))
      .map((m) => m[0].replace(/(?: (?:of|the|a|an|in|to|on|at|for|my|your))+$/, ''))
      .filter((r) => r.includes(' ') && !heldElsewhere(r));
    if (tracks.length === 0) {
      if (runs.length > 0) conflicts.push({ kind: 'unchecked', claim: s, fact: `no tracklist is cached for this release, so whether ${runs.join(', ')} ${runs.length === 1 ? 'is one of its songs' : 'are its songs'} cannot be read` });
      continue;
    }
    for (const run of runs) {
      if (titleHolds(run)) continue;
      const elsewhere = inDiscography(run);
      if (!conflicts.some((c) => c.kind === 'track' && c.claim === run)) conflicts.push({ kind: 'track', claim: run, fact: `not on this release’s tracklist${elsewhere === undefined ? '' : `; it is the artist’s ${elsewhere.year} release ${elsewhere.title}`}: ${tracks.map((t) => `${t.position} ${t.title}`.trim()).join(', ')}` });
    }
  }

  /*
    A POINTER, NOT A CHECK (the coordinator, 5 Nov). The Doors' note ran side one "from the hit's
    long solo trade to a Brecht-Weill cabaret turn", and Alabama Song is A5 with Light My Fire at
    A6 closing the side: a real error, in a sentence that refers to tracks by description and not
    by title, which no check can reach without reading the note the way a person does. A rule 3
    that read the named form of such claims was built and dropped the same day: across the 45 it
    met one position claim by a named title (true) and invented one finding from "opens it out", a
    phrasal verb, which reached Adam as a correction. A rule with one instance and no defect is
    not a rule. What stays is this: a sentence that runs a side from one thing to another is named
    `unchecked`, with the tracklist beside it and no verdict, so a reader's eye goes to it. It
    makes no claim, so it needs no motivating defect and has no entry in ASSERTIONS-spec. Do not
    let it grow a verdict.
  */
  if (tracks.length > 0) {
    for (const s of sentences) {
      if (/\bside (?:one|two|three|four|a|b|c|d)\b[^.;]*?\bruns from\b/i.test(s)) {
        conflicts.push({ kind: 'unchecked', claim: s, fact: `a pointer, not a check: this runs a side from one thing to another; read it against the tracklist: ${tracks.map((t) => `${t.position} ${t.title}`.trim()).join(', ')}` });
      }
    }
  }

  return conflicts;
}
