import 'server-only';
import { del as vercelDel, put as vercelPut } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import type { AcceptedImageType } from './image-type';

/**
 * Blob storage behind a seam (SPEC.md §4.2: "Use Vercel Blob for storage. Store
 * the returned URL here.").
 *
 * The SDK functions are injected rather than imported at the call site, for the
 * reason the Discogs client injects `fetch`: CLAUDE.md §2 forbids a test making
 * a live external call, and a module that reaches Vercel on import cannot be
 * tested at all. The route builds a storage from the real SDK; tests build one
 * from fakes; nothing else differs.
 *
 * `import 'server-only'` because this holds a write token — CLAUDE.md §6.
 */

type PutFn = (
  key: string,
  body: ArrayBuffer,
  options: { access: 'public'; contentType: string; addRandomSuffix: boolean },
) => Promise<{ url: string }>;

type DelFn = (url: string) => Promise<void>;

export type BlobStorage = {
  /**
   * The raw `ArrayBuffer`, which is what the SDK's `PutBody` accepts — it takes
   * `string | Readable | Buffer | Blob | ArrayBuffer | ReadableStream | File`
   * and NOT a `Uint8Array` view. Passing the buffer avoids a cast at the seam;
   * the sniffer still works on a view, since reading bytes needs one.
   */
  put: (key: string, body: ArrayBuffer, contentType: AcceptedImageType) => Promise<{ url: string }>;
  delete: (url: string) => Promise<void>;
};

/**
 * A storage key for a record's image.
 *
 * **The filename is never used as a path.** It is user-supplied, and `../` in
 * it would place the blob outside this record's namespace — overwriting another
 * record's image, or landing where nothing cleans it up. Only the extension is
 * kept, and only when it looks like one; the name itself is replaced by a UUID.
 *
 * The UUID also makes two uploads of `cover.jpg` distinct. Without it the
 * second silently replaces the first's bytes while both rows still point at one
 * URL — two records claiming one image, which is the §7.7 confusion in another
 * costume.
 */
export function storageKeyFor(recordId: string, filename: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(filename);
  const extension = match === null ? '' : `.${match[1].toLowerCase()}`;

  return `records/${recordId}/${randomUUID()}${extension}`;
}

export function createBlobStorage(sdk: { put: PutFn; del: DelFn }): BlobStorage {
  return {
    async put(key, body, contentType) {
      try {
        /**
         * `addRandomSuffix: false` — the key already carries a UUID, and a
         * second source of randomness would make the stored URL unpredictable
         * from the key, which the delete path needs.
         */
        const { url } = await sdk.put(key, body, {
          access: 'public',
          contentType,
          addRandomSuffix: false,
        });

        return { url };
      } catch (cause) {
        // Never report a URL that does not exist: the row would point at
        // nothing and render as a permanently broken image.
        throw new Error('The image could not be stored.', { cause });
      }
    },

    async delete(url) {
      await sdk.del(url);
    },
  };
}

/**
 * Whether this deployment can store images at all.
 *
 * `BLOB_READ_WRITE_TOKEN` is deliberately OPTIONAL (`lib/env/schema.ts`): §10's
 * in-store case wants the app usable without every integration configured, and
 * a developer running it locally has the same claim. The cost of that choice is
 * that the absence has to be detected where it matters rather than at boot —
 * otherwise the SDK throws deep inside an upload and the caller sees "Internal
 * server error" for a deployment problem.
 *
 * Read from `process.env` rather than `getEnv()` so this stays callable in the
 * same places the SDK is, without pulling the whole validated env in.
 */
export function isBlobConfigured(): boolean {
  return (process.env.BLOB_READ_WRITE_TOKEN ?? '') !== '';
}

/** The production storage, using the real SDK. */
export function getBlobStorage(): BlobStorage {
  return createBlobStorage({
    put: (key, body, options) => vercelPut(key, body, options),
    del: (url) => vercelDel(url),
  });
}
