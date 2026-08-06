/**
 * Escapes the LIKE/ILIKE metacharacters in a user-supplied search term.
 *
 * `q` is a SUBSTRING to look for, not a pattern the caller gets to write. It
 * was interpolated straight into `%${q}%`, so `q=%` matched every row and
 * `q=_h` matched 'Why' — the search silently returned non-matches and reported
 * a 200, which reads as "the search is bad at its job" rather than as a bug.
 *
 * This is a correctness fix, not an injection fix: the value is already a bound
 * parameter, so no SQL is being constructed from it. What leaks is PATTERN
 * SYNTAX, not SQL.
 *
 * The backslash MUST be escaped first, or escaping the others would double-
 * escape the backslashes this function itself introduces.
 *
 * Postgres's default LIKE escape character is the backslash, so no ESCAPE
 * clause is needed alongside this. Note `standard_conforming_strings` is `on`
 * by default (verified against the test database), which is what makes a single
 * backslash in a bound parameter arrive as one backslash rather than being
 * consumed by the string literal parser.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}
