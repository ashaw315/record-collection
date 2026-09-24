#!/usr/bin/env node
/**
 * Index assertions — implemented from `docs/design/ASSERTIONS-spec.md`.
 *
 * **The script's exit code is the result.** A report written by whoever
 * edited the index is not. Run it in CI and before any handoff is exported.
 *
 * Built from the spec rather than from the handoff or from the repo's own
 * earlier index test: the spec records, for six of the eight assertions, the
 * defect that motivated it and the weaker version that passed on it. Those
 * notes are the reason each check has the shape it has, and are reproduced
 * at the assertions they belong to.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGN = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'design');
const FILES = {
  H: 'HANDOFF-wall-and-pull.md',
  L: 'Record Detail 8a - build target.dc.html',
  S: 'Record Detail 8a - settled 1-10.dc.html',
  W: 'Wall and Pull - build target.dc.html',
};

/** Spec: decode these two entities before any text comparison. */
const decode = (s) => s.replace(/&rsquo;/g, '’').replace(/&amp;/g, '&');

const read = (key) => {
  const path = join(DESIGN, FILES[key]);
  if (!existsSync(path)) {
    console.error(`missing input ${key}: ${FILES[key]}`);
    process.exit(2);
  }
  return decode(readFileSync(path, 'utf8'));
};

const src = { H: read('H'), L: read('L'), S: read('S'), W: read('W') };

const stripTags = (s) => s.replace(/<[^>]+>/g, ' ');
const collapse = (s) => s.replace(/\s+/g, ' ').trim();
/** Spec: never match headings inside <svg> — SVG text holds cell labels like "1 · Cover". */
const withoutSvg = (s) => s.replace(/<svg[\s\S]*?<\/svg>/g, ' ');

const ID = String.raw`(?:W|W\.\d+(?:\.\d+)?|\d{1,2}(?:\.\d+)?)`;
const HEADING = new RegExp(
  String.raw`<p[^>]*style="[^"]*text-transform:uppercase[^"]*"[^>]*>\s*(?:§)?(${ID}) · ([^<]*)`,
  'g',
);

/** Headings of one target file, in order, with their text spans. */
function headings(key) {
  const raw = withoutSvg(src[key]);
  const found = [];
  for (const m of raw.matchAll(HEADING)) {
    const id = key === 'W' && /^\d/.test(m[1]) ? `W.${m[1]}` : m[1];
    found.push({ id, title: collapse(m[2]), at: m.index, end: m.index + m[0].length, raw });
  }
  return found.map((h, i) => ({
    ...h,
    /** Spec: from a heading to the next heading in the same file. */
    html: raw.slice(h.at, i + 1 < found.length ? found[i + 1].at : undefined),
  }));
}

const ALL = [...headings('L'), ...headings('S'), ...headings('W')];
const byId = new Map(ALL.map((h) => [h.id, h]));

/**
 * Spec: live text is the section text with every `[data-withdrawn-by]`
 * element removed. There is no keyword list — withdrawn text is DECLARED.
 */
const liveText = (html) => collapse(stripTags(html.replace(/<span[^>]*data-withdrawn-by=[^>]*>[\s\S]*?<\/span>/g, ' ')));
const sectionText = (html) => collapse(stripTags(html));

/* ---- tables in H ---------------------------------------------------- */
const between = (text, from, to) => {
  const a = text.indexOf(from);
  if (a < 0) return '';
  const b = to === null ? text.length : text.indexOf(to, a);
  return text.slice(a, b < 0 ? undefined : b);
};

const rowsIn = (block) =>
  block
    .split('\n')
    .filter((line) => line.startsWith('| §'))
    .map((line) => {
      const cols = line.split('|').map((c) => c.trim());
      const id = cols[1].replace(/^§/, '').split(/\s/)[0];
      return { id, title: cols[2] ?? '', pointer: cols.slice(3).join('|'), line };
    });

const governs = rowsIn(between(src.H, '## What each subsection governs', '## Structural sections'));
const pointers = rowsIn(between(src.H, '## Structural sections', '## Build order'));
const allRows = [...governs, ...pointers];

const orderBlock = between(src.H, '## Build order', '## Maintaining');

