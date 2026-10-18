
HANDOFF-wall-and-pull.md: 0 removed, 0 reworded, 16 added
  [The nav target, §G › Unnumbered, for Code to number — ring-144's two cases.]
  ADDED    154. Done: built; tests only, not a design step.
  ADDED    §T.4 and §T.5 — the tie-break's tests named for what they check.
  ADDED    Step 153's second test was named for every other order and checked only Release year, and its fixture could not tell year from title or reach an undated record.
  ADDED    Six records whose ids run against the expected order, each tie-break level separated by one of them; the orders checked are Genre both ways, Artist, Date bought, Price, Year, and Title through two records of one name.
  ADDED    Green first, the behaviour existing, then each level taken out in turn and watched failing.
  ADDED    Step level; the fixture is the test's own.
  ADDED    155. Done: built; Adam's request, Design's §T.4.
  ADDED    §T.4 — the Genre column.
  ADDED    It was previewed first against Design's proposed width, on a branch, so Adam could see the table at the 1054 fork with his own titles; he kept the column, and the width ruling (T.4/genre-to-content) followed.
  ADDED    Immediately after Record, 96 wide wherever it draws with its 16 of padding inside, so names wrap at their own spaces within 80, and Record takes the rest: 173 at the fork, from 269, the fork itself unmoved, since Genre takes its 96 at 768 and above the fork alike.
  ADDED    A row shows its top-level genres, the roots the Genre order reads, each once and alphabetical; each genre is its own element with the spaced middle dot drawn between them by the table's stylesheet, so the separator never enters the text and no genre's name can collide with it (Folk, World, & Country holds commas, Funk / Soul a slash; none of the 42 holds a dot).
  ADDED    The header is the Genre order's sort control.
  ADDED    Below 768 the genres leave with Label and set first on the row's second line.
  ADDED    A record with none leaves the cell empty.
  ADDED    The list route's rows carry the names.
  ADDED    Tests first, each red on the table as built: the list route, six component tests, and genre-column-155 on both projects; old pins moved with the ruling, table-98's headers and the fork's constants.

Table and Grid - build target.dc.html: 1 removed, 2 reworded, 9 added
  REMOVED  Record still takes the slack, so the Genre column’s width comes out of Record’s.
  was      Its place: immediately after Record, beside the identity it describes, left-aligned in the table’s 13 type and set to its content.
  now      Its place: immediately after Record, beside the identity it describes, left-aligned in the table’s 13 type.
  was      Where its names exceed the column, the cell wraps, and the row grows, as §T.4’s rows are at least 44 and as tall as their content.
  now      The row grows with its wraps, as §T.4’s rows are at least 44 and as tall as their content.
  [T.4 · The table › The Record column, title and artist, takes the table’s slack,]
  ADDED    Withdrawn within §T.4: the Genre column set to its content.
  ADDED    Sized by content, its longest cell would have pushed Record under its 128 floor at the 1054 fork, or cleared it by 1.6 on today’s collection alone, which a later genre would end.
  ADDED    It was carried in the drop Code built from, so the entry is owed.
  ADDED    The Genre column is 96 wide wherever it draws, its cell’s 16 of padding included, so 80 of content, and Record takes everything else.
  ADDED    Adam kept the column from the preview.
  ADDED    The width is stated, not measured from content, so Record taking the slack holds by construction, and adding a record cannot push it under its floor.
  ADDED    At the fork Record is about 173, which Code’s figures give with the padding counted inside the 96.
  ADDED    Each genre is its own element, with the dot drawn only between names, so the names wrap at their own spaces and a wrapped name reads as one name continuing.
  ADDED    A single word wider than the 80 of content breaks within itself, a rare fallback, since today’s longest word, Experimental, is 72.5.

WITHDRAWALS.md: 0 removed, 0 reworded, 3 added
  [The table and grid]
  ADDED    `T.4/genre-to-content`: §T.4, withdrawn by §T.4.
  ADDED    The Genre column sized to its content; it is a stated 96, padding included, and Record takes the rest.
  ADDED    Withdrawn within §T.4: the Genre column set to its content.

1 removed outright (sentences and steps). 28 sentences added, to be read against what Design said the drop holds. Compared the working tree with c0c35d6.

## Read against the message

The reviewer's notes of 18 Oct: the width ruling filed as T.4/genre-to-content, the ruling once in the target, "set to its content" surviving only inside the withdrawal sentence, bold 422/422. All are what the files hold. The ruling is the message's sentence word for word: 96 wide wherever it draws, its cell's 16 of padding included, so 80 of content, and Record takes everything else. The sentence removed outright, "Record still takes the slack, so the Genre column's width comes out of Record's", and the two reworded ones (the place without "set to its content"; the row growing with its wraps) are the withdrawn wording; the replacing sentences say Adam kept the column from the preview, that Record taking the slack holds by construction, Record about 173 at the fork, and one thing the branch did not yet build: "A single word wider than the 80 of content breaks within itself." That follows as its own fix, test first. The withdrawal pairs (7: 220 paired, from 219). WITHDRAWALS.md came without its derived comment, regenerated (222 entries). **The wall target did not arrive with these.**

Taken in with this intake, the branch's records corrected to the ruling: the NOTES entry that opened "PREVIEW ONLY" is replaced by one giving the history (previewed against a proposal, kept, then ruled); the comments in the code and specs that called the width a proposal now cite §T.4 and T.4/genre-to-content; step blocks 154 and 155 added to the handoff. The preview commit's message, which says the same false thing, is left in the branch and kept out of main by a squash merge.

Index 13 PASS. Assertion 12 unchanged at 23 calls: 4 named, 8 new rulings, 11 unnamed, 0 phrase, 4 draft fixes.
