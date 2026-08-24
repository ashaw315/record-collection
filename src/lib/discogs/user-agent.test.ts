import { describe, expect, it } from 'vitest';
import { buildUserAgent } from './user-agent';

/**
 * §6 requires a descriptive User-Agent — "Discogs rejects requests without one"
 * — and its purpose is to give Discogs somewhere to look when they want to talk
 * to whoever is making the requests.
 *
 * R6 found the header read
 * `RecordCollection/0.1 +https://github.com/adamshaw/record-collection` and that
 * that URL returns 404: the remote is `ashaw315/record-collection`. Measured
 * both, 404 against 200. So the header named nobody, which is the one thing it
 * exists not to do.
 */
describe('buildUserAgent', () => {
  it('carries the app name and version', () => {
    expect(buildUserAgent('https://example.test/x')).toMatch(/^RecordCollection\/\d/);
  });

  it('carries the contact so Discogs has somewhere to look', () => {
    expect(buildUserAgent('https://example.test/x')).toContain('https://example.test/x');
  });

  /**
   * The defect itself, pinned. This fails against the literal R6 found.
   */
  it('does not point at the 404 path', () => {
    expect(buildUserAgent()).not.toContain('adamshaw/record-collection');
  });

  it('falls back to the real repository when no contact is configured', () => {
    // Optional rather than required: §6 wants a descriptive header, and a
    // missing env var must not block a deploy over a value that has a correct
    // default. The default must be a URL that RESOLVES.
    expect(buildUserAgent()).toContain('https://github.com/ashaw315/record-collection');
  });

  it('is never empty, because createDiscogsClient refuses an empty one', () => {
    expect(buildUserAgent('').trim()).not.toBe('');
    expect(buildUserAgent('   ').trim()).not.toBe('');
  });

  it('ignores a whitespace-only override rather than emitting a dangling +', () => {
    expect(buildUserAgent('   ')).toBe(buildUserAgent());
  });
});
