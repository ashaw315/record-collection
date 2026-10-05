# Index assertions — specification for the repo script

Implement these as one script (suggested: `scripts/check-index.mjs`) and run it in CI and before any handoff is exported. **The script's exit code is the result.** A report written by whoever edited the index is not.

**Read the status directly.** The script is the last command of its invocation, or its status is captured on the next line (`node scripts/check-index.mjs; s=$?`), and CI asserts on that status, not on a pipeline's. An exit code is evidence only if nothing ran after it: a full test run exited 0 with two failures because a shell `echo` followed the test command, and the failures were found only by reading the summary.

**A check that reports nothing has not run.** Every assertion prints what it examined — files, sections, rows, entries — with counts, and fails if a set it quantifies over is empty: an empty set satisfies every universal claim, which is how 7 and 8a once passed on a file with no withdrawal marks at all. The suite that runs this script fails if any named assertion produced no count, and fails if the script was not invoked: a full test run once reported zero failures while this script, never called by it, exited 1. Skipped tests are listed by name; an unnamed skip is a failure.

## Inputs

| Key | File |
|---|---|
| `H` | `HANDOFF-wall-and-pull.md` |
| `L` | `Record Detail 8a - build target.dc.html` (live) |
| `S` | `Record Detail 8a - settled 1-10.dc.html` (closed, §1–§10) |
| `W` | `Wall and Pull - build target.dc.html` (§W, §W.1–§W.N) |
| `G` | `Nav - build target.dc.html` (§G.1–§G.N, the AppHeader) |
| `M` | `Record Modal - build target.dc.html` (§M.1–§M.N, the record modal) |
| `D` | `WITHDRAWALS.md` (the withdrawal list) |

Read every input as UTF-8. Decode `&rsquo;` → `’` and `&amp;` → `&` before any text comparison.

## Shared definitions

**Heading.** In `L`, `S` and `W`: any `<p …>` whose `style` contains `text-transform:uppercase` and whose text starts with an optional `§`, then a section id, then ` · `.
Section id pattern: `W` | `W\.\d+(\.\d+)?` | `G\.\d+(\.\d+)?` | `M\.\d+(\.\d+)?` | `\d{1,2}(\.\d+)?`. `M` is the record modal's target; its ids are accepted before it is an input, so the first §M citation is read rather than refused.
In `W`, a bare numeric id is prefixed `W.`.
**Never match headings inside `<svg>`**: SVG text holds cell labels like `1 · Cover`.

**Section text.** From a heading to the next heading in the same file, tags stripped, whitespace collapsed.

**Tables in `H`.**
- *Governs table*: lines starting `| §` between `## What each subsection governs` and `## Structural sections`.
- *Pointer table*: lines starting `| §` between `## Structural sections` and `## Build order`.
- A row's **id** is the text after `| §` up to the next space. Its **title** is column 2. Its **pointer column** ("go there for") is column 3 onward, joined back with `|`.

**Build order.** The text between `## Build order` and `## Maintaining`. A **step** is a line matching `^\d+\. `. The **closing paragraph** is the one containing `Every row in the table above`.

**Withdrawal list.** In `D`, the bulleted entries, and only them. Design ships `D` with no comment; the file ends at its last entry. **Nothing in `L`, `S` or `W` marks a withdrawal.** The list lives only in `D`, because a mark written into a target did not survive its export: across eleven exports, the targets carried no withdrawal attribute and no `<span>` at all.

**The bullet grammar.** The source of truth, so it is stated rather than assumed — a parser written from memory matched 0 of 33 bullets and derived an empty comment without a word.

```
- **`ID`**: §S, withdrawn by §BY. WHAT
  > QUOTE
```

- `ID` is `S/slug`, in backticks inside the bold, unique across the list.
- `S` and `BY` are section ids: `\d{1,2}(\.\d+)?`, `W(\.\d+)*`, `G(\.\d+)+` or `M(\.\d+)+`.
- `WHAT` runs from the character after the by-clause's own `. ` to the end of the line and is carried **verbatim** into the entry: its capital, its trailing period, any colon or inner period, and apostrophes straight or curly as written. No assertion reads `WHAT`; it is for people.
- `QUOTE` is the whole of the next line after `> `, verbatim; it is what 6 and 7 compare, so it is never normalised.
- A line beginning `- ` that does not match, or a bullet with no `> ` line after it, **fails the parse loudly** with its line number. An entry is never dropped silently.

Test cases, all of which the grammar must yield unchanged: `31/whole` (a colon and a comma inside `WHAT`), `33/journal-first` (a colon and a curly apostrophe inside `WHAT`), `26/0-78-scale` (a period inside `WHAT`, `0.78`), and `33/three-line-cap` (a straight apostrophe where four other entries use a curly one).

