import 'server-only';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { gapAnalysisResults } from '@/db/schema';
import type { Suggestion } from '@/lib/llm/parse-suggestions';

/**
 * SPEC.md §9.2 (A39) — the last gap analysis, for display.
 *
 * **A record of what was said, not a cache.** Nothing here is ever returned in
 * place of a request the user made: `POST /api/suggestions/ai` always calls the
 * model. This exists so that having asked once, the user does not have to spend
 * a second of ten hourly requests to see the same answer again.
 */

/**
 * A stored suggestion, plus what is true of it NOW (A47).
 *
 * **`onWantList` is not part of the model's answer** and is deliberately not
 * stored: it is recomputed on every read against the want list as it is at
 * display time. The stored row stays exactly what the model returned, so the
 * panel remains a transcript rather than becoming a live list.
 */
export type DisplayedSuggestion = Suggestion & {
  /**
   * The user has since added this record to their want list.
   *
   * **Marked, never dropped.** The panel is a record of what the model SAID;
   * silently editing it would make it a live list while it claims to be a
   * transcript — the same decision that keeps a suggestion on screen after it
   * has been acted on. A dropped line also hides the exclusion working, where a
   * marked one shows the user they acted on it.
   */
  onWantList: boolean;
};

export type StoredGapAnalysis = {
  suggestions: DisplayedSuggestion[];
  dropped: number;
  askedAt: Date;
  /**
   * Records added AND records want-listed since the analysis was asked (A47).
   *
   * **The fact the timestamp does not carry.** "Asked 20 minutes ago" is about
   * the REQUEST; what the reader needs is whether the answer still applies, and
   * the two diverge in the dangerous direction — two minutes with five records
   * added reads as fresh and is not. A gap analysis is a claim about what is
   * MISSING, so adding a record is exactly the event that invalidates it.
   *
   * **CORRECTED (A47): want-list additions count too.** This was records only,
   * on the argument that records are what the suggestions are ABOUT. That is
   * true of what the model REASONS OVER and false of what INVALIDATES its
   * answer, and this number is about the second. The cost of the conflation was
   * real: a want-listed record stayed on screen while this count asserted
   * nothing had changed — blind to precisely the change that staled the answer.
   *
   * **Still ONE number, and the old bullet was right about why:** a sentence
   * carrying two figures is vaguer than either and less likely to be read. Both
   * events invalidate for the SAME reason — each removes something from the set
   * of gaps — which is what makes one count honest rather than a blur. The copy
   * that renders it must name what it counted; see `GapAnalysis.tsx`.
   */
  gapsClosedSince: number;
};

export async function storeGapAnalysis(input: {
  suggestions: Suggestion[];
  dropped: number;
  /** The genre this answer covers, or omitted for the whole collection (A45). */
  genreId?: string | null;
}): Promise<void> {
  const db = getDb();

  /*
   * Insert-then-trim rather than an upsert on a fixed id: the table has no
   * natural key, and inventing a sentinel row to update would make "never
   * asked" and "asked and got nothing" indistinguishable — the absent-versus-
   * unknown failure this project keeps naming.
   *
   * **RETENTION: current plus one previous, per scope.** A39 kept exactly one,
   * on the argument that nothing in the app read a superseded answer. That was
   * accurate and was not the right question: the Aja case produced two
   * assessments of one album, minutes apart, where NEITHER DOMINATED — the
   * second more actionable on what it kept, the first with better coverage —
   * and that is a fact about the tool observable only across two answers.
   *
   * **The value of a stored answer is not only what the app reads; it is what
   * the user can compare.** Two is where the evidence pointed: the finding came
   * from CONSECUTIVE asks, and nothing has named a use for the third-most-recent
   * answer.
   */
  const genreId = input.genreId ?? null;

  await db.transaction(async (tx) => {
    await tx.insert(gapAnalysisResults).values({
      suggestions: input.suggestions,
      dropped: input.dropped,
      genreId,
    });

    /*
     * **Trim to the newest TWO of this scope** — current plus one previous.
     *
     * Inserted first, then trimmed, so the row just written is inside the
     * window it is measured against. Trimming before inserting would need the
     * new row's timestamp before it has one.
     *
     * **Bounded by construction.** The ceiling follows from this statement
     * rather than from a scheduled job, for the reason §4.3 gives about
     * `llm_requests` carrying its own timestamps: a job that must run is a job
     * that can fail to run, and a table with no policy is a decision deferred.
     *
     * **Trims only THIS SCOPE** (A45), and `IS NOT DISTINCT FROM` is what makes
     * that true for the collection-wide answer: `genre_id = NULL` matches no
     * row, so a plain `=` would trim nothing and let the NULL scope grow
     * forever. Two per scope, never two per table — otherwise a busy genre
     * would evict the collection-wide answer.
     */
    await tx.execute(sql`
      DELETE FROM gap_analysis_results
       WHERE genre_id IS NOT DISTINCT FROM ${genreId}
         AND id NOT IN (
           SELECT id FROM gap_analysis_results
            WHERE genre_id IS NOT DISTINCT FROM ${genreId}
            ORDER BY asked_at DESC
            LIMIT 2
         )
    `);
  });
}

