# NOTES.md

Out-of-scope observations recorded during build steps, per CLAUDE.md §4.
Nothing here has been acted on. Each entry names the step it was noticed in.

---

## Acceptance criteria for the remaining reference resources

These are **requirements**, not observations. They apply to `genres`, `artists`,
`record_stores`, `labels`, `formats` and, where noted, `records` and
`want_list`. Each was a real defect found in the `tags` template during the step
4 remediation; each is cheap to satisfy when the resource is written and
expensive to retrofit. A resource is not done until every applicable line holds.

1. **Every handler is wrapped in `withErrorHandling`.** An unwrapped handler
   leaks the SQL statement in a 500 body (SPEC.md §5). Verified by removing the
   wrapper and watching a test fail, not by inspection.

2. **Every race test is written in the same unit as the pre-check it guards —
   never retrofitted.** For every check-then-write and count-then-delete pair,
   the race test ships alongside. This is not optional hardening: a fallback
   behind a pre-check that returns first in every ordinary case is unreachable
   in normal testing, so it can be dead — as `isUniqueViolation` was for an
   entire build unit — while the suite stays green. Concretely, each resource
   needs a concurrent-create test (POST losing to the unique index), a
   concurrent-rename test (PATCH losing the same way) where the resource has a
   unique name, and a reference-appears-after-the-count test (DELETE hitting
   23503). Simulate the window by hooking the pre-check; do not race threads.

3. **Every blocking foreign key is declared in `REFERRERS`.** Counts below are
   from `pg_constraint`, not from memory — note that a *cascading* referrer must
   NOT be declared, since counting it would refuse a delete the database would
   happily perform. `artist_genres` and both `artist_influences` FKs cascade,
   which is why `artists` has two blocking referrers and not five:

   | Reference table | Blocking referrers |
   |---|---|
   | `genres` | 4 — `record_genres`, `want_list_genres`, `artist_genres`, and `genres.parent_genre_id` (self) |
   | `artists` | 2 — `records.artist_id`, `want_list.artist_id` |
   | `labels` | 2 — `records.label_id`, `want_list.label_id` |
   | `record_stores` | 1 — `records.store_id` |
   | `formats` | 1 — `records.format_id` |
   | `tags` | 1 — `record_tags.tag_id` |

   `test/integration/referrers.test.ts` diffs the declaration against
   `pg_constraint` and fails by name if one is missed — do not weaken that test
   to make a resource pass. Note `genres` is self-referencing: deleting a parent
   genre that still has children must be refused like any other in-use row.

4. **`DELETE` translates 23503 into the 409, and re-reads the count.** The
   pre-check alone is racy; the foreign key is the guarantee. Reporting the
   stale pre-check count in the raced 409 is wrong.

5. **Names go through `cleanName` before validation.** Any resource with a
   `UNIQUE` name needs NFKC normalization and invisible-character stripping, or
   NFC/NFD twins and zero-width-separated names become duplicate rows that
   render identically. Test the NFC/NFD collision explicitly, building the
   literals from `\uXXXX` escapes — a typed NFD literal is normalized to NFC on
   being written to disk, which silently destroys the precondition.

6. **List queries use `orderFor`**, which supplies the id tiebreaker and an
   explicit `NULLS LAST`. Both matter for the resources ahead: `artists`,
   `record_stores` and `genres` all have nullable sortable columns
   (`formed_year`, `city`, `description`), and Postgres flips null placement
   between ASC and DESC. Where a resource sorts by a nullable column, assert
   nulls land last in **both** directions.

7. **`sort` is validated against a per-endpoint allowlist by identity match**,
   returning the caller's own literal. Test the rejection side, including a real
   but unenumerated column — that is what distinguishes an allowlist from a
   blocklist.

8. **`records` and `want_list` additionally need `?page` bounds on every list
   endpoint** and the branded `Offset` type at the query boundary. They are the
   endpoints most likely to be paged deeply by a client.

9. **`genres` needs a cycle guard** (SPEC.md §4.1: a genre may not be its own
   ancestor) with a test for the self-parent case, the two-node cycle, and a
   longer chain. `parent_genre_id` is `NO ACTION`, so an in-use genre is
   refused by the FK as well.

---

## Open

- **CORRECTED — the database DOES protect reference rows; an earlier entry here
  said the opposite.** This entry previously claimed `record_tags.tag_id` was
  `ON DELETE CASCADE` and that only the application layer stood between a delete
  and silent data loss. That was wrong, and wrong in the dangerous direction:
  it asserted a threat that does not exist while implying the app check was the
  sole guard. Verified by querying `pg_constraint` directly (step 4, unit C):

  | Junction | → owning entity | → reference row |
  |---|---|---|
  | `record_tags` | `record_id` CASCADE | `tag_id` **NO ACTION** |
  | `record_genres` | `record_id` CASCADE | `genre_id` **NO ACTION** |
  | `want_list_genres` | `want_list_id` CASCADE | `genre_id` **NO ACTION** |
  | `artist_genres` | `artist_id` CASCADE | `genre_id` **NO ACTION** |
  | `artist_influences` | both FKs CASCADE | — |

  This matches SPEC.md §4.3 as amended (the rule is directional, not blanket).
  So the FK **is** the guarantee for every reference resource, and the query
  layer's count is advisory — it exists to produce a helpful 409 with a
  reference count before attempting the delete, not to prevent data loss. Both
  layers are kept deliberately; see unit C. Corrected: step 4, unit E.

