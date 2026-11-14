import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A migration Code pushes only creates (Adam's ruling, 14 Nov, option A).** "If a migration only creates new things,
 * you push it. If it touches anything that already exists, Adam pushes it." Vercel's build runs `drizzle-kit migrate`
 * against production on every deploy, so a pushed migration is a production write. This is the bright line as a text
 * property of the SQL, not a judgement of its effect: every statement is a CREATE (never CREATE OR REPLACE) or an
 * ALTER TABLE … ADD COLUMN of a nullable column. A new table's own foreign keys and constraints, which Drizzle writes as
 * ALTER TABLE … ADD CONSTRAINT, and its NOT NULL columns pass only where the same migration creates that table: no row
 * exists for them to touch. Anything else fails, naming the statement and saying the migration is Adam's to push.
 *
 * Migrations through 0035 are in production already and are not judged; 0035 was additive and falls inside the line.
 */
const DIR = 'drizzle';
const JUDGED_FROM = 36;

/** The statements of a migration: Drizzle's breakpoints, comment lines dropped. A hand-written file with none is one statement. */
export function statementsOf(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').trim())
    .filter((s) => s !== '');
}

/** The statements that cross the line, each with why. */
export function crossings(sql: string): string[] {
  const statements = statementsOf(sql);
  const created = new Set(statements.map((s) => /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?([a-z_]+)"?/i.exec(s)?.[1]).filter((t): t is string => t !== undefined));
  const out: string[] = [];
  for (const s of statements) {
    const one = s.replace(/\s+/g, ' ');
    if (/^CREATE OR REPLACE\b/i.test(one)) { out.push(`replaces what exists: ${one}`); continue; }
    if (/^CREATE\b/i.test(one)) continue;
    const alter = /^ALTER TABLE (?:ONLY )?"?([a-z_]+)"? ADD (COLUMN|CONSTRAINT)\b/i.exec(one);
    if (alter !== null) {
      const ownTable = created.has(alter[1]);
      if (alter[2].toUpperCase() === 'CONSTRAINT' && !ownTable) { out.push(`a constraint on an existing table: ${one}`); continue; }
      if (alter[2].toUpperCase() === 'COLUMN' && /\bNOT NULL\b/i.test(one) && !ownTable) { out.push(`a NOT NULL column on an existing table: ${one}`); continue; }
      if (/;\s*\S/.test(one)) { out.push(`more than one statement in a breakpoint: ${one}`); continue; }
      continue;
    }
    out.push(`not a CREATE or an ADD COLUMN: ${one}`);
  }
  return out;
}

const migrations = () => readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

describe('the migrations Code may push', () => {
  it('passes a new table with its own key, check and foreign key, a new index, a new type and a nullable column', () => {
    expect(crossings(readFileSync(join(DIR, '0035_red_punisher.sql'), 'utf8')), '0035, the matched text, as committed').toEqual([]);
    expect(crossings('CREATE INDEX "x" ON "records" ("title");--> statement-breakpoint\nCREATE TYPE "public"."k" AS ENUM(\'a\');--> statement-breakpoint\nALTER TABLE "records" ADD COLUMN "mood" text;')).toEqual([]);
  });

  it('fails a drop, a type change, a SET NOT NULL, a rename, a row rewrite, a replace, and a constraint or NOT NULL column on an existing table', () => {
    for (const sql of [
      'DROP TABLE "record_moods";',
      'ALTER TABLE "records" DROP COLUMN "snippet";',
      'ALTER TABLE "records" ALTER COLUMN "title" SET DATA TYPE varchar(80);',
      'ALTER TABLE "records" ALTER COLUMN "notes" SET NOT NULL;',
      'ALTER TABLE "records" RENAME COLUMN "notes" TO "remarks";',
      'UPDATE "records" SET "notes" = NULL;',
      'TRUNCATE "record_moods";',
      'CREATE OR REPLACE FUNCTION touch() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;',
      'ALTER TABLE "records" ADD CONSTRAINT "c" CHECK ("title" <> \'\');',
      'ALTER TABLE "records" ADD COLUMN "rank" integer NOT NULL DEFAULT 0;',
    ]) expect(crossings(sql).length, sql).toBe(1);
  });

  it('reads the real files: a migration in production that crossed the line is caught, though it is not judged', () => {
    const dropped = migrations().find((f) => f.startsWith('0033_'));
    expect(dropped, 'the precondition: 0033 is in the folder').toBeDefined();
    expect(crossings(readFileSync(join(DIR, dropped ?? ''), 'utf8')).length, '0033 adds NOT NULL columns to an existing table').toBeGreaterThan(0);
  });

  it('finds every migration from 0036 on inside the line, or says it is Adam’s to push', () => {
    const judged = migrations().filter((f) => Number(f.slice(0, 4)) >= JUDGED_FROM);
    const found = judged.flatMap((f) => crossings(readFileSync(join(DIR, f), 'utf8')).map((c) => `${f}: ${c}`));
    expect(found, 'these touch what exists, so the migration is Adam’s to push: Code does not push it (Adam, 14 Nov)').toEqual([]);
  });
});
