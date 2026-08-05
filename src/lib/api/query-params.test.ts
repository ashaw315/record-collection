import { describe, expect, it } from 'vitest';
import { MAX_PAGE, MAX_PAGE_SIZE, parseListParams } from './query-params';

/**
 * SPEC.md §5: list endpoints accept ?page=1&pageSize=50&sort=field:asc|desc.
 * pageSize is capped at 200 — larger values are CLAMPED, not rejected — and
 * sort accepts only the fields enumerated per endpoint, rejecting anything else
 * with 400 rather than interpolating it into SQL.
 *
 * The allowlist is the security boundary for the sort parameter. These tests
 * are written to fail if it is ever reduced to "reject a few known-bad strings"
 * rather than "accept only these exact fields", because the former passes a
 * naive test suite while still allowing injection.
 */

const SORTABLE = ['name', 'createdAt'] as const;

function parse(search: string) {
  return parseListParams(new URL(`https://x.test/api/tags${search}`).searchParams, SORTABLE);
}

describe('parseListParams — pagination', () => {
  it('defaults to page 1, pageSize 50 when absent', () => {
    const result = parse('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.page).toBe(1);
    expect(result.value.pageSize).toBe(50);
  });

  it('clamps pageSize above 200 rather than rejecting it', () => {
    const result = parse('?pageSize=5000');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pageSize).toBe(200);
  });

  it('clamps pageSize exactly at the 200 boundary', () => {
    const result = parse('?pageSize=200');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pageSize).toBe(200);
  });

  it('computes offset from page and pageSize', () => {
    const result = parse('?page=3&pageSize=25');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.offset).toBe(50);
  });

  it('rejects page 0 and negative pages', () => {
    for (const search of ['?page=0', '?page=-1']) {
      const result = parse(search);
      expect(result.ok, `${search} should be rejected`).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors.page).toBeDefined();
    }
  });

  it('rejects a non-numeric page or pageSize', () => {
    for (const [search, field] of [
      ['?page=abc', 'page'],
      ['?pageSize=abc', 'pageSize'],
      ['?page=1.5', 'page'],
    ] as const) {
      const result = parse(search);
      expect(result.ok, `${search} should be rejected`).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors[field]).toBeDefined();
    }
  });

  it('rejects pageSize 0 — a page of nothing is a client bug, not a clamp case', () => {
    const result = parse('?pageSize=0');
    expect(result.ok).toBe(false);
  });
});

/**
 * The existing pagination tests covered only page=0 and page=-1. The high end
 * was unbounded: `/^\d+$/` accepts any run of digits, `Number()` silently loses
 * precision past 2^53, and the resulting `5e+21` reached Postgres, which
 * rejected it with 22P02. Before unit A that escaped as an unshaped 500
 * carrying the entire SQL statement.
 *
 * A client error must be a 400, and it must be refused BEFORE the query — an
 * offset is not something to discover is invalid at the database.
 */
