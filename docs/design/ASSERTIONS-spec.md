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

Read all four as UTF-8. Decode `&rsquo;` → `’` and `&amp;` → `&` before any text comparison.

## Shared definitions

**Heading.** In `L`, `S` and `W`: any `<p …>` whose `style` contains `text-transform:uppercase` and whose text starts with an optional `§`, then a section id, then ` · `.
Section id pattern: `W` | `W\.\d+(\.\d+)?` | `\d{1,2}(\.\d+)?`.
In `W`, a bare numeric id is prefixed `W.`.
**Never match headings inside `<svg>`**: SVG text holds cell labels like `1 · Cover`.

**Section text.** From a heading to the next heading in the same file, tags stripped, whitespace collapsed.

**Tables in `H`.**
- *Governs table*: lines starting `| §` between `## What each subsection governs` and `## Structural sections`.
- *Pointer table*: lines starting `| §` between `## Structural sections` and `## Build order`.
- A row's **id** is the text after `| §` up to the next space. Its **title** is column 2. Its **pointer column** ("go there for") is column 3 onward, joined back with `|`.

**Build order.** The text between `## Build order` and `## Maintaining`. A **step** is a line matching `^\d+\. `. The **closing paragraph** is the one containing `Every row in the table above`.

**Withdrawal list.** In `L`, the JSON array in `<!-- reader-note-withdrawals […] -->`. Each entry is `{"id", "s", "by", "what"}`, where `id` is `s/slug` and is **unique across the list**; a duplicate `id` is a failure (`6 duplicate-id ID`). Uniqueness is the same discipline as assertion 1's one row per heading, one layer down: a section may carry any number of withdrawals, and each has exactly one entry.

**Withdrawn text is declared, not guessed.** Every withdrawn or superseded passage is wrapped in `<span data-withdrawn-by="N" data-withdrawal="ID">…</span>`, where `N` is the replacing section's id (`28`, `W.19`) and `ID` is the entry's `id` in the withdrawal list. **Live text** is the section text with every `[data-withdrawn-by]` element removed. There is no keyword list. An earlier version guessed from eleven keywords and missed "reversed", which this corpus uses for withdrawal constantly: a list derived from the phrasings seen so far fits those and misses the next one.

**The marking pass has landed.** The candidate pattern and `--candidates` are deleted from the script, so nothing in it guesses, and assertions 6, 7 and 8a print `PASS` or `FAIL` like the rest.

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

6. **Every listed withdrawal is marked where it happened.** For each entry, section `s` must contain an element with `data-withdrawal` equal to the entry's `id` and `data-withdrawn-by` equal to its `by`.
   Fail: `6 duplicate-id ID`, `6 ID missing`, or `6 ID by-mismatch`.
   (An earlier version matched on the pair `(s, by)`, which cannot tell apart two withdrawals from one section by one replacer: §26 carries two self-withdrawals, and one surviving mark satisfied both entries.)
   6 and 7 are the two directions of one check, so both read the attribute. **A section may withdraw its own wording:** an entry whose `s` equals its `by`, with the mark inside §s, is valid, and neither 6 nor 7 may reject it for that. §26 is the first instance. (An earlier version of 6 matched `/withdrawn|superseded/i` while 7 read the attribute, so a passage marked `data-withdrawn-by="20"` whose prose said "reversed by §20" passed 7 and failed 6.)

7. **Every marked withdrawal is listed.** Every `[data-withdrawn-by]` element in `L` or `S` must carry a `data-withdrawal` whose value is an entry's `id`, and that entry's `s` must be the section the element is in and its `by` the element's `data-withdrawn-by`. Each id is used by exactly one element.
   Fail: `7 §SEC unlisted`, `7 ID wrong-section`, or `7 ID used-twice`. (An earlier version matched three exact phrasings and none of them was "Reversed by §".)

8. **Figures in rows.**
   - **(a) Live.** (Reads live text as defined above: every `[data-withdrawn-by]` element removed.) For each governs row, strip its columns 2 onward as above, then extract numbers with `\d+(\.\d+)?%?(\s?[×x]\s?\d+(\.\d+)?)?`. Every extracted number (whitespace removed) must occur in the section's live text (whitespace removed).
     Fail: `8a §ID missing=N,N`.
   - **(b) Only pointers.** For each row of the **governs table only** whose id is not on the allow-list, the stripped pointer column (column 3 onward) must contain **no digit at all**. The pointer table has two columns, so it has no pointer column to check; its column 2 is section titles.
     Allow-list: `23`, `W.37`.
     **Guard against a vacuous pass:** fail with `8b empty-column §ID` if any governs row's pointer column is empty after stripping. An earlier version of this clause read both tables, so it checked an empty string for every pointer-table row and passed on all of them, and it carried §4.1 on the allow-list for rows it could not see.
     Fail: `8b §ID tokens=…`.
   The allow-list is the only exemption. Do not add a digit-width or magnitude exemption; that was tried and let through `1 : 1` and `2px`.

## Changing this spec

Add an assertion only with the defect that motivated it, recorded in `H`'s "Maintaining this file". Change an allow-list only in this file, never in the script alone.