/* ---- assertions ------------------------------------------------------ */
const CANDIDATES = process.argv.includes('--candidates');
const failures = [];
const fail = (line) => failures.push(line);
/** Offenders from 6, 7 and 8a while the marking pass is outstanding: printed, not fatal. */
const provisional = [];
const failProvisional = (line) => (CANDIDATES ? provisional : failures).push(line);
/**
 * Spec: "Until then, 6, 7 and 8a print `PROVISIONAL` instead of `PASS`."
 *
 * Provisional means the marking pass has not landed, so these three cannot
 * be judged either way — they print PROVISIONAL whether or not they found
 * offenders, and their offenders do not fail the run. Everything else fails
 * normally, which is why 8b's two real violations still exit non-zero.
 */
const report = (n, ok, provisional = false) =>
  console.log(`${provisional ? 'PROVISIONAL' : ok ? 'PASS' : 'FAIL'} ${n}`);

/* 1. Every heading has exactly one row. */
{
  const before = failures.length;
  const counts = new Map();
  for (const r of allRows) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  for (const h of ALL) {
    const k = counts.get(h.id) ?? 0;
    if (k !== 1) fail(`1 §${h.id} rows=${k}`);
  }
  for (const r of allRows) if (!byId.has(r.id)) fail(`1 §${r.id} no-heading`);
  report(1, failures.length === before);
}

/* 2. Every governs row is in the build order. */
{
  const before = failures.length;
  for (const r of governs) {
    const re = new RegExp(`§${r.id.replace('.', '\\.')}(?![\\d.])`);
    if (!re.test(orderBlock)) fail(`2 §${r.id} not-in-order`);
  }
  report(2, failures.length === before);
}

/* 3. Steps are contiguous, and none follows the closing paragraph. */
{
  const before = failures.length;
  const lines = orderBlock.split('\n');
  const steps = [];
  lines.forEach((line, i) => {
    const m = /^(\d+)\. /.exec(line);
    if (m !== null) steps.push({ n: Number(m[1]), i });
  });
  steps.forEach((s, k) => {
    if (s.n !== k) fail(`3 gap-at ${s.n}`);
  });
  const closeAt = lines.findIndex((l) => l.includes('Every row in the table above'));
  if (closeAt >= 0) for (const s of steps) if (s.i > closeAt) fail(`3 step-after-close ${s.n}`);
  report(3, failures.length === before);
}

