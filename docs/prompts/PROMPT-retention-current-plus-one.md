# Retention — current plus one previous, per scope

The decisions are made. This unit builds them.

---

## What it does

Gap analyses and pressing assessments currently keep one answer and discard the old one on
re-ask. Keep the previous one too — **current plus one, per scope** — and let the two be
compared.

---

## Why, and what the argument already settled

The Aja case is the evidence: two assessments of the same album, asked minutes apart,
produced different lists. **Neither dominated** — the second was more actionable on what it
kept, the first had better coverage. That is a fact about the tool, observable only across two
answers, and it survived by accident in terminal scrollback rather than in the app.

**Decisions already taken. Do not re-litigate them:**

- **Current plus one.** The finding came from consecutive asks; nothing has named a use for the
  third-most-recent answer.
- **Five was rejected** — a number nobody can derive, which is the same objection that killed a
  depth threshold in the drill-down unit.
- **Keep-everything was rejected** — a growing table with no policy is a decision deferred
  rather than made, and "fine for years at my rate of asking" is a bet on behaviour, not a
  design.

Current-plus-one is **bounded by construction**. A ceiling that follows from the design needs no
retention policy.

---

## The design question in it

**The previous answer must carry its own staleness, computed from its own `asked_at`.**

`recordsAddedSince` is already per-scope. A collection-wide answer from before five records
were added is superseded in a way a Punk answer from before a jazz record is not — so the
previous row cannot borrow the current row's count. Presenting two answers as equally current
claims about the same collection is exactly what this unit exists to avoid.

**And the previous answer must be visibly previous, not merely older.** The Aja case was two
lists that looked equally authoritative, distinguished only by timestamps. Whatever renders the
comparison must make it obvious which one is current at a glance — the same reasoning that made
A43's four verdicts carry structure rather than wording.

---

## Where the work lands

Noted by the previous session so this one need not re-derive it:

- `storeGapAnalysis` does delete-before-insert. That is the discard.
- `latestGapAnalysis` already computes staleness per row, which is most of what the previous
  answer needs.
- Pressing assessments have the same shape and the same decision applies.

---

## What must not break

- **Scope keying.** A genre answer must not overwrite the collection-wide one, and a previous
  answer must not leak across scopes.
- **The GET/POST split.** Reading spends no request; asking spends one. §9.2 chose POST because
  a GET is prefetchable, and a read that looked like an ask would bend the rule POST enforces.
- **Nothing stored becomes editable.** These are Claude's answers, displayed and attributed.
  §7.8's ownership lesson applies before the fact.

---

## Two checks this project has earned

**Before asserting a stored thing is read back, prove something stored it** — not that the
storing code ran, that the row exists. Three instances this session, all passing, all caught by
mutation rather than reading. The layer that stores is usually the layer a test stubs for
convenience.

**For any interaction that replaces content, ask what should now be present, not only what
should be gone.** A clear is a negative assertion and cheap to write; a load is positive and
needs a fixture. The scope-switch defect was exactly this — the deleted E2E asserted the clear,
which worked.

---

## Report

1. **What renders**, and how the previous answer is marked as previous.
2. **The two staleness figures**, and evidence they are computed independently.
3. **Mutation results** — at minimum, a previous answer borrowing the current one's staleness
   should fail a test, and so should a previous answer leaking across scopes.
4. **What is unverified**, including whether the `.env.test` gate blocks E2E coverage again. If
   it does, say so plainly rather than deleting tests quietly — that fixture has now cost
   coverage on four LLM features and the cost should stay visible.

Full suite, no file argument. Baseline is currently red: nine Neon WebSocket unit tests and
wall-scene:1093. "Nothing regressed" is a claim about the rest.

Migration in the same session as the push if one is needed — this project deploys on push and
migrates by hand.
