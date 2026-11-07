#!/usr/bin/env node
/**
 * **The twice sweep's hits against the shared quantities (the coordinator,
 * 7 Nov).** The sweep (`scripts/sweep-twice.mjs`) found 198 read sites that
 * recur in a test with an action between; too many to triage, so the list of
 * quantities another worker's write can move came first and was confirmed at
 * seven, and this intersects mechanically:
 *
 *   1 the wall's layout under §W.12 (`wallLayout`, `shelfRecords`)
 *   2 the collection's count (`countAllRecords`)
 *   3 the untagged count and the mood pick's pool (`untaggedCount`)
 *   4 facets and stats (`recordFacets`, static by §5.2; `recordStats`, `genreRollup`)
 *   5 `listRecords` under any filter, `q` included: its order and its total
 *   6 the Manage lists and the want list (`list*`)
 *   7 the ownership check (`matchOwnership`, `matchOwnershipForResults`)
 *
 *     node scripts/twice-intersect.mjs docs/measurements/twice/<log>.jsonl
 *
 * A site is in when the page its read ran on renders one of these from rows
 * the test does not own, and the read measures something it can move. The
 * route is the last `Navigate to` before the read's first occurrence, so a
 * client-side navigation (the rail's search submit, a link click) is not
 * seen: the printed caveat says so. The output is candidates, each still to
 * be read for its claim; the rules are the ones below and nothing else.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { evaluateWriteSites, hitsOf } from './sweep-twice.mjs';

export const QUANTITIES = {
  1: 'the wall’s layout (§W.12)',
  2: 'the collection’s count',
  3: 'the untagged count, the mood pool',
  4: 'facets and stats',
  5: 'listRecords under a filter: order and total',
  6: 'the Manage lists and the want list',
  7: 'the ownership check',
};

/* A read that measures: geometry, scroll, a count or a list's length, text, or an instrument the page writes. Not a font load, a focus, a style. */
const MEASURES = /getBoundingClientRect|\bscroll(?:Width|Height|Left|Top|X|Y)\b|\boffset(?:Width|Height|Top|Left)\b|\bclient(?:Width|Height)\b|boundingBox|\.count\(\)|querySelectorAll\([^)]*\)\.length|textContent|innerText|allTextContents|\$\$eval|\bwindow\b[^;]*__\w+|__(?:frames|scrolls|landing\w*|q48\w*)\b/;
const GEOMETRY = /getBoundingClientRect|\bscroll(?:Width|Height|Left|Top|X|Y)\b|\boffset(?:Width|Height|Top|Left)\b|\bclient(?:Width|Height)\b|boundingBox|\.count\(\)|querySelectorAll\([^)]*\)\.length|\$\$eval|__(?:frames|scrolls|landing\w*|q48\w*)\b/;
const MEASURING_KINDS = /^(?:Query count|Count|Bounding box|Screenshot|Text content|Inner text|All text contents|All inner texts)$/;

const MARKERS = [
  { q: 2, on: ['wall', 'collection'], re: /data-count|record-count|wall-count|collection-count|\d+ records/ },
  { q: 3, on: ['wall', 'collection'], re: /mood|untagged/i },
  { q: 4, on: ['wall', 'collection'], re: /data-filter|rail-genre|facet|\boption\b/ },
  { q: 7, on: ['lookup'], re: /card|badge|owned|ownership/i },
];

function domainOf(route) {
  const [path, query = ''] = route.split('?');
  const params = new URLSearchParams(query);
  const view = params.get('view');
  const scoped = params.has('artistId');
  if (path === '/') return { domain: view === 'table' || view === 'grid' ? 'collection' : 'wall', scoped };
  if (path === '/stats') return { domain: 'stats', scoped };
  if (path === '/manage' || path === '/want-list') return { domain: 'manage', scoped };
  if (path === '/lookup') return { domain: 'lookup', scoped };
  return { domain: null, scoped };
}

/** The shared quantities a read can see: its page's, where the read measures something they move. */
export function quantitiesOf({ route, title, body }) {
  const { domain, scoped } = domainOf(route);
  if (domain === null) return [];
  if (!MEASURING_KINDS.test(title) && !MEASURES.test(body)) return [];
  const found = new Set();
  let marked = false;
  for (const m of MARKERS) if (m.on.includes(domain) && m.re.test(body)) { found.add(m.q); marked = true; }
  /* The page's own quantity: whenever no marker named another, and beside a marker when the read is geometry, since a filter's box sits in the layout the rows push. */
  if (!marked || GEOMETRY.test(body) || MEASURING_KINDS.test(title)) {
    if (domain === 'wall') found.add(1);
    if (domain === 'collection' && !scoped) found.add(5);
    if (domain === 'stats' && !scoped) found.add(4);
    if (domain === 'manage') found.add(6);
  }
  return [...found].sort((a, b) => a - b);
}

/* The bracket-matched text from an opening bracket at `from`. */
function balanced(src, from) {
  let depth = 0;
  for (let j = from; j < src.length; j += 1) {
    const c = src[j];
    if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') { depth -= 1; if (depth === 0) return src.slice(from, j + 1); }
  }
  return src.slice(from);
}

