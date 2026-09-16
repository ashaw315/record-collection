import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **Every field of `PageRecord` is rendered by something.**
 *
 * `imageCount` was declared in the type, filled by the route, carried by the
 * probe's fixtures — and never read by a component. For two days the frame
 * showed no image count while §9.4's ground for marking Images said it did,
 * and nothing failed: a type does not complain about a field nobody reads, and
 * a route does not complain about passing one.
 *
 * A field with no consumer is a claim the page makes to the type system and
 * not to the reader. This finds the next one at the moment it is added.
 */

const TYPE_FILE = 'src/app/records/[id]/RecordPage8a.tsx';

/** Where a PageRecord field may legitimately be consumed. */
const CONSUMERS = [
  'src/app/records/[id]/RecordPage8a.tsx',
  'src/app/records/[id]/IdentityCell.tsx',
];

function pageRecordFields(): string[] {
  const source = readFileSync(TYPE_FILE, 'utf8');
  const start = source.indexOf('export type PageRecord = {');
  const end = source.indexOf('\n};', start);
  const body = source.slice(start, end);

  return [...body.matchAll(/^\s{2}([a-zA-Z]+)\??:/gm)].map((match) => match[1]);
}

describe('PageRecord has no field without a consumer', () => {
  it('finds the fields', () => {
    const fields = pageRecordFields();
    expect(fields.length, 'the type was located').toBeGreaterThan(10);
    expect(fields).toContain('imageCount');
  });

  it.each(pageRecordFields())('renders %s somewhere', (field) => {
    /*
      A read is `record.<field>` in a consumer, outside the type declaration.
      The declaration line itself is excluded by requiring the `record.` prefix,
      which the type body never has.
    */
    const reads = CONSUMERS.map((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(new RegExp(`record\\.${field}\\b`, 'g'))].length;
    }).reduce((sum, n) => sum + n, 0);

    expect(reads, `record.${field} is read by a component`).toBeGreaterThan(0);
  });
});
