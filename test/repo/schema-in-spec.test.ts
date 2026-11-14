import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **Every table the schema declares is named in SPEC.md §4 (the coordinator, 14 Nov).** CLAUDE.md §7: "Every schema
 * change is a Drizzle migration", and §3 asks whether §4 already specifies a change. Q22 shipped `record_embeddings`
 * with a migration and no §4 entry on 11 Nov, and it was found by chance on 14 Nov. This reads the schema's tables
 * and §4's text, so a table with no entry fails on the day it is added.
 */
const SCHEMA = 'src/db/schema.ts';

/*
  The tables the check found on its first run, 14 Nov, with no §4 entry: two named nowhere in SPEC.md, two named only
  outside §4 (§10's MusicBrainz and the stats retirement). Listed so the check holds from today rather than waiting on
  four SPEC entries; the list may only shrink, so writing an entry fails until its name is taken off.
*/
const KNOWN_UNSPECIFIED = ['discogs_release_text', 'pressing_assessments', 'genre_parent_rejections', 'artist_derived_acts'];

/** The names passed to `pgTable(`, as the schema writes them. */
export function schemaTables(source: string): string[] {
  return [...source.matchAll(/pgTable\(\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]);
}

/** §4's text: from its heading to §5's. */
export function sectionFour(spec: string): string {
  const start = spec.search(/^## 4\. Schema/m);
  const end = spec.search(/^## 5\./m);
  if (start < 0 || end < start) throw new Error('SPEC.md has no §4 between "## 4. Schema" and "## 5."');
  return spec.slice(start, end);
}

/** A table is named when §4 writes it as code, `name`, or as a table row's first cell. */
export function unnamed(tables: string[], section: string): string[] {
  return tables.filter((t) => !section.includes(`\`${t}\``) && !new RegExp(`^\\|\\s*${t}\\s*\\|`, 'm').test(section));
}

describe('the schema’s tables against SPEC §4', () => {
  it('reads the tables from pgTable calls and §4 between its heading and §5’s', () => {
    expect(schemaTables("export const a = pgTable('artists', {});\nconst b = pgTable(\n  'record_moods',\n  {})")).toEqual(['artists', 'record_moods']);
    expect(sectionFour('## 3. X\n`gone`\n## 4. Schema\n`kept`\n## 5. API\n`after`')).toBe('## 4. Schema\n`kept`\n');
  });

  it('names a table §4 does not mention, and passes one it writes as code', () => {
    expect(unnamed(['artists', 'record_embeddings'], '## 4. Schema\n**`artists`**: the people.\n')).toEqual(['record_embeddings']);
  });

  it('finds every table in src/db/schema.ts named in SPEC.md §4', () => {
    const tables = schemaTables(readFileSync(SCHEMA, 'utf8'));
    expect(tables.length, 'the precondition: the schema’s tables are read').toBeGreaterThanOrEqual(30);
    const missing = unnamed(tables, sectionFour(readFileSync('SPEC.md', 'utf8')));
    expect(missing.filter((t) => !KNOWN_UNSPECIFIED.includes(t)), 'tables the schema declares and SPEC §4 does not name').toEqual([]);
    expect(KNOWN_UNSPECIFIED.filter((t) => !missing.includes(t)), 'listed as unspecified but now named in §4 or gone: take them off the list').toEqual([]);
  });
});
