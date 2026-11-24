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
- **The deciding population:** the rerun's picks with Hot Tuna (c8b0af3d) excluded.
- **Reading:**
  - If it holds without Hot Tuna, it's a finding.
  - If it holds only with Hot Tuna in, it's one record, and it belongs to Q89.
  - Otherwise it is not supported.
- **Length** (characters) is reported beside it. Length carries no expected direction and decides nothing.
- **Command:** `scripts/report-top-n-spread.mts <rerun.jsonl> 30 --exclude=c8b0af3d-9f7e-4402-bb5a-47e6e646ab0f`, and the same at 20. Self-similarity is embedded fresh on each run of the report.

## Both runs, both ways

The rerun's rows are filled in after it runs, and nothing above changes.

| run | N | all records | without Hot Tuna |
|---|---|---|---|
| first (24 Nov, 02:10) | 30 | -0.34, p 0.040 (37 records) | -0.26, p 0.123 (36) |
| first (24 Nov, 02:10) | 20 | -0.20, p 0.233 | -0.14, p 0.404 |
| rerun | 30 | | |
| rerun | 20 | | |
