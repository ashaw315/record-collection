# CLAUDE.md

Operating rules for this repository. These are not suggestions. Read this file in full before any implementation work, at the start of every session, and again before starting any new numbered step from the build order.

The authoritative feature specification is **`SPEC.md`**. This file governs *how* you work. `SPEC.md` governs *what* you build. Where they appear to conflict, stop and ask.

---

## 1. The loop

Work happens in **one build step at a time**, in the order given in `SPEC.md` §12. A step is not "in progress" until you have announced it and the developer has confirmed. Do not begin step N+1 because step N felt short.

For every unit of work, follow this sequence without exception:

1. **Restate the task.** One paragraph: what you are about to build, which `SPEC.md` sections govern it, and what is explicitly out of scope for this unit.
2. **State your plan.** Files you will create or modify, and why. If the plan touches more than 8 files, stop and propose splitting the unit.
3. **Write the tests first.** See §2.
4. **Run the tests. Watch them fail.** Paste the failure output. A test that has never failed has not been shown to test anything.
5. **Write the minimum code to pass.** No speculative abstraction, no "while I'm here" refactors, no unrequested features.
6. **Run the tests. Watch them pass.** Paste the output.
7. **Run the full suite**, not just the new tests, to prove nothing regressed.
8. **Report and stop.** Summarize what changed, what is now green, and what the next step would be. **Then wait.** Do not proceed to the next unit unprompted.

Step 8 is the one you will be most tempted to skip. Don't. The developer is reviewing and verifying as we go, and a large unreviewed diff is worse than a small one, even if it is correct.

---

## 2. Test-driven development is mandatory

**Write the test before the implementation. Every time. No exceptions.**

- If you find yourself writing implementation code and no failing test exists for it, stop, delete it, and write the test.
- If a test passes the first time you run it, treat that as a defect in the test. Either it does not test what you think, or the behavior already existed. Investigate before continuing.
- Do not write tests after the fact to "cover" code you already wrote. That is not TDD and it produces tests shaped by the implementation's bugs.
- **A throwaway probe becomes a test before the unit is done.** If a scratch script, an inline `console.log`, or a temporary spec is what convinced you a branch works, that verification must survive the session as a committed test. Verification that does not survive the session did not happen. This is not the same as writing tests after the fact: the probe came first and drove the fix — committing it is finishing the job, not backfilling.
  This rule exists because a dead `isUniqueViolation` survived an entire build unit behind a confident comment, and because the fix for it was *itself* left unconstrained when the probes that proved it were deleted. Both times the code worked; both times nothing would have noticed if it stopped.
- **For every test, name the line of source it would fail against.** If the answer is "none directly", or "some other test would catch that", the test is decorative — it resembles verification without constraining the code under test. Rewrite it to call the function it names and assert its output, or delete it.
  Three instances of this shape have already shipped here: a probe that proved a branch worked and was then deleted; a length test that measured `[...str].length` inline rather than calling `nameLength`, so it passed whatever that function did; and a whitespace test whose real failure mode was caught incidentally by a different test. A fourth variant is worse — **a test whose precondition is silently destroyed**, as when an NFD string literal is normalized to NFC on being written to disk, leaving `expect(nfc).not.toBe(nfd)` comparing a value with itself. When a test depends on a precondition that tooling can quietly break, assert the precondition explicitly and construct the value from escapes.

**The one carve-out.** A few build steps have no meaningful test-first path: project scaffolding, config files, migrations themselves, and deploy configuration. For these, the verification is a **command that must succeed**, not a unit test. State up front which command proves the step (e.g. `npm run build` succeeds; `npm run db:migrate` runs clean on an empty database; the dev server boots and `/login` renders). Run it, paste the output, and treat a failing command exactly as you would a failing test. Do not invent hollow unit tests to satisfy the TDD rule where none are warranted — and do not use this carve-out for anything containing business logic.

**Test layers** (see `SPEC.md` §11 for required coverage):

| Layer | Tool | Use for |
|---|---|---|
| Unit | Vitest | Pure functions: scoring, ordering, mapping, parsing, validation |
| Integration | Vitest + test DB | Route handlers, transactions, constraints, auth |
| E2E | Playwright | The eleven user flows in `SPEC.md` §11 |

**Rules:**
- Every route handler gets integration tests for all four cases: happy path, validation failure, not found, unauthenticated.
- Never mock the database in integration tests. Use a real test database, reset between tests.
- **The test database is a local Postgres instance via Docker Compose**, not a Neon branch — CI and offline work must not depend on a network. Provide `docker-compose.yml` at the repo root and a `TEST_DATABASE_URL` env var. Each test run applies migrations to a clean database; each test truncates rather than re-migrating.
- **Driver caveat:** production uses Neon's serverless (HTTP) driver, but the local test database is plain Postgres. Put the driver choice behind a single module that selects based on environment, so both paths use identical Drizzle query code. Transactional behavior differs between the two — the acquire-flow transaction test (`SPEC.md` §11) must run against real Postgres, and any transaction code must be verified to work over the Neon driver before deploy, not assumed.
- Always mock Discogs and the Anthropic API. Never allow a test to make a live external call — not even "just once to check." Store realistic fixture payloads under `test/fixtures/`.
- Coverage is not the goal; the flows and cases enumerated in `SPEC.md` §11 are the goal. Do not add trivial tests to raise a number.
- **Never modify a test to make failing code pass.** If a test is genuinely wrong, say so explicitly, explain why, and get agreement before touching it.

---

## 3. Before you write anything, check the rules

Before every implementation unit, verbally confirm you have checked these. If any is uncertain, ask rather than assume.

