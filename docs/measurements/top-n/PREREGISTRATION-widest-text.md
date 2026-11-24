# The widest-text hypothesis: pre-registration for the top-N rerun

Written 24 Nov 2026, before the rerun's data exists. Committed ahead of the run so the test can't be fitted to its result.

## Status before the rerun

Open and untested. The hypothesis was formed after seeing Hot Tuna rank deep in the first run (2026-11-24T02-10-07-826Z.jsonl). On that same run it reads -0.34 (two-sided permutation p 0.040) with every record, carried largely by Hot Tuna. That figure describes the data that suggested the hypothesis. It is not evidence for it.

## The hypothesis

A record whose matched text ranges further gets picked from deeper in the ranking. "Ranges further" means lower self-similarity: the mean cosine among its own sentences, each embedded on its own.

## What counts, fixed now

- **Quantity:** Spearman's rank correlation, ties at average rank (`spearman` in src/lib/ask/top-n.ts). It is taken across the records picked at least once in the rerun, between each record's share of picks ranked beyond N and its self-similarity.
- **Direction expected:** negative.
- **N where it should appear:** 30. N = 20 is reported but does not decide.
- **Threshold:** the coefficient is negative, and the two-sided permutation p is below 0.05. The p comes from `permutationP` with 10,000 shuffles and seed 24.
- **The deciding population:** the rerun's picks with Hot Tuna (c8b0af3d) excluded. *Amended below: blocks one and three only.*
- **Reading:**
  - If it holds without Hot Tuna, it's a finding.
  - If it holds only with Hot Tuna in, it's one record, and it belongs to Q89.
  - Otherwise it is not supported.
- **Length** (characters) is reported beside it. Length carries no expected direction and decides nothing.
- **Command:** `scripts/report-top-n-spread.mts <rerun.jsonl> 30 --exclude=c8b0af3d-9f7e-4402-bb5a-47e6e646ab0f`, and the same at 20. Self-similarity is embedded fresh on each run of the report. *Amended below: `--groups=` confines it to the deciding blocks.*

## Amendment 1, 24 Nov 2026, before any rerun data exists

The coordinator found a hole. Block two of the rerun is the 23 Nov corpus, the same 24 phrases whose run suggested the hypothesis. A figure pooled across the three blocks would mostly re-run the data the hypothesis was fitted to, so it can't test it. So:

- **The deciding figure** is computed on block one (Adam's phrases) and block three (Design's three) only, the phrases that didn't inform the hypothesis, with Hot Tuna excluded. Threshold, direction and N are unchanged.
  `--groups=block-1-adam,block-3-design --exclude=c8b0af3d-9f7e-4402-bb5a-47e6e646ab0f`, at 30 (deciding) and 20.
- **Block two** is reported on its own as a replication of the first run, with and without Hot Tuna. It isn't part of the test.
- **The pooled figure** across all three blocks is reported as context, with and without Hot Tuna. It decides nothing.
- **If block one is empty** because Adam gave no phrases, the deciding base is three phrases, which is too thin to decide anything. The report says "untested", gives the three-phrase figure only as a description, and draws no conclusion.
- **If the coefficient is undefined**, because no record in the deciding base is ranked beyond 30 once Hot Tuna is out, the result is also "untested", not "not supported". Exercised on the first run's two phrases of Adam's: 8 records, none beyond 30, coefficient NaN.
- **No floor (the coordinator, 24 Nov).** The proposed 24-answer floor is withdrawn. The first run at 24 answers already failed to resolve the question without Hot Tuna (p 0.123), so a floor at that size makes "untested" and "not supported" indistinguishable exactly where the distinction matters. A floor on answers is also the wrong instrument: the correlation is across records, at most 55, so more answers sharpen each record's miss rate but can't raise n past the collection.

## Amendment 2, 24 Nov 2026, before any rerun data exists: power, in place of a floor

- **Every figure is reported with its base's power.** That means n, the records in the base, and the critical value: the |r| that would have cleared two-sided p < 0.05 at that n. The critical value is read off the same seeded null distribution (10,000 shuffles, seed 24) as the 95th percentile of the shuffles' |r| (`criticalR` in src/lib/ask/top-n.ts). "Not supported" is always stated with it, as in "not supported; an effect weaker than 0.41 could not have been detected at this base".
- **"Untested" is kept for one case:** no figure exists, because no record in the base is ranked beyond N or self-similarity is constant.
- **The rerun runs whatever Adam gives.** With a small deciding base the critical value is large, and the result says so itself.
- **The first run, exercised:** 37 records, critical 0.33 at N = 30 (0.32 at 20); without Hot Tuna 36 records, critical 0.33. So -0.26 without Hot Tuna is short of what that base could detect. Adam's two logged phrases alone give 9 records, critical 0.55, and untested once Hot Tuna is out.

## Both runs, both ways

The rerun's rows are filled in after it runs, and nothing above changes. Self-similarity is embedded fresh each time the report runs, so a p can move in the third place between runs (0.233 and 0.234 at N = 20).

| run | N | all records | without Hot Tuna |
|---|---|---|---|
| first (24 Nov, 02:10) | 30 | -0.34, p 0.040; n 37, critical 0.33 | -0.26, p 0.123; n 36, critical 0.33 |
| first (24 Nov, 02:10) | 20 | -0.20, p 0.233; n 37, critical 0.32 | -0.14, p 0.404; n 36, critical 0.33 |
| rerun, blocks one and three (deciding) | 30 | | |
| rerun, blocks one and three | 20 | | |
| rerun, block two (replication) | 30 | | |
| rerun, block two | 20 | | |
| rerun, pooled (context) | 30 | | |
| rerun, pooled | 20 | | |
