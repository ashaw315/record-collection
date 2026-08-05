import { describe, expect, it } from 'vitest';
import { parseListParams } from './query-params';

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
