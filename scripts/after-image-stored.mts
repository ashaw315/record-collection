/**
 * **The capture tools' way into `afterImageStored` (the coordinator, 8 Nov).** A capture seeds image rows straight
 * into the local test database, which skips what the upload route does once a row exists; on 8 Nov that left the
 * covers group with no colour, a state no real record can be in. After seeding, a capture runs this with the record
 * and the image type, and the route's own post-upload function does the rest.
 *
 *   node --conditions=react-server --import tsx scripts/after-image-stored.mts <recordId> <imageType>
 *
 * The local test database only: it refuses before connecting unless the database client would select the local
 * Docker database, the same selector the client uses, so it can never write to production.
 */
import { resolveDriver } from '@/lib/db/connection-string';

const [recordId, imageType] = process.argv.slice(2);
if (recordId === undefined || imageType === undefined) throw new Error('after-image-stored: usage: <recordId> <imageType>');
const { DATABASE_URL = '', TEST_DATABASE_URL, NODE_ENV } = process.env;
if (resolveDriver({ DATABASE_URL, TEST_DATABASE_URL, NODE_ENV }).driver !== 'pg') throw new Error('after-image-stored: refusing, the database is not the local test database (TEST_DATABASE_URL is not set)');

const { afterImageStored } = await import('@/lib/images/follow-cover');
const { closeDb } = await import('@/db/client');
await afterImageStored(recordId, { imageType: imageType as Parameters<typeof afterImageStored>[1]['imageType'] });
await closeDb();
process.stdout.write(`after-image-stored: ${recordId} ${imageType}\n`);