/**
 * Records added since ONE answer was asked, within that answer's own scope.
 *
 * **Per row, never per query** — this is the design question the retention unit
 * turned on. `recordsAddedSince` is a fact about what a PARTICULAR answer
 * covers, so the current and previous answers get separate counts from their own
 * `asked_at`. A collection-wide answer from before five records were added is
 * superseded in a way a later one is not, and presenting two answers as equally
 * current claims about the same collection is exactly what the comparison exists
 * to avoid.
 *
 * Counted in the database rather than in JS: the alternative is loading every
 * record to compare timestamps, which is the collection-scan §9.2 avoids
 * everywhere else.
 *
 * **Counted within the SCOPE, walking the same subtree the question walks**
 * (A45). Adding five jazz records does not make a UK82 answer stale, and a
 * shared counter would say it did — A37's rule that a limit named where it does
 * not bite spends the credibility of the one that does.
 *
 * **And it must recurse.** `Punk` has no records of its own and gains through
 * `UK82`, so a direct-only count would report zero while the answer's scope had
 * changed. The staleness walks what the question walks, or the two disagree.
 */
async function gapsClosedSince(scope: string | null, askedAt: Date): Promise<number> {
  const db = getDb();

  /*
   * **A47: want-list rows are counted alongside records**, and scoped the same
   * way. A want-list row carries its OWN genre links (it has no record yet), so
   * the scoped predicate goes through `want_list_genres` — the same asymmetry
   * `buildCollectionSummary` already handles.
   *
   * **Acquired rows are excluded.** §7.3 makes the want list double as
   * acquisition history, and an acquired row's record is counted as a RECORD —
   * counting the pair would report one event twice.
   */
  const counted =
    scope === null
      ? await db.execute<{ n: number }>(sql`
          SELECT (
            (SELECT count(*) FROM records WHERE created_at > ${askedAt})
            + (SELECT count(*) FROM want_list
                WHERE is_acquired = false AND created_at > ${askedAt})
          )::int AS n
        `)
      : await db.execute<{ n: number }>(sql`
          WITH RECURSIVE subtree AS (
            SELECT id FROM genres WHERE id = ${scope}
            UNION
            SELECT g.id FROM genres g JOIN subtree s ON g.parent_genre_id = s.id
          )
          SELECT (
            (SELECT count(DISTINCT r.id)
               FROM records r
               JOIN record_genres rg ON rg.record_id = r.id
              WHERE rg.genre_id IN (SELECT id FROM subtree)
                AND r.created_at > ${askedAt})
            + (SELECT count(DISTINCT w.id)
                 FROM want_list w
                 JOIN want_list_genres wg ON wg.want_list_id = w.id
                WHERE wg.genre_id IN (SELECT id FROM subtree)
                  AND w.is_acquired = false
                  AND w.created_at > ${askedAt})
          )::int AS n
        `);

  return Number(counted.rows[0]?.n ?? 0);
}

/** The newest answers for a scope, newest first, at most `limit` of them. */
async function rowsForScope(scope: string | null, limit: number) {
  const db = getDb();

  return db
    .select()
    .from(gapAnalysisResults)
    .where(
      scope === null ? isNull(gapAnalysisResults.genreId) : eq(gapAnalysisResults.genreId, scope),
    )
    .orderBy(desc(gapAnalysisResults.askedAt))
    .limit(limit);
}

type Row = Awaited<ReturnType<typeof rowsForScope>>[number];

/**
 * The key two spellings of one record must share (A47).
 *
 * Case- and whitespace-insensitive, matching `reasonFor` below: the model's
 * casing is its own and the want-list row was typed by hand, so an exact
 * comparison would read two spellings as two records and leave the line
 * unmarked — the defect, one layer down.
 */
const matchKey = (artist: string, title: string) =>
  `${artist.trim().toLowerCase()}\u0000${title.trim().toLowerCase()}`;

/**
 * Every unacquired want-list record, as match keys (A47).
 *
 * **UNSCOPED, deliberately, unlike the staleness count.** A suggestion is
 * want-listed or it is not; that fact does not depend on which genre the
 * question was asked about, and scoping it would leave a line unmarked in one
 * panel and marked in another for the same record.
 *
 * **Acquired rows are excluded** (§7.3): an acquired row is a record the user
 * OWNS, and "now on your want list" would be false of it.
 */
async function wantListedKeys(): Promise<Set<string>> {
  const db = getDb();

  const rows = await db.execute<{ artist: string; title: string }>(sql`
    SELECT a.name AS artist, w.title
      FROM want_list w
      JOIN artists a ON a.id = w.artist_id
     WHERE w.is_acquired = false
  `);

  return new Set(rows.rows.map((row) => matchKey(row.artist, row.title)));
}