/** The read's text at a line: an evaluate's argument bracket-matched, a bare identifier followed to its const, or the line itself. */
export function bodyAt(src, line) {
  const lines = src.split('\n');
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  const text = lines[line - 1] ?? '';
  const m = text.match(/(?:\.evaluate(?:All|Handle)?|\$\$eval|\$eval)\s*\(/);
  if (m === null || m.index === undefined) return text;
  const open = start + m.index + m[0].length - 1;
  const inner = balanced(src, open).slice(1, -1).trim();
  /* A $$eval is a list read whatever its callback does, so it keeps its name; the argument alone lost it. */
  const arg = m[0].startsWith('$$eval') ? `$$eval(${inner}` : inner;
  const ident = inner.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
  /* A reader wrapped in a function gets its selector, its argument or its locator from the callers: read them too. Only markers can come from there, so it can widen a site's quantities and never narrow them. */
  if (ident === null) return `${arg}\n${callersOf(lines, line)}`;
  const decl = src.search(new RegExp(`(?:const|let|function)\\s+${ident[1]}\\b`));
  if (decl === -1) return arg;
  return statementFrom(src, decl);
}

/* The lines calling the reader that wraps this evaluate (the nearest `const NAME =` or `function NAME` within three lines above), where its argument is written. */
function callersOf(lines, line) {
  for (let i = line - 1; i >= Math.max(0, line - 4); i -= 1) {
    const m = (lines[i] ?? '').match(/(?:const|let|function)\s+([A-Za-z_$][\w$]*)/);
    if (m === null) continue;
    const call = new RegExp(`\\b${m[1]}\\(`);
    return lines.filter((l, j) => j !== i && call.test(l)).join('\n');
  }
  return '';
}

/* The declaration's whole statement: to its `;` or a blank line at bracket depth 0, since an arrow's first bracket is its parameters. */
function statementFrom(src, from) {
  let depth = 0;
  for (let j = from; j < src.length; j += 1) {
    const c = src[j];
    if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') depth -= 1;
    else if (depth === 0 && (c === ';' || (c === '\n' && src[j + 1] === '\n'))) return src.slice(from, j + 1);
  }
  return src.slice(from);
}

/** The report: the distribution first, BROKEN READER when it cannot mean anything, then each quantity's sites. */
export function intersectReport(sites) {
  const byQ = {};
  for (const s of sites) for (const q of s.quantities) byQ[q] = (byQ[q] ?? 0) + 1;
  const inside = sites.filter((s) => s.quantities.length > 0);
  const buckets = new Set(sites.map((s) => s.quantities.join(',')));
  const broken = sites.length === 0 || inside.length === 0 || buckets.size === 1;
  const lines = [];
  if (broken) lines.push(`BROKEN READER: ${inside.length} of ${sites.length} sites in any quantity, ${buckets.size} distinct bucket(s); no intersection from this run means anything`);
  lines.push(`in the intersection: ${inside.length} of ${sites.length} sites; outside: ${sites.length - inside.length}`);
  lines.push(`by quantity (a site reading several quantities counts under each, so these do not sum to the site total): ${JSON.stringify(byQ)}`);
  lines.push('caveat: the route is the last goto before the read, so a client-side navigation (the rail’s search, a link) is not seen; the sites are candidates, each still to be read for its claim');
  for (const q of Object.keys(QUANTITIES)) {
    const here = inside.filter((s) => s.quantities.includes(Number(q)));
    lines.push('', `${q} ${QUANTITIES[q]}: ${here.length}`);
    for (const s of here) lines.push(`  ${s.site.padEnd(40)} ${s.title.padEnd(14)} ${s.routes.join(' ')}`);
  }
  return { broken, lines };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const writes = evaluateWriteSites();
  const sites = new Map();
  const sources = new Map();
  const source = (f) => { if (!sources.has(f)) sources.set(f, readFileSync(f, 'utf8')); return sources.get(f); };
  for (const r of rows) {
    if (!Array.isArray(r.steps)) continue;
    for (const h of hitsOf(r.steps, writes)) {
      const at = r.steps.findIndex((s) => `${s.file}:${s.line}` === h.site);
      const nav = r.steps.slice(0, at).reverse().find((s) => /^Navigate to/.test(s.title));
      const route = (nav === undefined ? '(none)' : nav.title.replace(/^Navigate to "/, '').replace(/"$/, '')).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, 'ID');
      const s = sites.get(h.site) ?? { site: h.site, title: h.title, routes: [], quantities: [] };
      if (!s.routes.includes(route)) s.routes.push(route);
      const [file, line] = h.site.split(':');
      const body = bodyAt(source(file), Number(line));
      s.quantities = [...new Set([...s.quantities, ...quantitiesOf({ route, title: h.title, body })])].sort((a, b) => a - b);
      sites.set(h.site, s);
    }
  }
  const { broken, lines } = intersectReport([...sites.values()]);
  process.stdout.write(`${lines.join('\n')}\n`);
  if (broken) process.exitCode = 1;
}
