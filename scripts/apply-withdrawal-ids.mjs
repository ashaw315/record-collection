import fs from 'node:fs';
import { sections, stripTags, collapse } from './design-target-parser.mjs';

const slug = (w) => w.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const L = 'docs/design/Record Detail 8a - build target.dc.html';
const S = 'docs/design/Record Detail 8a - settled 1-10.dc.html';
const list = JSON.parse(/<!--\s*reader-note-withdrawals\s*(\[[\s\S]*?\])\s*-->/.exec(fs.readFileSync(L, 'utf8'))[1]);

// The only (s, by) collision: §26's two self-withdrawals. Matched on content.
const FRAGMENT = {
  '0-78-scale': 'blaming the disc',
  'first-wording-of-placement-named-solo-and-pair': 'The first wording of this ruling',
};

const applied = [], unmatched = [];
for (const [file, tag] of [[L, 'L'], [S, 'S']]) {
  let src = fs.readFileSync(file, 'utf8');
  for (const sec of sections(src, tag)) {
    const hits = [...sec.html.matchAll(/<span data-withdrawn-by="([^"]+)">([\s\S]*?)<\/span>/g)];
    for (const h of hits) {
      const by = h[1];
      const text = collapse(stripTags(h[2]));
      const cands = list.filter(([s, b]) => s === sec.id && b === by);
      let entry = null;
      if (cands.length === 1) entry = cands[0];
      else {
        const ms = cands.filter((c) => {
          const f = FRAGMENT[slug(c[2])];
          return f !== undefined && text.includes(f);
        });
        if (ms.length === 1) entry = ms[0];
      }
      if (entry === null) { unmatched.push(`S${sec.id}<-S${by}: ${text.slice(0, 70)}`); continue; }
      const id = slug(entry[2]);
      const whole = h[0];
      if (src.split(whole).length - 1 !== 1) { unmatched.push(`S${sec.id}<-S${by}: not unique`); continue; }
      src = src.replace(whole, whole.replace(`<span data-withdrawn-by="${by}">`, `<span data-withdrawn-by="${by}" data-withdrawal="${id}">`));
      applied.push(`S${sec.id} <- S${by}  ${id}`);
    }
  }
  fs.writeFileSync(file, src);
}
console.log(`APPLIED ${applied.length}:`);
applied.forEach((a) => console.log('  ' + a));
console.log(`UNMATCHED ${unmatched.length}:`);
unmatched.forEach((u) => console.log('  ' + u));
