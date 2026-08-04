# NOTES.md

Out-of-scope observations recorded during build steps, per CLAUDE.md §4.
Nothing here has been acted on. Each entry names the step it was noticed in.

---

## Open

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

- **SPEC.md §2 line 41 still says driver selection is "by `TEST_DATABASE_URL` /
  `NODE_ENV`".** The implementation selects on `TEST_DATABASE_URL` presence
  *alone*, per developer instruction, because Playwright does not set
  `NODE_ENV=test` — selecting on `NODE_ENV` would have E2E runs connect to the
  real Neon database, which the reset-between-tests rule would then truncate.
  `NODE_ENV=test` with no `TEST_DATABASE_URL` is now a hard error rather than a
  fallback. Worth reconciling the §2 wording so the spec matches the code.
  Noticed: step 1 (post-review).

## Resolved

- ~~SPEC.md §2 prohibited `node-postgres` while CLAUDE.md §2 required a plain
  Postgres path for the local test database.~~ Resolved during step 1: SPEC.md §2
  was amended to scope the prohibition to serverless production functions and to
  name `pg` as a devDependency for the local test path.