- **`--reporter=basic` no longer exists in Vitest 4.** It is now resolved as a
  custom reporter *module*, so passing it fails the run with `ERR_LOAD_URL`
  before any test executes rather than with a "no such reporter" message. Cost a
  debugging round in unit 0. Nothing in the repo passes it today (the new probe
  in `test/repo/env-loading.test.ts` deliberately omits any `--reporter` flag),
  but it is the obvious thing to reach for when adding CI output formatting
  later — the Vitest 4 equivalents are `default`, `dot`, `json`, `junit`, etc.
  Noticed: step 4, unit 0.

- **A failing assertion in `test/repo/drizzle-config.test.ts` prints a vitest
  sourcemap error instead of the assertion message.** When vitest formats a
  failure from that file it walks the repo root looking for sourcemaps and
  chokes on a binary (`favicon.ico`), emitting
  `SyntaxError: Unexpected token '<9f>', "<9f>" is not valid JSON` in place of
  the diagnosis. **The detection itself is unaffected** — the mutation that
  removes `.env.test` loading is reliably caught (5 passing drops to 4) — only
  the message is unreadable. Two attempts to avoid it failed: `node
  --experimental-strip-types` cannot load the config (its imports omit file
  extensions under TypeScript `bundler` resolution), and reducing the assertion
  to a short string label did not stop vitest from source-mapping the frame.
  Left as is per CLAUDE.md §9 rather than thrashing. If it bites someone, the
  likely fix is a vitest `server.sourcemap` setting or moving the probe into a
  helper module outside `test/repo/`. Noticed: step 1–3 remediation, unit 3.

- **DEFERRED (from step 1–3 adversarial review): timing leak distinguishes a
  malformed `APP_PASSWORD_HASH` from a wrong password.** `src/lib/auth/password.ts`
  fails closed on a broken hash, and the response text is correctly vague — but
  the malformed-hash path returns in ~0.01ms versus ~270ms for a real bcrypt
  compare, a ~27,000× difference measured locally. An unauthenticated caller can
  therefore detect that the hash env var is unset or corrupt. Single-user app,
  low value; the fix is to compare against a fixed dummy hash of the same cost on
  the failure path. Developer decision: revisit at step 14 (deploy). Noticed:
  step 1–3 review.

- **DEFERRED: the transactional acquire flow MUST be verified against a real Neon
  database before step 6 is considered done — not against `pg` alone.** Every
  integration test runs on local Docker Postgres via `drizzle-orm/node-postgres`.
  Nothing in the suite exercises `drizzle-orm/neon-serverless`; `createClient()`
  in `src/db/client.ts` is never invoked by any test, and `resolveDriver`'s Neon
  branch is only asserted on the *string* it returns. SPEC.md §5.3 requires
  `POST /api/want-list/:id/acquire` to be transactional and SPEC.md §11 requires a
  forced mid-transaction failure test — that test will run against `pg` and pass
  regardless of how Neon's WebSocket pool behaves under connection interruption
  or function suspension. A partially-applied acquire (a `records` row with
  `want_list.is_acquired` never set) would silently corrupt §7.3's
  want-list-as-acquisition-history invariant. CLAUDE.md §2 already requires this
  verification; this entry is here so step 6 cannot be closed without it.
  Noticed: step 1–3 review.

- **README.md is a 20-byte stub.** SPEC.md §14 requires it to cover local setup,
  running migrations, obtaining a Discogs token, running each test suite, and
  deploying. That is project-level definition-of-done, not build step 1, so it
  was left untouched. Noticed: step 1.

- **`.env` and `.env.local` already exist in the working tree** (both gitignored,
  predating step 1). They were deliberately not read, so `.env.example` was
  written from SPEC.md §2 alone. If the variable names in those files diverge
  from `.env.example`, boot validation will fail against them and the two will
  need reconciling by hand. Noticed: step 1.

