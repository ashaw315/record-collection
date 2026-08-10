import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { POST as importRoute } from '@/app/api/discogs/import/route';
import { matchOwnership } from '@/lib/db/queries/ownership';
import { buildPressingBody } from '@/app/records/pressing-form';
import { discogsIdToSubmit } from '@/app/records/pressing-identity';
import { loadDiscogsPrefill } from '@/app/records/discogs-prefill';
import * as clientModule from '@/lib/discogs/client';

/**
 * **THE MISSING TEST.** Import a release, then ask §7.7 whether it is owned.
 *
 * A defect found in real use: every record added through the form was
 * permanently tier 2. The form built pressings with a catalog number, country,
 * year and matrix — and NO `discogs_release_id`, which is the only thing §7.7's
 * tier 1 matches on. So "You own this pressing" could never fire for anything
 * the user actually owned, which is the badge CLAUDE.md §8 exists to protect.
 *
 * **Why nothing caught it.** Every ownership test constructs its pressings
 * directly, with a `discogs_release_id`, and every import test asserts what was
 * written. Both layers were internally correct; the gap was BETWEEN them, and a
 * test at either end could not see it — the same shape as the search form
 * offering 7 of §5.7's 12 parameters while the endpoint accepted all twelve.
 *
 * So this file crosses the seam deliberately: real import path in, real
 * ownership query out.
 */

const db = getTestDb();

const DETAILED = JSON.parse(
  readFileSync('test/fixtures/discogs/release-detailed.json', 'utf8'),
) as { id: number; title: string };

const RELEASE_ID = DETAILED.id;

function mockDiscogs(response: unknown = DETAILED) {
  const get = vi.fn(async () => response);

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
  });

  return get;
}

const post = (body: unknown) =>
  new Request('https://x.test/api/discogs/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await truncateAll();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('import via the API, then ask who owns it', () => {
  it('reaches tier 1 for the release just imported', async () => {
    mockDiscogs();

    await importRoute(post({ discogsReleaseId: RELEASE_ID, target: 'record' }));

    const match = await matchOwnership({
      discogsReleaseId: RELEASE_ID,
      artist: 'Discharge',
      title: DETAILED.title,
    });

    expect(match.tier, 'the record just imported IS this pressing').toBe('exact');
  });

  it('persists discogs_release_id on the pressing, which is what tier 1 reads', async () => {
    // Asserted directly as well as through the match, because this column is
    // the single point of failure and a null here is invisible everywhere else.
    mockDiscogs();

    await importRoute(post({ discogsReleaseId: RELEASE_ID, target: 'record' }));

    const rows = await db.execute<{ discogs_release_id: number | null }>(
      sql`SELECT discogs_release_id FROM pressings`,
    );

    expect(rows.rows[0].discogs_release_id).toBe(RELEASE_ID);
  });

  it('still reports tier 2 for a DIFFERENT release by the same artist', async () => {
    // The control: tier 1 must come from the pressing id, not from the import
    // having happened at all.
    mockDiscogs();

    await importRoute(post({ discogsReleaseId: RELEASE_ID, target: 'record' }));

    const match = await matchOwnership({
      discogsReleaseId: 999000111,
      artist: 'Discharge',
      title: DETAILED.title,
    });

    expect(match.tier).toBe('different-pressing');
  });
});

