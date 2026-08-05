import { NextResponse } from 'next/server';
import { badRequest, isUuid, notFound } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { hydrateRecord } from '@/lib/db/queries/records';

/**
 * SPEC.md §5.2 `GET /api/records/:id` — the record with artist, label, format,
 * store, pressing, genres, tags, images, journal entries and latest price
 * resolved.
 */

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.records.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid record id', 'INVALID_ID');

    const record = await hydrateRecord(id);
    if (record === undefined) return notFound('Record not found');

    return NextResponse.json(record);
  },
);
