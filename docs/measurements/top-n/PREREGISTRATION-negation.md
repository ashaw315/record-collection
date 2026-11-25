# Pre-registration: does negation put "no vocals"'s records deep? (25 Nov)

Written and committed before the data exists. Nothing below is changed after the run; any amendment is added beneath, dated, with its reason.

## The question

In the 25 Nov top-N run (`2026-11-25T03-23-38-502Z.jsonl`), the four records the pick chose for "no vocals" ranked 40th to 50th of 55 by nearness to the phrase, the same in all three runs. One suggested mechanism (the coordinator's, proposed after seeing that phrase, so untested): an embedding represents what a text has, and a requirement like "no vocals" is about what it lacks, so the negated phrase sits near records that talk about vocals.

The test asks the same constraint three ways (the coordinator, 25 Nov):

| phrase | form |
|---|---|
| "no vocals" | negated |
| "instrumental only" | positive, with a restriction |
| "instrumental" | plain positive |

## The records

The four records "no vocals" chose, with their 25 Nov ranks:

| record | id | rank under "no vocals" on 25 Nov |
|---|---|---|
| Jeff Beck, Wired | 48461309-e0e0-42a8-b903-f60642c923ca | 40 |
| Miles Davis, Bitches Brew | 2be8579e-2ee7-44fa-81e8-9713a6aaa714 | 45 |
| Buddy Rich, Super Rich | 1d4a4107-3153-4e98-b48a-d00a28266f94 | 47 |
| Paul Whiteman And His Orchestra, Great Gershwin | 22d34772-3c46-4247-9878-2256dfc33291 | 50 |

## Method

This is a computation, not a sample, so there are no answers, no model calls, and no statistics.
- The pool is built as `scripts/measure-top-n.mts` builds it: every record with matched text, each matched text embedded fresh with the same model, in one call.
- All three phrases are embedded in one call.
- Each record's rank under each phrase comes from `ranksOfPicks` in `src/lib/ask/top-n.ts`: nearness by cosine, ties broken by id.
- Read-only. Production is read through the npm scripts' `--env-file=.env.local`.

**Two checks on the apparatus, reported before any result.**
1. The pool's size, against 25 Nov's 55.
2. The four ranks under "no vocals", against 40, 45, 47 and 50.

If either differs, the pool or the embeddings have moved since 25 Nov. The result is still read within this run's own ranks, since all three phrases share one pool and one set of vectors, but the difference is reported.

The embedding service is not guaranteed bit-identical between calls. So the computation runs twice, in two separate invocations, and both sets of ranks are reported. If a record's rank under any phrase differs between the two, that record is reported as unstable, and it meets no reading below: it can neither show the ordering nor refute it.

## Prediction (the mechanism's)

For each of the four records:

    rank under "instrumental"  <  rank under "no vocals"

The positive form ranks the record shallower than the negated form does.

## Reading, fixed now

Ordering only (the coordinator, 25 Nov). An earlier draft, never committed and never run, read the four against a bound of 30. That bound was chosen for the ruling's question, not this one, so it is not part of the reading: the outcome would have turned on where 30 falls relative to four records.

- **Consistent with the mechanism:** all four rank strictly shallower under "instrumental" than under "no vocals".
- **Not consistent:** any one stable record does not (an equal rank counts as not shallower).
- **Undetermined:** no stable record refutes it, but at least one record is unstable between the two invocations, so all four cannot be shown shallower.

The rule is `negationReading` in `src/lib/ask/top-n.ts`, tested before the run, so the reading is computed, not judged. "instrumental only" does not enter it.

## Reported beside the reading, as facts and not as the reading

- Every record's rank under all three phrases, in both invocations.
- How many of the four are within a bound of 30 (rank ≤ 30) under each phrase, for anyone who wants the bound's view.

Whatever the reading, the ruling it bears on ("Pool left unbounded") rests on the observed ranks and does not wait on this.

## Result

(Empty until the run.)
