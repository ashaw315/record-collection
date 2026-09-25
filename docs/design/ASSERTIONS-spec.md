# Index assertions — specification for the repo script

Implement these as one script (suggested: `scripts/check-index.mjs`) and run it in CI and before any handoff is exported. **The script's exit code is the result.** A report written by whoever edited the index is not.

**Read the status directly.** The script is the last command of its invocation, or its status is captured on the next line (`node scripts/check-index.mjs; s=$?`), and CI asserts on that status, not on a pipeline's. An exit code is evidence only if nothing ran after it: a full test run exited 0 with two failures because a shell `echo` followed the test command, and the failures were found only by reading the summary.

## Inputs

| Key | File |
|---|---|
| `H` | `HANDOFF-wall-and-pull.md` |
| `L` | `Record Detail 8a - build target.dc.html` (live, §12–§32) |
| `S` | `Record Detail 8a - settled 1-10.dc.html` (closed, §1–§10) |
| `W` | `Wall and Pull - build target.dc.html` (§W, §W.1–§W.N) |
| `D` | `WITHDRAWALS.md` (the withdrawal list) |

Read all four as UTF-8. Decode `&rsquo;` → `’` and `&amp;` → `&` before any text comparison.

## Shared definitions

**Heading.** In `L`, `S` and `W`: any `<p …>` whose `style` contains `text-transform:uppercase` and whose text starts with an optional `§`, then a section id, then ` · `.
Section id pattern: `W` | `W\.\d+(\.\d+)?` | `\d{1,2}(\.\d+)?`.
In `W`, a bare numeric id is prefixed `W.`.
**Never match headings inside `<svg>`**: SVG text holds cell labels like `1 · Cover`.

**Section text.** From a heading to the next heading in the same file, tags stripped, whitespace collapsed.

**Tag stripping, which is not one rule.** "Tags stripped" decides a pass on its own, so it is stated exactly. **Inline tags — `strong`, `em`, `code`, `a`, `span`, `b`, `i`, `sup`, `sub` — are removed to the EMPTY STRING. Every other tag becomes a single space.** Then whitespace collapses.

The distinction is load-bearing and was measured on this corpus: with inline tags mapped to a space, `26/first-wording-of-placement` reads `a pair in air , because` — a space before the comma, where the prose closes a `<em>` mid-sentence — and its quote scores zero occurrences. With inline tags mapped to empty, all 27 quotes match. The same file yields both results depending only on this choice, so it belongs here rather than in the script.

**Tables in `H`.**
- *Governs table*: lines starting `| §` between `## What each subsection governs` and `## Structural sections`.
- *Pointer table*: lines starting `| §` between `## Structural sections` and `## Build order`.
- A row's **id** is the text after `| §` up to the next space. Its **title** is column 2. Its **pointer column** ("go there for") is column 3 onward, joined back with `|`.

**Build order.** The text between `## Build order` and `## Maintaining`. A **step** is a line matching `^\d+\. `. The **closing paragraph** is the one containing `Every row in the table above`.

**Withdrawal list.** In `D`, the JSON array in the `<!-- machine-readable: […] -->` comment. Each entry is `{"id", "s", "by", "what", "quote"}`. `id` is `s/slug` and is unique across the list; `quote` is verbatim text from section `s`. **Nothing in `L`, `S` or `W` marks a withdrawal.** The list lives only in `D`, because a mark written into a target did not survive its export: across eleven exports, the targets carried no withdrawal attribute and no `<span>` at all.

**Declared withdrawal sentence.** A withdrawal sentence in `L` or `S` begins with one of these prefixes, as the first text of a `<strong>` run outside a heading: `Withdrawn by §`, `Withdrawn in part by §`, `Withdrawn in whole by §`, `Withdrawn within §`, `Superseded by §`, `Superseded in part by §`. The prefixes are the author's contract, not a guess: Claude begins every withdrawal sentence with one, and a withdrawal phrased any other way is a defect in the prose.

**Live text** is a section's text with every entry's `quote` for that section removed.

**Known limit: a whole-section withdrawal removes one sentence, not the section.** An entry quotes a sentence, so withdrawing a section "in whole" leaves the rest of its body in live text. §31 is withdrawn in whole and most of it is live. That is correct for a section kept as a record — the reasoning stays readable — but it means assertion 8a checks such a section's row figures against retired reasoning. §31's row carries no figures, so nothing is wrong today. If a whole-withdrawn section's row ever gains one, 8a will check it against text the file has retired, and the answer is a whole-section form of entry rather than a change to 8a.

