import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from './like';

/**
 * Unit-level counterpart to the integration tests in records-list.test.ts.
 *
 * Those prove the endpoint no longer treats `q` as a pattern; these pin the
 * function's exact output, which is what the ordering bug below would break
 * without changing any endpoint result the integration tests happen to cover.
 */
describe('escapeLikePattern', () => {
  it('escapes the percent wildcard', () => {
    expect(escapeLikePattern('%')).toBe('\\%');
  });

  it('escapes the underscore wildcard', () => {
    expect(escapeLikePattern('_')).toBe('\\_');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLikePattern('\\')).toBe('\\\\');
  });

  /**
   * The ordering defect this function is most likely to have: escaping `%` and
   * `_` first, THEN backslashes, double-escapes the backslashes just inserted
   * and turns `%` into a literal backslash followed by a live wildcard.
   *
   * Asserted on a string containing all three, because escaping each in
   * isolation passes under either order.
   */
  it('does not double-escape when a backslash and a wildcard appear together', () => {
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
    expect(escapeLikePattern('a\\_b%c')).toBe('a\\\\\\_b\\%c');
  });

  it('leaves an ordinary term untouched', () => {
    expect(escapeLikePattern('Hear Nothing')).toBe('Hear Nothing');
  });

  it('leaves other regex-special characters alone, since LIKE does not use them', () => {
    // `.` and `*` are regex metacharacters, not LIKE ones. Escaping them would
    // make a title containing them unfindable.
    expect(escapeLikePattern('R.E.M. *')).toBe('R.E.M. *');
  });
});
