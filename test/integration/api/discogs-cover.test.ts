import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { images } from '@/db/schema';
import { logger } from '@/lib/logger';
import { attachDiscogsCover } from '@/lib/discogs/attach-cover';
import * as storage from '@/lib/storage/blob';
import type { DiscogsClient } from '@/lib/discogs/client';

/**
 * The QA finding step 8 was asked to close: "a Discogs import doesn't bring the
 * cover across."
 *
 * **Fetched server-side and STORED, never hot-linked.** A Discogs image URL is
 * chosen by whichever contributor edited the release; rendering it directly
 * would make every visitor's browser contact a host a stranger picked, carrying
 * their IP — the contributor-controlled outbound request the `safeImageUrl`
 * allow-list closed.
 *
 * **And it must never fail the import.** A record lost because an image fetch
 * timed out is the worst trade available here: the record is what the user
 * typed, the cover is a convenience. Every failure path below asserts the
 * record survives.
 */

const db = getTestDb();

const RECORD_ID = '11111111-1111-4111-8111-111111111111';
const STORED_URL = 'https://blob.example/records/abc/cover.jpg';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;

let putSpy: ReturnType<typeof vi.fn>;
let fetchImage: ReturnType<typeof vi.fn>;

/** A client exposing only what the cover path uses. */
function clientWith(impl: ReturnType<typeof vi.fn>): DiscogsClient {
  return { get: vi.fn(), fetchImage: impl } as unknown as DiscogsClient;
}