**Stripping for assertion 8.** Remove, in order:
1. Section references: `§W\.\d+(\.\d+)?`, `§W\b`, `§\d+(\.\d+)?`
2. Step references: `steps? \d+` (case-insensitive)
3. Artefact names: `\b[A-Z]\d+[a-z]?\b` (D2, A75) and `\b\d{1,2}[a-z]\b` (5b, 7a, 8a). **Not** `\d+px` or other units: those are figures.

## The eight assertions

Each prints `PASS n` or `FAIL n` followed by one line per offender, then the script exits non-zero if any failed.

1. **Every heading has exactly one row.** Collect heading ids from `L`, `S`, `W`. Count rows by id across both tables in `H`.
   Fail on: a heading with 0 or ≥2 rows (`1 §ID rows=K`), and a row with no heading (`1 §ID no-heading`).

2. **Every governs row is in the build order.** For each governs row id, the build order must contain `§ID` not followed by `[\d.]`.
   Fail: `2 §ID not-in-order`.

3. **Steps are contiguous.** Step numbers in order must equal 0, 1, 2, …; the last step must come before the closing paragraph.
   Fail: `3 gap-at N` or `3 step-after-close N`.

4. **Cross-file references resolve.** In each file, with tags stripped and the renumbering note at the head of `W` excluded:
   - every `§W.N` in `L` or `S` names a heading in `W`;
   - every `§N` with 1 ≤ N ≤ 10 in `L` or `W` names a heading in `S`;
   - every `§N` with 12 ≤ N ≤ 32 in `S` or `W` names a heading in `L`.
   Fail: `4 FILE→§REF`.

5. **Each row's subject matches its section.** Take the row title, cut it at the first of `( : ; , —`, lowercase, normalise `’`→`'`, collapse whitespace, keep the first 24 characters. It must occur in the same-normalised heading text plus the first 600 characters of the section text.
   Fail: `5 §ID title="…" heading="…"`.

6. **Every entry's quote is in its section.** For each entry, `quote` occurs exactly once in section `s`'s text (tags stripped, entities decoded, whitespace collapsed). Ids are unique. **The list is non-empty and every entry is checked:** print the count, and fail if it is zero.
   **No two quotes for the same section may overlap in its text.** Two entries whose spans share a character each occur exactly once, so this assertion passes and the defect surfaces later as 8a's removed-count falling short of the entry count — reported against a section as though an entry were missing. Catch it where it happens.
   Fail: `6 empty`, `6 duplicate-id ID`, `6 ID quote-missing`, `6 ID quote-repeated`, or `6 §SEC quote-overlap ID,ID`.
   A rewritten withdrawal sentence fails here and names its entry. That is intended: re-quote it in the same edit.

7. **Every declared withdrawal sentence is quoted.** Every declared withdrawal sentence in `L` or `S` must begin some entry's `quote`, with that entry's `s` the sentence's section. **Assert the count of declared sentences is non-zero** and print it.
   Fail: `7 empty`, or `7 §SEC unquoted "first 60 chars"`.
   A section may withdraw its own wording: `s` equal to `by` is valid.

8. **Figures in rows.**
   - **(a) Live.** (Reads live text as defined above: every entry's quote removed. Assert, per section, that the number of quotes removed equals the number of entries for it, so a section with nothing removed is known to have nothing listed rather than assumed.) For each governs row, strip its columns 2 onward as above, then extract numbers with `\d+(\.\d+)?%?(\s?[×x]\s?\d+(\.\d+)?)?`. Every extracted number (whitespace removed) must occur in the section's live text (whitespace removed).
     Fail: `8a §ID missing=N,N`.
   - **(b) Only pointers.** For each row of the **governs table only** whose id is not on the allow-list, the stripped pointer column (column 3 onward) must contain **no digit at all**. The pointer table has two columns, so it has no pointer column to check; its column 2 is section titles.
     Allow-list: `23`, `W.37`.
     **Guard against a vacuous pass:** fail with `8b empty-column §ID` if any governs row's pointer column is empty after stripping. An earlier version of this clause read both tables, so it checked an empty string for every pointer-table row and passed on all of them, and it carried §4.1 on the allow-list for rows it could not see.
     Fail: `8b §ID tokens=…`.
   The allow-list is the only exemption. Do not add a digit-width or magnitude exemption; that was tried and let through `1 : 1` and `2px`.

## Changing this spec

Add an assertion only with the defect that motivated it, recorded in `H`'s "Maintaining this file". Change an allow-list only in this file, never in the script alone.
