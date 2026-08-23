import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **Every E2E spec that seeds records must remove them.**
 *
 * A full run from an empty database ended with 145 records and 129 artists.
 * `globalSetup` truncates once per run, so that growth is WITHIN the run — the
 * same shape as the login flake step 15 unit 1 diagnosed, where 724 accumulated
 * records made `/` slow enough that late specs' logins timed out. It took
 * eleven sightings and a wrong prescription to find last time. The only reason
 * it is not failing now is that the count is small, which is a property of the
 * current fixtures rather than of the design.
 *
 * A mid-run truncate is NOT the fix and must not become one: two projects run in
 * parallel against one database, so truncating mid-run would delete another
 * spec's live fixtures (see `global-setup.ts`). Each spec removes its OWN rows.
 *
 * **This guard is live, not skipped.** The thirteen specs that do not yet comply
 * are named below as explicit exemptions, each carrying its reason. A skipped
 * test is a test that does not run, and this project has been caught by that
 * shape before; a named list is visible debt instead. The list must only ever
 * shrink — a fourteenth non-compliant spec fails this immediately.
 */

/**
 * Specs that seed records and do not yet clean up. Being converted in unit (b);
 * `shelf` and `record-detail` first, as they carry 32 of the 47 seeding sites.
 *
 * **Remove a name from this list when its spec is converted. Never add one.**
 */
/**
 * Specs that seed records and do not yet clean up.
 *
 * **Empty, and it must stay that way.** Unit (b) converted all thirteen; the
 * staleness check below means a name cannot linger here after its spec complies,
 * and the offenders check means a new spec cannot be added without cleanup. If
 * you are about to add a name here, add `registerCleanup()` and `trackArtist()`
 * to the spec instead — see `e2e/cleanup.ts`.
 */
const EXEMPT_PENDING_CONVERSION = new Set<string>([]);

/**
 * Creates records: a POST to the records endpoint — directly or through a local
 * `post(page, '/api/records', ...)` wrapper — the bulk helper, or raw SQL.
 *
 * **A POST, not any mention of `/api/records`.** A first version matched the
 * path alone and named `discogs-prefill`, `records-routing` and `want-list`,
 * which only GET a record or mention the route in a comment. It would have sent
 * unit (b) to "fix" specs that seed nothing.
 *
 * **Known blind spot: creation through the UI.** `record-form` fills the form
 * and clicks Save thirteen times; no request literal appears, so this pattern
 * cannot see it. It is on the exemption list for that reason and the list note
 * says so — a guard that silently ignores a whole creation route would be worse
 * than one whose limits are written down. Widening this to "any spec that saves
 * a form" would catch every editing spec, most of which create nothing.
 */
const SEEDS = /post\(\s*page\s*,\s*[`'"]\/api\/records|request\.post\(\s*[`'"]\/api\/records|seedRecords\(|INSERT INTO records/;

/** Creates an artist fixture, by any of the idioms the specs use. */
const CREATES_ARTIST = /post\(\s*page\s*,\s*[`'"]\/api\/artists|post\(\s*[`'"]\/api\/artists|request\.post\(\s*[`'"]\/api\/artists|INSERT INTO artists/g;
/** Accounts for one: the shared tracker, or an explicit artist delete. */
const REMOVES_ARTIST = /trackArtist\(|DELETE FROM artists|deleteRecordsByArtist\(/g;

/** Removes them: the shared tracker, the bulk helper, the API sweep, or raw SQL. */
const CLEANS = /trackArtist\(|registerCleanup\(|removeRecordsFor\(|deleteRecordsByArtist\(|DELETE FROM records/;

const specs = readdirSync('e2e')
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => ({ name: f.replace('.spec.ts', ''), body: readFileSync(`e2e/${f}`, 'utf8') }));

describe('E2E specs clean up the records they seed', () => {
  it('finds the specs at all, so an empty glob cannot pass vacuously', () => {
    /* The hollow-check shape: zero specs would satisfy every assertion below. */
    expect(specs.length).toBeGreaterThan(20);
    expect(specs.some((s) => SEEDS.test(s.body)), 'some spec seeds records').toBe(true);
  });

  it('every seeding spec cleans up, except those pending conversion', () => {
    const offenders = specs
      .filter((s) => SEEDS.test(s.body) && !CLEANS.test(s.body))
      .map((s) => s.name)
      .filter((name) => !EXEMPT_PENDING_CONVERSION.has(name));

    expect(
      offenders,
      `these specs seed records and never remove them — add cleanup, do not add them to the exemption list:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every artist a spec creates is also removed', () => {
    /**
     * **Cleaning up SOMETHING is not cleaning up EVERYTHING.**
     *
     * The first version of this guard asked only whether a spec mentioned any
     * cleanup at all. `collection-filters` passed it while leaking 56 artists a
     * run: it calls `removeRecordsFor` for its records and never removes the
     * artists behind them, and `records.artist_id` is NO ACTION, so the artists
     * simply stay. Measured after unit (b) converted all thirteen listed specs —
     * the count fell 145 -> 74 rather than to ~0, and the residue was almost
     * entirely one spec the guard called compliant.
     *
     * So this counts creation sites against removal sites per spec. It is a
     * crude comparison and deliberately so: it cannot prove the right artist is
     * removed, only that a spec does not create more than it accounts for.
     */
    const offenders = specs
      .map((s) => {
        const created = (s.body.match(CREATES_ARTIST) ?? []).length;
        const removed = (s.body.match(REMOVES_ARTIST) ?? []).length;
        return { name: s.name, created, removed };
      })
      .filter((s) => s.created > s.removed)
      .filter((s) => !EXEMPT_PENDING_CONVERSION.has(s.name))
      .map((s) => `${s.name} (creates ${s.created}, removes ${s.removed})`);

    expect(
      offenders,
      `these specs create artists they never remove — artists outlive records because records.artist_id is NO ACTION:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the exemption list only names specs that are genuinely non-compliant', () => {
    /**
     * Stops the list outliving the debt. When (b) converts a spec, its name has
     * to come out — otherwise the list would quietly grant permission to
     * regress, which is the same "reads as a guarantee while doing nothing"
     * shape as an unwired global setup.
     */
    const stale = [...EXEMPT_PENDING_CONVERSION].filter((name) => {
      const spec = specs.find((s) => s.name === name);
      return spec === undefined || !SEEDS.test(spec.body) || CLEANS.test(spec.body);
    });

    expect(
      stale,
      `these are exempted but no longer need to be — remove them from EXEMPT_PENDING_CONVERSION:\n  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });
});