- **`npm audit` reports 4 moderate advisories, all one transitive chain.**
  `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → an old
  `esbuild` (GHSA-67mh-4wv8-2f99: the esbuild dev server will answer cross-origin
  requests). It is devDependency-only and does not reach the app or production
  bundle. `npm audit fix --force` resolves it by downgrading drizzle-kit to
  0.18.1, a breaking major regression, so it was left alone. Worth rechecking
  when drizzle-kit next updates its bundler. Noticed: step 1.

- **`d3-force` was installed in step 1 though not used until step 10.** SPEC.md §2
  names it in the fixed stack, so it was installed with the rest of the stack
  rather than deferred. No code imports it yet. Noticed: step 1.

- **`price_history` is append-only by convention only (SPEC.md §7.5).** Nothing
  in the schema prevents an `UPDATE`, and the `set_updated_at` trigger is
  attached to the table, which implies updates are expected. Enforcement is left
  to the query layer as the spec directs; a revoke or a rule could harden it
  later if that proves too weak. Noticed: step 2.

- **`records.condition_media` / `condition_sleeve` are nullable.** SPEC.md §4.2
  lists no NOT NULL on either, so they were left nullable and taken literally.
  Worth confirming that a record with unknown condition is intended to be
  representable. Noticed: step 2.

- **Next 16 deprecates the `middleware` file convention in favour of `proxy`.**
  The dev server warns on every boot and offers a codemod
  (`npx @next/codemod@canary middleware-to-proxy .`). `src/middleware.ts` works
  correctly today and SPEC.md §3 says "Next.js middleware" explicitly, so it was
  left alone rather than migrated mid-step. Worth doing before step 14 (deploy).
  Noticed: step 3.

- **A stray `next-server` (v16.2.12) was running on port 3000** from another
  project when E2E was first run. Playwright now uses port 3100 (`E2E_PORT`) so
  runs never collide with a dev server. Not this project's process; left alone.
  Noticed: step 3.

## Resolved

- ~~Integration test files raced each other against the shared test database.~~
  Resolved in unit 1 (step 4). Latent since step 2 and invisible until a second
  integration file existed: every integration test truncates in `beforeEach`
  (CLAUDE.md §2), and vitest runs files in parallel by default, so one file's
  truncate landed inside another file's test. It presented as
  `TypeError: Cannot read properties of undefined` on rows that had just been
  inserted, in `test/integration/schema.test.ts` — a file unchanged by this
  unit — with a *different subset* failing on each run. `fileParallelism: false`
  in `vitest.config.mts` serializes files; `test/repo/integration-isolation.test.ts`
  asserts the setting via a spawned tsx probe and was mutation-verified.
  Serial execution is the cost of one shared database; if the suite gets slow
  enough to matter, the fix is a database-per-worker, not re-enabling
  parallelism.

- ~~`npm test` failed unless the caller exported `TEST_DATABASE_URL` inline.~~
  Resolved in unit 0 (step 4). `drizzle.config.ts` loaded `.env.test` for the
  CLI, but nothing loaded it into vitest's own process, so `test/global-setup.ts`
  threw before any test ran. The suite passed only because it was being invoked
  with the variable exported — CI would not have. `vitest.config.mts` now calls
  `config({ path: '.env.test' })` at module scope, mirroring the drizzle config.
  `test/repo/env-loading.test.ts` asserts on the outcome (a real spawned vitest
  process resolves a local URL with nothing exported and a remote `DATABASE_URL`
  ambient), not on the presence of the call; mutation-verified that removing the
  load fails that test *even when `TEST_DATABASE_URL` is exported*, so it
  constrains the config rather than duplicating the global-setup throw. dotenv
  does not overwrite an already-set value, so an explicit override still wins —
  covered by a second test.

- ~~`next dev` appended a generated agent-rules block to CLAUDE.md on every run.~~
  Resolved during step 3 (post-review). `next dev` writes the block to
  `AGENTS.md` when that file exists and hosts it, and skips CLAUDE.md entirely
  (`writeAgentFiles` in `node_modules/next/dist/server/lib/generate-agent-files.js`,
  lines 99–104). `AGENTS.md` now carries the block verbatim and points at
  CLAUDE.md and SPEC.md as authoritative. Verified by running `next dev` and
  confirming CLAUDE.md's checksum is unchanged; `test/repo/claude-md-integrity.test.ts`
  fails if this ever regresses. If a future Next version changes the block text,
  that suite will fail and AGENTS.md needs re-syncing — do not let the generator
  fall back to CLAUDE.md.

- ~~`next dev` rewrote tsconfig.json.~~ Resolved during step 3 (post-review):
  accepted as-is by developer decision. One semantic change — adding
  `.next/dev/dev/types/**/*.ts` to `include` — plus cosmetic one-item-per-line
  array formatting. The added directory does not currently exist and typecheck
  passes without it; `.next/` is gitignored, so it has no effect on a clean
  checkout. The rewrite is one-time, not recurring: a second `next dev` run
  leaves the file byte-identical.

- ~~SPEC.md §2 line 41 said driver selection was by `TEST_DATABASE_URL` /
  `NODE_ENV`, while the implementation used `TEST_DATABASE_URL` alone.~~
  Resolved: §2 was amended to mandate `TEST_DATABASE_URL`-only selection,
  empty-string-as-absent, and a throw on `NODE_ENV=test` with no test URL. Spec
  and code now agree.

- ~~SPEC.md §4.3 was silent on whether junction-table FKs cascade.~~ Resolved
  during step 2: §4.3 was amended with an explicit cascade rule and its
  reasoning — without it, `DELETE /api/records/:id` (§5.2) would fail on an FK
  violation. Reference rows remain protected by NO ACTION FKs on the owning
  tables, so §7.4's 409 behavior is unaffected.

- ~~SPEC.md §2 prohibited `node-postgres` while CLAUDE.md §2 required a plain
  Postgres path for the local test database.~~ Resolved during step 1: SPEC.md §2
  was amended to scope the prohibition to serverless production functions and to
  name `pg` as a devDependency for the local test path.
