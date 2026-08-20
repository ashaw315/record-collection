# SPEC.md amendment A29 — §9.2's rate limit gets a store, and §12 stops pinning two units together

Baseline `9252603`.

**Anchors quoted from SPEC.md at that commit.** If any does not match, stop and quote what is
there rather than guessing at the intent.

---

## Why

Two corrections, both found by scoping step 14 unit 4 against the code rather than against the
spec's description of itself.

**1. §9.2 specifies a rate limit and no store.** "Rate limit to 10 requests/hour" names a
quantity with nowhere to keep it, and §4 is the authority on schema. The existing token bucket
(§6, step 7) was measured against this requirement and does not fit — for two reasons that are
worth recording, because "we already have a limiter" is the obvious wrong answer:

- **It makes callers WAIT; a quota must REFUSE.** `waitMs()` reports how long until a token
  frees and the Discogs client awaits it. That is right for a 60/minute transport limit, where
  the request should eventually go. The 11th LLM request in an hour must be told "not now",
  not silently held for six minutes.
- **It is in-memory, per module instance.** `getDiscogsClient()` is a module-level singleton:
  it survives across requests in one warm serverless instance, resets on a cold start, and
  does not exist across instances. For a transport limit that is a safe approximation. For a
  user-facing quota it means the ceiling is per-instance and resets unpredictably — which is
  R5's "enforced server-side or trusted from the client?" answered badly.

**2. §12 pins 13c to the §9.2 unit, and the reason does not survive reading both.** The shared
part — client, limiter, JSON-parse boundary — is real, and it is satisfied by a shared MODULE
rather than by a shared unit. What is not shared is most of each feature's difficulty.

---

## A29a — §4.2: the rate-limit table

**ADD a new table to §4.2, after `musicbrainz_cache`:**

> **`llm_requests`** — one row per outbound Anthropic request, for §9.2's and §10b's rate limit.
>
> | Column | Type | Notes |
> |---|---|---|
> | id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | |
> | kind | TEXT NOT NULL | `gap_analysis` \| `snippet` — the two callers, counted together |
> | requested_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
>
> Index on `requested_at`, which is the only column the limit reads.
>
> **A log of requests, not a counter.** A single mutable `count` row needs resetting on a
> schedule nothing runs, and answers "how many this hour" only if the reset fired. Rows carry
> their own timestamps, so the window is a `WHERE` clause and no scheduled job exists to fail.
> Rows older than the window are deletable at any time by anything, or never — the query is
> correct either way.
>
> **Both callers share one budget.** §9.2's gap analysis and §10b's snippet are the same
> spend against the same account; two independent 10/hour limits would be a 20/hour limit
> nobody specified. `kind` records which asked, for diagnosis, and is not part of the count.
>
> **The check and the insert must be ONE atomic statement.** A `SELECT count(*)` followed by
> an `INSERT` is check-then-act: two concurrent requests both read 9, both pass, and both
> write — the eleventh request in an hour, admitted by a limiter that was working correctly at
> every individual step. This is the acquire-flow race in a new place, and §7.3's rule applies
> for the same reason: a pre-check handles bad input, and only the atomic write handles what
> changes between the check and the write.
>
> Write it as a conditional insert — `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < limit`
> — and treat **zero rows inserted** as the refusal. The count and the insert then happen in
> one statement under one snapshot, and the caller learns the outcome from what the database
> did rather than from what it predicted.
>
> **This must be tested at the concurrent level, not only the sequential one.** Eleven requests
> in sequence will pass a limiter that is wrong; the test that matters fires the eleventh
> concurrently with the tenth. NOTES records the mock rule this needs: a mock intercepting
> every call disables the function, while one intercepting only the first simulates the race.

---

## A29b — §9.2: the limit points at its store

**REPLACE:**

> - Rate limit to 10 requests/hour. Never call this on page load — user-initiated only.

**WITH:**

> - **Rate limit to 10 requests/hour, enforced server-side against `llm_requests` (§4.2)** — never trusted from the client, and shared with §10b's snippet since both spend the same account. Exhaustion is a legible refusal naming when capacity returns, not a 500 and not silence: an exhausted quota is a fact the app knows, and reporting it as an internal error sends the reader to application logs for something the app could have said. Never call this on page load — user-initiated only.

---

## A29c — §9.2: what "unsure" can and cannot buy

**ADD beneath the JSON-output bullet:**