async function hydrate(scope: string | null, row: Row): Promise<StoredGapAnalysis> {
  /*
   * **A47: recomputed here, on every read, never written back.** The stored row
   * stays exactly what the model returned — the panel is a transcript — so the
   * marking must reflect the want list as it is NOW. Removing a want-list row
   * unmarks the line on the next render, with nothing to migrate.
   */
  const wantListed = await wantListedKeys();

  return {
    // Stored as JSON because it is the model's output rather than the app's
    // data; validated on the way IN by `parseSuggestions` (A29d).
    suggestions: (row.suggestions as Suggestion[]).map((suggestion) => ({
      ...suggestion,
      /*
       * Matched on artist AND title, never artist alone: A29g welcomes a
       * DIFFERENT record by an artist already present, so one artist can appear
       * with several titles, and flagging all of them because one is
       * want-listed would mark a record the user has not decided to hunt.
       */
      onWantList: wantListed.has(matchKey(suggestion.artist, suggestion.title)),
    })),
    dropped: row.dropped,
    askedAt: row.askedAt,
    gapsClosedSince: await gapsClosedSince(scope, row.askedAt),
  };
}

export async function latestGapAnalysis(
  genreId?: string | null,
): Promise<StoredGapAnalysis | null> {
  const scope = genreId ?? null;
  const [row] = await rowsForScope(scope, 1);

  if (row === undefined) return null;

  return hydrate(scope, row);
}

/**
 * The current answer for a scope and the one before it — SPEC.md §9.2, retention.
 *
 * **One read returning both**, rather than two reads the caller reconciles. They
 * are one answer's worth of information — "here is what Claude says now, and
 * what it said last time" — and two reads could observe different states of the
 * table either side of a re-ask, leaving the UI to reconcile a disagreement it
 * has no way to resolve.
 *
 * **`previous` is null after a single ask**, which is not the same as a previous
 * answer that was empty: A39's absent-versus-empty distinction, one row further
 * down. A caller must render nothing rather than an empty comparison.
 *
 * **Both carry their OWN staleness.** See `recordsAddedSince` above — that is
 * the requirement this function exists to satisfy, and the natural
 * implementation (count once, show twice) is precisely what it must not do.
 */
export async function gapAnalysisWithPrevious(genreId?: string | null): Promise<{
  current: StoredGapAnalysis | null;
  previous: StoredGapAnalysis | null;
}> {
  const scope = genreId ?? null;
  const [current, previous] = await rowsForScope(scope, 2);

  return {
    current: current === undefined ? null : await hydrate(scope, current),
    previous: previous === undefined ? null : await hydrate(scope, previous),
  };
}

/**
 * The model's stated reason for ONE suggestion, or null.
 *
 * **For `/want-list/new` arriving from a §9.2 suggestion.** §9.1's reasons are
 * REGENERATED on that page by walking `artist_influences` and
 * `artist_memberships` from an `artistId` — a derivation that cannot run for an
 * artist with no row and no edges, which is what an LLM suggestion of a new
 * artist is. So the model's reason is READ rather than recomputed.
 *
 * **They are different KINDS of claim and the caller must keep them apart.**
 * §9.1's is computed from the user's own data and is checkable; this is a
 * model's assertion and is not. Rendering this through §9.1's presentation
 * would give an assertion the standing of a computed fact — see the rule entry
 * in NOTES ("two things that look like the same field are not the same kind of
 * claim").
 *
 * **NULL IS THE COMMON CASE AND IT IS NOT A BUG.** A39 decided the store keeps
 * ONE analysis — the last — because the screen shows the last answer and a
 * superseded one is debris. **A consequence of that decision, made in a
 * different unit, is that a reason exists for suggestions from the CURRENT
 * analysis and never for older ones.** A user following a link from a
 * suggestion they read yesterday gets null, correctly.
 *
 * The caller must therefore render NOTHING on null — not "no reason available",
 * which draws attention to a gap the reader would not otherwise notice and
 * cannot act on.
 */
export async function reasonFor(artist: string, title: string): Promise<string | null> {
  const stored = await latestGapAnalysis();
  if (stored === null) return null;

  /*
   * Matched on artist AND title, never artist alone: A29g welcomes a different
   * record by an owned artist, so one artist can appear across analyses with
   * different titles, and returning the artist's reason for the wrong record
   * would attribute to the model something it said about another album.
   *
   * Case- and whitespace-insensitive because the values arrive back through a
   * URL the user may have edited.
   */
  const key = (value: string) => value.trim().toLowerCase();
  const match = stored.suggestions.find(
    (suggestion) => key(suggestion.artist) === key(artist) && key(suggestion.title) === key(title),
  );

  return match?.reason ?? null;
}
