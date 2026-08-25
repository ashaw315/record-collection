# Claude Code prompt — apply the SPEC.md amendments

Save `SPEC-AMENDMENTS.md` to the repo root first. Then paste everything below the line.

---

## Task

Apply the fourteen amendments in `SPEC-AMENDMENTS.md` to `SPEC.md`. This is a
documentation unit: **no implementation, no code changes, no test changes.** The only
file that may be modified is `SPEC.md`.

The purpose is to make SPEC.md describe the app that exists at HEAD. §8.1 and §8.2 specify
software that was deleted at step 13, §5.6 was corrected halfway, §11 mandates four tests
that cannot pass, and §14 gates on them. Several sections still in force reference §8, so
the amendments move surviving rules out before compressing it.

## CLAUDE.md §2 carve-out applies

There is no test-first path for editing a specification. The verification for this unit is
**a command that must succeed**, per the carve-out: the cross-reference sweep in step 4
below. Do not invent unit tests for prose. Do not treat the absence of tests as licence to
skip verification — the sweep is the verification and it must be run and pasted.

## Step 1 — preflight, before touching SPEC.md

Three claims in the amendments are about the repository rather than the document. Run these
and **report the output before editing**:

```
ls src/app/shelf/
grep -rn "d3-force\|d3-hierarchy\|from 'd3'\|from \"d3\"" src/ e2e/ test/ package.json
grep -rn "graph\|Graph" src/components/AppHeader.tsx src/app/layout.tsx 2>/dev/null
```

**One of these is a precondition, not a follow-up.** Amendment A10 adds the sentence *"The
shelf has no route of its own"* and asserts `/shelf` is not a route. If
`src/app/shelf/page.tsx` exists, that claim is false — **stop and report rather than
applying A10**, and I will reword it.

The other two are informational: report what you find, do not act on either. Removing
`d3-force` from `package.json` is a separate unit; this one only removes it from the spec's
stack table.

## Step 2 — apply the amendments

Work through A1 to A14 in order. For each one:

- **Match the REPLACE block exactly.** These are verbatim excerpts from SPEC.md at HEAD.
- **If an anchor does not match, stop that amendment and record it.** Do not fuzzy-match,
  do not search for something similar, do not reconstruct the intent. A non-matching anchor
  means either the spec has moved since I read it or I transcribed it wrong, and both need
  a human. Continue with the remaining amendments and list every miss in the report.
- **Change nothing outside the block.** No reflowing, no wrapping fixes, no tidying adjacent
  prose, no correcting typos you notice. A diff that touches lines it did not need to touch
  is the thing that makes this unreviewable.

Two amendments are flagged in the file as decisions rather than corrections. Both are
approved — apply them — but call them out separately in your report:

- **A4** adds `snippet` and `snippet_edited_at` to §4.2. This specifies work that does not
  exist yet; it is spec-ahead-of-code deliberately, so §10b's snippet has a schema authority
  when it is built. **It is a spec change only — do not write a migration.**
- **A14** resolves §10b's "on desktop" qualifier in favour of the code's behaviour and hands
  the open question to step 15.

## Step 3 — do not fix anything else

You will notice other things wrong with SPEC.md while reading it. Record them in `NOTES.md`
per CLAUDE.md §4 and do not act on them. In particular: §10b has unbuilt clauses (the
snippet, the arrows, the rise out of the slot) and that is expected mid-step, not drift.

## Step 4 — verify, and paste the output

The sweep is this unit's definition of done. Every remaining reference to a retired feature
must be **deliberate** — either inside §8's retirement note, or a historical statement that
says it is historical.

```
grep -n "§8\.1\|§8\.2" SPEC.md
grep -n "api/graph\|api/shelf-order\|shelf-order\|shelf_order" SPEC.md
grep -n "d3\|D3\|force-directed\|force simulation" SPEC.md
grep -n "/graph\|/shelf\b" SPEC.md
grep -n "has_genre\|Louvain\|INFLUENCE_WEIGHT\|GENRE_WEIGHT\|bridge record" SPEC.md
```

For each surviving hit, state in one line why it survives. Anything you cannot justify is a
missed amendment, not an acceptable remainder.

Then confirm three specific things by reading them:

1. **§14's gate is achievable.** "All eleven E2E flows in §11 passing" — count the flows in
   §11 after A12b. There must be eleven, numbered 1–11, and flows 6 and 7 must describe the
   shelf. Cross-check against `e2e/shelf.spec.ts`: does the spec file actually cover what
   flows 6 and 7 now claim? If it does not, say so — the amendment describes what should be
   covered and the gap is worth knowing before step 14.
2. **§5.6 has no endpoints and §14 no longer demands one.** A6 adds a rule preventing an
   endpoint being built solely to satisfy §14's completeness line. Confirm both halves landed.
3. **No section references a rule that now lives only in §8.** Specifically check that §10b
   carries the genre-grouping rule, the determinism rule and the sparseness rule in its own
   words (A11c, A11d), and that §9.1 carries the genre-overlap definition (A9). These are
   the four references that made deleting §8 unsafe; if any is still pointing at §8, the
   compression was premature.

## Step 5 — commit

One commit, `SPEC.md` only.

```
git add SPEC.md
git commit -m "SPEC: retire §8, and record what step 13 actually built"
```

**Stage by path, not `git add -A`.** NOTES records a unit whose component work landed under
two commits whose messages describe documentation, because `git add -A` swept unstaged work
into them. Commit messages are load-bearing in this repo — `git log -- SPEC.md` is how the
next reader finds out why §8 went.

If preflight told you to stop on A10, do not commit until that is resolved.

## Step 6 — report and stop

State:

- The preflight output, and whether A10 was applied or held.
- Which amendments applied cleanly, and every anchor that did not match, quoted.
- The full `git diff --stat` and the sweep output from step 4.
- The three confirmations from step 4, each answered explicitly rather than as a tick.
- Anything recorded in NOTES.md rather than acted on.
- Your answer to this, plainly: **is there anything left in SPEC.md that describes software
  that does not exist?** You have just read the whole document. That question is worth more
  than the diff.

Then stop. Step 13's three.js work is next and is not part of this unit.
