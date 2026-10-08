import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROBE_ID, judgeWriteProbe } from '../../e2e/sheet/write-probe';
import { isUuid } from '@/lib/api/errors';

/**
 * **The sheets cannot write to production, and these are the premises that
 * claim rests on (8 Oct).**
 *
 * The sheets run a local server against the production database. What
 * makes them unable to write is the connection: with `DATABASE_READ_ONLY=1`
 * every connection the server opens carries a read-only startup parameter
 * (`poolOptions`), proved against a real Postgres in
 * `test/integration/read-only-connection.test.ts` and against production's
 * pooled endpoint by `scripts/assert-read-only.ts` before each sheet run.
 *
 * That is true of the sheets only if three things about the code hold. Each
 * is a premise about the codebase, so each has a test here and none is a
 * sentence in a comment. They read source text, which is what they are
 * about: where connections are opened and how the sheet server is started.
 */
const code = (path: string) => readFileSync(path, 'utf8');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
};

describe('the premises of a read-only sheet server', () => {
  /* Fails if any module under src/ opens a database connection of its own: it would not carry the parameter. */
  it('exactly one module under src/ opens a database connection, and it is the driver module', () => {
    const opens = walk('src').filter((path) => /new\s+(?:Neon|Pg)?Pool\s*\(|\bneon\s*\(|new\s+Client\s*\(/.test(code(path)));
    expect(opens).toEqual([join('src', 'db', 'client.ts')]);
  });

  /* Fails if either pool is built from a bare connection string again. */
  it('the driver module builds every pool from poolOptions, which is where the parameter is added', () => {
    const pools = [...code(join('src', 'db', 'client.ts')).matchAll(/new\s+(?:Neon|Pg)Pool\s*\(([^)]*\)?)\)/g)].map((m) => m[1].trim());
    expect(pools).toEqual(['poolOptions(env)', 'poolOptions(env)']);
  });

  /* Fails if the sheet server is started without the flag, or without first proving the connection refuses a write. */
  it('the sheet server is started read-only, after the proof that its connection refuses a write', () => {
    const config = code('playwright.sheet.config.ts');
    const command = /command:\s*`([^`]*)`/.exec(config)?.[1] ?? '';
    const [proof, server, ...rest] = command.split('&&').map((part) => part.trim());
    expect(rest, 'two parts: the proof, then the server').toEqual([]);
    expect(proof).toMatch(/^DATABASE_READ_ONLY=1 npx tsx --env-file=\.env\.local scripts\/assert-read-only\.ts$/);
    expect(server).toMatch(/^DATABASE_READ_ONLY=1 npm run dev\b/);
  });
});

/**
 * **The server a sheet is talking to, whichever one it is (8 Oct).**
 *
 * The preflight above proves the connection of a server the config starts.
 * It proves nothing about a server the config did not start: with
 * `SHEET_REUSE_SERVER=1` or `SHEET_BASE_URL` a sheet drives whatever is
 * already listening, and that was the convenient path and the unguarded
 * one. So every sheet asks the running server itself, after signing in:
 * a read that must succeed and a write statement that must error.
 *
 * The write is `DELETE /api/influences/X/X`. That route issues its DELETE
 * with no read in front of it, and a self-edge cannot exist
 * (`artist_influences_no_self_edge`), so on a server that CAN write the
 * statement runs, matches nothing and returns 404, having changed nothing.
 * `test/integration/read-only-connection.test.ts` holds both halves of
 * that against a real Postgres.
 */
describe('the write probe a sheet makes through the running server', () => {
  const ok = { read: 200, write: { status: 500, code: 'INTERNAL_ERROR' } };

  it('passes only when reads succeed and the write statement errors', () => {
    expect(judgeWriteProbe(ok)).toEqual({ ok: true });
  });

  /* Fails against a judgement that treats "nothing was deleted" as safe: 404 means the statement RAN. */
  it('refuses a server whose write statement ran, which answers 404', () => {
    const verdict = judgeWriteProbe({ ...ok, write: { status: 404, code: 'NOT_FOUND' } });
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringMatching(/CAN write/) });
  });

  /* Absent, broken, working: a server that cannot read, or a probe that never reached the statement, proves nothing and is refused. */
  it.each([
    ['the read failed, so a failing write says nothing', { read: 500, write: ok.write }],
    ['not signed in', { read: 401, write: { status: 401, code: 'UNAUTHENTICATED' } }],
    ['the id was rejected before any statement', { read: 200, write: { status: 400, code: 'INVALID_ID' } }],
    ['a 500 that is not the app’s own error shape', { read: 200, write: { status: 500 } }],
    ['the edge was deleted, which cannot happen', { read: 200, write: { status: 200 } }],
  ])('refuses when %s, as nothing proved', (_name, observed) => {
    const verdict = judgeWriteProbe(observed);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringMatching(/nothing is proved/) });
  });

  /* Fails if the id stops passing the route's own check: the probe would get 400 and never reach the database. */
  it('uses an id the route accepts, so the probe reaches the statement', () => {
    expect(isUuid(PROBE_ID)).toBe(true);
  });

  /* Fails if a sheet signs in some other way, or if login can return without probing. */
  it('every sheet signs in through login, and login cannot return without the probe', () => {
    const sheets = readdirSync(join('e2e', 'sheet')).filter((name) => name.endsWith('.sheet.ts'));
    expect(sheets.length).toBeGreaterThan(0);
    for (const name of sheets) {
      const source = code(join('e2e', 'sheet', name));
      expect(source, `${name} imports login`).toMatch(/import \{[^}]*\blogin\b[^}]*\} from '\.\/login'/);
      expect(source, `${name} calls it`).toMatch(/\blogin\(page\)/);
      expect(source, `${name} does not set a session cookie of its own`).not.toMatch(/addCookies|rc_session/);
    }
    const body = /export async function login\(page: Page\)(?:: Promise<void>)? \{([\s\S]*?)\n\}/.exec(code(join('e2e', 'sheet', 'login.ts')))?.[1] ?? '';
    expect(body.split('\n').map((line) => line.trim()).filter((line) => line !== ''), 'login is: sign in, then the probe').toEqual([
      'await signIn(page);',
      'await assertServerCannotWrite(page.request);',
    ]);
  });

  /* Fails if the config's comment or switch promises reuse without naming what guards it. */
  it('the probe drives the influence route’s DELETE on a self-edge', () => {
    const source = code(join('e2e', 'sheet', 'write-probe.ts'));
    expect(source).toContain('`/api/influences/${PROBE_ID}/${PROBE_ID}`');
  });
});

