#!/usr/bin/env node
/**
 * **Q70, a one-time report (the coordinator, 11 Nov): every marker sentence whose quote names more than one target.**
 *
 *     node scripts/markers-naming-several.mjs            # prints the list; exits 0 whatever it finds
 *
 * Three dispersed-marker defects in two days (§26's disc host, §26's nine-section sentence, §W.22's pan-first pair)
 * shared one signature: one entry covered several dead sentences, only the last carried the marker, and the marker's
 * quote joined several clauses with commas and "and" after the colon. Counting cannot find them, since one entry gives
 * one marker and the count stays consistent. This lists, across the four cards, each marker whose quote (the sentence
 * after its colon) holds a comma and an "and", or two of either, so Design can judge which of those cover sentences
 * without a marker of their own. Report only, never refusing; not an instrument to keep, since the one-ruling-per-
 * sentence rule stops new ones.
 */
import { readFileSync } from 'node:fs';
import { markersIn } from './marker-grammar.mjs';
import { plainText } from './check-design-card.mjs';

const CARDS = [
  'docs/design/Record Detail 8a - build target.dc.html',
  'docs/design/Wall and Pull - build target.dc.html',
  'docs/design/Table and Grid - build target.dc.html',
  'docs/design/Mood Pick - build target.dc.html',
];
const STOP = /[.!?](?=[”’")\]]*(?:\s|$))/;

let total = 0;
let flagged = 0;
for (const card of CARDS) {
  const text = plainText(readFileSync(card, 'utf8')).replace(/\s+/g, ' ');
  const markers = markersIn(text);
  total += markers.length;
  const hits = [];
  for (const m of markers) {
    const after = text.slice(m.start + m.opener.length);
    const stop = after.search(STOP);
    const quote = (stop === -1 ? after : after.slice(0, stop + 1)).trim();
    /*
      The targets are the quote's own clause: what comes before an explaining clause (", which …", ", because …",
      ", so …", "; …", ", as …", ", not …", ", with …", ", for …", ", where …", ", since …", ", whose …") is what the
      marker names, and the three known cases are a coordinated list there: "A, B and C" or "A, B, and C". So the
      reading is a comma and an "and" after it in that span, or two "and"s there.
    */
    const named = quote.split(/;|,\s*(?:which|because|so|as|not|with|for|where|since|whose|while|when|if|and so)\b/)[0];
    const commas = (named.match(/,/g) ?? []).length;
    const ands = (named.match(/\band\b/g) ?? []).length;
    const listed = commas >= 1 && /,[^,]*\band\b/.test(named);
    /* Three or more targets (two commas, or two "and"s) are the shape of the three known cases; two ("A, and B") are listed after them. */
    if (listed || ands >= 2) hits.push({ opener: m.opener, quote, commas, ands, several: commas >= 2 || ands >= 2 });
  }
  flagged += hits.length;
  const three = hits.filter((h) => h.several);
  const two = hits.filter((h) => !h.several);
  console.log(`\n## ${card.replace('docs/design/', '').replace(' - build target.dc.html', '')}: ${hits.length} of ${markers.length} markers; ${three.length} name three or more, ${two.length} name two`);
  console.log('\nThree or more:');
  for (const h of three) console.log(`- (${h.commas} comma${h.commas === 1 ? '' : 's'}, ${h.ands} and) ${h.opener} ${h.quote}`);
  console.log('\nTwo:');
  for (const h of two) console.log(`- ${h.opener} ${h.quote}`);
}
console.log(`\n${flagged} of ${total} markers across the four cards name more than one target by this reading; Design judges which cover sentences without a marker of their own.`);