describe('parseListParams — page upper bound', () => {
  it('rejects the value that previously reached SQL as 5e+21', () => {
    const result = parse('?page=99999999999999999999');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.page).toBeDefined();
  });

  it('rejects a page beyond MAX_PAGE', () => {
    const result = parse(`?page=${MAX_PAGE + 1}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.page).toBeDefined();
  });

  it('accepts a page exactly at MAX_PAGE', () => {
    // The boundary is inclusive, and asserting both sides is what stops the
    // bound being silently tightened to something arbitrary later.
    const result = parse(`?page=${MAX_PAGE}`);
    expect(result.ok).toBe(true);
  });

  it('rejects every value past the safe-integer boundary', () => {
    // Number.MAX_SAFE_INTEGER + 1 and beyond cannot round-trip through a JS
    // number, so a value that merely "looks numeric" is not enough.
    for (const raw of [
      '9007199254740992', // 2^53, first unsafe integer
      '9007199254740993',
      '10000000000000000000',
      '99999999999999999999',
      '1'.repeat(40),
    ]) {
      const result = parse(`?page=${raw}`);
      expect(result.ok, `page=${raw} must be rejected`).toBe(false);
    }
  });

  it('rejects an out-of-range pageSize rather than clamping it', () => {
    // pageSize clamps (§5), but clamping presumes a real number. An unsafe
    // integer is a malformed request, not a large one, so it is refused rather
    // than silently becoming 200.
    const result = parse('?pageSize=99999999999999999999');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.pageSize).toBeDefined();
  });

  it('rejects an unsafe integer even where a range check would not catch it', () => {
    // MAX_PAGE and Number.isSafeInteger are independent guards, and this
    // isolates the second. pageSize has no upper *rejection* bound — it clamps
    // (§5) — so without the safe-integer check, pageSize=9007199254740993 is
    // silently clamped to 200 and the request looks perfectly valid. The digit
    // regex alone cannot tell those apart.
    const result = parse('?pageSize=9007199254740993');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.pageSize).toBeDefined();
  });

  it('reports the precision failure on the field that carried it', () => {
    // page and pageSize must each name themselves, so a client can tell which
    // parameter to fix rather than being told "something was wrong".
    const pageResult = parse('?page=9007199254740993&pageSize=50');
    expect(pageResult.ok).toBe(false);
    if (pageResult.ok) return;
    expect(pageResult.fieldErrors.page).toBeDefined();
    expect(pageResult.fieldErrors.pageSize).toBeUndefined();
  });

  it('produces an offset that stays a safe integer at the bound', () => {
    // page * pageSize is the value that actually reaches SQL. The bound is only
    // meaningful if the product it permits is still exactly representable.
    const result = parse(`?page=${MAX_PAGE}&pageSize=${MAX_PAGE_SIZE}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isSafeInteger(result.value.offset)).toBe(true);
  });
});

describe('parseListParams — sort allowlist', () => {
  it('defaults to no sort when absent', () => {
    const result = parse('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sort).toBeUndefined();
  });

  it('accepts an allowlisted field with an explicit direction', () => {
    const result = parse('?sort=name:desc');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sort).toEqual({ field: 'name', direction: 'desc' });
  });

  it('defaults direction to asc when omitted', () => {
    const result = parse('?sort=name');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sort).toEqual({ field: 'name', direction: 'asc' });
  });

  it('accepts every field the endpoint enumerates', () => {
    for (const field of SORTABLE) {
      const result = parse(`?sort=${field}:asc`);
      expect(result.ok, `${field} should be sortable`).toBe(true);
    }
  });

  it('rejects a field that is not on the allowlist', () => {
    // `id` is a real column and would sort fine — it is rejected because it is
    // not enumerated, which is the distinction between an allowlist and a
    // blocklist.
    const result = parse('?sort=id:asc');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.sort).toBeDefined();
  });

  it('rejects a SQL injection payload in the sort field', () => {
    const payloads = [
      'name; DROP TABLE tags--',
      'name)) UNION SELECT null--',
      "name' OR '1'='1",
      '(SELECT 1)',
      'tags.name',
    ];
    for (const payload of payloads) {
      const result = parse(`?sort=${encodeURIComponent(payload)}`);
      expect(result.ok, `${payload} must be rejected`).toBe(false);
    }
  });

  it('rejects an invalid direction rather than silently defaulting it', () => {
    // Silently coercing `name:sideways` to asc would hide a client bug and,
    // worse, would mean the direction string is not being validated either.
    for (const search of ['?sort=name:sideways', '?sort=name:asc;--', '?sort=name:']) {
      const result = parse(search);
      expect(result.ok, `${search} should be rejected`).toBe(false);
    }
  });

  it('rejects a sort with more than one colon-separated part', () => {
    const result = parse('?sort=name:asc:extra');
    expect(result.ok).toBe(false);
  });

  it('is case-sensitive on the field name', () => {
    // Accepting `NAME` would mean the comparison is not an identity check
    // against the allowlist, which is how normalization bugs let payloads slip.
    const result = parse('?sort=NAME:asc');
    expect(result.ok).toBe(false);
  });

  it('returns the field as one of the allowlisted literals, not the raw input', () => {
    // The returned value is what reaches the query builder. It must be a value
    // the caller enumerated, so that even a parser bug cannot emit free text.
    const result = parse('?sort=name:asc');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(SORTABLE).toContain(result.value.sort?.field);
  });
});