describe('save via the FORM path, then ask who owns it', () => {
  /**
   * The path Adam actually used, and the one that was broken. The form does not
   * call the importer: it builds a pressing body and POSTs it, so the id has to
   * survive `buildPressingBody` — which it did not.
   *
   * Reconstructed here from the same functions the form calls, since a vitest
   * test cannot drive the browser. `e2e/discogs-prefill.spec.ts` covers the
   * rendered form; this covers the data path with the ownership query attached.
   */
  async function saveThroughFormPath(edits: Record<string, string> = {}) {
    const prefill = await loadDiscogsPrefill(RELEASE_ID);
    expect(prefill, 'the prefill loaded').not.toBeNull();

    const current = { ...prefill!.pressing, ...edits };

    const body = buildPressingBody({
      ...current,
      discogsReleaseId: discogsIdToSubmit(
        prefill!.pressing.discogsReleaseId,
        prefill!.pressing,
        current,
      ),
    });

    const { POST: createPressing } = await import('@/app/api/pressings/route');
    const response = await createPressing(
      new Request('https://x.test/api/pressings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

    const pressing = await response.json();

    /**
     * Found-or-created rather than inserted: a test that saves twice would
     * otherwise hit `artists_name_unique` on the second call. §7.7 matches
     * artists fuzzily, so both records must belong to the SAME artist for the
     * ownership query to see them — a suffixed name would quietly change what
     * is being tested.
     */
    const artist = await db.execute<{ id: string }>(
      sql`INSERT INTO artists (name) VALUES ('Discharge')
          ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
          RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO records (artist_id, pressing_id, title)
          VALUES (${artist.rows[0].id}, ${pressing.id}, ${DETAILED.title})`,
    );

    return pressing;
  }

  it('reaches tier 1 when the user saves without corrections', async () => {
    /**
     * THE regression test for the reported defect. Before the fix this returned
     * `different-pressing`, so the badge said "You own a DIFFERENT pressing"
     * for the record the user had just added.
     */
    mockDiscogs();
    await db.execute(
      sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
          VALUES (${RELEASE_ID}, ${JSON.stringify(DETAILED)}::jsonb, now())`,
    );

    await saveThroughFormPath();

    const match = await matchOwnership({
      discogsReleaseId: RELEASE_ID,
      artist: 'Discharge',
      title: DETAILED.title,
    });

    expect(match.tier, 'saved via the form, and owned exactly').toBe('exact');
  });

  it('keeps tier 1 when the user corrects only the MATRIX', async () => {
    /**
     * §10: editing the matrix does not drop the id. Discogs' runout list is
     * incomplete by construction, so a runout it does not list is information
     * Discogs lacks — and this is the field the app most encourages users to
     * fill in.
     */
    mockDiscogs();
    await db.execute(
      sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
          VALUES (${RELEASE_ID}, ${JSON.stringify(DETAILED)}::jsonb, now())`,
    );

    await saveThroughFormPath({ matrixRunout: 'SP 3503-S7 / SP 3504-P11' });

    const match = await matchOwnership({
      discogsReleaseId: RELEASE_ID,
      artist: 'Discharge',
      title: DETAILED.title,
    });

    expect(match.tier).toBe('exact');
  });

  it('drops to tier 2 when the user corrects the CATALOG NUMBER', async () => {
    /**
     * §10: a corrected pressing is a different pressing. The user has
     * contradicted a printed fact Discogs asserts, and the app cannot tell
     * "Discogs is wrong" from "this is a different pressing" — so it must not
     * claim the release.
     *
     * And the correction SURVIVES, which is the point: attaching the id would
     * have found the shared row and discarded it.
     */
    mockDiscogs();
    await db.execute(
      sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
          VALUES (${RELEASE_ID}, ${JSON.stringify(DETAILED)}::jsonb, now())`,
    );

    const pressing = await saveThroughFormPath({ catalogNumber: 'CLAY LP 3 (corrected)' });

    expect(pressing.discogsReleaseId, 'no release claimed').toBeNull();
    expect(pressing.catalogNumber, 'the user correction survives').toBe('CLAY LP 3 (corrected)');

    const match = await matchOwnership({
      discogsReleaseId: RELEASE_ID,
      artist: 'Discharge',
      title: DETAILED.title,
    });

    expect(match.tier, 'honestly a different pressing').toBe('different-pressing');
  });

  it('never writes a user correction onto the shared Discogs row', async () => {
    /**
     * The §7.8 hazard this rule exists to prevent, asserted directly: one
     * user's correction must not land on the row every future import of that
     * release will match.
     */
    mockDiscogs();
    await db.execute(
      sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
          VALUES (${RELEASE_ID}, ${JSON.stringify(DETAILED)}::jsonb, now())`,
    );

    await saveThroughFormPath();
    await saveThroughFormPath({ countryPressed: 'DE' });

    const shared = await db.execute<{ country_pressed: string }>(
      sql`SELECT country_pressed FROM pressings WHERE discogs_release_id = ${RELEASE_ID}`,
    );

    expect(
      shared.rows[0].country_pressed,
      'the shared row still says what Discogs says',
    ).toBe('UK');
  });
});
