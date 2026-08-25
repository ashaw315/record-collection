import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, pressings, priceHistory, records } from '@/db/schema';
import { POST as refresh } from '@/app/api/discogs/refresh-prices/route';
import * as clientModule from '@/lib/discogs/client';
import { DiscogsError } from '@/lib/discogs/client';

/**
 * SPEC.md §5.7's `POST /api/discogs/refresh-prices`, §6's "write
 * `price_history` rows with `source: "discogs"`", and §7.5's append-only rule.
 *
 * **Auth is NOT tested here and that is deliberate.** §3 puts the cron behind
 * middleware, which authenticates it by `CRON_SECRET` bearer token — so the
 * handler never sees an unauthenticated request and a test calling the handler
 * directly could not observe the difference. That boundary is covered where it
 * lives: `src/lib/auth/password.test.ts` for the comparison, `routes.test.ts`
 * for the mode, and `e2e/auth.spec.ts` over real HTTP through real middleware.
 * Asserting it again here would test the mock.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

/** Layer 1 only — the floor is what a refresh records (see the route's docblock). */
const stats = (lowest: number | null) => ({
  num_for_sale: 4,
  lowest_price: lowest === null ? null : { value: lowest, currency: 'USD' },
  blocked_from_sale: false,
});

/**
 * Routes each release id to its own outcome, so one fake covers a whole run and
 * a single release can fail while its neighbours succeed.
 */
function mockDiscogs(byRelease: Record<number, unknown | Error>) {
  const get = vi.fn(async (path: string) => {
    const id = Number(path.replace(/^.*\/(\d+).*$/, '$1'));
    const outcome = byRelease[id];
    if (outcome === undefined) throw new Error(`unexpected release: ${path}`);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
    fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
  });

  return get;
}

async function seedRecord(discogsReleaseId: number, title: string) {
  const [artist] = await db.insert(artists).values({ name: `${title} artist` }).returning();
  const [pressing] = await db.insert(pressings).values({ discogsReleaseId }).returning();
  const [record] = await db
    .insert(records)
    .values({ title, artistId: artist.id, pressingId: pressing.id })
    .returning();
  return record;
}

const call = () =>
  refresh(new Request('http://test/api/discogs/refresh-prices', { method: 'POST' }), {
    params: Promise.resolve({}),
  });

const pricesFor = (recordId: string) =>
  db.select().from(priceHistory).where(eq(priceHistory.recordId, recordId));

describe('a refresh writes what Discogs quoted', () => {
  /**
   * Fails against: a route that writes nothing, or one that writes a price
   * without the source §6 names.
   */
  it('appends one row per record, sourced to discogs', async () => {
    const record = await seedRecord(249504, 'Why');
    mockDiscogs({ 249504: stats(47.28) });

    const response = await call();

    expect(response.status).toBe(200);
    const rows = await pricesFor(record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe('47.28');
    expect(rows[0].source).toBe('discogs');
  });

  /**
   * **Fails against a refresh that writes `used` or `new`.**
   *
   * §7.2 defines `asking` as "a price someone wants but nobody has paid — a
   * shop tag, an open listing", which is exactly what a marketplace floor is.
   * The type is not cosmetic: §7.6's estimated-collection-value chain reads
   * `used` then `new` and deliberately excludes `asking`, so mistyping these
   * rows would silently inflate the collection's value with prices nobody paid.
   * R4 already fixed the mirror of this defect in the sparkline.
   */
  it('records the floor as an asking price, which keeps it out of §7.6 value', async () => {
    const record = await seedRecord(249504, 'Why');
    mockDiscogs({ 249504: stats(47.28) });

    await call();

    expect((await pricesFor(record.id))[0].priceType).toBe('asking');
  });

  /**
   * Fails against: an UPDATE, or an upsert keyed on the record.
   *
   * §7.5: price history is append-only. Two refreshes are two observations, and
   * the older one is the history the feature exists to build.
   */
  it('a second refresh appends rather than replacing', async () => {
    const record = await seedRecord(249504, 'Why');
    mockDiscogs({ 249504: stats(47.28) });
    await call();

    mockDiscogs({ 249504: stats(51.0) });
    await call();

    const rows = await pricesFor(record.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.price).sort()).toEqual(['47.28', '51.00']);
  });
});

/**
 * **Absence is not a price — the decision this unit had to make.**
 *
 * §6 says to write `price_history` rows from Discogs; it does not say what
 * absence means, and a row recording "no data" is a different claim from no row
 * at all. There is no honest way to write the first: `price_type` is
 * `new | used | asking` (§4.2) and all three assert a price EXISTS, so an
 * absence row would have to invent a value or a type. §7.6's chain then reads
 * it as what the record is worth.
 *
 * §10a states the governing principle in its own first sentence — "later layers
 * degrade to absence, never to a guess" — and this project has already shipped
 * the opposite once, when the market cache recorded a ladder it never fetched
 * and served an empty range as measured truth for seven days.
 *
 * So: no data, no row. What absence must NOT be is silent, which is what the
 * reported counts below are for.
 */
