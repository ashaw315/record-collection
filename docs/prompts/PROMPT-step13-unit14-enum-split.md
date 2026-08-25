# Step 13 unit 14 — the gatefold enum split

Baseline `0ed1a89`.

**This is a destructive migration and CLAUDE.md §7 requires confirmation before it runs.**
Adam has confirmed it. What follows is the shape it must take and the checks that make it
safe.

Nothing else is in this unit. No renderer, no textures, no component work.

---

## What changes

`image_type` gains two values and loses one:

```
cover | back | gatefold | label | matrix | other
                  ↓
cover | back | gatefold_left | gatefold_right | label | matrix | other
```

§4.2 as amended by A21a is the authority on the final list.

**The data question is settled and does not need re-deriving.** Production Neon was measured
directly: 2 rows in `images`, both `cover`, zero `gatefold`, zero `back`. So the value being
removed has never been used and no row needs mapping to a leaf. Do not re-take that count
against the local test database and report it — that database is truncated between runs and
its zero means nothing, which is exactly the flattering-but-wrong claim NOTES records four
times.

---

## The migration

Postgres cannot remove an enum value in place. The type must be replaced: create the new
type, convert the column with a `USING` cast, drop the old type, rename. **Migration 0005 did
this for `price_type` and is the worked example in this repository** — read it before writing
this one rather than deriving the dance from scratch.

Three things NOTES records about this toolchain that will otherwise cost time:

1. **Use `drizzle-kit generate`**, then rename the generated file and fix the journal tag.
   Hand-writing the `.sql` and appending a journal entry by hand leaves
   `meta/NNNN_snapshot.json` missing, and `drizzle-kit migrate` then prints *"migrations
   applied successfully"* and applies nothing. The success line is unconditional on the file
   being found.
2. **`npx drizzle-kit migrate` does not load `.env.test`.** It exits 1 with an empty stderr
   having applied nothing, which reads exactly like broken SQL. Pass the URL explicitly:
   `TEST_DATABASE_URL=... npx drizzle-kit migrate`.
3. **`git add drizzle/`.** The fresh-clone migration test copies only tracked files, so a new
   `.sql` and snapshot are invisible to it while the journal already references them. This
   has failed twice for exactly this reason and belongs in the checklist, not in the
   debugging that follows.

**Verify by querying the schema, not by reading the success line.** Run `enum_range` after
migrating, and check ordinal positions as well as membership — `test/integration/schema.test.ts`
asserts `enumsortorder` and will fail on this change. That failure is the test doing its job;
update what it expects deliberately rather than relaxing it. The two leaves should sit
adjacent to each other and after `back`, so the enum reads in the order a person meets the
images.

---

## Both remote databases, in this unit

NOTES records this hazard three times, most recently one unit after it was written down:

> The local Docker test database is migrated by `drizzle-kit`. **Both remote databases — dev
> and the Neon test branch — are maintained out of band and drift on every migration.**

The tell is `test/integration/neon-transactions.test.ts` failing with an `INSERT` column list
naming something the branch lacks, inside a test called "rolls back the real nested-write
primitive". It reads as a transaction bug and is not one.

So: apply the DDL to the Neon test branch and to dev **as part of this unit**, not when the
tests go red.

Note that `TEST_DATABASE_URL=<neon-url> npx drizzle-kit migrate` is correctly refused by
`assertLocalTestDatabase` — that guard exists because integration tests truncate from that
variable, and it must not be worked around. Apply the statements directly against
`NEON_TEST_DATABASE_URL`, and against `DATABASE_URL` for dev.

**Report which databases you applied it to and how you verified each.** "Migrations run
clean" against the local database alone does not answer this.

---

## Tests

CLAUDE.md §2's carve-out applies to the migration itself — the verification is a command that
must succeed, run from an empty database.

What is not carved out is anything that reads or writes `image_type`. Find every reference to
the old value: the Drizzle schema's enum, any TypeScript union or constant listing image
types, the upload route's validation, the gallery's ordering, and the fixtures. **Grep for the
root, `gatefold`, not for a specific phrase** — six enumerations in this project's recent
history came up one short because they searched for a phrase rather than a root.

`test/integration/schema.test.ts` will fail. Update it to the new membership and ordering, and
say in the report what the ordering now is and why.

---

## Report

Beyond CLAUDE.md §10's checklist:

- The migration file, and confirmation it was generated rather than hand-written.
- `enum_range` output from each database you applied it to.
- Which databases were migrated, and how each was verified.
- Every file that referenced the old value, and how you found them.
- Whether `schema.test.ts`'s ordering assertion needed updating, and what it asserts now.
- Commit hash, and confirm `HEAD` moved.

Full E2E run with no file argument. Then stop — the renderer is the next unit.
