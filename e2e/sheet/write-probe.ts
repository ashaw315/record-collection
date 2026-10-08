import type { APIRequestContext } from '@playwright/test';

/**
 * **Asks the server a sheet is driving whether it can write, and refuses
 * to go on unless it cannot.**
 *
 * `scripts/assert-read-only.ts` proves the connection of a server the sheet
 * config starts. A sheet can also drive a server it did not start
 * (`SHEET_REUSE_SERVER=1`, `SHEET_BASE_URL`), and nothing was proved about
 * that one. This is asked of whichever server answers, through the app, so
 * what is proved is the connection that server actually holds.
 *
 * **The write cannot change anything, guard or no guard.** It is `DELETE`
 * on an influence edge from an artist to itself. The database forbids such
 * a row (`artist_influences_no_self_edge`), so there is never one to
 * delete; and the route issues the statement with no read in front of it,
 * so a read-only connection is refused at the statement and a writable one
 * runs it, matches nothing and answers 404.
 *
 * **What this can and cannot tell.** The app's error shape is a bare 500,
 * so the reason is not visible from here. "Refused" is read as: a read
 * through the same server succeeds, and this write statement errors.
 * Anything else proves nothing and stops the sheet.
 */
export const PROBE_ID = '5ee70000-0000-4000-8000-000000000000';

export type ProbeObserved = { read: number; write: { status: number; code?: string } };
export type ProbeVerdict = { ok: true } | { ok: false; reason: string };

export function judgeWriteProbe({ read, write }: ProbeObserved): ProbeVerdict {
  if (write.status === 404) {
    return { ok: false, reason: 'this server CAN write: its database ran a DELETE (which matched nothing and changed nothing). Start it with DATABASE_READ_ONLY=1.' };
  }
  if (read === 200 && write.status === 500 && write.code === 'INTERNAL_ERROR') return { ok: true };
  return { ok: false, reason: `nothing is proved about this server: the read answered ${read} and the write ${write.status}${write.code === undefined ? '' : ` ${write.code}`}, where a read-only server answers 200 and 500 INTERNAL_ERROR.` };
}

export async function assertServerCannotWrite(request: APIRequestContext): Promise<void> {
  const read = await request.get('/api/tags');
  const response = await request.delete(`/api/influences/${PROBE_ID}/${PROBE_ID}`);
  let code: string | undefined;
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    if (typeof body.error?.code === 'string') code = body.error.code;
  } catch {
    /* Not JSON: not the app's error shape, and judged as such. */
  }
  const verdict = judgeWriteProbe({ read: read.status(), write: { status: response.status(), code } });
  if (!verdict.ok) throw new Error(`The sheet is stopped: ${verdict.reason}`);
}