describe('a release Discogs has no price for', () => {
  /**
   * Fails against: a route that writes a zero, a null, or a placeholder row for
   * a release with no listings.
   */
  it('writes no row when there is no lowest price', async () => {
    const record = await seedRecord(249504, 'Why');
    mockDiscogs({ 249504: stats(null) });

    const response = await call();

    expect(response.status).toBe(200);
    expect(await pricesFor(record.id)).toHaveLength(0);
  });

  /**
   * **Fails against absence that is silent**, which is the half that makes the
   * decision above safe rather than merely defensible.
   *
   * A run that writes zero rows and a run that never happened are the same
   * observation from the outside — R6's "assert the state, not the exit code",
   * applied to the cron's own report. The counts say which.
   */
  it('reports it as skipped rather than as a success', async () => {
    await seedRecord(249504, 'Why');
    mockDiscogs({ 249504: stats(null) });

    const body = (await (await call()).json()) as {
      data: { written: number; skipped: number; failed: number };
    };

    expect(body.data.written).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(body.data.failed).toBe(0);
  });

  /**
   * **Fails against a route that treats a deleted release as an outage.**
   *
   * A 404 is Discogs ANSWERING — this release is gone — and a 503 is Discogs
   * failing to answer. The market route already draws this distinction for its
   * cache marker and the same reasoning applies: one is a settled fact, the
   * other is "we do not know", and a cron that reports them identically hides a
   * broken record behind a transient-looking number.
   */
  it('counts a deleted release as skipped, not failed', async () => {
    await seedRecord(249504, 'Why');
    mockDiscogs({ 249504: new DiscogsError('gone', { status: 404 }) });

    const body = (await (await call()).json()) as {
      data: { skipped: number; failed: number };
    };

    expect(body.data.skipped).toBe(1);
    expect(body.data.failed).toBe(0);
  });

  /**
   * Fails against: an outage folded into `skipped`, which would report a
   * Discogs outage as "nothing to price" — absence recorded as fact, the
   * failure §10a prohibits.
   */
  it('counts an outage as failed, not skipped', async () => {
    await seedRecord(249504, 'Why');
    mockDiscogs({ 249504: new DiscogsError('unavailable', { status: 503 }) });

    const body = (await (await call()).json()) as {
      data: { skipped: number; failed: number };
    };

    expect(body.data.failed).toBe(1);
    expect(body.data.skipped).toBe(0);
  });
});

/**
 * **Per-item isolation, demonstrated rather than implied.**
 *
 * Append-only means a partial run leaves no corrupt row, but that is a property
 * of the TABLE and says nothing about whether the loop keeps going. A refresh
 * that aborts on the first failure is equally append-safe and equally useless:
 * one dead release would freeze every record after it, every week, silently.
 * These tests fail against that route.
 */
describe('one record failing does not stop the rest', () => {
  /**
   * Fails against: a loop with no try/catch, or one that awaits a
   * `Promise.all` — either aborts the run at the first rejection and leaves the
   * remaining records unpriced.
   *
   * The failure is placed in the MIDDLE deliberately: a failure at the end
   * passes even on a route that aborts, so it would prove nothing.
   */
  it('prices the records either side of a failure', async () => {
    const first = await seedRecord(1, 'First');
    const middle = await seedRecord(2, 'Middle');
    const last = await seedRecord(3, 'Last');

    mockDiscogs({
      1: stats(10),
      2: new DiscogsError('unavailable', { status: 503 }),
      3: stats(30),
    });

    const response = await call();

    expect(response.status).toBe(200);
    expect((await pricesFor(first.id))[0]?.price).toBe('10.00');
    expect(await pricesFor(middle.id)).toHaveLength(0);
    expect((await pricesFor(last.id))[0]?.price).toBe('30.00');
  });

  /**
   * Fails against: a run that reports success because it did not throw.
   *
   * The counts have to add up to the work attempted, or a half-finished run
   * reads as a clean one — which for a weekly job nobody watches is how a
   * quietly broken refresh survives for months.
   */
  it('reports the failure in the counts', async () => {
    await seedRecord(1, 'First');
    await seedRecord(2, 'Middle');
    await seedRecord(3, 'Last');

    mockDiscogs({
      1: stats(10),
      2: new DiscogsError('unavailable', { status: 503 }),
      3: stats(30),
    });

    const body = (await (await call()).json()) as {
      data: { attempted: number; written: number; skipped: number; failed: number };
    };

    expect(body.data).toMatchObject({ attempted: 3, written: 2, skipped: 0, failed: 1 });
  });

  /**
   * **Fails against a route that stops after an unexpected throw** — a bug in
   * our own mapping code rather than a Discogs error.
   *
   * `DiscogsError` is the anticipated shape; a `TypeError` from a malformed
   * payload is not, and a catch that only handles the former would still abort
   * the run. One dead record must not cost the other forty.
   */
  it('survives an unexpected error, not only a Discogs one', async () => {
    const first = await seedRecord(1, 'First');
    await seedRecord(2, 'Middle');
    const last = await seedRecord(3, 'Last');

    mockDiscogs({
      1: stats(10),
      2: new TypeError('cannot read properties of undefined'),
      3: stats(30),
    });

    const body = (await (await call()).json()) as { data: { failed: number } };

    expect(body.data.failed).toBe(1);
    expect((await pricesFor(first.id))[0]?.price).toBe('10.00');
    expect((await pricesFor(last.id))[0]?.price).toBe('30.00');
  });
});

describe('an empty collection', () => {
  /**
   * Fails against: a route that errors on nothing to do, or reports it as a
   * failure. Nothing to price is a legitimate answer, not a fault.
   */
  it('is a success with zero counts', async () => {
    mockDiscogs({});

    const response = await call();
    const body = (await response.json()) as { data: { attempted: number } };

    expect(response.status).toBe(200);
    expect(body.data.attempted).toBe(0);
  });
});