**The machine-readable comment is derived, never authored.** Claude authors only the bulleted entries; `scripts/derive-withdrawals.mjs` rewrites the `<!-- machine-readable: […] -->` comment from them and is idempotent, so it is run first after every drop. The script reads the bullets as the list and **ignores a shipped comment**; assertion 6 fails `6 comment-stale` when the comment in the file disagrees with the bullets, so a hand edit to the comment, or a stale one shipped with a drop, is named rather than trusted. **Why:** the comment is one line of about 8KB of JSON that nobody can read to confirm their own edit, so any claim about it is a report from memory — and one round's report said two entries were fixed while the old comment had been written back unchanged.

**Tag stripping, which is not one rule.** "Tags stripped" decides a pass on its own, so it is stated exactly. **Inline tags — `strong`, `em`, `code`, `a`, `span`, `b`, `i`, `sup`, `sub` — are removed to the EMPTY STRING. Every other tag becomes a single space.** Then whitespace collapses. Measured on this corpus: with inline tags mapped to a space, `26/first-wording-of-placement` reads `a pair in air , because` and its quote scores zero; mapped to empty, every quote matches.

**Declared withdrawal sentence.** A withdrawal sentence in `L`, `S` or `W` **starts at a declared prefix wherever it occurs in a paragraph outside a heading, and runs to its own sentence end** — the first `. `, `? ` or `! ` after the prefix, or the end of its paragraph. It is read from the paragraph's plain text, inside a bold run or not, as assertion 9 reads; a prefix after a semicolon or a colon starts a declared sentence as a run start once did. (Until 1 Oct it had to begin inside a `<strong>` run: the bold was the convention for a reader's eye and, for a round, the detection mechanism, and `28/air-side-at-960`, which sits in a mono caption that takes no bold, was invisible to 7 while 9 saw it. Design ruled the bold-run convention stays for withdrawal sentences in prose and a withdrawal in a caption stays in the caption's type; 7 widened to plain text.) **A run of bold text is not a sentence boundary in either direction:** the sentence may continue past `</strong>`, and one run may hold more than one sentence. The prefixes: `Withdrawn by §`, `Withdrawn in part by §`, `Withdrawn in whole by §`, `Withdrawn within §`, `Superseded by §`, `Superseded in part by §`. They are the author's contract, not a guess: Claude begins every withdrawal sentence with one, and a withdrawal phrased any other way is a defect in the prose. (An earlier reading, "the strong run is the sentence", fails nine of thirty-two on this corpus; this one is what the corpus already satisfies, once two two-sentence quotes were re-cut to one.)

**Live text** is a section's text with every entry's `quote` for that section removed.

**Known limit: a whole-section withdrawal removes one sentence, not the section.** An entry quotes a sentence, so withdrawing a section "in whole" leaves the rest of its body in live text. §31 is withdrawn in whole and most of it is live — correct for a section kept as a record, but it means 8a checks such a section's row figures against retired reasoning. §31's row carries no figures, so nothing is wrong today.