/* 4. Cross-file references resolve. */
{
  const before = failures.length;
  const has = (id) => byId.has(id);
  /* Spec: exclude the renumbering note at the head of W, which names §11 as the old number. */
  const bodyOf = (key) => {
    const text = collapse(stripTags(withoutSvg(src[key])));
    if (key !== 'W') return text;
    const note = text.indexOf('Renumbering');
    return note < 0 ? text : text.slice(0, note) + text.slice(text.indexOf('. ', note + 200) + 1);
  };
  for (const key of ['L', 'S']) {
    for (const m of bodyOf(key).matchAll(/§(W\.\d+(?:\.\d+)?)/g)) {
      if (!has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  for (const key of ['L', 'W']) {
    for (const m of bodyOf(key).matchAll(/§(\d{1,2}(?:\.\d+)?)/g)) {
      const n = Number(m[1].split('.')[0]);
      if (n >= 1 && n <= 10 && !has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  for (const key of ['S', 'W']) {
    for (const m of bodyOf(key).matchAll(/§(\d{1,2}(?:\.\d+)?)/g)) {
      const n = Number(m[1].split('.')[0]);
      if (n >= 12 && n <= 32 && !has(m[1])) fail(`4 ${key}→§${m[1]}`);
    }
  }
  report(4, failures.length === before);
}

/* 5. Each row's subject matches its section. */
{
  const before = failures.length;
  const norm = (s) => collapse(s.replace(/’/g, "'").toLowerCase());
  for (const r of allRows) {
    const h = byId.get(r.id);
    if (h === undefined) continue;
    const subject = norm(r.title.split(/[(:;,—]/)[0]).slice(0, 24);
    if (subject === '') continue;
    const hay = norm(`${h.title} ${sectionText(h.html).slice(0, 600)}`);
    if (!hay.includes(subject)) fail(`5 §${r.id} title="${subject}" heading="${norm(h.title).slice(0, 40)}"`);
  }
  report(5, failures.length === before);
}

/* The declared withdrawal marks, and the reader's note's list. */
const WITHDRAWN_IN = (html) => [...html.matchAll(/data-withdrawn-by="([^"]+)"/g)].map((m) => m[1]);
const listMatch = /<!--\s*reader-note-withdrawals\s*(\[[\s\S]*?\])\s*-->/.exec(src.L);
const withdrawals = listMatch === null ? [] : JSON.parse(listMatch[1]);

/* 6. Every listed withdrawal is marked where it happened. */
{
  const before = failures.length;
  for (const [s, by] of withdrawals) {
    const h = byId.get(s);
    if (h === undefined || !WITHDRAWN_IN(h.html).includes(by)) failProvisional(`6 §${s}/§${by}`);
  }
  report(6, failures.length === before && provisional.length === 0, CANDIDATES);
}

/* 7. Every marked withdrawal is listed. */
{
  const before = failures.length;
  for (const h of ALL) {
    if (h.id.startsWith('W')) continue;
    for (const by of new Set(WITHDRAWN_IN(h.html))) {
      if (!withdrawals.some(([s, b]) => s === h.id && b === by)) failProvisional(`7 §${h.id}`);
    }
  }
  report(7, failures.length === before, CANDIDATES);
}

/* 8. Figures in rows. */
{
  const beforeA = failures.length;
  /* Spec: strip section refs, step refs, artefact names — but never units. */
  const strip = (s) =>
    s
      .replace(/§W\.\d+(\.\d+)?/g, ' ')
      .replace(/§W\b/g, ' ')
      .replace(/§\d+(\.\d+)?/g, ' ')
      .replace(/steps? \d+/gi, ' ')
      .replace(/\b[A-Z]\d+[a-z]?\b/g, ' ')
      .replace(/\b\d{1,2}[a-z]\b/g, ' ');
  const FIGURE = /\d+(?:\.\d+)?%?(?:\s?[×x]\s?\d+(?:\.\d+)?)?/g;

  for (const r of governs) {
    const h = byId.get(r.id);
    if (h === undefined) continue;
    const hay = liveText(h.html).replace(/\s+/g, '');
    const missing = [...strip(`${r.title}|${r.pointer}`).matchAll(FIGURE)]
      .map((m) => m[0].replace(/\s+/g, ''))
      .filter((n) => !hay.includes(n));
    if (missing.length > 0) failProvisional(`8a §${r.id} missing=${[...new Set(missing)].join(',')}`);
  }
  report('8a', failures.length === beforeA, CANDIDATES);

  const beforeB = failures.length;
  /* Spec: the governs table ONLY — the pointer table has no pointer column. */
  const ALLOW = new Set(['23', 'W.37']);
  for (const r of governs) {
    const stripped = strip(r.pointer);
    if (collapse(stripped) === '') {
      fail(`8b empty-column §${r.id}`);
      continue;
    }
    if (ALLOW.has(r.id)) continue;
    const tokens = stripped.match(/\d/g);
    if (tokens !== null) fail(`8b §${r.id} tokens=${collapse(stripped).slice(0, 60)}`);
  }
  report('8b', failures.length === beforeB);
}

/* Bootstrap: print unmarked candidate sentences for the author to mark. */
if (CANDIDATES) {
  const PATTERN =
    /withdrawn|withdraw|replaces|replaced|reversed|reverses|superseded|supersedes|earlier version|first (gave|said|version)|was wrong|original sentence|until now|instead of|no longer/i;
  console.log('\n--candidates: unmarked sentences matching the broad pattern\n');
  let n = 0;
  for (const [key, list] of [['L', headings('L')], ['S', headings('S')], ['W', headings('W')]]) {
    for (const h of list) {
      const live = liveText(h.html);
      for (const sentence of live.split(/(?<=[.!?])\s+/)) {
        if (PATTERN.test(sentence)) {
          n += 1;
          console.log(`${key} §${h.id}: ${sentence.trim().slice(0, 200)}`);
        }
      }
    }
  }
  console.log(`\n${n} candidate sentences.`);
}

for (const line of provisional) console.log(line);
for (const line of failures) console.log(line);
process.exit(failures.length > 0 ? 1 : 0);
