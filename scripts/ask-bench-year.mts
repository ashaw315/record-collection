/*
  What a release year beside each record's text would add to the pick's request, read from the API's own count
  (the coordinator, 21 Nov, before Design rules on the shape; nothing built). Two calls on production's pool: the request
  as the build sends it, then the same request with each record line carrying its release year, rewritten on its way
  out; the response's usage.input_tokens and the call's milliseconds for each. Writes nothing.

    node --env-file=.env.local --conditions=react-server --import tsx scripts/ask-bench-year.mts "something from the eighties"
*/
import { sql } from 'drizzle-orm';
import { askPick } from '@/lib/ask/pick';
import { getDb } from '@/db/client';
import { matchedTextsFor } from '@/lib/db/queries/ask';
import { collectionTitles } from '@/lib/db/queries/matched-text';
const [phrase] = process.argv.slice(2);
if (phrase === undefined) throw new Error('ask-bench-year: give the phrase');
const records = await collectionTitles();
const described = await matchedTextsFor(records.map((r) => r.id));
const titles = new Map(records.map((r) => [r.id, `${r.artist} — ${r.title}`]));
const years = new Map((await getDb().execute<{ id: string; year: number | null }>(sql`SELECT id, release_year AS year FROM records`)).rows.map((r) => [r.id, r.year]));

async function once(withYear: boolean) {
  let usage: { input_tokens?: number; output_tokens?: number } | undefined;
  let ms = 0;
  let rewritten = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { input: Array<{ role: string; content: string }> };
    if (withYear) {
      const user = body.input.find((m) => m.role === 'user');
      if (user === undefined) throw new Error('no user message');
      user.content = user.content.replace(/^\[([0-9a-f-]{36})\] /gm, (whole, id: string) => {
        const year = years.get(id);
        if (year === undefined || year === null) return whole;
        rewritten += 1;
        return `[${id}] (released ${year}) `;
      });
    }
    const started = performance.now();
    const response = await fetch(input, { ...init, body: JSON.stringify(body) });
    ms = Math.round(performance.now() - started);
    usage = ((await response.clone().json().catch(() => null)) as { usage?: typeof usage } | null)?.usage;
    return response;
  };
  const result = await askPick(phrase, described, [], { fetchImpl });
  console.log(`${withYear ? 'with the year' : 'as built     '}: input ${usage?.input_tokens ?? '?'} tokens, output ${usage?.output_tokens ?? '?'}, ${ms}ms${withYear ? `, ${rewritten} of ${described.length} lines carried a year` : ''}; ${result.ok ? `${result.verdict}: ${result.picks.map((p) => titles.get(p.id) ?? p.id).join('; ')}` : `failed: ${result.reason}`}`);
  if (result.ok) for (const p of result.picks) console.log(`    ${p.reason}`);
}
await once(false);
await once(true);
process.exit(0);
