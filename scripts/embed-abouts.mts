/**
 * **Q22's embedding run: one vector per record's ABOUT, re-embedding only what changed (the coordinator, 11 Nov).**
 *
 *   npm run abouts:embed                      # every record with an ABOUT whose vector is missing or stale
 *   npm run abouts:embed -- --record <id>     # one record, for a regenerated note (Q47's three cost three calls)
 *   npm run abouts:embed -- --dry-run         # the plan, no call, no write
 *
 * The key is OPENAI_API_KEY in the shell that runs this; it is never asked for. Absent, the run refuses by name before
 * any call. The query at request time reads the same variable from Vercel's project environment, a second place to
 * set it, and missing that one fails only in production. Each ABOUT is embedded with text-embedding-3-small and stored
 * with the hash of its text, so a run after nothing changed makes no call. Writes record_embeddings only.
 */
import { aboutsWithStoredHash, storeEmbedding } from '@/lib/db/queries/embeddings';
import { planEmbedding } from '@/lib/embeddings/plan';
import { EMBEDDING_MODEL, embedTexts, requireOpenAiKey } from '@/lib/openai/embeddings';

const args = process.argv.slice(2);
const only = args.includes('--record') ? args[args.indexOf('--record') + 1] : undefined;
const dryRun = args.includes('--dry-run');
if (args.includes('--record') && (only === undefined || only.startsWith('--'))) throw new Error('--record needs a record id');

if (!dryRun) requireOpenAiKey();

const rows = await aboutsWithStoredHash();
const plan = planEmbedding(rows, only);
console.log(`${rows.length} record${rows.length === 1 ? '' : 's'} with an ABOUT; ${plan.toEmbed.length} to embed, ${plan.skipped} current${only === undefined ? '' : ` (only ${only})`}`);
if (dryRun || plan.toEmbed.length === 0) process.exit(0);

/* One request per batch of 32: the collection is 55, so one or two requests; the batch bounds a request's size, not the run's. */
const BATCH = 32;
let done = 0;
for (let i = 0; i < plan.toEmbed.length; i += BATCH) {
  const batch = plan.toEmbed.slice(i, i + BATCH);
  const vectors = await embedTexts(batch.map((row) => row.about));
  for (const [j, row] of batch.entries()) {
    await storeEmbedding({ recordId: row.recordId, hash: row.hash, model: EMBEDDING_MODEL, vector: vectors[j] });
    done += 1;
  }
}
console.log(`embedded ${done} with ${EMBEDDING_MODEL}`);