**Stripping for assertion 8.** Remove, in order:
1. Section references: `§W\.\d+(\.\d+)?`, `§W\b`, `§G\.\d+(\.\d+)?`, `§M\.\d+(\.\d+)?`, `§\d+(\.\d+)?`. (§G was missing until 3 Oct, so §G.7's pointer, "held until §G.8 recorded Adam's choice", failed 8b on the 8 of a section reference.)
2. Step references: `steps? \d+` (case-insensitive)
3. Artefact names: `\b[A-Z]\d+[a-z]?\b` (D2, A75) and `\b\d{1,2}[a-z]\b` (5b, 7a, 8a). **Not** `\d+px` or other units: those are figures.

## The ten assertions, 0 to 9, and one not built

Ten are built and numbered 0 to 9. Assertion 8 has two parts, so the script reports eleven ids: 0, 1, 2, 3, 4, 5, 6, 7, 8a, 8b, 9. Assertion 10 is specified below and is NOT BUILT; the script does not run it. Each built assertion prints `PASS n` or `FAIL n` followed by one line per offender, then the script exits non-zero if any failed.

**Every id gets a line, and the last line counts them.** If the run stops before an id (an input missing, a parse refused), the script prints `RUN STOPPED: reason`, then `ABSENT n` for every id it did not reach, and exits non-zero. Every run ends `RESULT: p PASS, f FAIL, a ABSENT of 11`, with ` -- INCOMPLETE` when `a` is not zero. **Why (2 Oct):** the withdrawal parser threw after 5, and the run ended in five PASS lines and a stack trace; to a reader skimming for FAIL, 6 to 9 looked clean. An id with no result is neither a pass nor a failure, and is named as what it is.

0. **The spec is the committed spec.** `scripts/ASSERTIONS-spec.md` is tracked and does not differ from `HEAD`. It was overwritten by three of Design's exports while it lived in `docs/design/`; a stray copy now fails by exit code. Fail: `0 spec-untracked PATH` or `0 spec-modified PATH differs from HEAD`.

1. **Every heading has exactly one row.** Collect heading ids from `L`, `S`, `W`. Count rows by id across both tables in `H`.
   Fail on: a heading with 0 or ≥2 rows (`1 §ID rows=K`), and a row with no heading (`1 §ID no-heading`).

2. **Every governs row is in the build order.** For each governs row id, the build order must contain `§ID` not followed by a digit, or by a full stop and a digit (`(?!\.?\d)`). Until 3 Oct the rule was "not followed by `[\d.]`", which also refused the full stop ending a sentence, so the declaration "No step: §G.7." could not satisfy it.
   Fail: `2 §ID not-in-order`.

3. **Steps run 0 to N, each once, and no done step is absent.** Step numbers must cover 0 to the highest number with no gaps and no duplicates; the last step must come before the closing paragraph; and every step marked done (a bold `Done` or `Built` opening) in `HEAD`'s copy of `H` must still be numbered in the tree's. Prints the tree's step count and the count of done marks read from `HEAD`; fails if the order is empty or `HEAD` cannot be read.
   Fail: `3 missing N`, `3 duplicate N`, `3 step-after-close N`, `3 done-absent N "TEXT"`, `3 empty`, `3 head-unreadable FILE`.
   **Why (1 Oct):** Design's exports replace `H` wholesale, so a step inserted between exports is overwritten without a trace; step 71 was lost that way twice. The earlier form compared each number with its position and named the step after the gap (`3 gap-at 72`), could not tell a duplicate from a gap, and never said the lost step had been done. The done marks are read from `HEAD` because the export that drops a step drops its mark with it.

4. **Cross-file references resolve.** In each file, with tags stripped and the renumbering note at the head of `W` excluded:
   - every `§W.N` in `L`, `S`, `G` or `M` names a heading in `W`;
   - every `§G.N` in `L`, `S`, `W`, `G` or `M` names a heading in `G`;
   - every `§M.N` in `L`, `S`, `W`, `G` or `M` names a heading in `M`;
   - every `§N` with 1 ≤ N ≤ 10 in `L`, `W`, `G` or `M` names a heading in `S`;
   - every `§N` with N ≥ 12 in `S`, `W`, `G` or `M` names a heading in `L`. No upper bound: the live set is `L`'s own headings, and a bound restates them and goes stale each time a section is added (it sat at 32 while §33 and §34 were referenced unchecked).
   Fail: `4 FILE→§REF`.
   **Why the §G clauses (2 Oct):** 4 recognised only W and bare-number shapes, so "Superseded in part by §G.8" in §24 was not a reference to it, and it passed on a section it could not see. In the same run the bullet parser refused the same id with a line number. A check that ignores what it does not understand reports success; every reference shape the targets use is now one 4 reads.

5. **Each row's subject matches its section.** Take the row title, cut it at the first of `( : ; , —`, lowercase, normalise `’`→`'`, collapse whitespace, keep the first 24 characters. It must occur in the same-normalised heading text plus the first 600 characters of the section text.
   Fail: `5 §ID title="…" heading="…"`.

6. **Every entry's quote is in its section.** For each entry, `quote` occurs exactly once in section `s`'s text (tags stripped, entities decoded, whitespace collapsed). Ids are unique. **The list is non-empty and every entry is checked:** print the count, and fail if it is zero.
   **No two quotes for the same section may overlap in its text.** Two entries whose spans share a character each occur exactly once, so the rest of 6 passes and the defect surfaces later as 8a's removed-count falling short. Catch it where it happens.
   **The comment matches the bullets.** The derived JSON must equal the comment in the file, byte for byte after whitespace is collapsed.
   **An entry whose section is in none of the inputs fails as absent, not as a missing quote.** Three states -- absent, broken, working -- because a list with a whole file's entries scoped out would satisfy the count guard (`6 empty` catches an empty set; nothing caught a subset). The settled file's nine entries are the motivating case: if `S` were not in the repo they would be the quarter of the list nobody examined.
   Fail: `6 empty`, `6 duplicate-id ID`, `6 ID section-absent`, `6 ID quote-missing`, `6 ID quote-repeated`, `6 §SEC quote-overlap ID,ID`, or `6 comment-stale`.
   A rewritten withdrawal sentence fails here and names its entry. That is intended: re-quote it in the same edit.

7. **Every declared withdrawal sentence is an entry, one to one.** Each declared sentence in `L`, `S` or `W` — from its prefix to its own sentence end, as defined above — must **equal in full** the `quote` of exactly one entry whose `s` is the sentence's section, and each entry with a prefixed quote must equal exactly one declared sentence. Not a prefix and not a slice: a 40-character slice let 7 pass with an entry deleted, because `4.2/track-minimum` and `4.2/two-track` share their first 40 characters. **An undeclared entry — a quote with no prefix — is legal for one case only: a superseded first wording of the same section, so its `s` equals its `by`** (`26/first-wording-of-placement`, `34/acceptance-against-143`). 7 skips it and 6 checks its quote. Any other undeclared entry fails as `7 ID undeclared`: a ruling withdrawn without a declared sentence is a defect in the prose. **Assert the count of declared sentences is non-zero** and print it beside the entry count.
   Fail: `7 empty`, `7 §SEC unquoted "sentence"`, `7 ID matches-none`, `7 ID matches-many N`, `7 §SEC quoted-twice "sentence"`, or `7 ID undeclared`.
   **`W` is read by 6 and 7 as `L` and `S` are.** The list's scope was two targets from when the wall was a section of one; four declared withdrawals in `W` had entries nowhere and a loop that skipped `W` by name. The comment derivation covers the wall entries like any other (their section ids are `W.n`).
   A section may withdraw its own wording: `s` equal to `by` is valid.
   **What 7 cannot check:** that the text after the prefix names what is withdrawn. That is the author's contract, and a sentence that passes 7 while naming nothing is a defect in the prose.

8. **Figures in rows.**
   - **(a) Live.** (Reads live text as defined above: every entry's quote removed. Assert, per section, that the number of quotes removed equals the number of entries for it, so a section with nothing removed is known to have nothing listed rather than assumed.) For each governs row, strip its columns 2 onward as above, then extract numbers with `\d+(\.\d+)?%?(\s?[×x]\s?\d+(\.\d+)?)?`. Every extracted number (whitespace removed) must occur in the section's live text (whitespace removed).
     Fail: `8a §ID missing=N,N`.
   - **(b) Only pointers.** For each row of the **governs table only** whose id is not on the allow-list, the stripped pointer column (column 3 onward) must contain **no digit at all**. The pointer table has two columns, so it has no pointer column to check; its column 2 is section titles.
     Allow-list: `23`, `W.37`.
     **Guard against a vacuous pass:** fail with `8b empty-column §ID` if any governs row's pointer column is empty after stripping. An earlier version of this clause read both tables, so it checked an empty string for every pointer-table row and passed on all of them, and it carried §4.1 on the allow-list for rows it could not see.
     Fail: `8b §ID tokens=…`.
   The allow-list is the only exemption. Do not add a digit-width or magnitude exemption; that was tried and let through `1 : 1` and `2px`.

9. **Every withdrawal sentence in a target has an entry: the reverse of 6.** Scan every section's plain text in `L`, `S` and `W` for the six declared prefixes, wherever they sit, and take each from its prefix to its own sentence end. A prefix inside quotation marks is an example of the form, not a declaration, and is not counted; the match is case-sensitive. Each sentence must equal the `quote` of an entry for its section. Prints the count of sentences with no entry and the count of sections scanned.
   Fail: `9 §SEC unentered "sentence"`.
   **Report-only by default:** the script lists the offenders and passes; it fails on them only with `--strict-reverse`. A run with offenders is therefore green unless the flag is given, and the offender lines are the result.
   **Why (1 Oct):** 6 checks every entry's quote is in its section, which is one direction only. A sentence in withdrawal form with no entry passed every assertion, which is how §28 and §33 each carried a withdrawal narrowing the Price history solo with nothing filed.

## Assertion 10 — NOT BUILT

**NOT BUILT. The script does not run it, so the no-count rule does not reach it and the suite does not run it.** It was planned as assertion 9; the number went to the reverse check, which was built first, so this is 10. It moves into the numbered list above in the round the quoting pass over the build steps lands.

**Every build step quotes its section.** Input: each numbered step in the handoff's build order. Each step carries `> ` a verbatim clause and names one § or §W section; the clause must occur in that section's live text (outside any withdrawn passage, per 8a). Prints the count of steps checked; fails if zero. Fail: `10 STEP no-quote`, `10 STEP not-in-§SEC`. Motivated by three stale steps in one round — 29(a)'s two-line cap and 24px, 29(d)'s "else note", §33's row — that no assertion read.

## Changing this spec

Add an assertion only with the defect that motivated it, recorded in `H`'s "Maintaining this file". Change an allow-list only in this file, never in the script alone.