beforeEach(async () => {
  await truncateAll();

  /**
   * A record to hang the image off: `images.record_id` is NOT NULL, which is
   * why the cover is fetched on SAVE rather than when the form opens.
   *
   * Inserted through Drizzle rather than raw SQL — `db.execute` will not take
   * two parameterised statements in one call, which is how the first version
   * of this setup failed.
   */
  const { artists, records } = await import('@/db/schema');
  const [artist] = await db
    .insert(artists)
    .values({ name: 'Discharge' })
    .returning({ id: artists.id });
  await db.insert(records).values({ id: RECORD_ID, title: 'Hear Nothing', artistId: artist.id });

  /**
   * The cover path now refuses to start without configured storage, the same
   * way the upload route does — otherwise the SDK throws from inside the catch
   * and a deployment problem is reported as a Discogs failure.
   *
   * No real `BLOB_READ_WRITE_TOKEN` is present here, correctly, so the CHECK is
   * stubbed rather than the environment faked. `images-delete.test.ts` does the
   * same for the same reason. The tests that exercise an unconfigured
   * deployment override this back to false.
   */
  vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(true);

  putSpy = vi.fn().mockResolvedValue({ url: STORED_URL });
  vi.spyOn(storage, 'getBlobStorage').mockReturnValue({
    put: putSpy as unknown as storage.BlobStorage['put'],
    delete: vi.fn().mockResolvedValue(undefined),
  });

  fetchImage = vi.fn().mockResolvedValue({ bytes: JPEG, contentType: 'image/jpeg' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('attachDiscogsCover', () => {
  it('stores the primary image and writes a cover row (happy path)', async () => {
    const outcome = await attachDiscogsCover({
      recordId: RECORD_ID,
      /**
       * Secondary FIRST, deliberately.
       *
       * With primary first, "find the primary" and "take the first" agree and
       * the assertion below cannot tell them apart — a mutation replacing the
       * search with `images[0]` failed nothing. Real releases order images with
       * the primary first most of the time, which is exactly what makes the
       * wrong rule survive.
       */
      images: [
        { url: 'https://i.discogs.com/secondary.jpg', type: 'secondary' },
        { url: 'https://i.discogs.com/primary.jpg', type: 'primary' },
      ],
      client: clientWith(fetchImage),
    });

    expect(outcome).toEqual({ attached: true });

    const rows = await db.select().from(images);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(STORED_URL);
    expect(rows[0].imageType, 'a cover, per §4.2’s enum').toBe('cover');

    // The PRIMARY, not merely the first — Discogs orders them but the type is
    // what says which is the front sleeve.
    expect(fetchImage).toHaveBeenCalledWith('https://i.discogs.com/primary.jpg');
  });

  it('falls back to the first image when none is marked primary', async () => {
    await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/only.jpg', type: 'secondary' }],
      client: clientWith(fetchImage),
    });

    expect(fetchImage).toHaveBeenCalledWith('https://i.discogs.com/only.jpg');
    expect(await db.select().from(images)).toHaveLength(1);
  });

  it('does nothing when the release carries no images', async () => {
    const outcome = await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [],
      client: clientWith(fetchImage),
    });

    expect(outcome).toEqual({ attached: false, reason: 'none' });
    expect(fetchImage).not.toHaveBeenCalled();
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it('SURVIVES a fetch failure, writes no row, and says why', async () => {
    /**
     * The requirement this function exists to honour. Discogs being slow, the
     * image being over 10MB, or the bytes failing the sniff must all end the
     * same way: no cover, no exception, and something the caller can tell the
     * user.
     */
    const error = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    fetchImage.mockRejectedValue(new Error('That image is too large — over 10MB.'));

    const outcome = await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/huge.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    expect(outcome.attached, 'the import is not failed by a missing cover').toBe(false);
    expect(await db.select().from(images)).toHaveLength(0);
    expect(error, 'the failure is recorded rather than silent').toHaveBeenCalled();
  });

  it('logs the UNDERLYING cause of a storage failure, not just our own wrapper', async () => {
    /**
     * QA finding: a real cover failure logged only "The image could not be
     * stored." — our own sentence, naming no cause and giving the operator
     * nothing to check.
     *
     * `createBlobStorage` attaches the SDK's error as `cause`, and nothing read
     * it. The chain existed and stopped one frame short of the log, at exactly
     * the point where it was the only thing that could explain the failure.
     */
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    putSpy.mockRejectedValue(
      new Error('The image could not be stored.', {
        cause: new Error('Vercel Blob: Access denied, please provide a valid token'),
      }),
    );

    await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/primary.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    const logged = warn.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged, 'the SDK’s own words reach the log').toContain('Access denied');
  });

  it('walks a nested cause chain rather than stopping at the first link', async () => {
    // The SDK wraps its own errors too, so one level of unwrapping is not
    // reliably enough — the useful sentence can be two or three deep.
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    putSpy.mockRejectedValue(
      new Error('outer', { cause: new Error('middle', { cause: new Error('the real reason') }) }),
    );

    await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/primary.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    const logged = warn.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('the real reason');
  });

  it('SURVIVES a blob-store failure the same way', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    putSpy.mockRejectedValue(new Error('blob store unreachable'));

    const outcome = await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/primary.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    expect(outcome.attached).toBe(false);
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it('never throws, whatever the client does', async () => {
    /**
     * The discriminating case for "must not fail the import". The tests above
     * use rejected promises; this one throws SYNCHRONOUSLY, which a
     * `.catch()`-only guard would miss entirely — and the caller is a save
     * handler that would then 500 with the record already written.
     */
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const throws = vi.fn(() => {
      throw new Error('synchronous explosion');
    });

    await expect(
      attachDiscogsCover({
        recordId: RECORD_ID,
        images: [{ url: 'https://i.discogs.com/x.jpg', type: 'primary' }],
        client: clientWith(throws),
      }),
    ).resolves.toEqual(expect.objectContaining({ attached: false }));
  });

  it('does not overwrite a cover the record already has', async () => {
    // §7.8: never overwrite user data with external data. A user who
    // photographed their own sleeve has the better image of THEIR copy.
    await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/primary.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    const outcome = await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/other.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    expect(outcome).toEqual({ attached: false, reason: 'already-has-cover' });
    expect(await db.select().from(images), 'still one, not two').toHaveLength(1);
  });
});

describe('a deployment with no blob storage configured', () => {
  /**
   * **`isBlobConfigured` guarded ONE of its three call sites.**
   *
   * `BLOB_READ_WRITE_TOKEN` is deliberately optional (`lib/env/schema.ts`) so
   * §10's in-store case and local development work without every integration
   * present. The cost is that the absence must be detected where it is USED —
   * and only the upload route checked. This path went straight to
   * `getBlobStorage().put()`, the SDK threw from inside the try, and the user
   * was told:
   *
   *   "The cover art could not be fetched from Discogs. The record saved
   *    normally — you can add an image below."
   *
   * Both halves wrong. Discogs was reached perfectly well, and adding an image
   * below is also impossible — the upload route 503s on the same missing token.
   * The one action offered is the one guaranteed to fail.
   *
   * So this is `reason: 'unconfigured'`, distinct from `'failed'`: a deployment
   * fact rather than a transient error, and the two want different sentences.
   */
  it('reports unconfigured rather than blaming Discogs', async () => {
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(false);

    const outcome = await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/a/cover.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    expect(outcome).toEqual({ attached: false, reason: 'unconfigured' });
  });

  it('does not spend a Discogs request it cannot use', async () => {
    /**
     * Checked BEFORE the fetch, not after. The image fetch is rate-limited on
     * the shared 60/minute bucket, so fetching bytes that can never be stored
     * spends budget the lookup screen needs — and on a deployment with no
     * token, it would do so on every single import.
     */
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(false);

    await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/a/cover.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    expect(fetchImage, 'no bytes are fetched').not.toHaveBeenCalled();
    expect(putSpy, 'and no store is attempted').not.toHaveBeenCalled();
  });

  it('still attaches normally when storage IS configured', async () => {
    // The guard must not become an unconditional refusal — the ordinary path is
    // the one that matters, and a check that always failed would pass every
    // test above.
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(true);

    const outcome = await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [{ url: 'https://i.discogs.com/a/cover.jpg', type: 'primary' }],
      client: clientWith(fetchImage),
    });

    expect(outcome).toEqual({ attached: true });
    expect(await db.select().from(images)).toHaveLength(1);
  });

  it('says nothing about storage when the release has no cover at all', async () => {
    // 'none' outranks 'unconfigured': there was nothing to store either way, and
    // reporting a deployment problem for a release with no images would send the
    // reader after the wrong thing.
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(false);

    const outcome = await attachDiscogsCover({
      recordId: RECORD_ID,
      images: [],
      client: clientWith(fetchImage),
    });

    expect(outcome).toEqual({ attached: false, reason: 'none' });
  });
});
