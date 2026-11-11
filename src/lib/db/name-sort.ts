import 'server-only';
import { sql, type Column, type SQL } from 'drizzle-orm';

/**
 * **§T.4, the name sort key (Table and Grid card; Adam, 10 Nov; Design, 11 Nov).** "Wherever a record is put in order
 * by its artist or its title, it is ordered by a key that drops a leading “The” followed by a space, and compares the
 * rest without regard to case; the name drawn is never changed."
 *
 * The articles are one list, so an answer about one changes one entry: Adam looks for A Tribe Called Quest under A, so
 * "A" and "An" left it on 11 Nov and only "The" is dropped. The space is the test: "Theatre Of Hate" keeps its word.
 * A name in another language keeps its first word ("Die", "Le", "La" are as often the name as an article).
 */
export const ARTICLES = ['The'] as const;

const LEADING_ARTICLE = `^(${ARTICLES.join('|')}) `;

/**
 * The key as one Drizzle SQL fragment, used in ORDER BY only: the article dropped, case-insensitively ("the doors" and
 * "The Doors" compare equal), then the rest lowered. One fragment rather than a copy per query, so the table, the
 * sheet, the shelf and the Manage lists cannot order a name differently. No expression index backs it, deliberately:
 * the collection is a few hundred rows and every list is page-bounded, so an index would be a migration spent on a
 * problem nobody has measured (CLAUDE.md §4).
 */
export function nameSortKey(name: Column | SQL): SQL {
  return sql`lower(regexp_replace(${name}, ${LEADING_ARTICLE}, '', 'i'))`;
}