- [ ] Which `SPEC.md` sections govern this unit? (Section numbers below refer to `SPEC.md` unless stated otherwise.)
- [ ] Does this touch the schema? If so, does `SPEC.md` §4 already specify it?
- [ ] Does this add an endpoint? Is it in §5 exactly as specified — path, method, shape?
- [ ] Am I about to add a dependency? (See CLAUDE.md §5.)
- [ ] Is any part of this on the non-goals list, §13?
- [ ] Are there business rules in §7 that apply?

---

## 4. Scope discipline

**Build exactly what the current step calls for. Nothing else.**

Things that are out of scope by default, always:
- Features not in `SPEC.md`.
- Anything in `SPEC.md` §13 (non-goals). Re-read it if unsure.
- Refactoring code outside the current unit.
- "Improving" a previous step's implementation.
- Adding configuration, tooling, or abstraction layers not asked for.
- Performance optimization before a measured problem exists.

If you notice a genuine problem outside the current scope, **write it down and report it at step 8**. Do not fix it mid-stream. A running list lives in `NOTES.md`.

If the spec is silent on something you need, do not invent a feature to fill the gap. Ask. The default answer to "should I also build X" is no.

---

## 5. Dependencies

The stack in `SPEC.md` §2 is fixed. Beyond it:

- **Ask before adding any dependency.** State what it does, why hand-rolling is worse, and its weekly download count.
- Do not add a library to avoid writing twenty lines.
- Do not swap a specified library for one you prefer.
- Do not add: state management libraries (React state and server components are sufficient), ORMs other than Drizzle, component libraries other than shadcn/ui, date libraries beyond what shadcn pulls in, or test frameworks beyond Vitest and Playwright.

---

## 6. Code standards

- TypeScript strict mode. `any` is forbidden except at the boundary of genuinely untyped external payloads, and there it must be immediately narrowed with a Zod parse.
- Validate every route input with Zod at the boundary. Reject unknown keys.
- Never use non-null assertions (`!`) to silence the compiler. Handle the null.
- Errors return the shape in `SPEC.md` §5. No stack traces in responses.
- No `console.log` in committed code. Use a small logger module.
- Server-only code must never be importable from a client component. Mark server modules with `import 'server-only'`.
- Database access lives in a query layer, not inline in route handlers.
- Comments explain *why*, never *what*. Do not narrate the code.

---

## 7. Database rules

- **Every schema change is a Drizzle migration.** Never edit a committed migration. Never hand-modify the database.
- Migrations must run clean on an empty database, every time. Verify this before reporting a schema step done.
- Migrations are forward-only. If something is wrong, write a new migration.
- Never write a destructive migration (drop column, drop table, change type with data loss) without flagging it explicitly and getting confirmation first.
- Respect the schema-wide rules in `SPEC.md` §4 — especially: duplicate records are legal, `pressings` are shared and found-or-created, `price_history` is append-only, and reference rows in use are never cascade-deleted.

---

## 8. Domain rules you will otherwise get wrong

This app is about vinyl records. Several distinctions matter and are easy to flatten. Getting them wrong produces an app that is confidently misleading, which is worse than one that is obviously broken.

- **"Best dig" means the highest-fidelity pressing worth hunting for. It does not mean the cheapest, the best deal, or the best price.** `max_price` is a separate, unrelated field. Never conflate them in logic, variable names, or UI copy.
- **A pressing is not an album.** Two records with the same artist and title can be completely different objects worth wildly different amounts. The ownership check in `SPEC.md` §7.7 must distinguish "you own this exact pressing" from "you own a different pressing of this album." Collapsing those is the single worst bug this app can ship.
- **Discogs data is user-submitted and imperfect.** Never present a Discogs match as certain. Never overwrite user-entered data with Discogs data. Matrix/runout is user-authoritative.
- **Genres are a hierarchy, not a flat list, and the distinctions are real.** UK first-wave punk, UK82, US hardcore, horror punk, and psychobilly are different scenes with different sounds. Do not flatten them to "punk" anywhere — least of all in the LLM suggestion prompt.
- **This app never sells anything.** No purchase paths, no marketplace links, no affiliate anything. Prices are displayed as information only.

---

## 9. Communication

- Be direct. Report what is broken plainly.
- **Never claim something works that you have not run.** If you did not execute the test, say so.
- If you are uncertain, say you are uncertain and state what would resolve it. Do not present a guess in confident prose.
- If you get stuck, stop and say so after two failed attempts at the same problem. Do not thrash, and do not start rewriting adjacent code hoping something shakes loose.
- If an instruction from the developer conflicts with `SPEC.md`, flag the conflict rather than silently picking one.
- Do not apologize repeatedly. Fix the thing and move on.

---

## 10. Definition of done for a unit

Do not report a unit complete unless all of these are true and you have verified each by running it:

- [ ] Tests were written before the implementation.
- [ ] The tests were observed failing, then passing.
- [ ] The full suite passes, not just the new tests.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` clean.
- [ ] `npm run build` succeeds.
- [ ] Migrations (if any) run clean from an empty database.
- [ ] No new dependencies were added without approval.
- [ ] Nothing on the §13 non-goals list was built.
- [ ] Out-of-scope observations were recorded in `NOTES.md` rather than acted on.

---

## 11. Session start checklist

At the beginning of every session, before anything else:

1. Read this file.
2. Read `SPEC.md` §12 and state which build step is next.
3. Read `NOTES.md` for outstanding observations.
4. Run the full test suite and report its current state.
5. State the plan for this session's single unit of work, and wait for confirmation.