> **The prompt asks the model to omit records it is unsure exist. That reduces hallucination and does not prevent it** — a model's confidence is not evidence, and nothing in the response can be checked against the world. So it is a trade of recall for precision, not a guarantee, and the human step below is what actually catches an invented record. Do not let the instruction's presence in the prompt read as a verification anywhere in the code or the UI.

---

## A29d — §9.2: `genre` is validated against the hierarchy

**ADD beneath the JSON-output bullet:**

> **`genre` must be one of the user's own genre names, and this is validated rather than trusted.** The prompt supplies the collection's genre hierarchy and constrains the field to it, which is what makes the response checkable instead of merely plausible — and it is the mechanism that enforces §9.2's genre-accuracy requirement, since a model flattening UK82 into "punk" produces a name the hierarchy does not contain.
>
> A suggestion whose `genre` is absent from the hierarchy is **valid JSON of the wrong shape** — the envelope parsed and one value is unusable. It is not a parse failure and not an empty response, and the three must stay distinguishable.
>
> **Drop that suggestion, keep the rest, and report how many were dropped.** Per-suggestion rather than whole-response: one bad genre in five is not a reason to discard four good ones. Silently rather than visibly is the failure to avoid — a dropped suggestion nobody is told about makes the model's error invisible and the list shorter for no stated reason.

---

## A29e — §9.2: how a suggestion reaches the want list

**ADD beneath the results bullet:**

> **The "add to want-list" action prefills the want-list form; it never writes a row directly.** An LLM suggestion names a record, so unlike §9.1 a title exists — but it is a title the model produced, and §5.7's architecture exists because a client asserting a fact the server can establish is the pattern to eliminate. A model is a less reliable client than a user: it can name a record that does not exist, misattribute one, or invent a pressing. A direct write puts an unverified assertion in the same table as records the user typed, where nothing afterwards distinguishes them.
>
> **Prefilling through `/lookup` was considered and rejected**, though it is the only option where a hallucinated record cannot land. Discogs search is fuzzy and returns something for almost any string, so a hallucinated title finds a near-match and the user confirms a record the model did not mean. That converts a visible failure — a record that does not exist — into an invisible one, a different record blessed by a search. The same shape as a version table whose identical rows read as an answer.
>
> **Suggestions must read as generated** (§10b's labelling rule): the list says so, and `reason` is presented as the model's rationale rather than as something the app established.

---

## A29f — §12: the two features are separate units

**REPLACE:**

> 14. Suggestions — relationship-based first (§9.1), then LLM-assisted (§9.2). E2E #8.

**WITH:**

> 14. Suggestions — relationship-based first (§9.1), then LLM-assisted (§9.2). E2E #8. **§9.2 and 13c are separate units sharing one module**, not one unit: see the deferral note below.

**And REPLACE 13c's deferral note:**

> **13c. The snippet** (§10b). **Trigger: step 14**, with §9.2's LLM work. It is a second call to the same API and it needs the same rate limit, the same JSON-parse boundary, and the same answer to R5's question about what leaves the machine. Building it here would build that boundary twice, and R5 is scoped to review it once.

**WITH:**

> **13c. The snippet** (§10b). **Trigger: step 14**, immediately after §9.2 and built on the module §9.2 extracts — the Anthropic client, the shared rate limit (§4.2's `llm_requests`) and the JSON-parse boundary. R5 still reviews one boundary, because there is one.
>
> **Separate units, and the original reasoning is why.** This note used to say building it alongside §9.2 was necessary to avoid building that boundary twice. Having read both features, the shared part is satisfied by a shared *module*; what is not shared is where each one's difficulty lives. §9.2 sends a summary of the whole collection and returns something ephemeral, so its hard question is disclosure — R5's first attack line, field by field. The snippet sends one record and its hard question is **storage and ownership**: the text is written to `records.snippet`, `snippet_edited_at` transfers ownership to the user on edit, and a regeneration must then refuse (§7.8).
>
> Judging a disclosure decision and a stored-ownership decision in one review is what splitting §9.1 from §9.2 was meant to avoid.

---

## After applying

§9.2's rate limit has a store, an atomicity requirement and a stated exhaustion behaviour;
`genre` is a validation rather than a hope; the want-list path is specified with its rejected
alternative recorded; and §12 says what the build does.

The migration for `llm_requests` follows this amendment, not the other way round.
