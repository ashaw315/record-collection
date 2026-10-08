import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
