# Running the app locally

`npm run dev` connects to **Neon main** — your real collection. The test
suites connect to a **local Docker database** that they wipe. No flags either
way.

---

## The three databases

This project touches three, and knowing which is which is most of the problem.

| Database | Where | Holds | Wiped by |
|---|---|---|---|
| **Local test** | Docker, `localhost:5433` | test fixtures | `truncateAll`, between every integration test **and** at the start of every Playwright run |
| **Neon main** | `ep-royal-rain-…` | your real collection | nothing |
| **Neon test branch** | `ep-curly-mode-…` | throwaway rows for the transaction gate | its own cleanup |

## Which database each command uses

Driver selection is by **`TEST_DATABASE_URL` alone** — never `NODE_ENV`
(`src/lib/db/connection-string.ts`). If that variable is set and non-empty, the
app uses it; otherwise it falls through to `DATABASE_URL`.

The variable lives in **`.env.test` only**. `.env.local` deliberately does not
set it.

| Command | Reaches |
|---|---|
| `npm run dev` | Neon main — `.env.local` has no `TEST_DATABASE_URL` |
| `npm test` | local — `vitest.config.mts` loads `.env.test` |
| `npx playwright test` | local — runs under `NODE_ENV=test`, so Next loads `.env.test` |
| `npm run db:migrate` | **Neon main** — see below |

This used to be the other way round: `.env.local` set the variable, so
`npm run dev` wrote to the *test* database and anything entered through the UI
vanished on the next `npm test`. `test/repo/dev-targets-neon.test.ts` asserts
the current arrangement, because it is the kind of thing that reverts silently.

## Migrating

`drizzle.config.ts` uses the same resolver, but loads `.env.test` **only when
`NODE_ENV=test`**. Verified by running both forms:

```bash
npm run db:migrate                # -> Neon main
NODE_ENV=test npm run db:migrate  # -> local test database
```

This changed with the move: while `.env.local` set `TEST_DATABASE_URL`, the
plain form went to the local database. It now goes to Neon, which is the right
default for a schema change you intend to keep — but check the target before
running it, because migrations are forward-only and are never edited after
committing (`CLAUDE.md` §7).

`npm test` applies migrations to the local database itself, via
`test/global-setup.ts`, so the suites need no manual migrate step.

## First-time setup

```bash
npm install
npm run db:test:up        # start the Docker test database, for the suites
npm test                  # migrates the local database and runs the suite
```

## Tests

```bash
npm test                  # vitest: unit + integration, against the local test DB
npx playwright test       # E2E: starts its own dev server on :3100 under NODE_ENV=test
```

Both need `npm run db:test:up` first. Playwright uses `.env.test`, not
`.env.local`, so an E2E run never touches Neon or your own credentials —
except the transaction gate, which uses `NEON_TEST_DATABASE_URL` and skips
loudly when it is unset.

---

## Two things worth knowing

**The E2E run resets the local test database at the start** — see
`e2e/global-setup.ts`. It is one-directional and cannot reach Neon: the guard in
`assertLocalHost` refuses any connection string that is not unmistakably the
local container.

**Migrations are forward-only and are never edited after committing**
(`CLAUDE.md` §7). If something is wrong, write a new one.
