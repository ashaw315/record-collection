# Record Collection Tracker — Implementation Spec

## 0. How to use this document

This is a complete build specification for a single-developer project. Implement it in the order given in §12 (Build Order). Do not deviate from the stack in §2 or the schema in §4 without flagging the reason first. Where this spec is silent on a detail, prefer the simplest option that does not require a schema migration to undo later.

---

## 1. Overview

A personal vinyl record collection tracker. Two core datasets: **records owned** and a **want-list** of records to acquire. Around those sit reference data (artists, genres, labels, stores, pressings) that make two signature features possible:

1. **The shelf** — the collection rendered as a wall of spines, ordered by genre so related records stand together, with a record that can be pulled out and turned over (§10b). It is the default view of the collection.
2. **In-store lookup** — a structured Discogs search that answers "do I already own this pressing?" and "is this a fair price?" while standing in a shop (§5.7, §7.7, §10a).

Plus a **suggestion engine** that recommends records to acquire from the relationships in the collection: influence edges the user has asserted and shared band membership imported from MusicBrainz (§9). A genre-overlap term is specified and unbuilt, because nothing populates its source (§9.1a).

An earlier version of this spec named a force-directed network graph and a derived shelf *ordering* as the two signature features. Both were built and retired at step 13; §8 records why, and §10b is what replaced them. The relationship data they read from is untouched and still feeds §9.

Single user for v1, behind a password gate. Designed so multi-user is a later feature flag, not a rewrite.

---

## 2. Stack (non-negotiable)

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript strict mode |
| Database | Postgres via Neon (Vercel's native Postgres) |
| ORM | Drizzle ORM + Drizzle Kit for migrations |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| 3D | `three` — the pulled record only (§10b). The shelf stays CSS. Adopted after the flat version was built and judged: the motion was right and the object was not, and lighting across a printed surface is the part CSS cannot do. |
| Image processing | `sharp` — spine colour averaging at import (§10b). Present transitively via Next; **declared explicitly** so a Next minor release cannot remove it. |
| Unit/integration tests | Vitest |
| E2E tests | Playwright |
| Hosting | Vercel |
| External API | Discogs (personal access token) |
| LLM | Anthropic API (suggestion engine, §9.2) |

**Constraints:**
- All DB access goes through Drizzle. No raw `pg` client usage except in migration scripts.
- **In production and development against Neon**, use `@neondatabase/serverless` with Drizzle via the **WebSocket `Pool` adapter (`drizzle-orm/neon-serverless`)** — not `node-postgres`, and **not** the HTTP adapter (`drizzle-orm/neon-http`). The HTTP driver cannot do interactive transactions, and §5.3's acquire flow and §5.7's import both require them. Using HTTP for reads and WebSocket for writes would mean two production code paths and a class of bug that only appears once deployed; use WebSocket throughout. The marginal per-query latency versus HTTP is immaterial at this scale.
- **Against the local Docker test database**, use `pg` (`drizzle-orm/node-postgres`), installed as a devDependency. The prohibition above is scoped to serverless production functions and does not apply here. Both paths sit behind the single driver-selection module described in CLAUDE.md §2 and share identical Drizzle query code; **selection is by the presence of `TEST_DATABASE_URL` alone — never by `NODE_ENV`.** Playwright does not set `NODE_ENV=test`, so keying on it would route E2E runs to the production database, where the reset-between-tests rule would truncate real data. An empty-string `TEST_DATABASE_URL` counts as absent. `NODE_ENV=test` with no `TEST_DATABASE_URL` must throw, not fall through to Neon.
- API surface is Next.js Route Handlers under `app/api/`. Do not create a separate Express server.
- Secrets and required environment values (`DISCOGS_TOKEN`, `ANTHROPIC_API_KEY`, `APP_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `MUSICBRAINZ_CONTACT_EMAIL`) live in env vars and are only ever read server-side. Never expose them to a client component. Validate all of them at boot with Zod and fail fast with a clear message naming the missing variable.
- **`d3-force` is no longer part of the stack.** It was specified for §8.1's graph, which is retired. Before uninstalling, grep for importers — a null result from a search that could not have found it is not evidence (NOTES). If nothing imports it, remove it; the dependency and this line go together.
- **`three` is scoped to the pulled record and nothing else.** §10b's wall is deliberately 2D. A change that renders the shelf in WebGL is a spec change, not an implementation detail.

`MUSICBRAINZ_CONTACT_EMAIL` is not a secret but is required by MusicBrainz's terms of use in the `User-Agent` (§12 step 11), and §14 requires every variable documented in `.env.example`. Three of these fail at point of use rather than at boot — Blob, MusicBrainz contact, Anthropic — which R6 is tasked with checking.

---

## 3. Auth

Simple password gate. Not a user system.

- Single shared password stored as a bcrypt/argon2 hash in env var `APP_PASSWORD_HASH`.
- `POST /api/auth/login` accepts `{ password }`, verifies against the hash, sets an httpOnly, secure, sameSite=lax session cookie (signed JWT or iron-session; pick one, 30-day expiry).
- Next.js middleware protects all routes except `/login` and `/api/auth/login`.
- **Cron exception:** `/api/discogs/refresh-prices` is not reachable by session cookie. It authenticates instead via a `CRON_SECRET` bearer token (Vercel Cron sends this automatically). Reject any request to it lacking a valid secret with `401`. Do not exempt it from middleware wholesale — that would leave it open to the internet.
- `POST /api/auth/logout` clears the cookie.
- **Forward compatibility:** every user-owned table (`records`, `want_list`, `journal_entries`) gets a nullable `user_id UUID` column now, unused in v1. Do not add a `users` table yet.

---

## 4. Schema

All tables: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` unless stated otherwise.

**Schema-wide rules:**
- Enable the `pg_trgm` extension in the first migration (required by the fuzzy-search indexes in §4.4). `gen_random_uuid()` is built into Postgres 13+; do not add `uuid-ossp`.
- `updated_at` is maintained by a Postgres trigger, not by application code. Write one `set_updated_at()` trigger function and attach it to every table.
- **Duplicate records are legal and expected.** A collector may own two copies of the same album in different pressings or conditions. Never add a unique constraint on `(artist_id, title)` and never dedupe on save.
- **`pressings` rows are shared, not owned.** Before creating one, find-or-create by `discogs_release_id` if present, otherwise by the tuple `(catalog_number, country_pressed, year_pressed)`.
  - **Find-or-create applies only when the match key is non-empty.** If `discogs_release_id` is absent and all three tuple fields are null, always CREATE — an absent key identifies nothing, and matching all-nulls against all-nulls would silently share one row between two unrelated white-label pressings, then let an edit to one change the other. That is the pressing-is-not-an-album hazard (CLAUDE.md §8) arriving through the back door.
  - **`matrix_runout` counts as identifying but is not part of the match key.** A white label with no catalog number but a distinct etched runout is identified, not unknown — so a request carrying only a matrix value is not "empty" and must still create. It stays out of the auto-match key because runout transcriptions are frequently partial or inconsistent, and a false merge is worse than a duplicate: a duplicate is visible and fixable, a false merge silently rewrites another record's pressing. A pressing may be referenced simultaneously by a `records` row and a `want_list.target_pressing_id`.
- Deletion of a `pressings` row is rejected if referenced (same `409 IN_USE` rule as §5.4).

### 4.1 Reference tables

**`artists`**
| Column | Type | Notes |
|---|---|---|
| name | TEXT NOT NULL | **Not unique.** Two different bands genuinely share a name — MusicBrainz carries two distinct UK groups called Discharge — and a unique constraint asserts they are one artist. That is §8's pressing-is-not-an-album hazard at the artist level, and it silently fuses two bands' lineups and records. Uniqueness lives on the external ids below, which identify an artist; a name does not. |
| musicbrainz_id | TEXT | nullable, **unique when present** (partial unique index), matching `discogs_artist_id` — §4.1's find-or-create keys must behave identically. |
| formed_year | INTEGER | nullable. Validated at the API boundary to `1877 <= year <= currentYear + 1` — 1877 is the year sound recording began, so no recording artist predates it; +1 allows a band announced for next year. Not a database constraint: it is a product judgement, and the upper bound moves. **Compute the upper bound at validation time, never at module load** — a warm serverless instance that booted last December would otherwise reject a valid current year. Tests must derive the year rather than hardcode it. |
| origin_country | TEXT | nullable |
| notes | TEXT | nullable |
| discogs_artist_id | INTEGER | nullable, unique when present |

**`genres`**
| Column | Type | Notes |
|---|---|---|
| name | TEXT NOT NULL UNIQUE | |
| parent_genre_id | UUID REFERENCES genres(id) | self-referencing; nullable. Enables nesting (UK82 under Punk, Doom under Metal) |
| description | TEXT | nullable |

Guard against cycles in `parent_genre_id` at the application layer — a genre may not be its own ancestor.

**MEASURED 2026-08-26: the hierarchy is specified and effectively unpopulated.** The live collection carries **34 genres, 2 of which have a parent**. `Punk`, `UK82` and `US Hardcore` are SIBLINGS at the top level — and `UK82 under Punk` is this table's own worked example, one row above.

**That is the flattening CLAUDE.md §8 forbids, sitting in the database rather than in the code.** §8 is explicit that UK first-wave punk, UK82, US hardcore, horror punk and psychobilly are different scenes with different sounds; a flat vocabulary asserts they are peers of each other and of their own parent. Nothing in the app produced this: `parent_genre_id` has been correct and available since step 2, and assigning it is a manual edit per genre on `/manage`, which is why 32 of 34 were never done.

**Recorded here so the gap is legible as UNFILLED rather than unspecified.** A reader finding a flat genre list should see that the structure was always intended and never populated — not conclude that the hierarchy is aspirational or that flatness is the design. Any feature that helps assign parents is filling this gap, not inventing a structure, and it inherits §8's constraint: **the vocabulary is the user's, so a parent may be suggested and must never be assigned without confirmation.**

**`labels`**
| Column | Type | Notes |
|---|---|---|
| name | TEXT NOT NULL UNIQUE | |
| notes | TEXT | |
| discogs_label_id | INTEGER | nullable, **unique when present** (partial unique index) — matching `artists.discogs_artist_id` and `pressings.discogs_release_id`. All three are find-or-create keys for §5.7 import and must behave identically. |

**`formats`**
| Column | Type | Notes |
|---|---|---|
| name | TEXT NOT NULL UNIQUE | e.g. "LP", "7\"", "10\"", "Box Set" |

| is_seeded | BOOLEAN NOT NULL DEFAULT false | true for the seven rows below; never set by the API |

Seed with: LP, 2xLP, 7", 10", 12" Single, Box Set, Picture Disc, all with `is_seeded = true`.

**Seeded formats cannot be deleted.** `DELETE /api/formats/:id` returns `409` with code `SEEDED` for any row where `is_seeded` is true, *even when unreferenced* — nothing re-seeds them, so a delete is permanent and would leave the app without a format it depends on. User-created formats (including any created by §5.7's Discogs find-or-create) delete normally under the usual `409 IN_USE` rule. Identify seeded rows by the column, never by name: names are editable via PATCH, and a name-matched guard would fail silently after a rename. PATCH may rename a seeded row; it may not change `is_seeded`.

**This is the only seed data in the project** — no sample records, artists, genres, or want-list entries. The database starts otherwise empty.

**`record_stores`**
| Column | Type | Notes |
|---|---|---|
| name | TEXT NOT NULL | |
| city | TEXT | |
| state_region | TEXT | |
| country | TEXT | |
| address | TEXT | |
| website | TEXT | |
| notes | TEXT | |
| is_favorite | BOOLEAN NOT NULL DEFAULT false | |

**`tags`**
| Column | Type | Notes |
|---|---|---|
| name | TEXT NOT NULL UNIQUE | freeform, e.g. "signed", "gift", "first show" |

### 4.2 Core tables

**`records`** — owned items
| Column | Type | Notes |
|---|---|---|
| user_id | UUID | nullable, unused v1 |
| title | TEXT NOT NULL | |
| artist_id | UUID NOT NULL REFERENCES artists(id) | |
| label_id | UUID REFERENCES labels(id) | nullable |
| format_id | UUID REFERENCES formats(id) | nullable |
| pressing_id | UUID REFERENCES pressings(id) | nullable; the specific pressing owned |
| store_id | UUID REFERENCES record_stores(id) | nullable; where acquired |
| release_year | INTEGER | nullable. The album's original release year, **not** this pressing's year. Bounded at the API boundary by the same rule as `artists.formed_year` (§4.1): `1877 <= year <= currentYear + 1`, computed per call. |
| condition_media | condition_grade | enum, see below |
| condition_sleeve | condition_grade | enum |
| purchase_price | NUMERIC(10,2) | nullable |
| purchase_date | DATE | nullable |
| notes | TEXT | |
| spine_colour | TEXT | nullable. The average colour of this record's cover as `#rrggbb`, computed once when a cover image is attached and stored (§10b). |
| snippet | TEXT | nullable. Two or three generated sentences about the album (§10b). Absence is normal. |
| snippet_edited_at | TIMESTAMPTZ | nullable. Set when the user edits the snippet. |

**`spine_colour` is written once and never overwritten** (§7.8). It is computed from the *cover* image only — a matrix or label photograph averages to the vinyl or the label, not the sleeve, and would give a spine matching nothing on the shelf. `null` means no cover has been processed and is treated as absent rather than as a decision, so a record whose first cover failed to decode still gets a colour when a readable one arrives. A null spine renders plain (§10b): an honest absence, not a gap in the wall, and never a default colour.

The averaging rule itself is a product decision recorded in §10b, not a schema concern. The one schema-adjacent constraint: the value is stored, not derived per render, because computing it needs the image bytes.

**`snippet_edited_at` is what makes §7.8 enforceable here.** Null means the text is as generated and a regeneration may replace it; non-null means the user owns it and a regeneration must refuse rather than overwrite *unless the user explicitly confirms the replacement* (A31a, §10b). It records WHO OWNS THE TEXT — which determines whether replacing it needs consent — not whether replacing it is possible. The server enforces this: a regeneration against an edited snippet without confirmation is refused with `409`, so the safety does not depend on a dialog being present in some particular client. A boolean with a default would not do: `false` would mean both "generated" and "never asked", and the two become indistinguishable at write time (NOTES). Deleting a snippet sets `snippet` to null and leaves `snippet_edited_at` alone — a deliberate deletion is an edit.

**`condition_grade`** is a Postgres enum: `'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P'` (Goldmine standard).

**`want_list`**
| Column | Type | Notes |
|---|---|---|
| user_id | UUID | nullable, unused v1 |
| title | TEXT NOT NULL | |
| artist_id | UUID NOT NULL REFERENCES artists(id) | |
| label_id | UUID REFERENCES labels(id) | nullable |
| priority | INTEGER NOT NULL DEFAULT 3 | 1 = highest, 5 = lowest |
| target_pressing_id | UUID REFERENCES pressings(id) | the "best dig" — the highest-fidelity pressing worth hunting |
| best_dig_notes | TEXT | caveats, e.g. bootleg warnings, how to spot a fake |
| max_price | NUMERIC(10,2) | what the user is willing to pay |
| acquired_record_id | UUID REFERENCES records(id) | set when fulfilled; see §7.3. **Partial unique index where not null** — a record is the fulfilment of at most one want-list entry. |
| is_acquired | BOOLEAN NOT NULL DEFAULT false | |

**Important semantic:** `best_dig` means *the optimal pressing for sound quality*, not the cheapest option. Any UI copy must reflect this — never label it "best deal" or "best price".

**`pressings`** — a specific physical issue of a release
| Column | Type | Notes |
|---|---|---|
| catalog_number | TEXT | label's catalog # |
| matrix_runout | TEXT | etched in the dead wax; the true pressing fingerprint |
| pressing_plant | TEXT | |
| year_pressed | INTEGER | nullable. The year *this pressing* was manufactured, which for a reissue is later than the record's `release_year`. Same bound as `release_year` and `artists.formed_year`: `1877 <= year <= currentYear + 1`, computed per call. |
| country_pressed | TEXT | |
| vinyl_weight_grams | INTEGER | e.g. 140, 180 |
| color_variant | TEXT | e.g. "black", "clear w/ splatter" |
| discogs_master_id | INTEGER | the Discogs MASTER this release belongs to (A60) |
| discogs_release_id | INTEGER | nullable, unique when present |
| is_reissue | BOOLEAN NOT NULL DEFAULT false | |
| notes | TEXT | |

**`price_history`**
| Column | Type | Notes |
|---|---|---|
| record_id | UUID REFERENCES records(id) | nullable |
| want_list_id | UUID REFERENCES want_list(id) | nullable |
| pressing_id | UUID REFERENCES pressings(id) | nullable |
| price | NUMERIC(10,2) NOT NULL | |
| price_type | price_type enum NOT NULL | `'new' \| 'used' \| 'asking'`. **NOT NULL** — §7.6's fallback chain has no defined behavior for an untyped price. See the correction note in §7. |
| source | TEXT | e.g. "discogs_median", "manual" |
| recorded_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Exactly one of `record_id` / `want_list_id` must be non-null — enforce with a CHECK constraint.

**This table is exempt from the schema-wide `created_at` / `updated_at` rule.** `recorded_at` is its only timestamp: `created_at` would duplicate it and `updated_at` is meaningless on an append-only table. Neither column should exist.

**`record_id` and `want_list_id` are `ON DELETE CASCADE`.** Append-only restricts UPDATE, not DELETE (§7.5) — and without cascade, a record with any price history could never be deleted at all, breaking `DELETE /api/records/:id` (§5.2). Price history is a property of its parent; when the parent goes, it goes.

**`images`**
| Column | Type | Notes |
|---|---|---|
| record_id | UUID REFERENCES records(id) ON DELETE CASCADE | |
| url | TEXT NOT NULL | |
| image_type | image_type enum | `'cover' \| 'back' \| 'gatefold_left' \| 'gatefold_right' \| 'label' \| 'matrix' \| 'other'` |
| caption | TEXT | |

**Four of these are textures on the pulled record; the rest are gallery images.** `cover`, `back`, `gatefold_left` and `gatefold_right` are the object's skins (§10b), which is where the shape they are mapped at — and what happens when a stored image does not match it — is specified. An earlier version of this line said they "are expected to be square", which was an assumption about data the app does not control rather than a rule it enforces: Discogs serves whatever a contributor uploaded, and the first cover measured was 591×599. `label`, `matrix` and `other` are photographs of the record that appear in the gallery and are never mapped onto the object — a close-up of the dead wax is evidence about a pressing, not a surface of the sleeve.

`gatefold` was a single value, added before the affordance was built. It became two when the inner was specified as two square photographs rather than one wide spread. Removing an enum value is not possible in place: Postgres requires the type to be replaced, which is a destructive migration and needs confirmation before it runs (CLAUDE.md §7).

**The swap carries no data, and that was measured rather than assumed.** Production held two images at the time of writing, both `cover`: zero `gatefold`, zero `back`. So there is no row to remap and no decision about which leaf an existing `gatefold` row would have been — the case that would have made this migration genuinely hard does not arise. The §7 confirmation still stands, because replacing a type is destructive whatever it currently holds; what the count removes is the mapping problem inside it, not the need to confirm.

Use Vercel Blob for storage. Store the returned URL here.

**`discogs_cache`** — not user data; supports §6 caching
| Column | Type | Notes |
|---|---|---|
| discogs_release_id | INTEGER NOT NULL UNIQUE | |
| payload | JSONB NOT NULL | raw normalized response |
| fetched_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Also exempt from the `created_at` / `updated_at` rule — `fetched_at` is the only timestamp that means anything here, and it is rewritten on every refresh.

**`journal_entries`**
| Column | Type | Notes |
|---|---|---|
| user_id | UUID | nullable, unused v1 |
| record_id | UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE | |
| entry_date | DATE NOT NULL DEFAULT CURRENT_DATE | |
| note | TEXT NOT NULL | |

### 4.3 Junction tables

These carry the relationships the rest of the app reads: genre filtering and its hierarchy rollup (§7.1), the collection's facet counts (§5.2), the shelf's genre ordering (§10b), and §9.1's suggestion scoring. All are composite-PK, no separate `id`.

An earlier version of this line said they power the network graph. That screen is retired (§8); the tables and every other consumer of them are not.

**`record_genres`** — `(record_id, genre_id)`
**`want_list_genres`** — `(want_list_id, genre_id)`
**`artist_genres`** — `(artist_id, genre_id)`
**`record_tags`** — `(record_id, tag_id)`

**`artist_genres` has never held a row.** It has a schema, cascade rules, a `REFERRERS` entry, conformance tests and merge handling — all correct, none of which check that anything writes to it. `mergeArtists`' handling of it was found broken during a review, diagnosed, fixed and pinned with a test, for rows that cannot exist; the test builds its own fixture and genuinely proves the code works, and no test can notice that the production path feeding it has no source.

Recorded here rather than only in NOTES because it is a fact about the schema: **a table can read as populated because everything around it behaves as though it is.** The dead-code sweep finds a module with no callers by following imports; a table with no writers is not findable that way. The check is whether a write path exists, not whether rows are present — a table can be legitimately empty and fully wired.

**Cascade rule for junction tables — directional, not blanket.** A junction row has two FKs and they behave differently:

- **Toward the owning entity** (`record_id`, `want_list_id`, `artist_id` on `artist_genres`): `ON DELETE CASCADE`. Deleting a record removes its links.
- **Toward the reference row** (`genre_id`, `tag_id`): `NO ACTION`. Deleting a genre or tag that is still linked must be *refused*, surfacing as `409 IN_USE` (§5.4, §7.4). Cascading here would silently strip a tag from every record that had it — precisely the data loss the 409 exists to prevent.

`artist_influences` cascades on both FKs, since both point at `artists` as owner and an edge to a deleted artist is meaningless. A junction row is a *link*, not an entity — deleting a record must remove "this record is tagged punk" while leaving the genre itself untouched. This does not weaken §7.4: the reference row is protected by the NO ACTION FK on the owning table (`records.artist_id`, `records.label_id`, `records.pressing_id`, `genres.parent_genre_id`), which still produces a `409 IN_USE`. Without junction cascade, `DELETE /api/records/:id` (§5.2) would fail on an FK violation, so this is required, not optional.

**Dropping the name constraint does not drop the duplicate warning.** `POST /api/artists` keeps its check and still answers `409 DUPLICATE` with `existingId` when a name matches — because typing a name you already have is far more often a mistake than a genuine second band. What changes is that the client may override it: "you already have Discharge — add anyway?" A constraint the database enforced becomes a question the user answers, rather than a silence.

**`artist_match_candidates`** — a possible duplicate, recorded rather than asked about mid-import.

| Column | Type | Notes |
|---|---|---|
| artist_id | UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE | the row just created |
| candidate_artist_id | UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE | the existing local row it might be |
| reason | TEXT NOT NULL | e.g. `name_match_no_mbid` |
| resolved_at | TIMESTAMPTZ | nullable; set when the user decides |
| resolution | TEXT | nullable; `merged` \| `distinct` |

`UNIQUE NULLS NOT DISTINCT (artist_id, candidate_artist_id, reason)`, so a re-import raises nothing new.

A table rather than a column on `artists`, because a column holds one candidate and importing a name that matches two local rows has two — a column would silently drop one. And because the decision must persist: "these are distinct" has to be remembered or every re-import asks again, and a column would have to be nulled on resolution, losing the fact that it was ever answered.

**Artist resolution on import, and when to ask.** Matching an imported artist to a local row is where a silent wrong merge does the most damage, so the rule is asymmetric — declining to merge is visible and cheap, merging wrongly is invisible and self-reinforcing, because every later import matches the id that was attached in error.

- **MBID matches a local row** → the same artist. Use it.
- **Name matches a row carrying a *different* MBID** → definitely a different artist. Never merge; create a new row.
- **Name matches a row with no MBID** → genuinely ambiguous. Do not claim it, and do not block the import on a question the user cannot yet answer: create the artist and record the possible match. A first import against a collection of hand-entered artists hits this case constantly, and a wall of confirmations at that moment is a worse failure than a duplicate row.

Surface accumulated possible matches as a review afterwards, in `/manage`, where the user can merge deliberately with both artists in front of them. Asking once, later, with context beats asking thirty times during a walk.

**`musicbrainz_cache`** — artist relation payloads, keyed by MBID. Not `discogs_cache` or `market_cache`: both are keyed by `discogs_release_id`, and this holds a different entity type under a different key.

| Column | Type | Notes |
|---|---|---|
| musicbrainz_id | TEXT NOT NULL UNIQUE | the artist MBID |
| payload | JSONB NOT NULL | the raw artist-rels response |
| fetched_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**TTL is 90 days, not the 7 used elsewhere.** Lineups change on the scale of years; prices change weekly. Inheriting §6's rule would mean re-walking thirty-odd requests for a fact that has not moved since 1982. Put that reasoning in the code — 7 is the established number in this codebase and someone will otherwise "fix" the inconsistency. Same stale-read behaviour as §6: a stale entry reads as a miss but is left in place, so an outage serves three-month-old lineups rather than nothing.

**Store the raw payload, never the normalized relations.** Normalization is our code and it changes; caching its output freezes today's decisions into rows that outlive them by ninety days, and a later fix to the normalizer would never reach anything already fetched. The same reasoning governs `discogs_cache` (§6).

**Key on the MBID, not on a local artist id.** The same MusicBrainz person reached through two different bands' lineups is one fetch, and a local key would refetch them separately.

**Finding the MusicBrainz artist for a local row.** Hand-entered artists have no MBID, so a lineup walk must search by name — the one thing §4.3 says cannot identify an artist. **The search result is auto-accepted only when no other result carries the same name.** If two or more hits share the exact name, the candidates are returned and the user picks, whatever their scores.

The rule keys on the name because the name is what failed. An earlier version used a score gap — accept when the top hit scores 100 and the next is below 90 — and it is worth recording why that was wrong, since it looks more sophisticated. MusicBrainz ranks by how well documented an artist is, so among four groups called Discharge the famous d-beat band scores 100 and the others 83, 82, 82. A gap rule therefore auto-accepts exactly the case it was written to catch, and stays silent precisely where names are ambiguous. The spec previously justified that rule by asserting both Discharges score 100 — a measurement nobody had taken, and false for the query the code sends.

Name collision is rare enough that asking is cheap, and it is the only signal that means what it appears to mean.

**A confirmed MBID is written to `artists.musicbrainz_id`; an inferred one is not.** §4.3's resolver refuses to attach an id on a name match precisely because a wrong attachment is silent and self-reinforcing. A user who has been shown the candidates and chosen one has supplied the evidence the resolver lacked — that is a different act, and the id may be stored. The distinction is who decided, not how confident the code is.

**`gap_analysis_results`** — the last §9.2 gap analysis, kept for display (A39).

| Column | Type | Notes |
|---|---|---|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | |
| asked_at | TIMESTAMPTZ NOT NULL DEFAULT now() | What the screen shows as "asked N minutes ago" |
| suggestions | JSONB NOT NULL | The model's output, exactly as parsed and validated (A29d) |
| dropped | INTEGER NOT NULL DEFAULT 0 | A29d's count of suggestions discarded for an out-of-vocabulary genre |

**One row, superseded rather than accumulated.** The screen shows the last analysis, so an older one is debris; the store deletes before inserting rather than relying on a scheduled cleanup, for the reason §4.3 gives about rows carrying their own timestamps — a job that must run is a job that can fail to run.

**Exempt from §4's `created_at`/`updated_at` rule**, on the same grounds as `llm_requests`: `asked_at` is the only time this table has an opinion about. An `updated_at` would be worse than redundant — it would imply a row that changes, and a new analysis supersedes rather than updates, because an answer is a transcript of what was said at a moment.

**Stored as JSON deliberately.** These are the model's output, not the app's data: nothing joins to them and nothing queries inside them. Columns would invite exactly that — a schema implying these are facts about the collection. §9.2's rule that a suggestion never becomes a row in the collection is untouched; **this table is not the collection.**

**`llm_requests`** — one row per outbound Anthropic request, for §9.2's and §10b's rate limit.

| Column | Type | Notes |
|---|---|---|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | |
| kind | TEXT NOT NULL | `gap_analysis` \| `snippet` — the two callers, counted together |
| requested_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| completed_at | TIMESTAMPTZ | When the call finished, NULL if it never did. **Nullable is load-bearing:** a serverless function killed at `maxDuration` runs no cleanup, so a claim with no completion is the timeout signature and `claimLlmRequest` stops counting it past the function ceiling (R6 finding 5). Added at step 16; **this table omitted it until A38** |
| input_tokens | INTEGER | What the call cost, A38 |
| output_tokens | INTEGER | " |
| stop_reason | TEXT | `end_turn` \| `max_tokens`, or NULL if unreported |

Index on `requested_at`, which is the only column the limit reads.

**The usage columns are DIAGNOSTIC and are never read by the limiter (A38, 2026-08-26).** They exist to answer "how has this changed over time" — whether output grows with the collection, and whether §9.2's six-suggestion count still leaves the headroom it was estimated to leave. A log line answers "what happened just now"; a column answers the question that outlives the incident, which is the one that matters as a collection grows from 17 records to 200.

**Tokens must not become the quota, and this will look wrong to someone reasonable.** A request returning 4,000 tokens plainly costs more than one returning 200, so counting requests looks like a crude proxy for the thing that matters. It is not a proxy: **the quota protects a REQUEST budget agreed with Anthropic, not a token budget.** Swapping the unit silently changes what "ten" means — a user who asked ten cheap questions has capacity left under one rule and none under the other, with nothing in the UI or the spec explaining the difference. Metering on tokens is a different feature with a different agreement behind it and needs its own specification first.

**Nullable, never defaulted.** Rows predating the migration have unknown usage, not zero usage; a `DEFAULT 0` would fabricate a measurement for a call nobody measured. Same reasoning as `completed_at`, and the same distinction as the two live rows whose NULL means "this predates the question".

**A log of requests, not a counter.** A single mutable `count` row needs resetting on a schedule nothing runs, and answers "how many this hour" only if the reset fired. Rows carry their own timestamps, so the window is a `WHERE` clause and no scheduled job exists to fail. Rows older than the window are deletable at any time by anything, or never — the query is correct either way.

**Both callers share one budget.** §9.2's gap analysis and §10b's snippet are the same spend against the same account; two independent 10/hour limits would be a 20/hour limit nobody specified. `kind` records which asked, for diagnosis, and is not part of the count.

**Claimants must be serialised against each other, and one statement does not do it.**

Two separate hazards, and conflating them is how this was specified wrongly the first time:

1. **Check-then-act within one caller.** A `SELECT count(*)` followed by an `INSERT` sees two different states of the table, and another caller writes between them. Two concurrent requests both read 9, both pass, and both write — the eleventh request in an hour, admitted by a limiter that was correct at every individual step. This is the acquire-flow race in a new place, and §7.3's rule applies for the same reason: a pre-check handles bad input, and only the atomic write handles what changes between the check and the write.

2. **Concurrent claimants reading the same committed state.** A conditional insert — `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < limit` — closes the first hazard, because its count and its insert cannot interleave with each other. It does **not** close the second: under READ COMMITTED, the default here, a statement cannot see rows other transactions have inserted and not yet committed, so ten such statements issued together each count the same nine committed rows and each insert.

**So take `pg_advisory_xact_lock` on a fixed key before the count**, inside the transaction that performs the insert, so the lock is held until commit and the next claimant reads a committed table rather than a stale snapshot. Then treat **zero rows inserted** as the refusal: the caller learns the outcome from what the database did rather than from what it predicted.

**An earlier version of this section said "one statement, therefore atomic under one snapshot" and stopped there.** That sentence is true, reads as sufficient, and is not — the measurement that found it admitted ten claims against nine free slots, reproducibly, about two runs in five. Recorded rather than replaced silently, because anyone reading this section to build a second quota would otherwise inherit the error along with its justification.

**With the lock held, the statement's shape stops being load-bearing.** A count and an insert as two statements inside the lock is equally correct, because the lock is what makes it safe. The conditional insert is still preferred — it keeps the refusal in one place and needs no branch — but a test asserting the single-statement form is pinning an implementation detail rather than the property, and the property is that a claim cannot read stale state and write anyway.

**This must be tested at the concurrent level, and writing that test is harder than it looks.** Eleven requests in sequence will pass a limiter that is wrong, because the first has committed by the time the second reads. Three things were measured while building it, each of which produced a test that passed and proved nothing:

- **Two promises in flight is not enough.** A barrier placed *before* the claim caught the defect when its file ran alone and missed it in a full run — earlier tests warm the connection pool, so the first round-trip completes before the second is issued. **The isolated run is the honest one**; the full-file pass is the artefact.
- **A lock in the test defeats the test.** Wrapping each claimant in an advisory lock serialises them, which is the sequential case the test exists to avoid.
- **The barrier belongs between the READ and the WRITE**, because that is the window the defect lives in — every claimant must have counted before any inserts.

And the detector must be **deterministic, not probabilistic**: a version relying on real concurrency caught the missing lock 4 runs in 6, which reads as flake and gets retried away. Hold every claimant at the same point instead, so timing is not part of the question.

**`artist_memberships`** — a person's membership of a group, imported from MusicBrainz. A *fact with a source*, kept separate from `artist_influences`, which is the user's judgement.

| Column | Type | Notes |
|---|---|---|
| person_artist_id | UUID NOT NULL REFERENCES artists(id) | the individual |
| group_artist_id | UUID NOT NULL REFERENCES artists(id) | the band |
| instrument | TEXT | nullable |
| began_year | INTEGER | nullable |
| ended_year | INTEGER | nullable |
| musicbrainz_id | TEXT | the relation's MBID, nullable |

Identity is `(person_artist_id, group_artist_id, instrument)` — a person may join a group twice on different instruments — but that cannot be the primary key, because `instrument` is nullable and a PK may not contain a nullable column. Use a surrogate `id` with a `UNIQUE NULLS NOT DISTINCT` constraint on the triple. The `NULLS NOT DISTINCT` clause is load-bearing: without it two rows with a null instrument for the same pair are treated as distinct, so every re-import accumulates a duplicate while the cache appears to be working. CHECK that person ≠ group.

**Membership is never written to `artist_influences`.** MusicBrainz has no influence relationship — its artist-artist vocabulary is membership, collaboration, founder, rename, tribute and personal relations, and nothing represents "A influenced B". Mapping membership onto influence would fill a 1–5 `strength` with a number nobody measured, and membership and influence are different claims: one is a sourced fact about a lineup, the other is the user's judgement about sound. Collapsing them would fill a 1–5 `strength` with a number nobody measured. `artist_influences` stays what it is: edges the user asserts.

**Shared membership is a real connection and §9 may read it.** Two groups sharing a person — Discharge and Broken Bones — is evidence of a genuine link. It is derived from `artist_memberships` at query time, weighted by the number of people in common, and never denormalized into an influence row. §8.1 drew it as a `shared_member` edge; that screen is retired (§8) and the derivation went with it, but the data and the reasoning stand and are exactly what §9.1's "linked to artists you own" term should read. The weight distinction matters when it is rebuilt: a tribute act overlaps by one hired player, a genuine side project by several, and that difference is the signal.

**`artist_influences`** — directed edge between artists
| Column | Type | Notes |
|---|---|---|
| source_artist_id | UUID NOT NULL REFERENCES artists(id) | the influencer |
| target_artist_id | UUID NOT NULL REFERENCES artists(id) | the influenced |
| strength | INTEGER NOT NULL DEFAULT 1 | 1–5, used as edge weight |
| notes | TEXT | |

PK is `(source_artist_id, target_artist_id)`. CHECK that source ≠ target.

### 4.4 Indexes

Index every FK column. Additionally:
- `records(artist_id)`, `records(store_id)`, `records(purchase_date)`
- `want_list(priority) WHERE is_acquired = false`
- `price_history(recorded_at)`
- `pressings(discogs_release_id)`
- Trigram index on `records(title)` and `artists(name)` for fuzzy search (`pg_trgm`).

---

## 5. API contract

All routes under `app/api/`. All responses JSON. All protected by the auth middleware.

**Conventions:**
- Success: `200` (or `201` on create) with the resource or `{ data: [...], meta: { total, page, pageSize } }` for lists.
- Client error: `400` with `{ error: { message, code, fieldErrors?: Record<string,string> } }`.
- Not found: `404` with the same error shape.
- Server error: `500`, same shape, no stack traces in the response body.
- All input validated with Zod at the route boundary. Reject unknown keys.
- List endpoints accept `?page=1&pageSize=50&sort=field:asc|desc` and resource-specific filters. `pageSize` is capped at 200; larger values are clamped, not rejected. `sort` accepts only the fields enumerated per endpoint — reject anything else with `400` rather than interpolating it into SQL.

### 5.1 Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/login` | `{ password }` | `{ ok: true }` + session cookie |
| POST | `/api/auth/logout` | — | `{ ok: true }` |
| GET | `/api/auth/session` | — | `{ authenticated: boolean }` |

### 5.2 Records
| Method | Path | Notes |
|---|---|---|
| GET | `/api/records` | Filters: `artistId`, `genreId`, `labelId`, `storeId`, `tagId`, `formatId`, `condition`, `yearFrom`, `yearTo`, `q` (fuzzy on title + artist name). Sort: `title`, `artist`, `purchaseDate`, `purchasePrice`, `releaseYear`. |

**List rows carry hydrated names, not bare FK ids.** Every row from `GET /api/records` includes:

```ts
artist: { id: string; name: string };            // never null — records.artist_id is NOT NULL
label:  { id: string; name: string } | null;
format: { id: string; name: string } | null;
store:  { id: string; name: string } | null;
```

A collection list cannot render "Discharge — Hear Nothing" from an `artistId`, and `artist` is already in the sort allowlist, so sorting by a field the row cannot display would be incoherent. Resolve these with joins in the query layer, page-bounded — never by a second client-side fetch, which reimplements a server concern in the browser and breaks past one page of reference rows. `pressing` is deliberately excluded: it is only needed on the detail read (§5.2), where it is already hydrated.

**`includeUndated` on year-filtered results.** `yearFrom` / `yearTo` compare against `records.release_year`, which is nullable, so a year range silently excludes every undated record. `GET /api/records` therefore accepts `includeUndated=true|false` (default `true`), which is only meaningful when a year filter is present:

- `true` — records with a null `release_year` are returned alongside those in range.
- `false` — they are excluded.

Either way the response's `meta` carries `undatedCount`: how many records in the current filter set have no release year, so the UI can state the omission rather than let records vanish silently. Do **not** make nulls satisfy the range predicate itself — `yearFrom=1980` must never be described as matching a 1972 record.

**`GET /api/records/facets`** returns the values worth filtering by, not the full reference tables:

```ts
{
  genres: Array<{ id: string; name: string; count: number }>;
  labels: Array<{ id: string; name: string; count: number }>;
  stores: Array<{ id: string; name: string; count: number }>;
  tags:   Array<{ id: string; name: string; count: number }>;
}
```

Rules:

- **Only values appearing on at least one record.** A chip for a genre no record has returns zero rows when clicked — noise at twenty genres, not merely at three hundred. Rendering the reference tables instead also truncates silently once they exceed a page.
- **Genre counts follow §7.1.** A record tagged `Oi!` counts toward `UK82` and `Punk`, so `Punk (12)` matches exactly what clicking that chip returns. Any other count is a lie the moment the user clicks. Use the same recursive-CTE rollup as `stats.byGenre`, so the two agree by construction rather than by coincidence.
- **A genre appears if any descendant is used**, even with no records tagged directly. Otherwise `Punk` is absent from the chips while `Punk (12)` is precisely what a user wants to click.
- **Facets describe the whole collection, not the current result set.** They do not change when filters change. Filter-aware counts are a better UX in the abstract but create dead ends — filter to `Crust`, the `Clay Records` chip vanishes, and with it the control the user would click to undo — and make every count shift under the reader. Static counts are honest, cacheable, and computable once.
- **Sorted by count descending, then name ascending.** Unpaginated: the result is bounded by the collection's actual variety, and a collection with hundreds of distinct labels has a different problem worth solving with typeahead when it arrives.
- **A separate endpoint, not `meta` on `/api/records`.** Since facets don't vary with filters, bundling them would recompute four aggregates on every filtered request. Separate also lets the page fetch them in parallel.
- `artists` and `formats` are excluded: §10 names chips for genre, label, store and tag. Artists are better served by search; formats are a short closed list. Adding either later is additive.

**Year bounds are one shared rule, applied to three columns.** `artists.formed_year` (§4.1), `records.release_year` and `pressings.year_pressed` are all bounded to `1877 <= year <= currentYear + 1` — 1877 being the year sound recording began, so nothing in a record collection legitimately predates it. Implement it once and reference it from all three; three copies drift.

**A rejected year must name the field and state the range.** `yearPressed is out of range` is the API's field name and tells the user nothing actionable. The message must read like `Year pressed must be between 1877 and 2027`, with the upper bound computed at validation time rather than hardcoded. This applies to every bounded field: an error that does not say what would be acceptable makes the user guess, and a three-digit year typed in place of a four-digit one is the realistic case.

**`matchedVia` on genre-filtered results.** Because §7.1 makes genre membership hierarchical, filtering by `genreId=<Punk>` returns records tagged only `Oi!` or `Crust` — records whose visible badges never mention Punk. Without an explanation the result reads as a bug.

So when `genreId` is supplied, every returned record carries:

```ts
matchedVia: {
  filtered: { id: string; name: string };      // the genre the caller filtered by
  descendants: Array<{ id: string; name: string }>;  // the record's own genres that fall under it
} | null
```

`descendants` is an **array, not a single path**: a record may match through several descendants at once, and picking one arbitrarily flattens exactly the genre distinctions CLAUDE.md §8 forbids. When the record is tagged with the filtered genre directly, `descendants` contains that genre itself, so the field is never empty on a matched row. `matchedVia` is `null` when no `genreId` filter is applied.

The UI decides how to present this; the API's obligation is to make the match explainable rather than to format it.
| POST | `/api/records` | Create. Accepts nested `genreIds: string[]`, `tagIds: string[]`. |
| GET | `/api/records/:id` | Returns record with hydrated artist, label, format, store, pressing, genres, tags, images, journal entries, and latest price. |
| PATCH | `/api/records/:id` | Partial update. |
| DELETE | `/api/records/:id` | Cascades images + journal entries. |
| GET | `/api/records/facets` | Filter facets for the collection screen's chips. See below. |
| POST | `/api/records/:id/journal` | Create a journal entry. Body `{ entryDate?, note }`; `entryDate` defaults to today. |
| DELETE | `/api/journal/:id` | Delete a journal entry. |
| POST | `/api/records/:id/prices` | Append a price observation. Body `{ price, priceType, source? }`. **Append-only (§7.5)** — there is no update path, and a request shaped like an edit is rejected rather than quietly appended as a new row. |
| GET | `/api/records/stats` | `{ totalRecords, totalSpend, estimatedValue, byGenre: [...], byDecade: [...], byStore: [...], byLabel: [...] }` — `byLabel` because §10's stats screen asks for it and a collection organised around labels like Clay or Dischord is a real way to read a shelf. |

Note: `app/api/records/stats/route.ts` is a static segment and must not be swallowed by `app/api/records/[id]/route.ts`. Next.js resolves static before dynamic, so this works — but `[id]` must still reject a non-UUID param with `400` rather than attempting a lookup.

**Snippet** (§10b, A31b). A separate resource rather than fields on `PATCH /api/records/:id`: generation spends a rate-limited external budget and the other two do not, so folding them in would put a metered side effect behind a general-purpose update. §5.9 makes the same split for images.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/records/:id/snippet` | Generate and store a snippet (§10b). Rate-limited with §9.2 against `llm_requests` (`kind: 'snippet'`). Body: `{ confirmReplace?: boolean }`. |
| PATCH | `/api/records/:id/snippet` | Save a user edit. Sets `snippet_edited_at`. Body: `{ snippet: string }`. |
| DELETE | `/api/records/:id/snippet` | Clears `snippet`, leaves `snippet_edited_at` (§4.2 — a deliberate deletion is an edit). |

**`confirmReplace` is required only when `snippet_edited_at` is set**, and its absence there is a refusal rather than a silent overwrite: `409` with a code naming the situation, so a client that has not asked the user cannot destroy their text by omission. Defaulting it to true would put the safety in the UI, where the next caller — a script, a retry, a second client — does not inherit it.

### 5.3 Want list
| Method | Path | Notes |
|---|---|---|
| GET | `/api/want-list` | Filters: `priority`, `artistId`, `genreId`, `isAcquired`. Default excludes acquired. |
| POST | `/api/want-list` | |
| GET | `/api/want-list/:id` | Hydrated, including `targetPressing`. |
| PATCH | `/api/want-list/:id` | |
| DELETE | `/api/want-list/:id` | |
| POST | `/api/want-list/:id/acquire` | Body: full record payload — **the same shape as `POST /api/records`, from one shared schema definition, not two that agree today**. Creates a `records` row, sets `is_acquired = true` and `acquired_record_id`. Transactional — both succeed or neither. Returns the new record. |

**The acquire body carries every nested collection the create endpoint does** — `genreIds` *and* `tagIds`. A payload field the endpoint validates and then silently discards is worse than one it rejects: the caller gets a 201 and believes the data landed.

**`target_pressing_id` prefills the record's pressing fields; it is neither dropped nor silently copied.** The target pressing is the "best dig" — the specific pressing being hunted (§7.2) — so a record acquired against it should start from those details. But the user may have settled for a different pressing, and §7.7's whole ownership distinction rests on knowing which one is actually in hand. So the acquire form prefills the pressing section from `target_pressing_id`, visibly and editably, exactly as a Discogs lookup result prefills it, and the user verifies against the physical item before saving. Silently dropping it loses the hunt; silently copying it asserts something nobody checked.

**Acquiring an already-acquired item returns `409`, including when the race is lost.** The handler's pre-check gives a legible 409 in the ordinary case, but the transaction's `is_acquired = false` guard is what closes the concurrent case — and it must surface as the same `409`, not as a `500`. A defined conflict reported as an internal error misleads the user and fills the log with false faults.

### 5.4 Reference resources

Standard REST CRUD (`GET` list, `POST`, `GET :id`, `PATCH :id`, `DELETE :id`) for:
- `/api/artists`
- `/api/genres`
- `/api/labels`
- `/api/formats`
- `/api/stores`
- `/api/tags`
- `/api/pressings`

**Delete behavior:** reject with `409` if the row is referenced by any record or want-list item. Return `{ error: { code: "IN_USE", message, referenceCount } }`.

**Duplicate behavior:** a `POST` or `PATCH` colliding with an existing unique name returns `409` with `{ error: { code: "DUPLICATE", message, existingId } }`. `existingId` is **required**, not optional, and applies to every resource in this section.

The reason is that names are normalized with `cleanName` before comparison (§4, NFKC plus invisible-character stripping), so a collision is frequently not a string match on the client's side: `"Clay  Records"` with a double space, a non-breaking space, a zero-width joiner, or an NFD-composed `Café` all collide server-side while failing any naive client-side comparison. Without `existingId`, a client wanting to offer "that already exists — use it instead" must reimplement the server's normalization, and will get it wrong in exactly the cases normalization exists to handle.

`existingId` must be returned from **every** path that can produce a `DUPLICATE`, including the unique-violation recovery path taken when a concurrent write wins the race. A recovery-path 409 without it is the same defect surfacing only under concurrency, which is the hardest version to diagnose.

Note that comparison is case-sensitive: `clay records` and `Clay Records` are distinct labels. That is existing behavior and this section does not change it.

`GET /api/genres` supports `?tree=true` to return the nested hierarchy rather than a flat list.

### 5.5 Relationships
| Method | Path | Notes |
|---|---|---|
| GET | `/api/artists/:id/influences` | Both directions: `{ influencedBy: [...], influenced: [...] }` |
| POST | `/api/influences` | `{ sourceArtistId, targetArtistId, strength, notes }` |
| PATCH | `/api/influences/:sourceId/:targetId` | Updates `strength` / `notes`. |
| DELETE | `/api/influences/:sourceId/:targetId` | Removes the edge. |

The pair is addressed in the path, not a request body — `DELETE` with a body is poorly supported across clients and caches. Influence edges are directed: creating source→target does not imply target→source.

### 5.6 Graph & shelf — retired, no endpoints

This section listed `GET /api/graph` and `GET /api/shelf-order`. Neither exists.

`/api/graph` was built, integration-tested, and called by nothing: §5.6 required the endpoint while §8.1 independently required `/graph` to be a server component calling `buildGraph()` directly. Both mandates were followed and they could not both produce a live endpoint. The server component won on merit and the spec line was the defect. `buildGraph` itself was later deleted with the graph screen (§8).

`/api/shelf-order` was never built. §10b replaced the feature before step 13 reached it (§8.2).

**The rule this leaves behind, because §14 will otherwise recreate the first mistake:** §5 lists endpoints a client actually calls. Where a server component or a query-layer function is the only consumer, the contract and its tests live at that layer, and no endpoint is built to satisfy §14's completeness line.

### 5.7 Discogs — record lookup

The goal of this group of endpoints is: **the user fills in a structured form describing a record they are holding, and gets back the specific pressing, with cover art and full details.**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/discogs/search` | Structured search. See parameters below. Returns normalized results, not raw Discogs payloads. |
| GET | `/api/discogs/master/:id/versions` | All releases (pressings) under a master, so the user can narrow to their exact copy. Paginated. |
| GET | `/api/discogs/release/:id` | Full release detail, normalized to our field names, ready to prefill a form. |
| POST | `/api/discogs/import` | `{ discogsReleaseId, target: "record" \| "want_list", overrides?: {...} }`. Creates artist/label/pressing rows as needed (find-or-create by discogs ID, then by name), then the record or want-list row. Transactional. |
| POST | `/api/discogs/refresh-prices` | **Cron-invoked only** — see §6 for its separate auth. Updates `price_history` for all items with a `discogs_release_id`. |

**Import is a two-stage flow, not one click.** `/api/discogs/release/:id` returns the normalized payload; the client renders it into the add/edit form (§10); the user verifies against the physical record and corrects; only then is `/api/discogs/import` called with the user's edited values in `overrides`, which take precedence over the Discogs values for every field they cover. There is no path that writes a record straight from a search result without passing through the form.

**A prefilled field is a claim in the act of being settled, and the scope predicate decides where it may sit (A64, 2026-09-09).** Of the form's 20 fields, 11 are prefilled from Discogs, and exactly two are held outside their inputs — for two unrelated reasons, both the predicate. **Matrix/runout:** a release carries one runout per side and per variant, eight on the captured fixture across four documented pressings, so joining them yields a fingerprint describing no physical object; every variant is worth seeing while reading the wax, so none are dropped and all move beside the field. **Notes:** Discogs' notes describe the release and the user's describe their copy, so a prefilled one reads as verified while making the never-overwrite rule (§7) unenforceable. One predicate, two reasons, which is better evidence than a clean split.

Two smaller non-prefills are the same predicate: artist and label are matched and never created, because a prefill is not a commitment and an abandoned form would leave debris; and where two local artists share a name the prefill fills nothing and says why, rather than guessing between two bands called `Discharge` on the one screen where the user could settle it.

**`GET /api/discogs/search` accepts all of the following as optional query params**, mapped one-to-one onto Discogs' search parameters. At least one must be present.

| Param | Maps to | Why it matters |
|---|---|---|
| `artist` | `artist` | |
| `title` | `release_title` | |
| `label` | `label` | |
| `catno` | `catno` | **Catalog number — the most NARROWING param on this form, and it narrows to an album, not a pressing.** Measured live 2026-08-25: `?catno=EKS-74007` returns **197 results**, every one the same master, spanning six countries and 1967–2007. It is the strongest field the user can read off the object, and it is not an identifier. Copy anywhere in the app must say narrows, never identifies or pins down — see §7.7 and CLAUDE.md §8. |
| `barcode` | `barcode` | Near-unique **where it exists** — barcodes reach LPs in the mid-1980s, so the field is blank for most pre-1985 pressings and is ranked below artist and title on the form for that reason. Strongest available identifier on a modern release. |
| `country` | `country` | Distinguishes UK/US/Japanese pressings of the same album. |
| `year` | `year` | Separates originals from reissues. |
| `format` | `format` | e.g. "Vinyl", "LP", "45 RPM", "180 Gram", "Picture Disc". |
| `genre` / `style` | `genre` / `style` | |
| `track` | `track` | Useful when the sleeve is missing. |
| `type` | `type` | `release` \| `master`. Default `release`. |
| `q` | `q` | Freeform fallback, combinable with the above. |

**Normalized search result shape** — every result must carry enough to identify a pressing at a glance, without a second API call:

```ts
{
  data: Array<{
    discogsId: number;
    type: "release" | "master";
    masterId: number | null;
    title: string;
    artist: string;
    thumbUrl: string | null;      // small, for list rows
    coverUrl: string | null;      // full size
    year: number | null;
    country: string | null;
    label: string | null;
    catalogNumber: string | null;
    formats: string[];            // e.g. ["Vinyl", "LP", "Album", "180 Gram"]
    formatText: string | null;    // the qualifier — see below
    isReissue: boolean;           // inferred from format descriptors
    communityHave: number | null; // how many collectors own it
    communityWant: number | null;
  }>,
  meta: { total, page, pageSize }
}
```

**Normalized release detail shape** (`/api/discogs/release/:id`) adds:

```ts
{
  images: Array<{ url: string; type: "primary" | "secondary" }>;
  matrixRunout: string[];         // from identifiers where type is Matrix / Runout
  otherIdentifiers: Array<{ type: string; value: string; description: string | null }>;
  pressingPlant: string | null;   // from companies where role indicates pressing
  vinylWeightGrams: number | null;// parsed from format descriptors when present
  colorVariant: string | null;    // parsed from format descriptors
  tracklist: Array<{ position: string; title: string; duration: string | null }>;
  genres: string[];
  styles: string[];
  notes: string | null;
  numForSale: number | null;
  lowestPrice: number | null;
}
```

**Ownership and `is_acquired` are INDEPENDENT, so a want entry survives every tier.**

A want-list row with `is_acquired = false` on an album the user already owns is not corruption and not an untidied mistake — it is the ordinary consequence of two rules that do not talk to each other. The acquire flow sets the flag; a record added any other way (direct entry, an import, a purchase logged separately) leaves the want row untouched. §7.3 keeps acquired rows forever as history, and nothing tidies the un-acquired ones.

So the want entry must be **carried through every tier rather than treated as a fallback for when nothing is owned.** The state this makes reachable is the most valuable answer the screen can give: *you own a different pressing of this album, and this exact pressing is the one you have been hunting* — a copy plus an upgrade, which is a buy signal that neither half expresses alone. Resolving the want list only after ownership misses drops it silently, on the tier §7.7 exists to protect.

The filter stays `is_acquired = false`: surfacing an acquired row would tell the user they are still hunting something they have already bought.

**Ownership travels with every result.** Each entry from `/api/discogs/search` and from `/api/discogs/master/:id/versions` carries the §7.7 ownership tier for that release, resolved server-side in the same request:

```ts
ownership: {
  tier: "owned_exact" | "owned_different_pressing" | "wanted" | null;
  ownedPressing?: { year: number | null; country: string | null; catalogNumber: string | null } | null;
  wantedPriority?: number | null;
} 
```

It is part of the result, not a second request. A card that renders and acquires its badge a moment later is the worst version of this on the one screen where a wrong glance costs money — someone looking during the gap sees no warning at all. Resolve the whole page in one batch query that delegates to the same §7.7 matcher the rest of the app uses; a batch-optimised second implementation of the tiering is how the two drift, and the screen would show whichever one nothing tested.

This applies to the versions list as much as to search. The drill-down is where the user chooses *between* pressings, so knowing which of them are already on the shelf matters more there than anywhere else — a version table without ownership is a list of candidates with the answer withheld.

`ownedPressing` is present on `owned_different_pressing` and names the year, country and catalog number of the copy already owned, since the question being answered is whether the copy in hand is better than the one at home. When the owned record has no pressing recorded — the common result of §10's quick in-store entry — say so explicitly rather than rendering an empty detail: the badge has something specific to report, namely that the album is owned and the copy cannot be identified.

**`formatText` — the qualifier, and the measured ceiling on list-level
identification.**

Discogs search rows carry TWO format fields: `format`, a flat array of
descriptor strings, and `formats`, an array of objects whose `text` holds a
free-text qualifier. **`text` exists only on the plural key**, and it often
names the pressing plant — "Specialty Records Corporation Pressing", "Allentown
Pressing", "Terre Haute Pressing". It is the most discriminating thing Discogs
offers at list level and the reason two otherwise identical cards can be told
apart.

**It is a hint, never an identity.** The value is contributor-entered free text
and mixes plant with colour, weight and sleeve notes — real values include
"180g", "Blue", "USA Cover" and "(Columbia Records Pressing) " with a trailing
space. Render it as Discogs' own words, distinct from the controlled-vocabulary
descriptors, and never labelled as a plant. §7.8 applies directly: never present
a Discogs match as certain.

**MEASURED 2026-08-25, six albums, 477 live vinyl rows — quote the PLANT row
when asked whether the matrix work is still needed:**

| Measure | Result |
|---|---|
| rows carrying any non-empty qualifier | **53%** (33%–80% by album) |
| — of which **names a pressing plant or label variant** | **24% of all rows** |
| — colour / finish | 18% |
| — sleeve, insert, cover | 8% |
| — weight, other | 2% |

**The only row that bears on identification is the plant row, and it is 24%.**
An earlier version of this table recorded 50% coverage and "separates 56% of
collisions", counting ANY qualifier as separating. That number is real but it
answers the wrong question: "Gatefold" or "Red Translucent" distinguishes two
rows on screen while telling the user nothing about which pressing is in their
hands. **Separating two rows and identifying a pressing are different things,
and only the second is what this screen is for** (CLAUDE.md §8). Corrected after
QA on the live page; the overstatement is recorded in NOTES because the mistake
— counting a proxy and reporting it as the thing — is more reusable than the
figure.

**The variance is not noise and does not average away.** Discharge — Hear
Nothing has 80% qualifier coverage and **0% plant**: every value is a sleeve or
colour note. Misfits — Walk Among Us is 70% coverage, **2% plant**, almost
entirely colour variants. The Doors debut by catalogue number reaches 47% plant.
Coverage tracks what a scene's contributors care about — colour variants for
hardcore reissues, plants for 1960s US majors — so an album's headline coverage
says nothing about whether it can be identified.

**So list-level identification is roughly one row in four, not one in two.**
That is the ceiling the two-phase matrix resolution exists to break, and it is a
number rather than an impression precisely so "lookup feels adequate now" cannot
quietly retire that work.

**Master → release drill-down.** If a search result is a master, the UI must let the user open it and see every version underneath (`/api/discogs/master/:id/versions`), displayed as a comparison table with country, year, label, catalog number, format descriptors and cover thumbnail.

**This shows what pressings of an album EXIST. That is a discography question, and it is not the identification question.** The sentence here previously said this was "the step where the user identifies *their* pressing rather than just the album", which is a claim this endpoint cannot support: a master's version list is ordered by release date and unbounded — The Doors' debut has 637 versions across 26 pages — so the drill-down answers "what is out there" and answers it well. Asking it "which of these is mine" gives a list that may not contain the record in the user's hand at all, which is what shipped and what QA found (see §12 step 14b).

**Identification lives in step 14b**, which scopes the comparison to the candidates the search actually returned. Both are legitimate and both are wanted; they are different questions and the UI must not let one label imply the other. Where the drill-down is offered, it is offered as browsing a discography, never as identifying a copy.

**Neither view may present a match as certain**, and the reason is measured rather than cautious: the columns this table displays do not always discriminate. Rows identical on every displayed column collapse into one saying "N more look identical from here" (§10), and `formatText` — the most discriminating list-level field Discogs offers — names a pressing plant on only 24% of rows. A version table whose identical rows read as an answer is the same failure as a hallucinated record blessed by a search.

**Honest limits — surface these in the UI, do not paper over them:**
- Discogs data is user-submitted. Distinct pressings are sometimes merged into one release entry, and identical ones sometimes split across two. Treat a matched release as a strong starting point, never as proof.
- `matrixRunout` is frequently missing or partial. Always let the user hand-enter it from the dead wax, and never overwrite a user-entered matrix value with a Discogs one on re-sync.
- When a search returns several plausible pressings, present them for comparison rather than auto-selecting the top hit.

### 5.8 Suggestions
| Method | Path | Notes |
|---|---|---|
| GET | `/api/suggestions` | Relationship-based suggestions, §9.1. Query: `limit` (default 10). |
| POST | `/api/suggestions/ai` | LLM-assisted gap analysis, §9.2. Rate-limited to 10/hour. |

### 5.9 Images
| Method | Path | Notes |
|---|---|---|
| POST | `/api/records/:id/images` | Multipart upload → Vercel Blob → creates `images` row. Max 10MB, accept jpeg/png/webp only. |
| DELETE | `/api/images/:id` | Deletes blob and row. |

---

## 6. Discogs integration

- Auth: personal access token in `DISCOGS_TOKEN`, sent as `Authorization: Discogs token=...`.
- **Required:** set a descriptive `User-Agent` header. Discogs rejects requests without one.
- **Rate limit:** 60 requests/minute authenticated. Implement a token-bucket limiter in a shared module that all Discogs calls route through. On 429, respect `Retry-After` and surface a clear error to the client rather than silently failing.
- **Caching:** cache release detail responses in a `discogs_cache` table (`discogs_release_id`, `payload JSONB`, `fetched_at`). Serve from cache if `fetched_at` is under 7 days old. Search results are not cached.
- **Field mapping** (Discogs → ours): `title`→`title`, `artists[0].name`→`artists.name`, `labels[0].name`→`labels.name`, `labels[0].catno`→`pressings.catalog_number`, `year`→`pressings.year_pressed`, `country`→`pressings.country_pressed`, `formats[0].descriptions`→`formats.name` (**not** `formats[0].name`, which holds the medium — "Vinyl" — while the seeded format rows are descriptors like "LP" and "Album"; matching on `name` matches none of the seven), `identifiers` where `type == "Matrix / Runout"`→`pressings.matrix_runout`, `genres` + `styles`→`genres` (find-or-create; prefer `styles` since it's more specific).
- **Price refresh:** `/api/discogs/refresh-prices` runs via Vercel Cron weekly. Pull the marketplace price suggestions endpoint, write `price_history` rows with `source: "discogs"`. Do not overwrite manual entries.

---

## 7. Business rules

1. **Genre nesting**: a record tagged with a child genre is implicitly a member of all ancestor genres — for collection filtering, for `/api/records/facets` counts, and for the shelf's ordering (§10b). Compute this with a recursive CTE; do not denormalize. Every caller uses the same walk, from one shared module: two callers with their own copies is how one of them ends up matching only the exact genre while the other walks the subtree, and both return a plausible 200.
2. **`price_type` never contains `best_dig`.** Its three values are `new` (a price for a sealed copy), `used` (what a second-hand copy actually sold for), and `asking` (a price someone wants but nobody has paid — a shop tag, an open listing). An earlier version of this spec put `best_dig` in that enum: a *pressing* modelled as a *price*, which is precisely the conflation rule 3 forbids, written into the schema. It must be migrated out. A record displaying "£120.00 best dig" reads as "best price", which is the error the rule exists to prevent.

3. **Best dig ≠ best price.** `target_pressing_id` and `best_dig_notes` describe the highest-fidelity pressing worth hunting for. `max_price` is a separate, independent field. Never conflate them in logic or copy.
4. **Acquiring a want-list item** never deletes the want-list row — it marks it acquired and links the new record. The want-list doubles as acquisition history.

   The rule is about *implicit* loss: acquiring must not discard history as a side effect of a different action. An **explicit** user delete of an acquired item is permitted. Mistakes happen, this is a personal tool, and the record itself retains its own `purchase_date`, `purchase_price` and `store_id` — so deleting the want-list row loses the wanting, not the acquisition. Deleting it must never touch the linked record: `acquired_record_id` points from want-list to record, never the reverse.

   The UI must make the consequence legible before it happens — a confirmation naming what is lost, not a bare delete button on an acquired row.

   **A record fulfils at most one want-list entry.** Enforce with a partial unique index on `want_list.acquired_record_id WHERE acquired_record_id IS NOT NULL`. Two entries pointing at one record would give that record two contradictory acquisition histories — it was acquired once. Duplicate *unacquired* entries stay legal: wanting two copies, or the same album in two pressings, is a real intention, and each is fulfilled by its own record. §5.7's import makes this reachable, since importing the same release to the want list twice creates two rows.
5. **Deleting an artist/genre/label/store that is in use** is rejected with `409`, never cascaded.
6. **Price history is append-only.** Never `UPDATE` a `price_history` row; always insert a new one.
7. **Estimated collection value** = for each record, the most recent `price_history` row of type `used` (falling back to `new`, then to `purchase_price`). Sum.
8. **Ownership matching** (the "do I already own this?" check on `/lookup`) resolves in three tiers, and the UI must show which tier matched — never a bare yes/no:
   - **Exact pressing match** — a `records` row whose `pressing_id` points to a pressing with the same `discogs_release_id`, **and** which also satisfies the same artist/title match tier 2 uses. Badge: "You own this pressing."

     The corroboration is not redundant. `discogs_release_id` is a plain integer a client can assert through `POST /api/pressings` without the server verifying it names anything, so the id alone lets a wrong or forged value produce "you own this pressing" for a record with an entirely different artist and title. Requiring the id *and* the album means a bad id degrades to tier 2 rather than to a confident wrong answer — the direction the asymmetry below demands.

     Separately, `discogsReleaseId` supplied to `POST` or `PATCH /api/pressings` must be verified against the release it names before being stored. The server holds the release detail and the cache; a client asserting a fact the server can establish is the pattern to eliminate wherever it appears.
   - **Different pressing of the same album** — a `records` row matching on artist + fuzzy title but a different `discogs_release_id`. Badge: "You own a different pressing" plus the year/country/catalog of the one owned. **This case must never be collapsed into the exact match** — it is the whole reason the distinction exists, and getting it wrong is what causes a bad buying decision in a store.
   - **On the want list** — matching `want_list` row not yet acquired. Badge shows priority and, if `target_pressing_id` is set, whether this result *is* that target pressing.
   - No match: no badge.

   **In a version table, the badge belongs to the table, not to every row.** §7.7's tiers were written for a single candidate — one record in hand, one answer. A master's version table is a different shape: every row shares the album, so every non-owned row is genuinely "a different pressing of something you own", and rendering that on all of them makes the badge the table's background rather than a signal about any row.

   So: state the ownership fact **once at the head** — "100 versions · 1 already on your shelf. You own: 1978 US BSK 3266" — and badge **only the row that is actually owned**. The asymmetry says the unmissable answer is "you own *this* one", and it is unmissable precisely because nothing else is marked.
9. **Never overwrite user-entered data with external data.** On any Discogs re-sync or re-import, fields the user has edited are preserved. `matrix_runout` in particular is user-authoritative.

10. **A relayed claim's settler travels with the claim (A63, 2026-09-09).** Where a stored field records *where* an observation came from or *when* it was actually written, that field is part of the claim and must reach the screen with it: `price_history.source` records where an observation came from, and `journal_entries.created_at` records when an entry was actually written as opposed to the `entry_date` it claims. Both are currently selected on every page view and dropped before rendering — the query takes every column, the page maps `id`, `price`, `priceType` and `recordedAt` and drops `source`; the journal renders only `entry_date`, and the two differ whenever a user backdates, which the date input supports to 1877. On the price side the copy *"Nothing here says what a copy sold for — only what someone asked"* is carried entirely by `priceTypeMeaning()`, while the field naming who asked is loaded and thrown away. The journal case is not a settler and not an age but **the difference between when a claim was made and when it says it was made.** (`journal_entries.user_id` is null on every row; nothing writes it.)

11. **An action that will never exist says so; an absent control otherwise reads as one not yet built (A65, 2026-09-09).** `journal_entries` has POST and DELETE and no PATCH or PUT, so an entry cannot be corrected once written — and nothing on screen says so. A user finds out by looking for an Edit control that is not there, beside a Delete control that is, and fixes a typo by deleting and rewriting, which loses the original and changes `created_at`. **Price history makes the same promise about editing and states it** — *"each one is added, never edited"* — and makes the opposite promise about deletion, with no per-row delete at all. Two logs on one page, the same rule on editing, opposite rules on deletion, one announced and one silent, enforced at different layers.

---

## 7a. Display rules — what a claim renders as (A61, 2026-09-09)

Rules that hold across screens rather than within one. No existing section owned them, which is why they are here rather than distributed into §10's screen rows: a rule stated once per screen is the enumeration defect these rules are themselves about.

**The axis a claim renders on is the scope of the claim's subject.** A row's marks are about the row's own subject; a claim about something else does not compete for that axis, it leaves it. *The defect:* `isTargetPressing` was a boolean holding two situations, and the want-list panel's verdict marks were placed in the same left-edge column as the ownership marks — two mark sets arbitrating a column when they were never about the same subject. Stated as *"what is true of one pressing"* the rule was the instance; `/genres` corrected it to the row's own subject, because a tree row's subject is a genre.

**Presence: ink where a figure covers its subject, muted where it covers part of it.** *The defect:* the earlier rule was *ink where the reader can act* — which cannot resolve on a screen with no actions, and `/stats` has none. The two readings agree wherever the subject is a single object, because a claim about one record has no fraction, so the instruction reading is the coverage reading restricted to n=1. They can only diverge on an aggregate. Measured 2026-09-04: `/stats`' estimated value of `$33.00` was computed over 4 of 17 records, so it takes muted; `totalRecords` covered its subject and takes ink. **Dated because the figures are evidence and the rule is not:** a coverage figure takes muted at any denominator, and a total takes ink at any count. **A zero keeps display and takes muted** — a figure that covers nothing is still a figure.

**Absence is named where the reader can act on it, and only where the layout gives it a labelled slot.** Two clauses, and the second is a constraint of the layout rather than of the reader. *The defect:* four vocabularies for one absence on `/records/[id]` — release year renders `Unknown`, paid renders `Not recorded`, label and format and every pressing fact vanish, and the collection table renders an em dash for the same two columns one screen away. `purchase_price` and `purchase_date` settle it: same column kind, same form, same sort allowlist, same section, adjacent, one naming its absence and the other vanishing. **The second clause came from `/collection`:** its table dashes what its grid omits, and the grid has a real argument — a dash in a labelled column says *this field is absent*, a dash among wrapped chips says nothing about which. *A marker without a persistent position is not a weaker marker, it is a character with no subject.*

**A withheld set is named with its criterion, never with a count alone; and a stated criterion must be able to produce the rows actually drawn.** *The defect, twice in one section:* `/stats`' genre tree first stated *"24 genres hold no records"*, a count that followed from no available derivation. Retiring the number left the worse half standing — *"the genres not listed hold no records"* — because the direct counts sum to more than the collection holds, so most unlisted rows hold plenty. **At the time of the defect, 2026-09-04, two of 34 genres held nothing anywhere** (`Black Metal`, `US Hardcore`), **so the criterion would have withheld two rows rather than twenty-eight.** Dated because it is evidence for a defect that happened at a moment, not a description of the tree: the same figures today are eight of 40, and the defect is identical at both. **Fixing the count made the sentence more wrong**, by leaving a confident filter over a fragment.

**An invented value closes the question; an empty one asks it.** *The defect:* `yearPressed` was prefilled from the Discogs master year, beside `releaseYear`, after the album-versus-pressing argument had been made for `releaseYear` and not for the line next to it. Security review found it. Because `yearPressed` is identifying, a user correcting the fabricated value contradicted an identifying field and **silently lost tier 1** — punished for fixing the app's error. The rule the code settled on is the strong form: *an empty field asks the user to read the year off the record, a wrong one tells them it is already known.*

**A state the schema permits is not a state the app has.** *The defect:* an acquired want-list row with a null `acquired_record_id` was drawn as a real state on the strength of the column being nullable. One write site sets both columns in the same `.set()` inside a transaction; an UPDATE matching nothing throws and rolls the record back; deleting the record is refused with 409 `IN_USE` rather than cascaded. The state is reachable only by direct SQL. **Unobserved and unreachable are different verdicts and only a read separates them.**

**The type scale.** `72 · 40 · 15 · 13 · 12 · 11 · 10 · 9`, with 15 and 13 each carrying two entries under the two-entry predicate. **13/400 sans is the size for continuous text.** *The defect:* the scale had no comfortable size for prose, and one design document's own body copy reached for 12.5px in fifteen separate places — a convention held in fifteen places with nothing owning it, which is an enumeration. `/lookup` never exposed it because `/lookup` has no paragraphs. 13/500 mono was the candidate and was rejected: it changes family, weight and letterform to solve a size problem.

**16px is ABSENT from the scale and REQUIRED on one control (A67, 2026-09-10).**
The chasm between 15 and 20 is where 16 would sit, and the scale declines it
deliberately — but a text input is not free to decline it. **Safari zooms the
viewport when a focused input's font-size is under 16px**, so an input set at 15
zooms the page on every focus on iOS. That is a browser behaviour, not a design
preference, and no role name changes it.

So `components/ui/input.tsx` carries `text-base md:text-sm` — 16px on mobile,
smaller from `md` up, where no zoom rule applies — and it has eight consumers.
`app/login/page.tsx`'s password field carries the same for the same reason.

**Recorded as an exception with its reason attached rather than left to be
rediscovered.** The next person to notice 16 is missing from an eight-size scale
will find these two sites using it and reasonably try to fix them; this says why
they are not a mistake. Moving them to 15 reintroduces the zoom on every form
field in the app, through a shared component, on the one screen size where §10
says the app must be fastest.

The exception is the CONTROL, not the size: prose at 16 is still outside the
scale and still wrong.

**Carried as a role token rather than as a standing exception**, so the rule
travels with the code: the scale gains `typed`, scoped to controls that accept
typed text, and it is deliberately not `prose`. Both would otherwise read as
"text someone reads or writes", and the next person moving `prose` down the
scale would move every form field with it and reintroduce the zoom. One
exception, one token, one line to change. `DialogTitle`'s `text-base` is a third site and is NOT
covered by this — it is a heading, no zoom rule applies to it, and it converts
by role like anything else.

**The three role rules, stated so they are rules rather than habits (A68,
2026-09-10).** They carried 102 sites across three screens — `/records/[id]`,
`/lookup` and `/stats` — while existing only in a conversation. Six sites on the
first screen could not be classified without a design call; on the second and
third the count was zero, because these three sentences replaced what would
otherwise have been about forty individual judgements across 333 sites.

1. **A value takes `detail` whether or not its label renders.** A label that is
   absent or implied is a layout fact, not a change of role — the artist · year
   line under a record title and a price row are both values whose label the
   layout omits.
2. **Provenance takes `meta`.** Where a value came from, when it was fetched,
   how much of a set is shown: `meta` is what the app knows about how the value
   got there, where `detail` is what the value is. That boundary is the one the
   small end of the scale kept blurring.
3. **Anything the user types into takes `typed`, regardless of what the text
   is.** A67's exception as a rule: an input's size is a claim about Safari, not
   about the text, so a textarea holding continuous prose still takes `typed`
   and not `prose`.

**The ambiguity clustered rather than scattering, which is what made three
sentences enough.** It fell in exactly two places — controls, and the
meta/caption/detail boundary — so naming those two boundaries settled the rest.
A per-site role table would have been the enumeration this section's own type
scale rule warns about.

**Presence and the scale compose; they do not contend.** Measured on `/stats`,
the first screen where both act on one element: the scale sets the SIZE from
what the text is, presence sets the WEIGHT of the mark from how much of its
subject the figure covers. `totalRecords` is `display` and ink; the estimated
value is muted, and takes `prose` rather than `display` because it is a sentence
with a figure in it rather than the subject's own count.

**What the scale does NOT cover, stated as a gap rather than discovered as one
(A70, 2026-09-10).** The conversion reached every built screen and stopped at
two shared components. Both were left unconverted deliberately, and the reason
is the same in each case: the rules produce an answer, and the answer is one
nobody would choose.

**Persistent chrome has no role, and should not borrow one.** Every role in the
scale answers *what is this text doing on this screen*. `AppHeader` is the thing
that is not on a screen — it is around all of them. A wordmark is the app's
name; its links navigate BETWEEN screens rather than acting within one. Neither
`title` nor `label` describes that, and forcing one would make twelve screens
inherit a role chosen because the list was the list. A chrome role can be added
if it earns one.

**A control's size is not a claim about its text.** §7a sizes text by what the
text is; a button's size comes from its hit target and its variant — `xs`, `sm`,
default — which is a different system expressed in the same units. Three button
sizes do not collapse into one role without inventing a button-size mapping this
section does not state. The rules do answer — a button is a control, so `label`
— and that answer is 14px to 11px on every submit and action across sixteen
consumers. **A rule producing an answer nobody would choose is evidence the rule
does not reach the case**, not evidence the answer is right.

**Two components correctly left alone is a result rather than a shortfall.** The
count of converted sites is not the measure; 267 sites with two reasoned
exceptions is a better outcome than every site with two forced calls, and the
exceptions are in this document so the next reader does not finish the job.

**Text meets 4.5:1 against what is behind it.** *The defect:* a specimen arguing contrast arithmetic shipped its own absence marker at **2.66** and its labels at 4.29 on `#100e0d`. The element carrying the meaning was the one below the floor.

### 7a.1 The settler register (A61a, 2026-09-09)

Six answers to *who settles this claim*, each with a treatment that follows from the answer rather than being assigned to it, and a second axis for whether the answer stays settled. **This replaces `State Notation v2`'s single dashed register** — a section in a design artefact, **not §5 of this document**, which is the API contract. The two share a document-relative label and were collapsed in conversation for an entire pass; they are different documents' sections.

The sixth entry is the one worth stating carefully, because it shipped three times as one-off copy before it had a name: **the app, about its own answer.** Distinguished from *the app (computed)* by **basis against scope** — a basis explains a figure you can see, a scope names what you cannot. Its treatment is not a value but a sentence at the scope of the set it describes, naming the criterion and never the count alone, and it does not stay settled: it expires when the set changes, which `gapsClosedSince` already implements. *The three instances:* `/suggestions`' *"Showing 6 of 74 linked artists — the strongest connections, not the whole graph"*, `askedLine`'s *"before you added 5 records or wanted records"*, and *"1 suggestion was discarded for naming nothing checkable"*.

---

## 8. Graph & shelf ordering — retired at step 13

Both features in this section are gone. They are recorded here rather than deleted because three sections still in force were written against them, and because the reasons are worth keeping.

### 8.1 Network graph — built, then retired

`GET /api/graph` returned artist and genre nodes with `influence`, `member_of`, `genre_parent`, `shared_member` and `has_genre` links; `/graph` rendered them with a D3 force simulation. It shipped at step 12 and was retired at step 13 unit 5, along with `buildGraph` and the `has_genre` derivation. The implementation is in git at `src/lib/db/queries/graph.ts`, commit `bfc8f08^`, with the tests that pinned its clustering behaviour.

**Why.** It drew a picture that told the user what they already knew. The collection's structure — punk things, rock things, two singletons — was legible from the shelf without a force layout, and the screen's real value turned out to be the data behind it, which §9 reads directly.

**What survives, and where it went.** The tables are untouched: `artist_memberships`, `artist_influences` and `record_genres` are all still written correctly. `artist_genres` is the exception and always was — it has never held a row (§4.3), which the graph's retirement did not cause and did not reveal. Three rules moved rather than died:

- **Genre grouping and its tie-break** — an artist or record is attributed to the top-level ancestor of the genre with the most of its owned records, ties broken by genre name so the same collection always groups the same way. This was the graph's colouring rule and is now the shelf's ordering rule; it is stated in §10b, which is the section that uses it.
- **Sparseness is not disguised.** A collection of unrelated artists is genuinely a scatter, and a view that implied structure the data lacks would be the confidently-misleading shape CLAUDE.md §8 forbids. Restated in §10b rather than referenced from here.
- **`has_genre` was a count, not a boolean** — the number of an artist's owned records tagged with a genre, derived at query time from `record_genres` and never stored (§7.1). §9.1's genre-overlap term is the same aggregate and should be written against §9's requirement rather than restored wholesale: a payload builder shaped for a force layout is the wrong shape for a scoring function.

**People are edges, not nodes** was the graph's answer to a real problem that outlives it: a membership import pulls in every session player and side project, and 71 artists of which 4 have records is a hairball. Any future view over this data inherits the problem. The graph's answer was to collapse a person who links two groups into a weighted edge between them; it is recorded here because the next reader will meet the same 67 artists.

### 8.2 Shelf order — specified, never built

`GET /api/shelf-order` proposed a linear filing order for the physical collection, derived by greedy-modularity community detection over an artist graph weighted by `INFLUENCE_WEIGHT` and `GENRE_WEIGHT`, with bridge records marking the transitions.

**Why it was retired before it was built.** It needed three things the collection does not have: enough records for clusters, a built-out genre hierarchy, and hand-entered influence edges. Its output for a real collection today is "punk things, rock things, two singletons" — which a genre sort gives for free, without a tuning knob no test can validate. `WIDE_RATIO` had already failed to validate twice against a case with a known answer; `INFLUENCE_WEIGHT`/`GENRE_WEIGHT` would have been the same bet, twice over.

**One requirement survived and is load-bearing.** *"The same collection must always produce the same shelf order."* A wall scanned by eye cannot reshuffle between page loads, or it is re-scanned every time. §10b inherits this and states it; `shelfRecords` breaks every tie deterministically and a test pins it. The requirement was about the problem, not the algorithm, which is why it outlived the mechanism.

**What replaced both:** §10b.

---

## 9. Suggestion engine

### 9.1 Relationship-based (default, always on)

`GET /api/suggestions`. Pure computation, no external calls.

**It reads two tables and no screen.** `artist_influences` (edges the user asserted) and `artist_memberships` (lineups imported from MusicBrainz, §4.3). An earlier version read `record_genres` too, for a genre term now recorded at §9.1a as awaiting a source. Earlier versions of this spec called this "graph-based" after §8.1's visualization; that screen is retired (§8) and the relationships it drew are not. The name changed so that nothing sends a reader looking for a graph to find one.

For each artist **not** in the collection but reachable from one that is — appearing in `artist_influences` linked to an owned artist, or sharing a member with one through `artist_memberships` (§4.3) — compute:

```
score =
    (2.0 × number of owned artists directly linked, weighted by edge strength)
  + (1.5 × number of owned artists sharing members, weighted by people in common)
  - (3.0 if already on the want-list)   // suppress, don't hide
```

**Two terms are specified below and not yet scored, because nothing populates their source.** Measured, not assumed: `artist_genres` has never held a row, and no `artist_labels` table exists. Both are recorded at §9.1a with what each would need.

What remains is a **relationship engine**: an artist is suggested because you asserted an influence edge to them, or because they share members with a band you own. That is scene adjacency, and it is what the data actually supports today. §9.2's LLM gap analysis is where genre-aware suggesting lives, and it is unaffected — it summarises the collection from `record_genres`, which is populated.

**The two link terms are separate on purpose, and must not be merged.** An `artist_influences` edge carries a 1–5 `strength` the user typed; a shared membership carries a count of people imported from MusicBrainz. Merging them into one link total requires an exchange rate between a judgement and a measurement — a number nothing in the collection can supply, which would be guessed once and cited as settled thereafter. §4.3 already forbids the version of this that writes membership into `artist_influences`; scoring them as one term is the same conflation one layer up.

Merging also destroys the distinction the membership import was built to expose. In a sum, four shared members and one strong influence edge are the same number, so the terms must stay separate. **But the claim this paragraph used to make about WHICH distinction the count draws is false, and is corrected below.**

**MEASURED AND REFUTED (A48, 2026-09-07): the shared-member count does NOT separate a tribute act from a side project.** This paragraph read *"a tribute act shares one hired player with a band the user owns; a genuine side project shares several"* — an appealing rule, asserted from nothing, and Adam's collection falsifies it directly:

| candidate | shared with Dire Straits | what it is |
|---|---|---|
| Mark Knopfler's Guitar Heroes | 2 — Guy Fletcher, Mark Knopfler | a member's side band |
| The Notting Hillbillies | 2 — Guy Fletcher, Mark Knopfler | a member's side band |
| The Straits | 2 — Alan Clark, Chris White | a continuation act |
| Dire Straits Experience | 1 — Chris White | a tribute act |

**The same two people produce both of the middle rows**, and the tribute act at the bottom shares FEWER than the side projects — the exact inverse of the rule. The count is a real measure of connection strength and it is not a measure of what kind of connection it is.

#### The honest limit of §9.1 — a graph cannot represent intent

**This is the general statement, and it is the thing to meet BEFORE proposing an improvement to this ranking.**

**A graph can represent that relationships exist and cannot represent why.** `artist_memberships` records that a person played in two groups. It does not record — and MusicBrainz does not record anywhere reachable — whether the second group was formed to continue the first, to pay tribute to it, to give one member a side outlet, or for reasons unrelated to it. Those differ ONLY in intention, and intention is not a property of graph shape.

**So any signal derived from graph shape alone will conflate cases that differ only in intention.** No weighting, threshold or normalisation escapes this, because the information is absent from the input rather than obscured within it. A cleverer function of the same edges cannot recover what the edges never carried.

The proof is above and it is exact: Guitar Heroes and The Notting Hillbillies share the **identical pair** of people with Dire Straits. Any function of the membership graph returns the same value for both. They are different things — one is a guitarist's side band, the other a different member configuration — and nothing in the data says so.

**What this rules OUT, so the next attempt does not re-derive it:** tuning the shared-member weight, adding a normalisation by band size, ranking by the fraction of a lineup shared, or any threshold on the count. Each is a function of the same edges and each conflates the same cases.

**What it leaves OPEN:** signals from OUTSIDE the membership graph. MusicBrainz's `tribute` relation is one — it is a different edge type carrying an explicit statement of intent, which is precisely why it works where the count cannot (A48 uses it, catching 2 of 6 measured cases). Release-level data, dates, and the user's own judgement are others. **The rule is not "this cannot be improved" but "it cannot be improved from the membership graph alone."**

#### The list STOPS rather than running to exhaustion (A53, 2026-09-08)

**Every convergence is shown; adjacency stops at five.** A display decision, not a cut — nothing is filtered, no candidate is judged, and no score changes.

**A numeric threshold cannot work, and this is measured rather than argued.** Over 74 candidates from seven walked artists: at a cut of 2 you keep Tom & Jerry and Manzarek–Krieger (the same act under another name) and lose nothing worth losing; at 3 you lose Blood, Sweat & Tears — a real discovery — while KEEPING Rick & The Ravens, a rename. **The renames rank high by construction**, because a band of the same people shares the most members with it. No threshold on the shared count separates a rename from a destination.

**So the fix is to show fewer, not to judge more.** 55 of the 74 links sit at a single shared member, which is graph adjacency rather than a recommendation. **74 rows where 3 are useful trains the reader to skim; 6 rows where 3 are useful does not.**

**Convergences are never capped**, because a cap on the combined list could push the only real discovery off the screen to make room for adjacency — the exact inversion A50's tier exists to prevent, arriving through the display instead of the sort. They are rare: one in 74 measured.

**Five is a product judgement**, the same standing as A27's weights and §9.2's six suggestions. Revisit if the list reads as consistently too short.

**The cap lives on the SCREEN, not in the query, and the first implementation got this wrong.** Capping inside `suggestions()` silently changed `GET /api/suggestions` — which §5.8 specifies as returning `limit` results, default 10 — and its contract test caught it. **A screen's editorial decision must not rewrite an API contract**: the endpoint returns the ranking, `forDisplay` decides how much of it a reader sees.

**And the truncation is STATED** — "Showing 6 of 74 linked artists" — because a silently shortened list makes "these are all the links" and "these are the strongest six of seventy-four" indistinguishable. That is the absent-versus-unknown rule applied to a list length.

**This deliberately does NOT solve the same-act-renamed problem**, which is confirmed unsolvable from the membership graph three separate ways (below). A display decision does not need to.

##### The same-act-renamed problem, and three mechanisms that fail

Tom & Jerry and Tico & The Triumphs are Simon & Garfunkel under earlier names; Manzarek–Krieger, Butts Band and Rick & The Ravens are Doors members; The Straits and The Notting Hillbillies are Dire Straits players. All rank high because they share the most members. Three mechanisms were tried against them:

| mechanism | why it fails |
|---|---|
| MusicBrainz `tribute`/`subgroup` | the wrong relation — these are not tributes; the edge does not fire and should not |
| name containment | catches "Miles Davis Quintet", misses "The Notting Hillbillies" — coverage is the complement of usefulness |
| **shared ÷ candidate's lineup** | **structurally incapable of varying — see below** |

**THE RATIO TEST IS THE MOST DANGEROUS OF THE THREE AND MUST NOT BE RETRIED.** The proposal is sound in principle: a renamed act shares most of its lineup with the original, while a genuine destination shares a few players out of many. **Measured, every candidate scores exactly 1.00** — Blood, Sweat & Tears and The Doobie Brothers alongside Tom & Jerry and Butts Band.

**The denominator is the numerator.** A candidate is by definition a band that has never been walked, so the only members the database holds are the ones shared with an owned artist. The Doobie Brothers has 20+ members; the database has 3, all ex-Steely Dan. `shared ÷ known_lineup` is therefore 1.00 by construction for every candidate.

**It reads as a confident classifier rather than a broken one**, which is why it is recorded here rather than in NOTES alone: a uniform 1.00 across every row looks like a signal that has decided, and nothing about the number suggests it cannot vary. **A ratio is only meaningful when its denominator is measured independently of its numerator.** Making it work would require walking each candidate — one request each, which is exactly the cost a cheap ranking metric exists to avoid.

#### Convergence is a TIER above adjacency (A50, 2026-09-07)

**A candidate reaching TWO OR MORE owned artists ranks above every candidate reaching one, whatever the scores say.** Within each tier the existing order stands: score descending, so Broken Bones still tops the adjacency tier and want-list suppression still orders inside both.

**Two different questions, not one question at two confidences.** Four shared members with one owned band says a band grew out of another — real, and Broken Bones earns its place. Two people from two DIFFERENT owned bands says two threads in the collection meet somewhere, which is something the user could not have worked out themselves. **Only the second is a discovery, and no amount of the first adds up to it.**

**This is A27's argument one level in.** A27 refused to merge the influence and shared-member terms because a sum makes four shared people and one strong influence edge indistinguishable. The same objection applies WITHIN the shared-member term: adjacency and convergence are different claims, and a single number lets one substitute for the other.

**A TIER, never a large coefficient, and this is the load-bearing decision.** A coefficient — however large — can be out-summed by enough shared members, and it invites someone later to tune it until the tiers overlap. That overlap is exactly what must not happen. So the ordering is structural: the sort compares the tier first and the tier is never added to `score`. A test pins that a 2-band candidate beats a 1-band candidate carrying **twenty** shared members, which no coefficient scheme can satisfy.

**The candidate need not have an owned parent.** Measured: two people who each reach the collection through a DIFFERENT owned band, meeting in a band the user owns nothing by, yields `sharedMemberArtistCount = 2`. The unowned band is the discovery — Chris Cornell and Tom Morello converging in Audioslave is the case, and it fires whether or not Soundgarden and Rage Against the Machine are themselves owned.

**The quantity is OWNED BANDS, not people.** `sharedMemberWeight` counts distinct people; `sharedMemberArtistCount` counts distinct owned artists those people come from. Two people from Dire Straits is adjacency (`people=2, ownedBands=1`); one person each from two owned bands is convergence. The Notting Hillbillies is the proof that the people count cannot discriminate: it scores 2 people and is the case this ranks DOWN.

**The reason string says which claim fired.** "Shares 2 members with X" is true of both tiers and cannot explain an order the tier produced, so a convergence names the count of owned artists it reaches. §9.1's rule that a reader who sees the evidence can judge it applies to the tier as much as to the terms.

**DORMANT BY CONSTRUCTION, and that is not a defect** — recorded here so nobody later reads zero convergences as a bug. Measured against the live collection: **zero of 34 candidates reach two owned artists**, because two artists are walked (§9.1b) and their lineups do not intersect. A convergence requires at least two walked artists whose members meet in a third band. This is the same state as §9.1a's terms awaiting a source: the term is right and the data has not arrived. **Walking more artists is what makes it fire**, which is why the scoring was built first — it is cheap and safe now, and it stays quiet until the data can exercise it.

#### Derived acts are EXCLUDED, not suppressed (A48, 2026-09-07)

`artist_derived_acts` records a `tribute` or `subgroup` relation between two artists, read from the same MusicBrainz payload the lineup walk already fetches — **no extra request, which is why this signal is free.** A candidate is dropped from §9.1 when it is the DERIVED side of a relation whose ORIGIN the user owns.

**Excluded rather than suppressed, and the asymmetry with the want list is deliberate.** A want-listed candidate keeps its row and loses 3.0 because it is a real suggestion the user has already acted on. A tribute act is not a weak suggestion — it is the band the user already owns under another name, and there is no score at which "you own Dire Straits, consider The Dire Straits Experience" becomes useful. Subtracting a constant would put it on a scale it does not sit on.

**Three things this must not do**, each pinned by a test because each is a plausible over-correction:
- **Drop a genuine side project.** Broken Bones shares members with Discharge and has no derivation relation; it is the suggestion the feature exists to produce.
- **Match on the derived artist alone.** A tribute to a band the user has never heard of says nothing about their collection.
- **Drop the ORIGIN.** Matching either column would hide an unowned original because it happens to have a tribute act — the direction error, one layer up from `normalizeDerivedActs`'s `backward` check.

**These are NOT memberships and must never be written to `artist_memberships`.** That table holds person→group facts; a band in it would inflate the very shared-member count §9.1 reads, corrupting the signal this exists to clean up.

**Coverage is 2 of 6, measured (§9.1's honest limit).** The remaining four carry no such relation and are unreachable by any graph-derived signal. This is a floor, not a fix, and no threshold is specified to close the gap — see §9.1b for why the tail is left alone.

**Weight the shared-member term by people in common**, not by whether any exist: the count is the signal. Ties break on artist name, so the same collection scores the same way on every call.

Return the top `limit` sorted descending, each with a **reason string** assembled from which terms contributed — e.g. "Linked to 3 artists you own; shares 4 members with Discharge."

The two link terms appear as separate clauses, naming which one fired. "Linked to 3 artists you own" and "shares 4 members with Discharge" are different claims about different evidence, and a reader who can see which one produced a suggestion can judge it; a merged clause asks them to trust an arithmetic they cannot see.

The example previously continued *"; shares the UK82 genre; on Clay Records, a label you own 4 records from"* — clauses from the two terms now at §9.1a. They return when their terms do.

Suggestions must be explainable. Never return a bare score with no reasoning.

#### The influence term has never run in production (A48, 2026-09-07)

**Measured in Adam's live database: `artist_influences` has ZERO rows.** So §9.1 is specified as a two-term ranking and has only ever been a one-term ranking. The 2.0 coefficient, the "Linked to N artists you own" clause, and the deliberate refusal to merge the terms have never been exercised against real data — only against test fixtures that POST to the API directly.

**Why: there is no production entry point.** `POST /api/influences` exists and works, `createInfluence` exists, and **nothing in `src/app/**/*.tsx` or `src/components` ever calls them.** The only client that does is `e2e/suggestions.spec.ts`, setting up its own fixtures. The sole place the UI touches influences is artist MERGING (`merge-summary.ts`), which rewires existing rows and cannot create one.

**This is a finding about the spec, not only the code.** §9.1's primary term — the one weighted highest, precisely because the user typed it — is unreachable through the app. **A term with no entry point is a term that cannot be evaluated**, so every judgement made about this ranking's behaviour, including judgements about its tail, has been about the shared-member term alone.

**Consequence for anyone tuning this ranking:** do not draw conclusions about §9.1's output until the influence term has contributed at least once. Adam's six-tribute complaint, and the distribution measured from it, are the shape of ONE term reading TWO walked lineups (§9.1b) — not the shape of this feature.

**Not fixed here, and deliberately not.** Whether influence edges get a UI is a product decision (§13 governs what gets built), and inventing one to satisfy a coefficient is the wrong order. What is fixed in A48 is the LIE about it: `/suggestions` told the user influence edges are "recorded in Manage" and `/manage` has no such control — the app directing the user somewhere to do something they cannot do.

### 9.1b The ranking's inputs are two lineups, not a collection (A48, 2026-09-07)

**Measured, and it governs how the current output should be read.** Of 17 owned artists, **2 have been walked** — Discharge and Dire Straits. Every one of the 34 candidates the engine can produce descends from those two.

So the observed distribution — 1 candidate at 4 shared members, 1 at 3, 6 at 2, and 26 at 1 — **is the shape of two lineups, one of which is a band with thirty years of continuation acts.** It is not a property of the collection, and a threshold fitted to it would be fitted to 12% of the collection and to one band's unusual tribute footprint.

**So no cut is specified here**, though the tail is plainly noisy. Adam's decision, recorded because the reasoning outlives it: *"a threshold measured now is fitted to 12% of my collection"*, and judging the tail before the primary term has ever contributed is judging something else. **Walk more lineups first, then measure, then decide.** The next measurement is four unambiguous groups — The Doors, Steely Dan, Simon & Garfunkel, The Blues Project — which answers whether the Dire Straits tribute footprint is anomalous or typical without needing all fifteen.

**The walk's cost, corrected and measured** (an earlier estimate of "fifteen calls, one a second" was wrong and is recorded as such): `walkLineup` fetches the band and then fetches EVERY MEMBER individually, because following a member into their other bands is the entire point. Discharge was 24 members — 25 requests. None of the 15 unwalked artists has an MBID, so each also needs a search, and an ambiguous name STOPS the walk for a user decision (§4.3's disambiguation). Realistic total: **250–350 requests, 4–6 minutes, punctuated by prompts** — not unattended, and `maxDuration = 60` makes it inherently one artist at a time.

### 9.1a Two terms awaiting a source

Both were specified in §9.1 and are not scored. Each is recorded with what it needs, because the term is right and the data is missing rather than the reverse.

**Genre overlap — `1.5 × overlap with the user's top 3 genres by owned count`.** "By owned count" ranks the top 3; it does not say whose records supply the overlap. The overlap is between the candidate and those three genres, and a candidate's genres are a property of the artist — `artist_genres` (§4.3) — not of records they do not own. §9.1's own example reason string says *"shares the UK82 genre"*, a claim about an artist.

**Trigger: when anything populates `artist_genres`.** The obvious candidate is the Discogs import, whose release payloads carry genres and styles.

**But that is a measurement before it is an implementation**, and the measurement comes first. Discogs genres are a property of a *release*. Deriving "this artist is a UK82 artist" from one release's tags is a claim about an artist assembled from claims about records, which is the move §4.3 already refuses when it declines to write membership into `artist_influences` — MusicBrainz has no influence relationship, and mapping one onto the other would fill a 1–5 strength with a number nobody measured. Whether a release's genres honestly characterise its artist is answerable against real payloads and must be answered before this is built. If the answer is no, the term needs a different source or it does not ship.

**Label overlap — `1.0 × overlap with labels appearing 2+ times in the collection`.** Needs an artist-to-label relationship, which does not exist in §4 in any form.

**Trigger: a schema decision, taken deliberately, not as a side effect of building the term.** The same question applies harder than for genres: a label is a property of a *pressing* (§4.2), and an artist releasing once on Clay does not make them a Clay artist. A table asserting otherwise would be the app inventing a fact about an artist from a fact about a record.

**Neither term is deleted, because neither is wrong.** They are claims this app cannot currently substantiate, and §8's rule is that an unsubstantiated claim is not made quietly.

### 9.2 LLM-assisted (on-demand)

`POST /api/suggestions/ai`. Server-side call to the Anthropic API.

- Build a compact summary of the collection: owned artists grouped by genre **and with the titles they own (A41)**, want-list with priorities, label counts. Do not dump raw rows.

  **What leaves the machine, field by field** — R5's first attack line, and `test/integration/llm-payload.test.ts` asserts it against the serialised payload with a sentinel per excluded field:

  | Sent | Withheld |
  |---|---|
  | artist names, record counts, genres | purchase price, purchase date |
  | **owned record titles (A41)** | store names, journal entries |
  | want-list artist, title, priority | record notes, matrix/runout, catalogue numbers |
  | label names and counts | best-dig notes, max price |
  | the genre hierarchy | every database id |

  **Owned titles were withheld until A41 and their absence was the defect.** A29g made "already owned" an ARTIST-level rule because titles were not sent, and then asked the model to lead with ownership reasoning anyway — producing "Miles Davis — *Bitches Brew*" twice in two runs against a collection that contains it, 1 of 6 suggestions each time.

  **A rule the payload cannot support is either enforced by data or dropped from the prompt.** Dropping it means giving up same-artist suggestions, which is the case A29g deliberately wanted, so the data is sent instead and the rule is stated at record level — the same level the want-list prohibition has always had.

  **A29g named the wrong cost, and this is worth recording rather than quietly correcting.** It declined on DISCLOSURE grounds; the argument that actually scales is INPUT SIZE. Measured: owned titles add ~150 tokens at 17 records and ~2,000 at 200, against inputs of 1,603–1,738 and A38's finding that input is the cheap side. On disclosure the honest position is that owned titles are the same KIND of fact as want-list titles — which §9.2 has always sent — and that §9.2 already sends a full taste profile in outline (every artist, count and genre); titles sharpen a picture already disclosed. The real asymmetry was volume (17 owned against 1 wanted), which is a scale concern rather than a category one.
- Prompt asks for **gap analysis**: named records that are conspicuous absences given what's owned, with a one-sentence rationale each. Ask explicitly for genre-accurate reasoning — the distinctions between UK first-wave punk, UK82, US hardcore, horror punk, and psychobilly are meaningful and should not be flattened into "punk".
- Require JSON-only output: `{ suggestions: [{ artist, title, reason, genre }] }`. Strip markdown fences before parsing. Handle parse failure gracefully with a user-visible error, not a crash.
- **"Already owned" is an ARTIST-level rule, because the payload cannot express a record-level one.** The summary sends owned ARTISTS — a name, a record count and genre names — and **no record titles**. So "do not recommend anything they already own" could not be honoured at record level by either side: the model is never told which records they are.

  **A different record by an artist they own is a legitimate suggestion, not a defect.** It is arguably the best-supported kind: an artist with four records on the shelf is demonstrably collected, and naming a fifth is exactly the gap this feature exists to find. The live run produced one — Dire Straits, *Brothers in Arms*, with the reason openly saying "The collector already owns Dire Straits" — and it was a good suggestion. The prompt now says so, and asks the model to name that as its reasoning when it applies.

  **The want list keeps a record-level prohibition, and the asymmetry is the point.** It is sent with artist AND title, so "already on their want list" is checkable from the payload in a way "already owned" is not. A rule the data can support is stated; a rule it cannot is not asserted. This is the same discipline as A29c's refusal to let a prompt instruction read as a verification.

- **The prompt asks the model to omit records it is unsure exist. That reduces hallucination and does not prevent it** — a model's confidence is not evidence, and nothing in the response can be checked against the world. So it is a trade of recall for precision, not a guarantee, and the human step below is what actually catches an invented record. Do not let the instruction's presence in the prompt read as a verification anywhere in the code or the UI.
- **`genre` must be one of the user's own genre names, and this is validated rather than trusted.** The prompt supplies the collection's genre hierarchy — each genre with its parent, so a child reads as "UK82 (a kind of Punk)" — and constrains the field to those names, which is what makes the response checkable instead of merely plausible.

  **What the validation catches, stated precisely, because an earlier version of this bullet overclaimed.** It rejects a `genre` that is not one of the user's genres at all — "Britpop" against a collection that has no such genre. It does NOT reject a parent term: `Punk` is a name the user has, so a suggestion tagged `Punk` validates even where every record is tagged at a leaf beneath it. The previous wording said a model flattening UK82 into "punk" "produces a name the hierarchy does not contain", which is true only while the parent is absent from the collection — and false for exactly the collection that has the hierarchy this bullet describes.

  **So the hierarchy in the prompt is what prevents flattening, and the validation is what catches an invented genre.** They are two mechanisms against two failures, and neither is a backstop for the other. Measured: a live run against a collection with `Punk` as a parent of `UK82` and `US Hardcore`, tagged entirely at the leaves, returned 34 suggestions and none tagged `Punk`.

  **Rejecting a parent is deliberately NOT a rule.** "Nothing is tagged Punk" is a fact about the collection today, not a rule about it — a user may tag at a parent tomorrow, and a validation that dropped those suggestions would discard correct answers on a state change nobody made. Genre precision is asked for in the prompt, where being wrong costs a weaker suggestion, rather than enforced in the parser, where being wrong silently deletes a good one.

  A suggestion whose `genre` is absent from the hierarchy is **valid JSON of the wrong shape** — the envelope parsed and one value is unusable. It is not a parse failure and not an empty response, and the three must stay distinguishable.

  **Drop that suggestion, keep the rest, and report how many were dropped.** Per-suggestion rather than whole-response: one bad genre in five is not a reason to discard four good ones. Silently rather than visibly is the failure to avoid — a dropped suggestion nobody is told about makes the model's error invisible and the list shorter for no stated reason.
- **Ask for SIX suggestions, in the prompt (A37, 2026-08-26).** Measured, not assumed: a real gap analysis over a 17-record collection was truncated — `reason=cut stop_reason=max_tokens chars=3399 in_tokens=1533 out_tokens=4000 max_tokens=4000`, the output ceiling hit exactly. Input was 1,533 tokens for 17 records, so **the summary is cheap and the pressure is entirely on output**; even a 200-record collection would not make the input the problem.

  **A count fixes this at any collection size; raising `max_tokens` does not.** With no count the model returns as many suggestions as it judges warranted — R5 measured 34 — and that number grows with the collection, so a higher ceiling buys a few more and fails again later. R5 already identified the prompt as the honest place for a count, rather than a server-side slice that would discard output the account was billed for.

  **Six is a PRODUCT JUDGEMENT, not a measured value, and is recorded as one** — the same standing as A27's 2.0 and 1.5 link weights, which are also chosen rather than derived. The reasoning: R5's run produced 34 suggestions and the user read the first six. A gap analysis is a prompt for the next dig, not a catalogue, and a list nobody reaches the end of spends tokens on suggestions that are never read. Six fills a phone screen without scrolling and is small enough that the sixth is still considered rather than skimmed. **Revisit if the user finds the list consistently too short** — that is a real signal and the number is one line of prompt text.

  **A bounded response can still truncate, and the copy must not pretend otherwise.** The count bounds how many suggestions are asked for, not how long each `reason` may be.

  **MEASURED, correcting an earlier estimate (A41, 2026-08-26).** The first two runs to record tokens, both six suggestions, both `end_turn`:

  | run | | input | output | headroom at 4,000 |
  |---|---|---|---|---|
  | 18:42 | pre-A41 | 1,603 | **526** | 7.6× |
  | 19:10 | pre-A41 | 1,738 | **1,210** | 3.3× |
  | 19:50 | **post-A41** | 1,886 | **1,736** | **2.3×** |

  **Reason length varies 3.3× across three runs of the same six suggestions, unprompted.** The original figure — "roughly 2.5× headroom" — was extrapolated from a single sample by assuming one representative reason length, and **a single sample cannot bound variance**. The observed worst case has since passed under it.

  **A41 plausibly raised output, and the mechanism is legible:** a reason grounded in a specific owned title ("*Bitches Brew* is on your shelf, and this is the quieter session that opened the door it walked through") is simply longer than an ungrounded one. That is the feature working — the reasons are better — and it costs tokens.

  **Input is NOT the concern and the measurement settles it.** Owned titles added **148 tokens for 17 records**, which extrapolates to roughly 1,700 at 200 records — against outputs already reaching 1,736. A38's finding holds: the pressure is entirely output-side.

  **The number to carry forward is 2.3×**, and the trend across three runs is one direction. Six suggestions is comfortable at every observed length; a further doubling of reason length would not be. **What to watch is output per suggestion, not the count** — and `llm_requests` now records it on every run, so the trend is queryable rather than anecdotal. **So truncation becomes implausible rather than impossible**, the `cut` failure path stays, and its message stays accurate for the case where it genuinely happens.

- **Rate limit to 10 requests/hour, enforced server-side against `llm_requests` (§4.3)** — never trusted from the client, and shared with §10b's snippet since both spend the same account. Exhaustion is a legible refusal naming when capacity returns, not a 500 and not silence: an exhausted quota is a fact the app knows, and reporting it as an internal error sends the reader to application logs for something the app could have said. Never call this on page load — user-initiated only.
- **The last result is persisted for display, and re-asking always costs a call (A39, amended 2026-08-26).** This clause previously read "results are ephemeral (not persisted)", with no reasoning attached, and its own sentence paired ephemerality with the add-to-want-list action — which suggests the concern was that **a suggestion must never become a row in the collection**. That concern is untouched here and is enforced by the bullet below: the action still only prefills a form.

  **What ephemeral cost in practice.** The result lived in component state, so navigating away destroyed it, and the only way to see the same answer again was to ask again — spending one of ten hourly requests to be told what the user had already been told. Reported from real use.

  **The stored copy is a RECORD OF WHAT WAS SAID, not a cache.** "Suggest" always performs a fresh call; nothing is ever served from the store in place of a request the user made. That distinction is the whole design: a button that silently returned a previous answer would be a button that lies about what it did, and one that refused the call would give the user nothing for the click. Persisting instead removes the reason to re-ask.

  **It is displayed with when it was asked, and with what has changed since.** A timestamp alone is a fact about the REQUEST; what the reader needs is whether the answer still applies. Those diverge in the direction that matters: twenty minutes with nothing added is a current answer that reads as stale, while two minutes with five records added is a stale answer that reads as fresh — and a gap analysis is a claim about what is MISSING, so adding records is exactly the event that invalidates it.

  So the app states the count of records added since the analysis was asked, from `records.created_at`, and **only when it is non-zero** — a caveat shown when nothing has changed is noise that spends the credibility of the one that matters (the same rule as §12 step 14c's variant limit).

  **It STATES, it does not advise.** "Asked 20 minutes ago, before you added 5 records" is a fact about what the answer covers. Whether five more records is worth one of ten hourly requests is the user's judgement, and copy that nudges toward re-asking is the app spending the user's quota on its own opinion.

  **CORRECTED (A47, 2026-09-07): the count covers records AND want-list additions, and is named for what it measures.** This bullet previously read "records only, and want-list additions are deliberately not counted", on the argument that records are what the suggestions are ABOUT. **That argument is true of what the model REASONS OVER and false of what INVALIDATES its answer**, and the staleness line is about the second. The two were conflated, and the conflation had a cost: a want-listed record left a suggestion on screen while the line beside it asserted nothing had changed — the freshness signal blind to precisely the change that stales the answer.

  Found by Adam from real use: a record added to the want list was still being suggested, and the count read zero. The exclusion was working on the wire and the panel was showing a stored answer from before the addition (A47 below).

  **What was RIGHT in the old bullet is kept:** a sentence carrying two numbers is vaguer than either and less likely to be read. So the fix is not "records added, and want-list rows added" as two figures — it is ONE count of the events that invalidate this answer, with copy that names what it counted rather than claiming a record count. **A number's NAME must match what it measures**, which is the test-name rule (CLAUDE.md §2) applied to UI copy: "before you added 5 records" is a claim, and a claim that counts something else is the same defect as an assertion that tests a proxy one layer below it.

  Both events invalidate for the same reason and it is one reason, not two: a gap analysis is a claim about what is MISSING, and both adding a record and want-listing one remove something from the set of gaps. That is what makes a single count honest rather than a blur.
- **A stored answer is RE-FILTERED WHEN DISPLAYED, and the filter MARKS rather than removes (A47, 2026-09-07).** The want-list exclusion is enforced in the prompt (the payload carries titles, and the record-level prohibition is stated). That covers the ASK. It does not cover the SCREEN: a stored answer is a claim from the moment it was made, and want-listing a record afterwards makes one of its lines a record the user has already decided to hunt. Showing it unchanged is stale in a way the timestamp does not express.

  **Marked, never silently dropped**, and this follows an earlier decision rather than making a new one: acting on a suggestion does not remove it, because the panel is **a transcript of what the model said, not a live list**. Editing the stored answer on display would make it the second thing while it claims to be the first — and A39 already establishes the store as "a record of what was said, not a cache". A dropped line also hides the exclusion working; a marked one shows the user that they acted on it, which is information the removal destroys.

  So the suggestion stays in place, in the order the model gave it, marked as now on the want list. **The filter is applied at display, not at storage**: the stored row is never rewritten, so the transcript stays exactly what the model returned and the marking is recomputed against the want list as it is NOW, every time the panel renders.

  **This is the same shape as §12d's staleness count and 14c's display-not-match** — the app puts the material where the user can judge it rather than asserting a correction on their behalf.

- **The prompt names what the model suggested before, and the model may repeat it (A47, 2026-09-07).** Reported from real use: successive asks returned the same handful of names. Measured rather than assumed — two `buildPrompt` calls over an unchanged collection produce a BYTE-IDENTICAL string, the prompt contains no previous answer and no instruction to differ, and no `temperature` is set anywhere. **So the repetition is the model being consistent, and the feature giving it nothing to be consistent against.** "The six most worth their attention" over a fixed input is a request for a stable ranking; asked twice, a good model should answer twice the same.

  **THIS IS NOT A REVERSAL OF THE REPETITION DECISION, and the distinction is the whole point.** Repetition was kept on the grounds that *a still-missing record is still missing* — which defended **not suppressing a real gap**. It never argued the ask should be UNABLE to reach a seventh. "The top six of a fixed ranking, forever" is an inaccessible tail rather than honest consistency: records 7–12 cannot be surfaced by any number of asks. The model should therefore **know what it said and remain free to repeat it** when the gap is still the most worth naming. The difference is that it CHOOSES to, rather than being unable to do otherwise.

  **Told, not sampled.** A `temperature` was considered and rejected: it produces different answers to the same question rather than a model reaching past what it already said — drift rather than intent. This project has consistently preferred the model knowing something over the model guessing (the genre hierarchy in the prompt, §12c's parent suggestions, A41's titles), and this is the same choice a fourth time.

  **A39's retention is now load-bearing for a SECOND reason**, worth recording because it was not the reason it was built: retention exists so the user can compare two answers, and it happens to store exactly what this prompt needs. Nothing new is stored. **The consequence is that the retention depth and the prompt are now coupled** — reducing retention would silently weaken the prompt, so a change to one must consider the other.

  The instruction is permissive, never prohibitive: naming the previous suggestions and saying they may be repeated **if still the most worth naming** preserves the gap that is genuinely still a gap, while asking the model to look past what it has already said when it can. A prohibition would suppress real gaps, which is exactly what the original decision protected.

  **MEASURED against the live model (Adam, 2026-09-07), and this is the only test that could settle it.** Everything asserted in the test suite is about the prompt TEXT and the transport; whether a model actually reaches past its own previous answer is not observable from inside a fixture. Three consecutive asks over one collection:

  | ask | suggestions |
  |---|---|
  | 1 | Discharge, Black Sabbath, Chic, Brian Eno, Herbie Hancock, Minor Threat |
  | 2 | Massive Attack, Miles Davis, Mahavishnu Orchestra, The Doors, Public Enemy, Discharge |
  | 3 | Discharge, MGMT, Herbie Hancock, Chic, Augustus Pablo, Nicolas Jaar |

  **Three different sets, and the repeats are marked AS repeats** — Discharge recurs all three times with reasons saying so ("still the most conspicuous gap flagged last time", "worth raising again"). That is the model repeating DELIBERATELY because the gap still stands, which is exactly what the permissive framing was for: the distinction between honest consistency and an inaccessible tail now renders as copy rather than being invisible.

  **And the tail opened.** Ask 3 reached Augustus Pablo for Dub, Nicolas Jaar, and MGMT's debut — records unreachable by any number of asks under the fixed ranking. That was the concrete cost being paid, and it is no longer paid.

- **A repeated suggestion explains ITSELF, in prose, and no visual treatment should replace that (A47, 2026-09-07).** Observed by Adam across the three asks above: the model's reason for a repeat is doing work no other channel could. "Still the most conspicuous gap flagged last time" is specific to THIS record on THIS ask — it names which gap and why it survived — where a badge reading "suggested before" would be generic, and a design session would have had to invent one.

  **The cheaper mechanism is the one already present.** The prompt asks the model to say when it is repeating; it does, and it says something a UI element could not. **This is the same shape as §9.2's reason field generally and A40's stated-not-rated rule** — the app puts the material where the reader can judge it rather than compressing a specific claim into a generic marker.

  **Carried to the design pass as a CONSTRAINT, not a problem to solve there:** when that work reaches `/suggestions`, a repeat needs no badge, no icon and no "seen before" styling. If a marker is added anyway it must not displace the reason, because the reason is the part carrying the information. A badge alongside a sentence that already says it better is noise with a credibility cost, which is the rule §12 step 14c's variant limit states for caveats.

- **That action prefills the want-list form; it never writes a row directly.** An LLM suggestion names a record, so unlike §9.1 a title exists — but it is a title the model produced, and §5.7's architecture exists because a client asserting a fact the server can establish is the pattern to eliminate. A model is a less reliable client than a user: it can name a record that does not exist, misattribute one, or invent a pressing. A direct write puts an unverified assertion in the same table as records the user typed, where nothing afterwards distinguishes them.

  **Prefilling through `/lookup` was considered and rejected**, though it is the only option where a hallucinated record cannot land. Discogs search is fuzzy and returns something for almost any string, so a hallucinated title finds a near-match and the user confirms a record the model did not mean. That converts a visible failure — a record that does not exist — into an invisible one, a different record blessed by a search. The same shape as a version table whose identical rows read as an answer.

  **Suggestions must read as generated** (§10b's labelling rule): the list says so, and `reason` is presented as the model's rationale rather than as something the app established.

---

## 10. Screens

Responsive throughout — **desktop and mobile are equal priorities**, not desktop-with-a-mobile-fallback. Assume the mobile case is "standing in a record store checking whether I already own this," which means search and want-list must be fast and thumb-reachable.

| Screen | Route | Contents |
|---|---|---|
| Login | `/login` | Password field only. |
| Collection | `/` | Three views of the owned collection: **shelf** (default, §10b), grid, and table. Search and filter chips for genre/label/store/tag. **The views differ structurally, not just in layout:** grid and table carry their controls on the page, above the rows; the shelf owns the screen and reaches the same controls through an overlay, because a wall arriving under four rows of chrome is a strip rather than a wall (§10b). Filtering, sorting and paging apply to grid and table; the shelf is a wall, not a result set. |
| Record detail | `/records/:id` | All fields, pressing details incl. matrix number, images gallery, price history sparkline, journal entries with add-entry form. |
| Record lookup | `/lookup` | **Structured search form** — fields for artist, title, label, catalog number, barcode, country, year, format. Results as cards with cover art, year, country, label, catalog number and format descriptors. Masters expand into a version-comparison table to compare pressings (see step 14b — the table is scoped to the candidates on the page, and comparing is not the same as identifying). Each result offers: "Add to collection", "Add to want list", and an ownership badge (see §7.7). Mobile-optimized — this is the in-store screen. No result may link out to a purchase page (§13). |
| Add/edit record | `/records/new`, `/records/:id/edit` | Form prefilled from a lookup result, or blank for manual entry. All prefilled fields remain editable — the user verifies against the physical record and corrects. Inline create for artist/label/store/tag. Pressing details are entered here, not on a separate screen: catalog number, matrix/runout, country, year pressed, pressing plant, vinyl weight, colour variant, and whether it is a reissue. All optional — the in-store case must stay enterable in seconds. |
| Add/edit want-list item | `/want-list/new`, `/want-list/:id/edit` | Form for a wanted record, mirroring the record form's structure. Fields: title, artist, label, priority, target pressing, best-dig notes, max price. Prefilled from a `/lookup` result via `?discogsReleaseId=`, or blank. **`best_dig_notes` and `max_price` are visually and structurally separate** (§7.2) — never one section, never one label. **No reference row is created FROM A PREFILL** (A36, amended 2026-08-26): a prefill is not a commitment, and an artist created for an abandoned form is debris nothing points at. Inline create is available on this form as it is on the record form — it creates nothing until a deliberate click, so the commitment is the user's rather than the form's. When a Discogs or suggestion value matches no existing row, leave the field empty, name what could not be found, and offer it in the inline-create box ready to accept. |
| Want list | `/want-list` | Sorted by priority. Each row shows target pressing and best-dig notes. "Mark acquired" action opens the record form prefilled. |
| Suggestions | `/suggestions` | Relationship-based list with reasons, always present. Separate "Ask Claude for gap analysis" button for §9.2. Add-to-want-list on each. |
| Stores | `/stores` | **SPEC'D, NOT BUILT (A69, 2026-09-10).** List with favorite toggle; each store shows records acquired there and total spend. No route exists — `src/app/stores` is absent and nothing links to it. Recorded here rather than left to be inferred: the type-scale conversion covered every built screen and skipped this one because there is nothing to convert, and its absence from that work is not an omission. Store data itself is live — `record_stores` is written, and §10's record detail and `/stats`' by-store breakdown both read it. |
| Stats | `/stats` | Total records, total spend, estimated value, breakdown charts by genre/decade/store/label. **Genre is a tree, not a bar chart** — see the note below the table (A66). |
| Manage | `/manage` | CRUD for genres (incl. hierarchy editor), labels, formats, tags, artists, influences. **Not pressings** — see below. |

**`/stats`' genre series renders as a tree of pairs (A66, 2026-09-09).** Genre counts render as a pair, direct and subtree, both, always, labelled. *Four examples, from the tree as it stood on 2026-09-04, chosen because between them they cover every case the pair distinguishes — they specimen the format and are not a current count:* `Rock 10 · 10` (a parent whose branch adds nothing to its own total), `Jazz 3 · 4` (a parent holding less than its branch), `Punk 0 · 1` (a parent holding nothing of its own but something below it), `Black Metal 0 · 0` (a genre holding nothing anywhere). **The bar chart is retired for this series rather than restyled:** a bar is one length and this is two numbers, so no chart style could be honest about it. `/stats` hosts the genre tree, not a genre chart — a distinct component, not the flat breakdown configured twice.

*The defect, and it is a reasoning error rather than a missing feature:* the section previously stated *"direct counts sum to the collection; subtree counts do not"*, and kept it as the honest claim the bar was pretending to make. **It is false, and no count is needed to see why:** a record carries several genres, so the direct counts sum to the number of **genre tags** and exceed the number of records. The honest sentence names the mechanism instead of the arithmetic: *a record is counted under every genre it carries, and again under each of their parents.*

**Why the pair rather than either number alone.** Under direct-only, a parent holding nothing of its own renders 0 and is indistinguishable from a placeholder — new signalled by absence. Under subtree-only, `/collection`'s chips state a parent's and a child's counts separately and selecting both returns the parent's alone — an interface reporting a number its own action contradicts. **Three cases the pair keeps apart, all real:** a parent holding nothing of its own but something below it; a genre holding nothing anywhere; and a parent whose subtree adds nothing to its own count.

**The pair is the format at every depth; the collapse to top level is a default view state, not a different format.** Of the four specimens above only `Rock` and `Jazz` are top-level, so three of the four appear on expansion rather than at rest — and that is evidence about the default rather than about the specimens. **A screen that could only ever show top-level rows would not need the pair at all**, because two of the three cases it distinguishes occur only below the top: a parent holding nothing of its own but something below it, and a genre holding nothing anywhere. The specimen set needs depth to cover its cases, which is the argument that the default must be expandable rather than an argument that the specimens were wrongly chosen.

**The collapse is what pays the row cost, and the pair is what makes the reduction auditable.** A collapsed parent's subtree count states what is underneath without expanding it: **on the same 2026-09-04 table, of the six top-level genres that had children, all but `Jazz` said *the branch adds nothing*, and `Jazz 3 · 4` says the opposite.** One differing parent in six is the minimum that proves the second number is not redundant — if every pair matched it would be provably so — and the reader cannot know which parent differs without seeing all six pairs. **Top-level genres with no children collapse to one number by construction**, which is what the other three breakdowns are throughout.

**`/collection`'s filter row needs a limit, and the pair is not why.** Genres holding nothing anywhere are not offered, and the remainder is still enough chips that the filter competes with the results it filters — enough that dropping the second number would not fix it. Top rows by direct count, remainder behind a line naming its criterion, per §7a's withheld-set rule. Containment is stated on the result rather than encoded in the control: a child's count sits inside its parent's, so selecting both returns what the parent alone returns.

**The shelf has no route of its own.** It is a view of `/`, selected by the absence of `?view=`, with `?view=grid` and `?view=table` as the alternatives. Pulling a record out is a state of that screen, not a navigation — but a spine is still a link to `/records/:id`, so cmd-click, middle-click and a failed hydration all behave correctly (§10b).

**`/graph` and `/shelf` were listed here and are retired** (§8). Nothing links to them and no route exists.

**Pressing entry is inline, and a pressing is never created empty.** A pressing has no meaning apart from the record it describes: nobody enters a catalog number with no record in mind. So there is no standalone pressing screen and `/manage` does not list them. On save, the record's pressing fields resolve through §4's find-or-create rules.

**"Identifying field" is a wider set than §4's match key, and the difference matters.** The match key is `discogs_release_id`, or the tuple `(catalog_number, country_pressed, year_pressed)`. The identifying set is *all eight* pressing fields on the form. A user who enters only a matrix runout has identified their pressing precisely — it is the dead-wax fingerprint — even though nothing in the match key is populated. That entry must create a pressing (matching nothing, per §4's empty-key rule) rather than being discarded. Only when all eight are blank is no pressing created and `pressing_id` left null.

This is deliberately not the same as §4's API-side rule, and both are right for their layer. `POST /api/pressings` is told "make me a pressing" and must never silently share one. The form is told "here is a record", and an empty pressing section means the user did not fill it in — a form that created an empty pressing per record would generate a junk row for every quick in-store entry.

**Clearing every pressing field on an existing record detaches, never deletes.** Set `pressing_id` to null and leave the row alone. Pressings are shared (§4), so deleting one could silently alter another record — the pressing-is-not-an-album hazard in reverse. An orphaned pressing is visible and harmless; a deleted shared one is neither.

**A corrected pressing is a different pressing.** The form carries `discogsReleaseId` from the prefill so the ownership check in §7.7 can reach tier 1 — but it is sent **only if the identifying fields still match what Discogs supplied**. If the user has edited the catalog number, country or year pressed, the id is dropped and a new pressing row is created from their values.

The reason is that `discogs_release_id` is unique (§4.2) and pressings are shared (§4), so the row carrying a release id is *the* row for that release. Letting user edits win on it would write one person's correction onto every record that matches the same release — §7.8's rule broken in the direction hardest to notice. And a pressing whose printed details contradict Discogs' record of a release is not that release: it may be one Discogs has merged, split, or got wrong, all of which §6 says happen. Tier 2 is then honest rather than degraded — "you own a different pressing" is exactly true.

**Editing `matrix_runout` does not drop the id.** Discogs' runout list is incomplete by construction — it records only the variants contributors have submitted — so a runout it doesn't list is not a contradiction of identity, it is information Discogs lacks. Treating it as identity-contradicting would also punish the careful: the field the app most encourages users to fill in would cost them tier 1 every time. Non-identifying fields — weight, colour, pressing plant — likewise keep the id.

**`matrix_runout` is user-authoritative** (§4, CLAUDE.md §8). It is read off the dead wax by hand and is frequently absent or wrong in Discogs. Nothing may overwrite a user-entered value — not a re-import, not a re-sync, not a later edit that leaves the field untouched.

---

## 10a. Market data

> **A relayed claim's settler travels with the claim — and its age is a second axis (A63a, 2026-09-09).** `market_cache.fetched_at` is stored, read by the route to test the TTL, then discarded before the payload reaches the screen. The TTL is seven days, so *"63 for sale, cheapest asking $6.76"* can be a week old and renders identically to a figure fetched this second. **Perishability is a second axis, not a property of the settler**, which is why this differs from §7's *"a relayed claim's settler travels with the claim"*: that rule is about *who* settled a claim, and this is about *when* — a figure can have an impeccable source and still be stale. The general rule is that one, in §7; this section owns the age half.

**The question this answers is "is this a fair price?", asked in a shop, on a phone.** It is not a feature about the user's own records — it is about *releases*, and the same data answers three different questions depending on where the user is standing.

### Where it comes from

Four layers, each answering a different part of "should I buy this?". They are independent — later layers degrade to absence, never to a guess.

**1. Scarcity and floor.** `num_for_sale` and `lowest_price`, already on the cached release payload. How many copies exist for sale and what the cheapest is asking. Free, no extra call.

**2. Condition range.** `marketplace/price_suggestions/:id` returns a suggested price per condition grade — VG, VG+, NM and so on. **This endpoint requires completed Discogs seller settings on the token's account** and returns `404 You must fill out your seller settings first` otherwise, which was measured rather than assumed. If it 404s, the app shows layer 1 alone and says the range is unavailable; it never interpolates one.

  Note that per-listing marketplace data — who is selling what at which condition — is *not* available through the API at all. Discogs closed that endpoint and their own staff have said it was never public. Scraping the marketplace HTML is out (their terms, and it would break), and a paid third-party service is out for a personal app. `price_suggestions` is the only legitimate route to condition-level pricing.

**3. Does pressing matter here?** Computed, not fetched: the spread of `lowest_price` across a master's versions. Versions spanning £8 to £400 mean the pressing matters more than the price; everything between £10 and £25 means it barely does. This is the judgement a collector actually needs and no single release can supply it.

  It costs one call per version, so it is fetched **on demand only** — when the user opens a master's version table — and cached with the same 7-day rule. Never eagerly, never for a whole search page.

**A partial sample can still be decisive, in one direction only.** A price range only grows as more versions are checked, so a sample already spanning a wide ratio cannot become narrow — the verdict "pressing matters here" is safe on partial evidence and must be given. The opposite is not: a narrow sample says nothing, because an unchecked version could be the £400 one.

So on a partial fetch, say "pressing matters" when the ratio is already wide, and say only that the check is incomplete when it is not. Withholding both is what the naive rule does, and combined with a cap on versions priced it silences layer 3 on exactly the masters with the most versions — which are the popular records where pressing choice matters most. A verdict that only fires on small masters is a verdict that never fires when it counts.

**4. Why it matters.** An LLM call, on demand, answering what the numbers cannot: *which* pressing to hunt and what to check. "The 1982 UK Clay first press is the one — the 1989 repress carries the same catalogue number but was cut from a copy tape, and the runout tells them apart." Rate-limited and user-initiated per §9.2, never on page load.

  This layer is opinion and must be labelled as such. It may not state a price, and it may never contradict layers 1–3, which are measurements.

### Where it is cached

**A separate table, `market_cache` — not `discogs_cache`.** That table is keyed by `discogs_release_id` and holds release *detail* payloads, which the §5.7 import path reads to build records. Storing marketplace figures under the same key would corrupt what the importer reads.

| Column | Type |
|---|---|
| discogs_release_id | INTEGER NOT NULL UNIQUE |
| payload | JSONB NOT NULL — the normalized layers 1–2 for that release |
| fetched_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Same 7-day freshness rule as §6, and the same stale-read behaviour: a stale entry reads as a miss but is left in place, so a Discogs outage serves week-old figures rather than nothing.

**This is what makes layer 3 affordable.** The spread costs one call per version — eleven for a single master, a fifth of the per-minute budget — and without a cache every expand pays it again. With one, a second expand of the same master is free, and versions already seen through search or a previous expand are free the first time.

Market figures go stale faster than release details do, which is the argument for a shorter TTL later. Seven days is the starting point because it matches §6 and because a week-old floor price still answers "is this shop above or below the market" — the question the feature exists for.

### Where it appears

| Screen | The question | What it shows |
|---|---|---|
| `/lookup` result rows | Is the copy in front of me fairly priced? | Layers 1–2, **on demand per result** |
| `/lookup` version table | Which pressing should I be looking for? | Layers 1–3, plus the spread across versions |
| Want list | Is my ceiling realistic, and has the market moved? | Layers 1–2, beside `max_price` — never merged with it |
| Record detail | Has this appreciated since I bought it? | Layers 1–2, beside `purchase_price` |

**Layers 1–2 are fetched on demand, per release, never for a page of results.** Each is one API call, so a fifty-result search would cost up to a hundred against a sixty-per-minute budget. Every result carries a control that fetches that release's market data when asked — the same on-demand principle layer 3 follows, and the same shape as the real scenario: someone holding one record, not comparing fifty.

**Exception: a single result resolves automatically.** Arriving at `/lookup` by catalog number or barcode usually returns one release, and that is the shop case — requiring a click to answer the question the search just asked is friction for nothing. One result, one fetch. Two or more, each waits to be asked.

Layer 4 is offered as an action on the version table and the want list, never rendered automatically.

### What it replaces

Manual price entry on a record the user owns. Neither real use case needs it: the shop question is about a release they do not own, and the appreciation question is answered by refreshed market data rather than by the user noticing prices and typing them in. `price_history` remains as the store for observations the cron writes (§5.7), append-only per §7.5.

---

## 10b. The shelf

> **The spine's derived colour is not an identifying channel, and the absence clause below is RETIRED (A62, 2026-09-09).**
>
> **The clause reads that a record with no cover gets a plain spine, "an honest absence, not a gap in the wall". The honest half is refuted.** Measured on the stored `averageColour` values: **`MGMT` 1.088, `Discharge` 1.134 and `Jeff Beck` 1.374 against the `#3a3a3a` fallback** — three records that *have* covers rendering as if they had none. So a plain spine does not read as an absence; it reads as one of several possibilities, and the reader cannot tell which. **An absence that is indistinguishable from a present value is ambiguous, not honest.**
>
> **The wider finding, which is why the clause cannot simply be reworded: the spine's derived colour is not an identifying channel, and the surface has none.** Pairwise contrast across the sixteen stored values: median **1.623**, twelve of 120 pairs under 1.1, twenty-two under 1.2, six of sixteen under 10% saturation (`Death Grips` at 0.5%, so its hue is not weak evidence but none), with hue spread across a wheel that cannot be read at 17px. The two closest pairs name the failure: `Darkside · Psychic` against `Simon & Garfunkel · Bridge Over Troubled Water` at **1.016**, a mauve-grey and a green-grey at matched lightness; `Luther Vandross` against `The Doors` at **1.022**, a warm brown and a slate blue, genuinely different hues and identical to any channel that measures lightness.
>
> Worse than the fallback collision: **`MGMT` measures 1.016 against `SHELF_PLANE`**, so a record and the board it stands on are the same lightness, and no ground decision repairs it because the colour belongs to the record.
>
> **So the shelf identifies by position and pull, not by naming, and the spine's job is presence.** That is what the physical shelf does. All ratios above are computed on stored albedo, not rendered pixels: a lit spine at roughness 0.7 facing away from the key renders *lower* separation than these figures, so these are the optimistic numbers. **Measured 2026-09-04 and re-read at placement: the record count did not move** — still 17, still sixteen covers and one without, the same sixteen values — so these ratios go in as measured rather than dated-and-superseded. **They are evidence for the rule, not an inventory of the collection** — they are properties of sixteen particular covers, and a seventeenth cover changes the set without changing the finding.

**The collection rendered as a shelf of sleeves, browsed by eye rather than read as a table.** You know your records by their spines and covers; a table row is an index of them. This is the default view of `/`, at every width. Only the view *control* is hidden on narrow screens, so nothing becomes unreachable and a `?view=grid` link shared from a desktop still opens as a grid.

Whether a phone should default to the shelf at all is genuinely open and belongs to step 15's mobile pass, which is the first time the wall will be judged at 390px. If it is gated by width then, the gate goes on the default and not on availability: a view a URL can reach must stay reachable.

Inspired by thecriterioncloset.com, and worth being explicit about what is borrowed: a wall of spines that owns the window, a crosshair that names what you are aimed at, a case that comes off the shelf and can be turned, and — the part that took longest to see — **an object that carries nothing but artwork, with every fact in panels beside it.**

**What is deliberately not borrowed is the room.** The reference's closet is a camera in 3D space with shelves receding at an angle; this wall is viewed square on, because §10b requires artist, title and catalogue number legible on every spine and a raking angle foreshortens the ones toward the edges. A room is something you stand in; a wall is something you read. The reasoning is in full below, and it is what makes the wall CSS and the pulled record the only 3D in this feature.

The 3D engine is borrowed for the record and deliberately not for the wall. The wall is flat, so CSS is right for it; the record is a printed object you turn under light, and it is not.

One thing the reference settles that this spec previously got wrong: **its case does not flip.** It turns perhaps 15–20° off face-on, enough to show the case has thickness, never enough to reveal a back. Its own copy reads *"Move the mouse to turn it · click to put it back."* Turning the record over to read its back is this app's own design, not something taken from the reference, and the two motions are separate here for that reason.

### The shelf

- **The shelf is a view that owns the screen, not a section of a page.** Below the nav there is the wall and nothing else. Search and the filter chips are reachable from it — as an overlay, opened when wanted — but they do not sit above the wall taking vertical space from it, because a wall that arrives under four rows of controls is a strip rather than a wall.

  This is the one structural thing borrowed wholesale from the reference: its closet is the window, with a compact floating search control and a view toggle over the top of it. `?view=table` and `?view=grid` keep their filters on the page, unchanged — a list genuinely wants its controls visible, and this rule is about the wall.

- **The wall is viewed square on and scrolls vertically.** Every spine is at the same angle and equally legible; there is no camera, no perspective on the wall itself, and no horizontal pan. Rows wrap and the wall grows downward, as a bookcase does.

  **This is where the reference is deliberately not followed.** Criterion's closet is a *room* — a camera in 3D space, shelves receding at an angle, and looking around means moving the camera. It is beautiful and it costs legibility: spines toward the edges are foreshortened and hard to read. This wall exists to be scanned by eye, and §10b requires artist, title and catalogue number on every spine, so a raking angle would defeat the feature that makes the wall useful. A room is something you stand in; a wall is something you read.

  The consequence worth stating, because it governs the pulled record too: the wall stays flat, so the only 3D in this feature is the record you pull out of it.

- **Records stand as spines on shelves that wrap.** One shelf holds as many spines as fit; the rest continue on a shelf below, and the wall scrolls. Ordered by genre so related records stand together — all the punk adjacent, all the rock adjacent. That ordering is the shelf's own, not a proposal for the physical one.

  **A record occupies one position, so exactly one genre wins.** A record carrying several genres appears once, filed under the top-level ancestor of the genre with the most of that record's owned siblings, ties broken by genre name. This is the rule §8.1's graph used to colour an artist, kept deliberately identical: two views grouping one collection by different genre logic would disagree about what belongs together, and the disagreement would read as a bug in whichever the user checked second. Records with no genre file last, under no heading, as themselves.

  **The order is deterministic.** The same collection always produces the same wall — every tie broken explicitly, down to the record id. Inherited from §8.2, which stated it about a physical filing order and was right about the problem rather than the algorithm: a wall you scan by eye cannot move between loads, or you re-scan it every time.

- **The shelf is a plane, not a box, and it has no minimum width.** The surface runs edge to edge and ends where the wall ends. A real shelf with five records on it is still a shelf with space beside them — and the space beside them is *wall*, not empty shelf, which is why it implies nothing about records that are not there.

  **A24c left the minimum unstated pending a re-derivation. The re-derivation closed the clause rather than filling it in.** Rendered at five records against a viewport-owning wall, every candidate width failed the same way: 151px read as a tile, 499px as a partly-drawn box, 874px the same but wider, 1248px of black timber as *missing data*. They were one object at four widths, and the object was the defect — a rectangle that stops has a size, and a reader interprets the size. A plane does not, so there is nothing to set.

  What the old rule protected survives: a short collection must read as short rather than broken. That is now a property of the plane being the same width whatever stands on it, rather than of a floor holding a box open.

  **The empty portion is wall.** Judged by rendering four treatments of that space — black fill, edge-only, dim wall, and a wall block behind the records — and looking. Black fill is the *missing data* failure. Edge-only reads as a line ruled across a page rather than as a surface. A block behind the records floats over its own shelf edge, replacing one boundary with two. A dim wall carrying the shelf edge along its foot is the one that reads as furniture.

  **The wall and the plane are different surfaces, and the difference is in the paint.** "Dim wall with the shelf edge along its foot" was first implemented as ONE colour with an edge gradient repeating down it, which satisfied the words and not the intent: an empty stretch of a single dark rectangle reads as a void whatever the comment above it says. Three surfaces, in a fixed lighting order — the plane lighter than the wall because a room lit from the front puts light on a horizontal surface, and the plane's front lip darker than the plane because it faces the viewer rather than the light. Reversing either pair reads as a shadow box rather than as a shelf, so the ordering is the rule and the hex values are not.

  **The wall has a height of its own, set by the viewport.** A24a said "below the nav there is the wall and nothing else" and it had never been implemented: the wall stayed exactly as tall as its own contents, so at five records it was a 268px band floating in a 900px page. That is what defeated three rounds of treatments of the empty space — a container sized by its contents has no empty space to treat, and every candidate was painting a box whose shape was the defect. Five records and five hundred now get the same wall; the difference between them is how much of it is occupied, which is the point of a wall scanned by eye.

  **One mechanism draws the shelf.** Two — a repeating background for wrapped rows, an element for the last — cannot be made to agree, because a repeat cannot know where the last row ends and an element cannot know where the browser wrapped. Eight attempts produced a doubled shelf line every time. The repeat draws all of them, anchored to the BOTTOM: spines are bottom-aligned, so rows are anchored to their feet, and a top-anchored pattern lands `padding-top` above every one of them.

  **The wall carries light, not just a colour.** A flat field of the wall colour is 240px of featureless black at five records, and the eye reads *nothing there* rather than *wall*. Light rising from the shelf line and the top falling away is what makes it recede instead of end. These are the only soft edges in the surface, and they are soft because light is — every hard boundary tried in this space turned the wall back into a box.

- **Spines are proportioned like records, not like DVD cases** — narrow enough to read as a record, wide enough to name it. Roughly 1:12. Getting this wrong in one direction makes the wall a shelf of box sets; in the other it makes it a wall of colour bars that must be hovered one at a time to find anything.

  An earlier version of this said 1:40, which was arithmetic about sleeve thickness rather than a rule about reading. It loses to legibility: at any workable height a 1:40 spine is around 4px wide, which cannot hold a glyph, so the spine text this section requires becomes impossible. The reference carries a title and a catalogue number on every spine, and that is what makes a wall scannable rather than decorative. The instinct was right and the number was wrong.

  **No section headings, and no shelf band per genre.** Adjacency does the grouping, as it does on a real shelf and in the reference this borrows from, which shows 1,300 spines with no headings at all. Sections were tried and removed: a collection with six flat genres for five records produced five near-empty black bands stacked down the page, and it read as broken rather than as short. Signposting a wall is a problem that arrives with scale, and the decision belongs to whoever is looking at three hundred records.
**The wall is as tall as its contents — one shelf per row the records fill, growing with the collection.** *(Amended: a four-shelf minimum stood here — "a room has a size", so a filtered result kept the room's height with empty shelf below it saying "these are the ones that matched". Removed after judging it on both screens with real data: at 390px the empty rows stretched the canvas and pushed records to odd positions, and at 1280 they were two empty shelves saying in furniture what a count says in words. The signal moved to the heading — see A24d.)*

Spine height stays at the value chosen by looking — the wall does not shrink a spine to fit the window, any more than a bookcase does. A large collection's wall exceeds a laptop viewport once the nav and controls are accounted for, and that is correct: you scroll. A small collection is a short wall, honestly.

The last row is usually partial — the records pack from the left and stop where they run out — and its shelf still runs edge to edge: the surface ends where the wall ends, not where the records do. That partial row's empty stretch is SHELF, not void: same plane, lip and wall-behind treatment as an occupied stretch.

**A24d — a filtered wall keeps its shape, and the COUNT is what keeps it honest.** *(Amended.)* The original rule asked for gaps — each record staying where it was, with holes where the others had been — because a wall of five spines packed at the left is indistinguishable from a collection of five records. That honesty is what mattered, and holding positions for unrendered records is a hard mechanism with many ways to be subtly wrong. The four-shelf room was the first simplification of it; the count is the second and better one. **The collection heading states "N of M records" whenever a filter is active** — 43 of 125 — so the wall is free to be exactly the size of what matched. The numeric answer that the empty shelves used to imply in furniture is now said plainly in words, in the one place that always knows both numbers.

This is the absent-versus-unknown distinction (§10a, and the rule this project keeps meeting) applied to a layout: the count is the feedback. The filter chips carry the per-facet counts and `?view=table` shares the same URL state, so the answer is consistent across views.

- **A spine's colour is the average colour of its cover**, computed once when the cover is attached and stored in `records.spine_colour` (§4.2). The average is taken in linear light and weighted by alpha, not by the most populous colour bucket — measured against real sleeves, a dominant-bucket rule gives a warm brown portrait a near-black spine, which is a wrong answer rather than a different one. Saturation is never boosted: a spine is a claim about a cover, and a shelf prettier than the sleeves on it is inventing colour the record does not have. ~~A record with no cover gets a plain spine — an honest absence, not a gap in the wall.~~ **RETIRED (A62, 2026-09-09)** — a plain spine is not distinguishable from three records that have covers; see the blockquote at the head of this section.
- **Spine text is artist, title and catalogue number**, set in mono, rotated. The catalogue number is the collector's identifier and earns its space.

  **The derived budget was never satisfiable at the real font metrics (A62a, 2026-09-09).** SPEC.md never declares a character count; §11's unit-test bullet says the budget *derives from spine height*, and the derived value is `floor(240 / 5.4)` computed at runtime. There is no rule to retire — the finding is about what the derivation yields once the real metrics are used. **Geist Mono advances 0.6em per character, so the divisor is a function of the type size and the derivation understates it.** At the 9px legibility floor a 150px spine holds **25 characters** set upright and **22** on an isometric face, against **49** for `artist · title` on `Discharge · Hear Nothing Say Nothing See Nothing`. So the budget the code derives is not a truncation allowance but a different budget from the one this sentence assumes, and a spine label cannot carry identity at any size the shelf offers (specimens). **The sentence above defends the component that truncation removes first:** the catalogue number "earns its space" and is the last thing standing in the degenerate case, while the title — which this sentence also promises — is the first to go and is gone at every real spine length measured.
- **Hover names the record** — artist, title, year, label — in a floating label, with the aimed-at spine marked. Aim, then click.
- **Sparse is fine.** Six records is a short shelf, and the view does not pad, fake, or hide itself until the collection is large enough to flatter it. A view that implied more structure than the data has would be the confidently-misleading shape CLAUDE.md §8 forbids — and the failure runs the other way too: a shelf whose emptiness implies a collection that should have filled it reads as *missing data* rather than as a small collection. The minimum length exists to sit between those, which is why it is a measurement rather than a fraction of whatever the shelf happens to be inside.

**The wall is CSS, and that is now a design decision rather than a cost decision.** The original reasoning was that transforms and shadows get most of the feel for a fraction of the work. The better reasoning arrived from A24b: the wall is viewed square on, so there is no perspective to render and nothing for a 3D engine to do. Criterion's wall is `three.js` because it is a room; this is a flat wall, and CSS is what a flat wall is made of.

The pulled record is the exception and is rendered in `three.js` (below).

### Pulling a record

**The record rises out of its slot.** It was on the shelf a moment ago and now it is in your hands — that continuity is the feature. A record that fades in centred is a modal wearing a sleeve, and the difference is felt immediately.

**Rendered in 3D (`three.js`), unlike the shelf — decided by building the flat version and looking at it.** This decision has been made three times and the record of it is worth keeping, because each turn rested on different evidence.

It was first specified as `three.js` on the strength of two failed CSS flip attempts. That inference was wrong: those failures were a *discrete face swap* fighting an animation — a flag saying which face was showing, and a midpoint React and the compositor disagreed about — and they said nothing about the medium. Splitting the motion into a pointer-driven tilt and a deliberate click removed the state that failed, and the CSS version that followed wanted no flag, no coordinator, and no shared duration. On that evidence the decision was reversed to CSS.

**Then it was looked at, and the motion turned out not to be the problem.** The record read as a skewed panel: metadata crammed into the top third of an otherwise empty back face, a flat-lit surface with no detail for the rotation to act on, and controls floating beside the object rather than belonging to it. Every motion was correct and the object was not convincing.

What resolves it is the allocation, not the renderer alone: **the object carries only artwork, and every fact moves to a panel beside it.** That removes what made the back read as a form, gives the tilt a printed surface to act on, and makes real lighting worth having — a face that shades as it turns, an edge that catches, a shadow cast back onto the wall. Those respond to angle, and CSS cannot do them at any level of care.

**The known cost.** The record rises out of a spine that is a flex child in a wrapping CSS row, so the renderer must map a DOM rect into world coordinates and keep that mapping correct across scroll, resize and re-wrap. That is a number two systems share, and it is the hardest part of this work rather than an incidental detail.

**Two motions, deliberately separate: a tilt you drive, and a turn you ask for.**

**The tilt is continuous, pointer-driven and limited.** On desktop the record follows the pointer as the reference does — around 15–20°, enough to show it is an object with thickness and to catch the light across its face, never enough to reveal the back. The mapping is absolute: the same pointer position always gives the same angle, so moving away and back returns the record to where it was. On touch it is dragged. It **holds its last angle** when the pointer leaves rather than springing back, because a record you have turned stays turned — and because a still record then costs nothing at all.

**The turn to the back face is a deliberate click**, not something the pointer can reach. Rotation of a two-sided object rather than a swap of one face's contents, so no state says which side is showing. Both faces exist throughout.

The reason for the split is that they answer different questions. The tilt says *this is an object*; the turn says *show me the other side*. Collapsing them means the back arrives by accident while someone is looking at the front.

**The turn is a button on touch, not a swipe, and that is a decision (A34).** A swipe-to-flip is declined for two reasons. A flick and a drag differ only in speed and distance — a threshold nobody can derive, and one that behaves differently for different hands, the same shape as the `WIDE_RATIO` minimum this section rejected. And horizontal swipe belongs to *moving between records* (13b): it is the gesture every gallery has taught, so spending it on the flip would force a second, invented gesture for the more important navigation. "Turn over" is a button; it is unambiguous and it works. **Trigger to revisit: R8, or the first real one-handed use in a shop** — if the button proves awkward to reach with a thumb while holding a record, the swipe earns reconsidering, and the cost is then whatever gesture 13b did not take.

**The object takes four textures, all square.** `cover` on the front, `back` on the back, and `gatefold_left` and `gatefold_right` across the two leaves of the open sleeve. Nothing else is mapped onto it.

Square because a 12″ sleeve is square. **The stored images frequently are not**, and that is measured rather than assumed: Discogs serves whatever a contributor uploaded, and the first cover checked was 591×599.

**A non-square image is cropped to square from its centre when it is mapped onto the object**, matching what the wall already does with `object-cover`. The alternative — fitting the whole image and letterboxing the remainder — puts a border on a record that has none, which is the app asserting something false about a physical object; and filling that border with the spine colour, considered and rejected, invents a sleeve edge that was never photographed.

Cropping loses artwork at the edges. That is a real cost and it is the right one: a sleeve photographed slightly off-square loses a few pixels of its own border, where a letterboxed one gains a band that belongs to no record.

**The crop happens at mapping time, not on the stored file.** The image in the gallery is the whole photograph, unmodified — it is the user's data (§7.8) and the object's needs are not a reason to alter it. In practice that means adjusting the texture's UV mapping rather than re-processing bytes.

The inner is **two photographs, not one spread.** A real gatefold inner is continuous, and mapping one wide image across both leaves would be more faithful — but it asks for a photograph most phones take badly, and it makes the inner the only non-square image in the collection. Two straight-on shots are what someone can actually take. The cost is a seam down the middle wherever the two differ in lighting or crop, and that is accepted: a visible seam is honest about being two photographs.

**AMENDED 2026-09-03 by 14a's measurement — the two photographs are the user's OWN, essentially always.** This clause was written expecting Discogs to supply inner artwork with a wide scan as the awkward exception. The measurement found the reverse: on four of four verified gatefolds Discogs carries exactly one image at roughly 2:1 and nothing else non-square, so **the wide spread is Discogs' convention, not an edge case**, and it cannot fill two square slots. Combined with 14a's Q1 — no `images[].type` value distinguishes a leaf from a back cover — the consequence for this section is direct:

**A four-face record is something the user photographs into existence. An import does not produce one.** The hinge opens onto two photographs taken by hand, in one sitting, of one physical sleeve — which is why the seam this clause already accepts is the NORMAL case rather than the degraded one. Two shots from the same sitting under the same light are the best case available, not a fallback from a better one.

This matters beyond the importer, and it is why the measurement runs before the design pass (§12): designing the inner as though stock artwork will usually fill it would design for a state the data cannot reach. The gatefold is rare, hand-made, and the user's own — the pass should treat it that way.

**A gatefold opens as a real hinge** — two **leaves** rotating about their shared edge, inner artwork mapped across both. Front → turn → back is rotation; front → open → inner spread is a hinge. Two physical acts, two motions, and sharing one would flatten the distinction.

The halves are called *leaves* throughout, deliberately: a *panel* in this section is the DOM block of facts beside the record, and the two must not be confused. One is a surface of the object; the other is the place text lives precisely because it is not on the object.

**The state exists only where both leaves have been photographed.** One is not enough: a hinge that opens onto artwork on one side and a blank on the other invents exactly the thing the user came to see, and it does it in the most conspicuous place possible. §10b's strictest rule is that no affordance appears without a photograph behind it, and a half-filled gatefold is that rule failing through a partial state rather than an empty one.

So the affordance is present when `gatefold_left` and `gatefold_right` both exist, and absent otherwise. A single inner photograph is still stored and still appears in the gallery — it is a real photograph of a real record — it simply does not open the sleeve. A record with no inner images has two faces, and nothing suggests otherwise.

There is no generated stand-in of any kind. The point of a gatefold is the artwork inside it.

That means the affordance is driven by §4.2's `image_type` values rather than by a flag: `gatefold_left` and `gatefold_right` are two of the seven that enum defines, and the hinge appears exactly when both are present. §4.2 is the authority on the full list — restating a subset of it here is how the two drift, and an earlier version of this sentence did precisely that, naming a `gatefold` type that no longer exists.

**Arrows move through the collection without putting the record back.** Browsing a shelf is continuous; being returned to the wall between every record is not. The next record rises as the current one returns.

**The faces carry artwork and nothing else.** Where a `back` photograph exists it is used. Where one does not — which is most records, since Discogs supplies a front cover and nothing more — the back is **a plain sleeve in the record's stored spine colour**, carrying label and catalogue number as a small imprint and nothing further.

The front is the `cover` image. A record with no cover gets a plain sleeve there too, in the same colour, by the same reasoning that gives it a plain spine on the wall: an honest absence rather than a placeholder. Both cases are ordinary and neither is an error state.

That is honest in the way the plain spine is honest: it does not invent a back that was never photographed, it reuses a colour already computed from the record's own cover, and a plain back is a real thing rather than a placeholder. Repeating the front would assert something false, and a stock sleeve texture would be a photograph of someone else's record.

An earlier version of this section had the back rendering pressing details, condition and purchase information as body text. Built and looked at, that read as a form rather than a sleeve — metadata in the top third of a large empty field. Those facts have not been dropped; they have moved to the panel below, which is where the reference puts them and where they can actually be read.

**The record's presentation depends on the width available, because a panel beside the record and a record that fills the screen want different amounts of room (A32).** Above a measured threshold the facts sit in fixed panels *beside* the record — the layout the rest of this section describes. Below it, there is no room for a panel at a readable size without shrinking the record to a stamp, so the record fills the frame and the facts move to a **summary card overlaid on its lower portion (A33)**: artist, title, release year, over the artwork rather than a block beneath it, the record reading through behind — as the reference does, so you stay in the room.

**The threshold is a measurement, not a screen-size label (A32).** The question is not "phone or desktop" but "is there room for a panel beside a record that still reads as an object". §10b flanks the record with two panels — facts on one side (≈210px), the controls on the other (≈180px) — and a record reads as an object down to roughly its phone size (≈320px). With gaps and page margins that flanking layout needs about **820px** of width; below it the record would be crushed between the panels. That figure sits between Tailwind's `md` (768px) and `lg` (1024px) and coincides with neither, so it is used as the measured value it is rather than rounded to a breakpoint that means something else.

**Collapsed, the overlay is a different shape from the flanking panel; expanded, they converge.** Collapsed it carries three facts — artist, title, release year — over the artwork, because a full fact list dumped over a full-bleed record on a phone is the "form" failure this section already rejected for the back face. Expanded (A33), it adds the synopsis and the fact list, scrolling within itself so the record stays whole behind it. The flanking panel is the expanded shape at rest — it has the room to show everything without a control — which is why expanding is one behaviour across widths rather than a second fork on top of A32's: A32 forked on *room*, and there is no room argument for making the wide panel static while the narrow one expands.

**The panel expands in place; it does not navigate (A33).** Both shapes carry a control that *expands the panel over the record* — the synopsis unfolds and scrolls inside it, the record staying behind, as the reference does — rather than leaving the shelf. **A33 supersedes A32's decision that the control navigated to `/records/:id`**, taken hours earlier in this same unit: A32 sent the tap to the detail page, and looking at the reference showed the panel should open in the room instead. The detail page is still reached — by a link *inside* the expanded panel — for what the panel does not hold: the journal, prices, images and editing. So `/records/:id` remains the one destination §10b's keyboard-reachable list also links to, but it is a link within the panel, not the panel's whole behaviour.

**The expanded panel keeps generated and entered facts distinguishable (A33).** The synopsis is the record's `snippet` (§10b), which is generated, followed by the entered and imported facts. These must not merge into one undifferentiated block, or the panel becomes the app asserting things about music without saying which part it made up — the exact failure §10b's snippet rule and 13c's typed label (text paired with its `generated` flag, never a bare string) were built to prevent. The snippet keeps its "generated" label inside the expanded panel, and a boundary separates it from the entered facts below.

**The facts live in fixed panels beside the record, where there is room for them.** Artist, title, year, label, catalogue number, pressing details, condition, and purchase information — laid out beside the object, static while it turns, as the reference does. They do not track the record's geometry and never need to agree with it about anything. Below the A32 threshold they move to the summary overlay (A33); everything else in this section — the faces, the turn, the tilt, the hinge, reduced motion — is the same at every width.

This is what makes the object worth rendering: with the copy off it, the faces are printed artwork and the rotation has something to be a rotation *of*.

**The panels are DOM, not canvas.** A canvas has no text, so the panel is the only channel a screen reader or a test can read — and this is the same distinction the spine already draws, where the visible glyphs are clipped to fit and the accessible name carries the whole title. Facts that matter belong where they can be read by something other than an eye.

The controls belong with the record rather than floating beside it. A control row that does not participate in the object's arrival undercuts the continuity the rise exists to establish.

**Reduced motion disables all of it.** The rise, the tilt, the turn and the hinge are decorative; the record, its faces and the panel beside it are not. A reader who has asked for less motion still gets the record, still turns it over, and still reads every fact — the object simply does not travel or follow the pointer to get there.

### The snippet

**A short generated note about the album, stored on the record.** Two or three sentences — what it is, when it landed, why it matters. It sits in the panel beside the record, with the other facts, for the same reason they do: the faces carry artwork only.

Generated by an LLM on demand, written once and stored rather than fetched per view. It is the app asserting things about music, so:

- **It is labelled as generated**, in the same register as "Discogs estimates" — never presented as fact the app established.
- **It never contradicts entered data.** It does not state a pressing, a year, or a price; those are on the record.
- **It is editable and deletable.** A snippet the user has corrected is theirs, and a regeneration must not overwrite it silently (§7.8).
- **Absence is fine.** A record with no snippet shows none, and no placeholder invites one.

**Regenerating an edited snippet is OFFERED, not hidden, and it names what will be lost** (A31a). Once `snippet_edited_at` is set the text is the user's, so a regeneration must never proceed on its own — but it is offered, behind a confirmation saying the edited text will be replaced and cannot be recovered. The same shape §7.3 requires for deleting an acquired want-list row: "a confirmation naming what is lost, not a bare delete button."

**The reasoning is §7.8's actual scope.** §7.8 forbids overwriting user-entered data *with external data* — the Discogs re-sync case, where the app acts unasked and the user finds out afterwards. It governs what the app does on its own initiative, not what its owner may deliberately choose. §7.3 already draws that line for a structurally identical case: "The rule is about *implicit* loss… An **explicit** user delete of an acquired item is permitted. Mistakes happen, this is a personal tool." A snippet the user edited and now wants regenerated is the same situation — they typed it, they can see it, and they are asking. Hiding the control would treat the owner of the text as the threat the rule protects against.

**Confirmation only where there is something to lose.** With `snippet_edited_at` null the stored text is as generated, and regeneration replaces it without asking: no user work is at stake, and confirming every regeneration would train the user to dismiss the one that matters.

**The confirmation names the text, not the rule** — "Replace the snippet you edited? Your version will be lost", never "this record has snippet_edited_at set".

**Three clauses in this section are specified and not yet built**, each moved out of step 13 with a trigger rather than left open inside it: the gatefold hinge (§12, 13a), arrow navigation between records (13b), and the snippet (13c). Everything else described above is built and live at `/`.

The gatefold's four texture slots exist in the schema (§4.2) and are wired through the scene's surface-kind rule, so what is missing is the hinge geometry and a way to fill the slots — not the model.

### What this replaces

The shelf replaces §8.2's shelf ordering. That feature proposed a physical filing order derived from community detection over the graph, and it needed three things the collection does not have: enough records for clusters, a built-out genre hierarchy, and hand-entered influence edges. Its output for a real collection today is "punk things, rock things, two singletons" — which a genre sort gives for free, without a tuning knob no test can validate.

`/graph` is likewise retired as a screen. The tables behind it — `artist_memberships`, `artist_influences`, `record_genres` — are untouched, still written on every import, and feed §9's suggestions, which is what they were actually useful for. (`artist_genres` was drawn by the graph too and has never held a row; see §4.3.) Drawing them added a picture that told the user what they already knew.

Note that `has_genre` was **not** among the survivors, though an earlier version of this paragraph listed it. It was never a table: it was an artist-to-genre count derived inside `buildGraph` on every call, and it was deleted with it. §9.1 specifies the equivalent aggregate for the one consumer that still wants it.

---

## 11. Testing

### Unit (Vitest)
- Suggestion scoring function — every **scored** term independently, plus the want-list suppression case. The two link terms are tested separately, including a case where an artist is reached by shared membership alone and one where it is reached by an influence edge alone: a single fixture carrying both cannot tell a correct implementation from one that merged them.

  The genre and label terms are unbuilt (§9.1a) and have no tests. **Do not write tests asserting they return zero** — a test pinning an unsourced term to zero would pass for the wrong reason and would keep passing after a source arrived.
- **Shelf ordering determinism** — the same collection produces byte-identical order across repeated runs, including the tie-break chain (§10b).
- **Shelf genre attribution** — a record carrying several genres appears exactly once, under the correct top-level ancestor, with ties broken by name; a record with no genre files last.
- **Spine colour** — average-in-linear-light against known inputs, alpha weighting, and the null case (no cover, or a fully transparent image) returning absence rather than black.
- **Spine text fitting** — the character budget derives from spine height rather than being declared, the truncation gives way in the right order (title, then artist, never the catalogue number), and the degenerate case where artist plus catalogue number alone exceed the budget.
- Genre ancestor resolution (recursive CTE) — including deep nesting and cycle rejection.
- Discogs field mapping — a real-shaped payload in, our fields out.
- Estimated-value fallback chain.
- Rate limiter behavior.

### Integration (Vitest against a test database)
- Every endpoint in §5: happy path, validation failure, not-found, and auth-required.
- `POST /api/want-list/:id/acquire` transactional integrity — force a failure partway and assert nothing was written.
- `409` on deleting in-use reference rows.
- `price_history` CHECK constraint rejects rows with both or neither parent ID.

### Component (Vitest + `react-dom/server`) — A46

**Added 2026-08-28**, after the `.env.test` gate cost coverage on a fifth
feature. **The gate is correct and stays**: `ANTHROPIC_API_KEY` is deliberately
absent so `snippet.spec.ts` can assert the unconfigured state, which makes that
absence a fixture other specs depend on. A component test supplies `configured`
as a **prop**, so it reaches a gated feature without touching the fixture — the
fix rather than the workaround.

**Static rendering only. No new dependency**: `react-dom` is already a
production dependency, and neither `jsdom` nor `@testing-library/react` is
added. Interaction coverage is a separate decision needing its own
justification, not a convenience bought while building this.

**What this layer asserts:** the structure of a component's INITIAL render.

- element presence and nesting;
- DOM attributes, including `<details open>` — a closed disclosure is an
  attribute question, not a CSS one;
- the presence or absence of an element within a subtree (e.g. no action link
  inside a disclosure);
- text and `useState` initial state as rendered.

**What it CANNOT assert, stated so nothing is built on a false expectation:**

- **no interaction** — `renderToStaticMarkup` returns a string, not a tree.
  Clicking, scope switching, and `ask()` are unreachable;
- **no CSS.** Anything checked by class name asserts a class name, not an
  appearance;
- **no `useEffect`** or any post-mount behaviour.

**The consequence, and it is why this layer does not close every gap:** for the
five gated LLM features, initial-render structure is coverable and interaction
is not. The scope-switch clear-and-load stays uncovered by any layer, and that
is recorded rather than papered over.

### E2E (Playwright) — these flows must be covered
1. Log in with a wrong password, then the correct one.
2. Add a record manually, end to end, and see it in the collection list.
3. Use the structured lookup form (artist + catalog number), drill from a master into a specific version, verify cover art and pressing details render, import it, verify prefilled fields, save it.
4. Ownership badge tiers: look up a record owned in the exact pressing (expect "you own this pressing"); look up a different pressing of an owned album (expect "you own a different pressing", **not** the exact-match badge); look up a want-list item (expect the want-list badge).
5. Add a want-list item, then mark it acquired, and verify it appears in the collection and is flagged acquired in the want-list.
6. Load the collection at its default view, confirm the shelf renders spines for owned records, and click one — verify it leads to that record.
7. Pull a record out of the shelf and turn it, on a record with no photographed back: verify the turn shows the other side, that the back is a plain sleeve in the record's spine colour carrying label and catalogue number and no body text, that the pressing details appear in the panel beside the record rather than on the face, and that the gatefold affordance is **absent** on a record with no inner image.
8. Request relationship-based suggestions and add one to the want-list.
9. Upload an image to a record and verify it appears in the gallery.
10. Run the collection list and lookup flows at a mobile viewport (390×844) — search and filter must be usable one-handed.
11. Add the same album twice in two different pressings and verify both persist as separate records.

Mock the Discogs, MusicBrainz and Anthropic APIs in tests. Never hit live external APIs in CI. The no-live-call guard is host-agnostic by design and already covers all three; it keys off the database target rather than a flag, and R6 owns the case that breaks (a test run against a remote database).

---

## 12. Build order

1. Project scaffold, Tailwind, shadcn/ui, Drizzle config, Neon connection, env var validation at boot.
2. Full schema + migrations + enums + indexes. Verify migrations run clean on an empty DB.
3. Auth (password gate + middleware). E2E test #1 passing.
4. Reference CRUD (`artists`, `genres`, `labels`, `formats`, `stores`, `tags`) + `/manage` screen.
5. Records CRUD + collection list + record detail + add/edit form. E2E #2.
6. Want-list CRUD + acquire flow. E2E #5.
7. Discogs integration: rate limiter, cache, structured search, master version drill-down, release detail, import, and the `/lookup` screen incl. tiered ownership matching (§7.7). E2E #3, #4, #11.
8. Images upload. E2E #9.
9. Journal entries, price history, stats screen.
10. **Market data (§10a).** Discogs marketplace ranges on `/lookup`, the want list and record detail. No new dependency — the client, limiter and cache all exist — and it is the feature the app is carried into a shop for.
11. **MusicBrainz import: populate `artist_memberships`.** Band membership pulled automatically into its own table (§4.3) — *not* into `artist_influences`, since MusicBrainz has no influence relationship and inventing one would fabricate a strength nobody measured. Its own rate limiter and cache, roughly the shape of step 7's Discogs work, but stricter: **one request per second**, and a `User-Agent` carrying contact information, both required by MusicBrainz.

    **On demand, per artist, never a bulk crawl.** `member of band` links a person to a group, so building one band's full lineup graph means walking band → person → that person's other bands: roughly 32 sequential requests for an artist like Discharge, about 35 seconds at the permitted rate. That is acceptable when the user asks about one artist and unacceptable as a background job over a whole collection. Fetch when asked, cache, and show progress.
12. Graph endpoint + visualization. **Built and retired at step 13** — see §8. Kept in this list because the steps are numbered and referenced; the work happened, the screen no longer exists, and the data it read from is still populated by steps 10 and 11.
13. **The shelf (§10b).** The collection as a wall of sleeves, replacing the shelf-ordering feature and the graph screen. Delivered: the wall and the pulled record in one `three.js` scene, so a record leaves an emptied slot; hover, tilt, turn, the flanking panels, filtering, and a keyboard-reachable list of every record. Three §10b clauses are deliberately **not** in this step and are listed at 13a, 13b and 13c below.
14. Suggestions — relationship-based first (§9.1), then LLM-assisted (§9.2). E2E #8. **§9.2 and 13c are separate units sharing one module**, not one unit: see the deferral note below.
14a. **Measure Discogs' inner images. DONE 2026-09-03.** Discogs carries gatefold artwork on some releases, which makes 13a reachable — but three things were assumptions rather than facts and this project's record on assuming API shapes is poor (`format.text`, the versions payload, the master-year fallback each cost a round).

    Measured against the live API across **four verified gatefold releases** — 381756 (Discharge), 14451455 (Grateful Dead), 10155238 (Deep Purple), 6758287 (Cat Stevens) — captured by `scripts/capture-discogs-fixtures.mjs` and kept as `src/lib/discogs/gatefold-inner-images.test.ts`. The measurement is a TEST rather than a note, because its conclusions are what 14d and 13a get built on, and a note does not fail when someone builds an importer that assumes otherwise (CLAUDE.md §2).

    **Q1 — how the payload types an inner image: it does not.** `images[].type` is `primary`/`secondary` and nothing else. Every inner-sleeve photograph is `secondary`, the same value carried by the back cover, the labels and the dead-wax close-ups. There is no per-image field that separates them, which settles 14d's central rule below as measured fact rather than caution.

    **Q1a, unasked and found anyway — a gatefold need not carry a `primary` at all.** Release 14451455 has seven images and not one is `primary`. `attach-cover.ts:54` falls back to `images[0]`, so that fallback is doing real work on live releases rather than defending against a hypothetical: the cover attached for such a release is whichever image a contributor happened to upload first. Recorded here because it is a live-path finding outside 14a's scope; see NOTES.

    **Q2 — one wide spread, or two square leaves: a wide spread, on 4 of 4.** Each release carries exactly one image at roughly 2:1 (measured 2.083, 2.0, 1.852, 2.027) and every other image within 10% of square. A21b anticipated the wide scan as an edge case; the measurement makes it **the common case** — Discogs' convention for an open gatefold is one photograph of the spread, not two leaves. So the honest consequence stands and is the expected case rather than the exception: the app cannot fill two square slots from Discogs, and a user who wants the hinge photographs their own sleeve. **Four releases is a small sample and is stated as one** — it is enough to establish that the wide spread is Discogs' convention rather than one contributor's habit, which is what 14d needed to know, and not enough to put a percentage on it.

    **Q3 — what §6's mapping must gain: `width` and `height`, and only those.** Every candidate already reaches the importer with its URL and type (`normalize-release.ts:292`), so nothing new needs fetching. But the normalizer drops dimensions, and Q1 plus Q2 together mean **aspect ratio is the only signal that distinguishes a spread from a leaf**. Without it the assignment UI cannot warn that a wide scan will not fill a square slot, and A21b becomes unenforceable at the point of choice. The measurement test pins this omission deliberately and is expected to fail when 14d closes it.

    **A caveat the measurement produced about its own method:** `format_desc=Gatefold` is the search facet (`format=Gatefold` returns 200 with zero results — a wrong facet name fails as silence, not as an error), and the facet is unreliable: 22 of the first 24 candidates it returned were not gatefolds. Any future capture must verify the property per release rather than trust the query.

14b. **WITHDRAWN 2026-08-26 (A42) — "Compare pressings", scoped to the candidates on the page. Never built.**
    Specified 2025-08-25, superseded by 14c the following day, and closed here
    rather than left deferred.

    **What it would have been.** The expanded panel fetches a master's version
    list unfiltered — 25 rows of 637 for The Doors' debut, with the user's copy
    on page 7 — so 14b would have scoped that list to the other results from the
    same search, comparing them column by column at no additional API cost.

    **Why it is withdrawn, and the argument is 14b's own.** Its clause already
    drew the distinction that retires it: **the master version list answers
    "what pressings of this album exist" — a discography question. The candidate
    set answers "which of these is mine" — an identification question**, which
    is what §5.7 says the screen is for.

    **14c answered the identification question by a different route.** Fetching
    release detail for one candidate and displaying its identifiers, companies
    and notes lets the user's eye match against the record in hand — measured at
    93% on identifiers alone, 100% including notes — and it does that without
    the master call at all. **Verified in real use** (NOTES, 2026-08-26): a
    Terre Haute pressing identified against `EKS-75005-A-1 CTH` in the deadwax,
    corroborated by the rim text in its notes.

    **Adam, on a 17-record collection: "14c does the identification job and I
    have not missed the discography view."**

    **Closed rather than deferred, and that is the point.** This project's rule
    is that a deferral without a trigger is a decision never to act. 14b HAD a
    trigger — "may be built whenever a lookup unit is open" — and three lookup
    units have opened and closed since without it firing. **A deferral that
    survives its own trigger is a decision nobody made**, and leaving it in the
    build order would misrepresent a settled question as pending work.

    **If the discography view is ever wanted it returns as a NEW step with its
    own justification**, which is a better artefact than a stale one: the case
    would be made against the collection as it is then, not against a defect
    report from 2026-08-25 that a different feature has since answered.

    **What survives from it:** the identical-row collapse (§10) it relied on,
    which is built and unaffected; and the reasoning above, which is why this
    entry is a paragraph rather than a deletion.

14c. **Verification-by-display: identify a pressing by showing the evidence
    (§5.7).** Added 2026-08-25 out of the lookup QA. **This SUPERSEDES the
    two-phase stored-matrix design** that was previously deferred — see below
    for why, because the reasoning is the point.

    **The problem it solves.** Search payloads cannot distinguish pressings.
    Measured: the `formatText` qualifier names a plant on 24% of rows, and 0%
    on Discharge, 2% on Misfits — the genres this collection is made of. Cards
    that look identical are the §7.7 confusion arriving through the search
    screen.

    **The mechanism.** Release detail carries what search does not:
    `identifiers` (Matrix / Runout, Pressing Plant ID, Rights Society, Label
    Code), `companies` (Pressed By / Manufactured By) and free-text `notes`.
    Fetch detail for ONE candidate on demand and DISPLAY those fields. The
    user compares them against the record in their hands. **The app asserts
    nothing.**

    **MEASURED before specifying, on 15 collision groups across six albums,
    41 releases fetched:**

    | Result | Figure |
    |---|---|
    | groups fully distinguished by identifiers + companies | **93%** |
    | ...including notes | **100%** |
    | releases carrying a Matrix / Runout | **93%** |
    | calls to resolve one group | median 3, mean 2.7 |

    It resolves Discharge and Misfits, the two albums where search-level text
    was useless — which is what makes it worth building for this collection
    rather than for a generic one.

    **Why this supersedes rather than defers alongside the matrix design.** That
    design stored a user-entered matrix string and matched against it, and **the
    expensive half was matching messy transcriptions**: normalisation rules,
    fuzzy comparison, and an `unresolved` confidence enum to express how sure
    the match was. The real runouts are
    `BSK-1-3010 LW2 F12 (scratched out)-W-1 KP SUB #1 MASTERED BY CAPITOL`,
    `JW10 FS7• #2`, `△21970` — spacing, strikethroughs, unicode glyphs and
    per-contributor conventions. Machine-matching those is a research project;
    a person reading two strings side by side is instant. **This skips the
    problem rather than solving it**, which is why it is cheaper AND more
    honest: nothing is claimed, so nothing can be wrongly claimed.

    **Per-card expand, never automatic.** Automatic would pay the calls on
    every search, including the ones where the displayed columns already
    separate the candidates. An expand is also honest about what it is: the
    user is ASKING to compare rather than being told the answer — the same
    distinction §5.7 draws between showing what exists and identifying a copy.
    §10a's rule against eager fetching for a whole search page applies here
    unchanged.

    **Layout: identifiers and companies FIRST, notes below and labelled.**
    They are different kinds of thing. A runout is transcribed off the object
    and checkable against what the user is holding; `notes` is someone's
    description of the release, up to several hundred characters. Notes earn
    their place — they resolved the one group identifiers could not — but they
    read as CONTEXT, not as evidence, and are kept visually distinct the way
    §7.8 keeps a generated snippet distinct from the facts.

    **THE RULE THIS FEATURE LIVES OR DIES BY: runout strings render EXACTLY as
    Discogs holds them.** Spacing, strikethroughs, unicode glyphs, parenthetical
    transcription notes — all of it. The user's eye is the matcher, so any
    character the app trims, collapses or strips is discrimination thrown away,
    and thrown away SILENTLY, because a tidied runout still looks like a
    runout. **This inverts the normalizer's usual job**: every other Discogs
    string in this app goes through `meaningful()` and `bounded()`, and a
    runout must not. A generous `bounded()` cap is acceptable as a
    denial-of-service guard; `meaningful()`, trimming and whitespace collapsing
    are not. **A test pins this**, not a comment — a comment does not fail when
    someone adds a `.trim()` in good faith.

    **What it does NOT do.** It answers "which of these am I holding" at the
    moment of asking; it does not RECORD the answer. Storing identification
    evidence on a `records` row is a separate feature with a separate
    justification and must not be smuggled in here.

14d. **Gatefold slot assignment (the UI half of the original 14a).** **Trigger: after the design pass (14e below) — so this step is lettered before 14e and RUNS AFTER IT.** The letters here are feature identifiers, not a sequence, exactly as the 13a/13b/13c block already warns; execution order for this run of steps is 14a (done) → 14e → 14d (with 14f, or earlier if a cover looks wrong first) → 13a. The add-record form surfaces the release's images as candidates and the user assigns them to `cover`, `back`, `gatefold_left` and `gatefold_right`.

    **The importer does not assign slots automatically** — 14a's Q1 measured that Discogs' types cannot distinguish a left leaf from a right leaf from a back cover, and a wrong guess opens a hinge onto artwork that is not the inner sleeve, which is the invented-stand-in failure §10b's strictest rule forbids. Discogs supplies the material, the user supplies the judgement, the same shape §5.7 already uses for every other field.

    Carries §6's `width`/`height` addition (14a Q3), since the UI cannot enforce A21b without it. A single wide scan of an open gatefold cannot fill two square slots: it goes to the gallery as `other`, and a user who wants the hinge photographs the sleeve themselves. That is honest — splitting a scan down the middle and hoping the seam lands right is not.

14e. **The design pass.** The visual system, decided once and written down, rather than settled screen by screen as each was built.

    **It produces a SPEC amendment, not code.** The output is a new section describing the visual system — type, colour, spacing, surface, motion — which this build order then implements as ordinary numbered units afterwards, under the same §1 loop and the same definition of done as everything else. Nothing ships from inside this step. That separation is the point: a design decision argued while a route handler is open gets made by whatever is easiest to type, and the reason this step exists at all is that the pass has been running as a thing that happens rather than a step that produces something.

    **Sequence inside it, and the reason for that order:**

    1. **The system, built on `/lookup`.** The densest screen in the app and the one carrying the most distinct kinds of information — search results, pressing evidence, ownership tiers, market ranges. A system that survives `/lookup` survives everything; one derived from a simpler screen gets amended the first time it meets a real table.
    2. **Applied to the other DOM screens.** Collection, record detail, want list, `/manage`, stats, the add/edit form. Application, not re-derivation — a screen that needs a new rule is evidence the system is wrong, and the rule goes back into step 1 rather than being special-cased here.
    3. **The wall's open questions (§10b).** Held to last because the wall is a lit three-dimensional scene rather than a DOM surface, and because two of its questions are already parked waiting for exactly this: **wall colour** (measured, deliberately not decided — it changes what spine colours do, what the dim means, and whether cover art still separates against a lighter ground) and **the sheen on the pulled record**.

    **The gatefold belongs in step 3's inputs, and that is why 14a precedes this step.** The record is not a two-faced object: §10b gives it four (`cover`, `back`, `gatefold_left`, `gatefold_right`), and a gatefold **opens** rather than turns — two leaves rotating about a shared edge, which means a surface whose angle to the key light changes mid-motion. The sheen question in particular is different for a surface that may be opening than for one that only rotates, so settling sheen for a flat object first produces a decision that has to be re-made rather than refined.

    14a's measurement is what makes those inputs honest rather than aspirational: it established that Discogs supplies one 2:1 spread and no way to type a leaf, so **the four-face state exists only where the user has photographed their own sleeve** — the design pass should know how often four faces actually occur before designing for them.

    **Numbered 14e rather than before 13a because of a real ordering constraint.** The wall's questions are the pass's third input, and they are best judged against a scene that can show what it is deciding about — but 13a (the hinge) cannot be built until 14d supplies images to open, and 14d should not be built before the pass has decided what the assignment UI looks like. The circle is broken by 14a: the pass gets the gatefold as a **measured fact** about the object's geometry and Discogs' supply, without needing the hinge to exist first. So the pass decides the system, then 14d and 13a implement inside it.

    **The known cost of that order**, stated rather than discovered later: step 3 settles the hinge's look — the sheen across an opening leaf, the seam where two photographs meet — against a description and a still scene rather than against a running hinge. If building 13a shows a decision was wrong in motion, that is an amendment to the pass's section, not a licence to re-decide it in the implementation unit.

14f. **The no-primary cover fallback (§6).** **Trigger: the first time an imported cover looks wrong, OR the 14d unit — whichever comes first.** A DEFECT with a trigger, not an observation: it is live now and it affects records already in the collection.

    **What is wrong.** `attach-cover.ts` picks `images[].type === 'primary'` and falls back to `images[0]`. 14a measured that **a gatefold need not carry a primary at all** — release 14451455 has seven images and not one is primary — so on such a release the fallback is the live path, and the attached cover is whichever image a contributor happened to upload first. That can be a label close-up, a runout shot, or the 2:1 inner spread. The front sleeve is not privileged in any way.

    **Why it is worse on exactly the records this feature is about.** Q2 established that a gatefold reliably carries a wide inner spread. A gatefold with no primary is therefore the case most likely to attach something that is not a cover, and most likely to attach the *inner artwork* as the cover — on the wall, in the shelf's spine colour derivation, and as the pulled record's front face. Adam has gatefolds in the collection.

    **The fallback is not deleted.** Without it a no-primary release gets no cover at all, which is worse. What changes is what it prefers and whether it says so — both decided in the unit, with these as the inputs the measurement supplies:

    - a wide (≳1.5:1) image is the one thing 14a proved is *never* a front cover, so it should be the last thing chosen rather than an equal candidate;
    - `width`/`height` reach the normalizer as part of 14d (14a Q3), so a shape-aware fallback costs nothing extra if the two are built together — which is why 14d is one of the two triggers;
    - an import that had no primary to choose from is worth surfacing, since §7.8 already forbids overwriting user data and the user is the one who can tell a cover from an inner leaf.

    **Not fixed inside 14a**, which was a measurement unit; recorded here rather than in NOTES because a live defect with a named trigger is a build step, and NOTES is for observations that have not earned one.

15. Mobile pass across all screens. E2E #10. **Unit 1 was the E2E flake, fixed by per-spec cleanup rather than the per-worker isolation originally prescribed** — see below.
16. Vercel deploy config + cron for price refresh.

    **THE DEPLOY APPLIES MIGRATIONS (A49, 2026-09-07).** `buildCommand` is
    `npm run db:deploy` — `drizzle-kit migrate && db:verify:state && next build`.

    **Why this is a mechanism and not a reminder.** Code deployed automatically
    on push; schema migrated by hand. Nothing sequenced them, so every schema
    change had a window where the deployed code was ahead of the deployed
    schema. NOTES recorded three options and predicted the serious failure; it
    then arrived exactly as described. A48 shipped a write to
    `artist_derived_acts`, the migration was never applied to production, and a
    lineup import returned a live 500 — `42P01 relation does not exist`,
    surfaced to the user as "Internal server error" because nothing catches a
    database fault on that path.

    "Migrate before push" is a habit, and it is the thing that failed. "Tolerate
    the column's absence" buys a silently-no-op write, which is the
    absent-versus-unknown failure this project keeps naming. **The two must not
    be able to separate**, so one command does both.

    **The ORDER is the mechanism**: migrate, verify, then build. A build that
    compiled first would still ship code ahead of schema when the migration
    failed, because the artifact exists and Vercel deploys it. Verifying between
    the two is not optional — `drizzle-kit migrate` prints "migrations applied
    successfully" and exits 0 when a diverged ledger made it apply nothing, which
    three databases in this project have reached.

    **A failed migration now fails the deploy.** That is the intended behaviour
    rather than a cost: the alternative is a deploy that succeeds into a schema
    the code cannot use, which is precisely what just happened.

    **THE DESTRUCTIVE CASE, which is why this was deferred and is the part that
    needed thinking through.** Schema-first is correct for an ADDITIVE migration
    and inverts for a destructive one: dropping a column before the new code
    deploys breaks the running code in the window between migrate and build. The
    deploy gate does not fix that, and must not be read as fixing it.

    **The rule that resolves it, which §7 already half-states:** a destructive
    change is TWO deploys, never one. Deploy 1 ships code that no longer reads
    the column, with no migration. Deploy 2 drops it. Each is additive-safe on
    its own, and the window between them is a schema carrying one unused column
    rather than an outage. This is the standard expand/contract discipline and it
    is the only shape under which "migrate before build" is safe in both
    directions — which is exactly why §7's "never write a destructive migration
    without flagging it and getting confirmation first" is load-bearing rather
    than ceremonial: the confirmation is where the two-deploy split gets planned.

    **What this does NOT cover, stated so nobody assumes it does:** a migration
    that succeeds and is wrong, a long migration exceeding the build timeout, and
    a rollback of code to a version older than the schema. Each is a real gap and
    none is closed here.

**Why 10 and 11 come before 12.** The original order put the graph immediately after the stats screen, and it read its edges from `artist_influences` — a table nothing populated automatically. Built in that order it would have rendered unconnected dots, with no way to tell whether the layout or the clustering was at fault. Seeding first made it verifiable, and what that verification eventually showed was that the screen was not worth keeping (§8) — which is a better outcome than shipping it blind. Step 11's membership data survives the screen and now feeds §9. Market data moved ahead of both because it has no dependency at all and answers the question the app exists for.

**Deferred out of step 13, each with a trigger.** These are §10b features, built later rather than never:

This block is in **execution order** — 13c, then 13a, then 13b. The numbering is by feature and does not run in sequence: 13c happens first, at step 14.

**13a's position moved when the design pass was numbered (14e).** It still runs after 13c, but no longer immediately: 14a (measurement, done), then 14e (the design pass), then 14d (slot assignment), then 13a. The block's relative order is unchanged; what sits between 13c and 13a grew.

**13c. The snippet** (§10b), in THREE UNITS. **Trigger: step 14**, immediately after §9.2 and built on the module §9.2 extracts — the Anthropic client, the shared rate limit (§4.3's `llm_requests`) and the JSON-parse boundary. R5 still reviews one boundary, because there is one.

- **Unit 1 — the column and the ownership rule.** The migration A4 implied and never produced (`snippet`, `snippet_edited_at` reached §4.2 and never reached the schema), the query-layer writes, and §7.8's rule as pure state: a regeneration without confirmation refuses when `snippet_edited_at` is set; a delete clears the text and keeps the timestamp. **No LLM** — testable with no mock, no fixture and no injected client, because a rule about who owns a piece of text is pure state.
- **Unit 2 — the generation path.** The prompt, `kind: 'snippet'` through the shared limiter, the parse boundary, and `POST`. Consumes unit 1's refusal rather than defining it. R5's finding 4 (no count limit on LLM output) is decided here, since it is the same client and the same question.
- **Unit 3 — the panel UI.** Display with the generated label, edit, delete, and A31a's confirmation.

**Why the ownership rule is judged alone.** Every other failure in this feature is recoverable: a bad snippet is regenerated, a 500 is retried. Silently overwriting text the user wrote is permanent. Judging that rule in the same unit as a prompt, a route and a UI is how it gets waved through — the same argument that split §9.1 from §9.2, and that R5 found worth having.

**Separate units, and the original reasoning is why.** This note used to say building it alongside §9.2 was necessary to avoid building that boundary twice. Having read both features, the shared part is satisfied by a shared *module*; what is not shared is where each one's difficulty lives. §9.2 sends a summary of the whole collection and returns something ephemeral, so its hard question is disclosure — R5's first attack line, field by field. The snippet sends one record and its hard question is **storage and ownership**: the text is written to `records.snippet`, `snippet_edited_at` transfers ownership to the user on edit, and a regeneration must then refuse (§7.8).

Judging a disclosure decision and a stored-ownership decision in one review is what splitting §9.1 from §9.2 was meant to avoid.

**13a. The gatefold hinge.** Two leaves about a shared edge, and the affordance only where both inner photographs exist (§10b, A21c). **Trigger: after the slot-assignment UI (14d), which is itself after the design pass (14e).** Nothing in the collection can open a gatefold until images can be assigned to `gatefold_left` and `gatefold_right`, so the hinge has nothing to act on. The scene already wires both slots through the surface-kind rule, so the geometry is what is missing.

The measurement half of the old trigger is **done** (14a, 2026-09-03) and sharpens what this step is building for: Discogs supplies one 2:1 spread and no way to type a leaf, so both `gatefold_left` and `gatefold_right` will in practice come from **the user's own photographs**. The hinge will therefore open onto two images taken in one sitting rather than two stock scans — which is what A21a's accepted seam was always describing, now known to be the normal case rather than the fallback.

**13b. Arrow navigation between records** (§10b). Moving through the collection without putting the record back. **Trigger: step 15's mobile pass**, which is already touching how the wall is navigated on a small screen, and where "browsing is continuous" matters most.

**Step 15 begins with the harness, not with a screen.** Per-worker test-data
isolation (a schema or database per Playwright worker, in `e2e/global-setup.ts`
and `test/helpers/db.ts`) is unit 1, moved here from step 16 on 2026-08-20.

The reason is indistinguishability. A genuine mobile regression presents as
"tests fail on mobile"; the shared-database contention presents as "tests fail on
mobile". Everywhere else that ambiguity is tolerable — mobile E2E is incidental
to what those steps change, and the chromium project gives an independent read.
**Step 15 is the exception on both counts: mobile is what it changes, and mobile
E2E is how it is verified**, so the one diagnostic that separates a real
regression from noise is unavailable exactly where it is needed.

Measured during R5's remediation, at workers=2: three full runs in five produced
hard failures (retries exhausted, not flake) — seven, five and two — every one
failing at login before reaching an assertion, in specs unrelated to the change
under test. 12 of the 14 were `[mobile]` and 2 were `[chromium]`.

**The diagnosis, done in step 15 unit 1, found a different cause than every
earlier entry assumed.** Every failure sat in the last quarter of the run —
earliest 194 of 262, none in the first 190, across roughly 800 executions.
`globalSetup` truncates once per run and nothing cleaned up after each spec, so a
run accumulated 724 records; `/` is a server component awaiting `shelfRecords`,
`records` and `facets`, and every spec's `login()` ends by waiting for that
render. Late in a run it exceeds the 5s default.

So it was accumulation WITHIN a run, not contention between workers — and
per-worker isolation would not have fixed it, because one worker accumulates just
as fast. After per-spec cleanup in an `afterEach`, four valid runs at
`--retries=0` produced ONE failure: a pre-existing hydration flake unrelated to
load. Per-worker isolation is deferred with a trigger (NOTES).

Each step should end with its tests green before moving on.

---

## 12a. RETIRED — ranked pressings (A40), amended by A43, both retired by A59

**Proposed by Adam 2026-08-26. Written up rather than built, and the open questions below are why: two of them change the schema, and one has no answer in the current model at all.**

> **BOTH THIS AND A43 ARE NOW RETIRED (A59, 2026-09-08), and the need they shared is UNMET.** A40 was closed on the argument that A43 covered it; A43 was retired because a model cannot be trusted to establish which pressings EXIST. **Read §12b's retirement block before building from either** — it names the chain, the still-unmet need in Adam's own words, and what Discogs' versions table does and does not answer. A40's own conclusion — that desirability is the user's judgement — turns out to be right, for a different reason than it gave.

> **A43 (2026-08-27) CORRECTS A40's central argument.** A40 concluded that only the user can judge which pressing matters, from two premises that are both true — Discogs has no fidelity ranking, and nothing in the schema knows a first press beats a repress. **The conclusion does not follow from those premises, because the enumeration was incomplete: the app already has a third source of judgement about music, and §9.2 has been using it since step 14.** Read §12b below before building anything from this section; the parts of A40 that survive are marked there.

### What it is

When a pressing matters, the app carries **which pressing to get** — a first choice, a second, a third if it is all you can find — each clickable through to the detail behind it.

### What it is NOT, since two things in this project are adjacent

**It is not `best_dig_notes`, but it is close.** §7.2 already gives one free-text field per want-list row ("caveats, e.g. bootleg warnings, how to spot a fake"), and "1st UK Clay press, Porky stamp; avoid the 1989 repress" fits in it today. **What is missing is structure, not knowledge:** an ordering, and a link through to the pressing. This feature is a structured version of a note the user already writes — which is the whole reason it is cheap and the whole reason it must not become something else.

**It is not §7.7's tier-1 badge, and that failure is not a precedent against it.** That badge was a claim about OWNERSHIP MATCHING — the importer wrote `discogs_release_id`, the matcher read it, and the form path never sent it, so the badge could never fire. It was a SEAM defect between two components. **This feature has no equivalent seam because nothing computes it** (see below), so the class of failure that killed the badge cannot occur here.

### Whose judgement a tier is, which decides the design

**The user's, and only the user's.**

- **Not Discogs'.** It has no fidelity ranking. It has community `have`/`want` counts, which measure popularity, and marketplace prices, which measure scarcity plus hype. Neither is "sounds better", and treating either as one would be the fabricated-230g-weight failure at feature scale.
- **Not the app's.** Nothing in the schema knows a Porky-stamped first press beats a 1989 repress. Deriving it means inventing an authority the data cannot support, and CLAUDE.md §8 is explicit that "best dig" is a judgement about SOUND.

**So the app records a preference; it never computes a ranking.** Everything follows from that: the app can only misrender the list, never be wrong about it. That is what makes this closer to `want_list` — rows the user creates, ordered by a priority they set — than to anything §9 computes.

### Where it attaches: the album, reachable from both sides

**A ranked pressing list belongs to the ALBUM, not to a row in a table.** "For *Rumours*, the first US press beats the 1979 repress" is true whether the user owns a copy, wants one, or neither.

- the want-list row asks **"which one am I hunting"**;
- the owned record asks **"is mine the good one, and what would an upgrade be"**.

**Same list, two questions.** And the attachment is load-bearing rather than tidy: **a want-list attachment would not survive acquisition.** Acquiring clears the hunt, and the knowledge must not go with it — that is the moment it becomes most useful, because the user now owns a copy and wants to know whether it is the good one.

### THE BLOCKING QUESTION: there is no album in this schema

**Measured before writing this, not assumed.** There is no `albums` or `masters` table. `records` and `want_list` EACH carry their own `title` and `artist_id`, and `pressings` are shared and found-or-created (§4.2). So "Rumours by Fleetwood Mac" exists as free text in up to two places with nothing joining them.

**This feature attaches to a thing that does not exist**, and that is the first question to answer:

1. **Introduce an album entity** and migrate `records`/`want_list` to reference it. Correct, and the largest change in the project since step 2 — it touches the two central tables, every query over them, and the import path.
2. **Key the list on `(artist_id, normalized title)`** — no new entity, a derived key. Cheap, and brittle in the way this project has been bitten by before: a title edited on one row silently orphans the list.
3. **Key it on Discogs' `master_id`.** Precise where it exists, absent for anything Discogs does not list, and it makes a user's own judgement depend on an external catalogue.

**None is obviously right, which is why this is not built.**

### Open question: what identifies the thing being RANKED

Adam's, and it is 14c's tension one level up. **"The first US press" is a description, not a row.** Pinning a tier to a `discogs_release_id` makes it precise and brittle at once: precise because it links through to real detail, brittle because a user may rank a pressing Discogs does not list, or rank a class of pressings ("any Porky-stamped copy") that no single release id names.

**14c resolved the same tension by DISPLAYING rather than MATCHING** — the app showed the evidence and the user's eye did the work. The analogous resolution here is that **a tier carries the user's own words AND an optional link**, rather than requiring a row to point at. What must not happen is the link becoming mandatory, which would make the app refuse to record a judgement it cannot look up.

### Open question: what happens when a tier is wrong

Also Adam's. **This is a judgement recorded at a moment, and judgements about pressings change** — a user hears a better copy, or learns the repress they dismissed used the original stampers.

So it needs editing, and it should probably record **when it was written**, the same way `snippet_edited_at` (§7.8) makes ownership of a piece of text legible. The parallel is close but not exact and the difference matters: `snippet_edited_at` distinguishes GENERATED text from text the user took ownership of, whereas here everything is the user's from the start. **What a timestamp would carry is age, not authorship** — "you ranked this two years ago" is a fact worth showing next to a judgement, in the same way A39 shows when a gap analysis was asked.

### Non-goals, stated now so they are not smuggled in later

- **The app never ranks.** No score, no "recommended pressing", no ordering derived from community counts or price.
- **No purchase path** (§13), unchanged: a tier says which pressing to look for, never where to buy it.
- **It does not make `best_dig_notes` redundant** until it demonstrably replaces it. Free text holds things a ranked list cannot — "avoid the 1989 repress, the stampers were worn" is a caveat, not a tier.

### What would fire it

**Nothing yet, deliberately.** The blocking question needs an answer, and answering it well probably means the album entity — which is a step-2-sized change and should be judged on its own merits, not adopted as a side effect of a want-list feature. **Trigger: Adam deciding the album question, or a second feature needing the same entity** — at which point the entity is justified by two callers rather than one.

---

## 12b. RETIRED — pressing assessment (A43), retired by A59 (2026-09-08)

> **READ THIS BEFORE REBUILDING ANYTHING IN THIS SECTION.** A43 is retired, and so is A40 before it (§12a). The need both were built for is **real and now unmet** — this block exists so the next person to feel it finds the trail rather than reinventing the same feature a third time.

### The chain, because the trail runs through two closed units

| unit | what it proposed | how it closed |
|---|---|---|
| **A40** | the user ranks pressings by hand — tiers, first choice, second | closed by A43, which found the reasoning incomplete: the app has a third source of judgement (a model), so "only the user can judge" did not follow |
| **A43** | ask a model which pressing matters and which to hunt | **retired by A59**, below |
| **A59** | display what the app holds; point at real releases | built (§12b's surviving half, and A55) |

### The need, in Adam's own words, still unmet

> *"What I actually want is the app telling me whether a pressing matters for this record, and which one to hunt."* (A43, 2026-08-27)

**That is a good want and nothing in the app now answers it.** A55's panel shows the pressing the user RECORDED; it does not say whether pressing matters for the record, and it does not rank. **If you are reading this because you felt that need again, it is the same need — not a gap someone forgot.**

### Why A43 was retired: three arguments, none about the implementation

**1. The endpoint that would ground it omits the distinguishing field.** Discogs' `/masters/:id/versions` returns catalogue number, year, country and a controlled-vocabulary `format` string (`Repress`, `Promo`, `Mispress`). It does **not** return `formats[].text` — the free-text descriptor, which is where `"White, Early fadeout (Desire Lines)"` lives. That field exists only on `/releases/:id`. **Both Deerhunter variants are CAD 3X38**, so the descriptor IS the distinction, and retrieval returns everything except it. Grounding the feature would cost one call for the list plus one per release — 26 for the Discharge master — with 25 of those existing solely for the field the list omits.

**2. Once you have the versions list, the question is already answered.** A list of real releases with catalogue numbers, years and countries *is* "which pressing should I look for". A model ranking those rows adds a desirability judgement over data the user can read — a different and smaller feature than the one A43 proposed.

**3. The failure is not fixable by grounding, and this is the one that settles it.** In the session that produced the fabricated CAD 3016, the assistant also offered **"J. Lambert @ JLM"** as a pressing discriminator — twice, with search available. It is the mastering studio credit, present across *every* vinyl pressing of that title. **A model with retrieval and a correcting interlocutor still invented a discriminator from adjacent data.** That is not a prompt defect and not a grounding defect; more real data nearby arguably makes it worse, because a plausible-looking identifier acquires the authority of its true neighbours (see A57's recorded cost).

### What the versions table DOES and DOES NOT answer

**Does:** which releases exist under a master; their catalogue numbers, years, countries and format descriptors; how many collectors have or want each (`stats.community`). **It establishes EXISTENCE**, which is the thing a model cannot be trusted with.

**Does not:** which pressing sounds better; which is worth hunting; whether pressing matters for this record at all; the free-text variant descriptor that separates two releases sharing a catalogue number. **It does not establish DESIRABILITY**, which is the collector's judgement (§8) — and the honest position is that the app has no source for it, which is where A40 started and was right for the wrong reason.

### What was KEPT rather than deleted

**Stored assessments stay in the database.** `pressing_assessments` is not dropped, `latestAssessment` and `assessmentWithPrevious` still work, and A58's current-plus-one retention is intact. Nothing renders them. They are a record of what the feature said, and this thread turned on being able to compare answers across runs — deleting them would destroy the evidence that produced the retirement.

**The route and client remain** (`/api/want-list/:id/pressing-assessment`, `pressing-assessment-client.ts`) with A56's anchor gate and A57's held-pressing prompt. Unreferenced by any screen. Kept so the trail is inspectable rather than archaeological.

## 12b (surviving half). The held pressing, displayed — A55, amended by A56

### A55 (2026-09-08) — the held pressing is DISPLAYED, above the generated assessment

**Reported by Adam from real use, and it is a fabrication rather than an inaccuracy.** Asked about Deerhunter's *Halcyon Digest*, the assessment produced three pressings under **CAD 3016** — not this release, whose number is **CAD 3X38** — described a gatefold sleeve that does not exist, and framed the variance as US/EU/repress, which is a template rather than a description of this record. The genuine distinction was **already in the app's possession** from a lookup: two variants differing in whether *Desire Lines* fades early, told apart by **"Salt" etched in the side B runout**.

**Root cause: `PressingSubject` is `{ artist, title }`.** The prompt receives two strings and nothing about the release, so CAD 3016 is training-data recall about 4AD catalogue numbering.

**The fix is display, not description.** `/want-list/:id` now shows the pressing facts the row HOLDS — catalogue number, matrix/runout, variant descriptor, plant, country — verbatim, above the generated assessment. **A model cannot fabricate an identifier it was never asked to produce**, which is a stronger guarantee than any prompt rule.

**Three empty states, reusing A52's distinction rather than rebuilding it:**

| state | meaning | what it says |
|---|---|---|
| `no-pressing` | nothing attached to the row | the app does not know which record is being hunted |
| `no-detail` | attached, carrying nothing distinguishing | it knows the record and has no variant facts |
| `detail` | facts to show | shows them |

**Showing nothing for Halcyon Digest is the CORRECT outcome**, not a shortfall — no pressing was ever attached to that row, so the app genuinely does not know which record is being hunted. **Fetching on demand was considered and rejected**: it would reintroduce the identity question the panel exists to answer, and inherit the lookup's ambiguity into the panel that is supposed to be the answer. It also makes attaching a target pressing the thing that unlocks the panel, which is the right incentive.

**A year is displayed but never counts as detail**, carrying A43's rule forward: a year is an output of identification rather than an input to it.

### A56/A57/A58 (2026-09-08) — the fabrication is not stable, and three changes follow

**A second report: the same prompt produced CAD 3020 where the first run gave CAD 3016**, for a record numbered CAD 3X38. **Two different invented numbers from identical input**, so the model is generating an identifier to fill a required field rather than recalling one — and neither run is flagged.

**A56 — no anchor, no assessment.** A row with no target pressing gives the model two strings and nothing else, so neither the ask nor a stored answer is shown for such a row, and `POST /api/want-list/:id/pressing-assessment` refuses with `NO_TARGET_PRESSING` before claiming a rate-limit slot. The stored row is KEPT in the database and not rendered: it is a record of the model answering a question the app never gave it enough to answer.

**Why suppress rather than show both.** The variants panel correctly said *"No target pressing on this want-list entry"* while the assessment beneath it named CAD 3020 — two contradictory claims about one row, with nothing on screen showing that the lower panel never saw the row. **Adjacency is clarifying only when the panels are COMPARABLE**: a held CAD 3X38 above a model's claim below makes a conflict legible. With nothing above there is no comparison, only an unanchored identifier under a statement that the app has no anchor. The gate shares `assessmentAvailable` with the screen so the two cannot disagree.

**A57 — the prompt carries the held pressing.** `PressingSubject` gains `held`: catalogue number, matrix/runout, variant and country, with instructions never to contradict them and not to restate them back. **The dig-notes exclusion stays**: withholding the user's BELIEFS so the model cannot flatter them is sound, and a catalogue number is not a belief but the identity of the object.

**A COST OF A57, recorded against it (Adam, 2026-09-08): anchoring may have made the output harder to DISTRUST.**

> *"Three invented catalogue numbers are uniformly suspect — nothing corroborates anything. One real number beside two invented ones reads as a verified list, because the true entry lends its authority to the false ones."*

**This holds, and it is worse here than in the general case.** The held value will ALWAYS match, because the app sends it — so row one reads as confirmed by construction, every time. The prompt asks the model not to restate it, but the output format is a list of identifiers, and a model that uses the held number for row one and invents rows two and three produces precisely that shape with nothing distinguishing the rows.

**A list's credibility is set by its most verifiable entry, not its least.** One true row creates an implicit warrant — *the app clearly knows this record* — which transfers to neighbours that never earned it.

**And the usage condition decides the weight.** This screen is read standing in a shop at speed, where the question is "which of these do I look for" — so a list that appears corroborated gets LESS scrutiny per row. **A57 raised accuracy and lowered the legibility of its own errors, and in this context the second may outweigh the first.**

**This NARROWS the fabrication; it does not eliminate it**, and that is stated rather than discovered later. The prompt asks for pressings plural, so rows two and three — a reissue, a US press — are still generated from recall and carry the same risk. `isCheckable` cannot tell: a second invented number passes the same shape test. And if the model echoes the held value back, agreement is not verification. **What it fixes is the case where EVERY row is wrong because the model never knew which record it was discussing.**

**A58 — retention is current plus one.** The unique constraint on `want_list_id` is dropped (migration 0026) and `storeAssessment` trims to two, exactly as A39 does for gap analyses. **The disagreement between runs is the strongest evidence available that neither answer is knowledge, and one-per-row destroyed it.** A43's argument — "nothing reads a superseded one" — was accurate and answered the wrong question: the reader is the user, comparing.

### Two limits of A43, recorded because both were read as stronger than they are

**1. The disclaimer does not cover this failure class.** A caption mitigates *"this might be wrong about music"*. It cannot mitigate *"this identifier does not exist"* — the first is epistemic and a hedge answers it; the second is **navigational**, and the user reaches the wrong record regardless of what the caption says. **Where output names an IDENTITY rather than a judgement, a disclaimer is not mitigation.**

**2. `isCheckable` tests SHAPE, not truth.** The rule accepts `/\b[A-Z][A-Z0-9]*[\s-][A-Z0-9]*\d{2,}\b/`, and **`CAD 3016` matches** — as does every plausible fabrication. It asks *"could this be checked against the object?"* and cannot ask *"is this real?"*. It was built to suppress "the first press sounds better", which it does; **it is not a fabrication guard and must not be relied on as one.** The name is the trap: a rule called `isCheckable` reads as verification and performs validation.

### Not fixed, recorded: snippets carry the same exposure

`SnippetSubject` is also `{ artist, title }`, and §10b's prohibition on stating a pressing or catalogue number is **instructed, not enforced** — its own docblock says "the real protection is that none of these values are in the payload". **That prevents a value being ECHOED, not one being RECALLED**, and recall is the failure that happened. A snippet inventing a pressing year has the same shape as CAD 3016 and nothing would catch it.

## 12b (original). SPEC'D, NOT BUILT — pressing assessment (A43)

**Adam, 2026-08-27, correcting A40's scoping.** *"The dig is fields I fill in, storing what I already know. What I actually want is the app telling me whether a pressing matters for this record, and which one to hunt."*

### The error in A40, stated plainly because it is a reasoning error rather than a missing feature

A40 asked "whose judgement is a tier?" and answered "the user's, and only the user's", from two premises:

- **not Discogs'** — it has `have`/`want` counts (popularity) and prices (scarcity plus hype), and neither is "sounds better";
- **not the app's** — nothing in the schema knows a Porky-stamped first press beats a 1989 repress.

**Both premises are true. The conclusion does not follow, because the enumeration was incomplete.** The app has a third source of judgement about music, it is already integrated, rate-limited and disclosure-bounded, and §9.2 has used it since step 14: **the model.** Claude knows which *Rumours* stampers are worth finding, which Clay pressing of *Hear Nothing* is the good one, and — critically — **whether a record has a pressing worth chasing at all.**

**The mistake was reasoning about the DATA the app holds and forgetting the CAPABILITY the app has.** A40 was written the same day three §9.2 units shipped.

### The standing is §9.2's, exactly, and that is what makes it buildable

**A model's assertion about music, displayed as such, never stored as truth.** §9.2 already establishes every rule this needs:

- **"Suggestions must read as generated"** (§10b's labelling rule) — the assessment is attributed, visually separable, and never rendered through the same presentation as a fact the app computed (see the NOTES rule on two things that look like the same field);
- **it never writes a row** — §9.2's own clause anticipates precisely this case: a model *"can name a record that does not exist, misattribute one, **or invent a pressing**"*;
- **the shared limiter and `llm_requests` quota** apply unchanged, and the shared transport (A38, item 0) gives it `stop_reason`, token recording and truncation refusal for free.

**What the user supplies is unchanged: judgement.** The app assembles the material and orders the question; the user decides. **This is the same pattern as 14c's display-not-match, A40's tiers and the genre-parent suggestion — now the fourth instance**, and the shape is the project's most reusable: *the app never asserts what it cannot check; it puts the material where a person can judge it.*

### Q1 — does the album entity block this? **NO, and the reason is the shape of the answer**

**A40's ranking is a persistent fact about an ALBUM** — "for *Rumours*, the first US press beats the 1979 repress" is true whether the user owns a copy, wants one, or neither. That genuinely wants an album entity, and that entity genuinely does not exist.

**An assessment is a different shape: it is asked, about a row, at a moment.** Like a gap analysis, it is a model's answer to a question posed now — not a stored ranking accumulating across the collection. So it attaches to the want-list row the way §9.2's reason attaches to a suggestion, and **it needs no album entity to be honest.**

**The distinction that makes this safe rather than convenient:**

| A40's tiers | A43's assessment |
|---|---|
| the user's own ranking | the model's assessment |
| persists, survives acquisition | asked at a moment, like a gap analysis |
| belongs to the album | belongs to the asking |
| **needs the entity** | **does not** |

**Both can exist.** A43 answers "is this worth chasing, and which one" today; A40 records "this is my ranking" when the entity arrives. **A43 does not replace A40 and must not be built as if it did** — a model's assessment is not the user's judgement, and storing one as the other is the flattening this project keeps refusing.

### Q2 — what it says when a pressing does NOT matter

**Adam: "'Any copy is fine, do not spend time on this' is as useful as naming a specific one, and it is the answer the current design cannot express at all."**

**He is right that A40 could not express it.** A ranked list has no way to say "ranking is not the question here" — an empty list means "nobody has ranked these", which is a different fact.

**Three states, and they must stay distinguishable** — the absent-versus-unknown distinction this project keeps meeting, here with a third value:

| state | meaning | how it must read |
|---|---|---|
| **not assessed** | nobody has asked | no assessment shown; asking is offered |
| **assessed: it matters** | the model named pressings worth hunting | the assessment, attributed |
| **assessed: it does not** | the model's answer is that any copy is fine | **stated explicitly, as a result** |

**The third is a RESULT, not an absence**, and rendering it as an empty assessment would collapse it into the first — telling the user nobody has looked when in fact the answer is that it makes no difference. That is the market-cache failure and the truncated-snippet failure in a new place: **incomplete or absent presented as complete, or complete presented as absent.**

**And the third state is the one that saves the most time**, which is the argument for building it: it ends a hunt rather than directing one.

### What must NOT be built

- **No storage of the assessment as fact.** It is displayed at the moment of asking. If it is ever persisted, it is persisted the way A39 persists a gap analysis — a transcript, timestamped, attributed, never a column on `want_list` that later readers mistake for the user's own note.
- **It must not write `best_dig_notes`.** That field is the USER's, and §7.8's ownership lesson applies before the fact rather than after: text a model produced sitting in a field the user owns is indistinguishable from text they wrote.
- **No purchase path** (§13), unchanged.
- **It must not silently replace A40.** If the user has recorded their own ranking, that is theirs and outranks any assessment.

### Open questions, unanswered on purpose

1. **What it is asked ABOUT.** A want-list row carries artist and title; a pressing assessment may need more (country, year, the pressings actually available). Sending too little gets a generic answer; sending the collection is §9.2's disclosure boundary again.
2. **Whether an assessment can be re-asked, and what shows meanwhile.** A39's "asked N minutes ago, before you added 5 records" is the precedent for saying what an answer covers.
3. **Whether it belongs on the want-list row, the record, or both.** Adam's own A40 insight applies — the question changes after acquisition, from "which do I hunt" to "is mine the good one".
4. **What it costs.** One call per assessment against a 10/hour shared quota, and §9.2's measurements (input ~1,900, output 526–1,736) are the closest available estimate.

**Size: MEDIUM**, and smaller than A40 because it needs no schema change and no entity. **Not built; sequenced after the genre hierarchy**, which has a live §8 violation and is the only queued item fixing something currently wrong.

---

## 12c. SPEC'D, NOT BUILT — genre hierarchy assistance (A44)

**Scoped 2026-08-27.** §4.1 specifies `parent_genre_id` and the live collection has **34 genres with 2 parents** — `Punk`, `UK82` and `US Hardcore` are siblings, which is CLAUDE.md §8's flattening sitting in the database. Assigning parents is a manual edit per genre, and 32 of 34 were never done: **the friction is the feature's whole justification.**

### Suggest, never assign

**The hierarchy is the user's vocabulary and §8 protects it specifically.** A model assigning parents silently would make it the model's taxonomy wearing the user's names. The app proposes; the user confirms or rejects; **nothing is written that the user did not confirm.** Fourth instance of the project's most reusable pattern, after 14c's display-not-match, A40's tiers and A43's assessment.

**Where: `/manage`, on the genre list** — where the hierarchy is already edited by hand, and where the same edit is being made cheaper. Not on a record, not on `/suggestions`: this changes the vocabulary, not a record.

### What the model is sent: genre names AND the records carrying them

**Measured, and the measurement is why this is not optional.** `Rock` carries 10 records across 10 distinct artists — Buddy Rich to Death Grips to Discharge. From the NAME a model proposes a sensible tree; from the RECORDS it can see how a term is actually being used on this shelf.

So each genre is sent with its **record count and up to three example titles with artists** — the shape §9.2 already sends for artists, inside the established disclosure boundary. Not the whole collection.

### The basis is STATED, never RATED (A44's sharpest rule)

**Every proposed pairing shows what it is based on** — `UK82 (1 record: Discharge — Grave New World)`.

**Stated, not rated**, and the distinction is load-bearing. A count is a fact the user can weigh; a grade is the app judging its own suggestion. **The evidence count is not a confidence score and must not read as one:** ten records can mean a well-understood genre or a meaningless catch-all, and only the user can tell which. `Rock` at ten records is the proof — best-evidenced by count, and an import artefact rather than a chosen category (NOTES).

**Shown on EVERY pairing, not only thin ones.** Marking only the weak cases makes an unmarked row assert nothing about its own support, so the reader infers strength from an absence — which is how a ten-record pairing and a zero-record pairing come to look identical. **A basis is something every claim has**, unlike §12 step 14c's variant limit, which is a fact about data that applies sometimes.

**And the genres the user cares most about are the least evidenced**: `Punk` and `US Hardcore` at zero, `UK82` at one. A design that hid the basis would hide it exactly where it matters.

### Existing genre names only — the model may not invent a parent

**§8: the vocabulary is the user's.** A model proposing `Post-Punk` as a parent adds a term the user never chose, which is taxonomy authorship rather than structuring. Flagging it as new makes the introduction visible without changing what it is.

**Practically the constraint costs nothing**: `Punk` and `US Hardcore` already exist as empty intended parents. If a real gap appears, "New genre" is a text field on the same screen and the user adds it — **which is the right way round.**

**But the model may say a parent is MISSING without proposing one.** *"No existing genre fits as a parent for this"* is useful information and is not the same as leaving the genre unproposed. **That keeps the constraint without making the model pretend a bad fit is a good one** — the same honesty as A43's "any copy is fine" being a result rather than an absence.

### A whole tree, rejected in parts

**One confirmation at a time is 32 decisions, which is the friction that stopped this being done by hand** — a design reproducing it has failed regardless of correctness.

**And a hierarchy is a STRUCTURE, not 32 independent facts.** "UK82 under Punk" and "US Hardcore under Punk" are one decision about how punk is organised; proposing them separately hides that.

So: **one call, one proposed tree, rendered as a tree, each pairing individually accepted or rejected.**

- **Rejecting one pairing leaves the genre top-level and touches nothing else.** No cascade — a rejection is about that pairing.
- **Rejections are recorded** as `(genre_id, rejected_parent_id)`, and **a rejected pairing is never re-proposed** or the feature becomes something to dismiss repeatedly. **Cheap here where §9.2's dismissal state was not: both genres are real rows**, so this is a join table over two real keys rather than a string match.
- **Accept-all exists** for the common case where the tree is right, as a deliberate action rather than a default.

### Open questions

1. **Cycle prevention on accept.** §4.1 already forbids a genre being its own ancestor; a proposed tree accepted piecemeal could construct one across separate confirmations.
2. **Re-asking**, and what the screen shows meanwhile — A39's "asked N minutes ago" is the precedent.
3. **Interaction with the `Rock` finding** (NOTES): nesting may absorb it or expose it as a bucket. **Not solved here** — one problem is "the hierarchy was never populated", the other is "some genres were never chosen".

**Size: MEDIUM.** One call through the existing client, limiter and quota; a confirm/reject UI on `/manage`; one small table. **The prompt is the delicate part** — it must propose from the user's own vocabulary, which is the constraint A29d already enforces for suggestion genres and can reuse.

---

## 13. Explicit non-goals for v1

Do not build these. Do not add schema for them beyond what §4 specifies.

- Multi-user accounts, sharing, or public collection pages. (The nullable `user_id` columns are the only concession.)
- A marketplace, buying, or selling. **This extends to outbound links:** no "Buy on Discogs" button, no marketplace deep links, no affiliate links, nowhere in the app. Marketplace *prices* may be displayed as information; a path to purchase may not.
- Play counts, listening history, or Last.fm/Spotify integration.
- Barcode *scanning* via camera. (Typing a barcode into the lookup form is in scope — §5.7 — scanning one is not.)
- Collaborative "collectors like you" recommendations.
- Mobile native apps.
- Real-time/websocket anything.
- Dark mode toggle (pick one good theme and ship it).

---

## 14. Definition of done

- All migrations run clean from an empty database.
- Every endpoint in §5 implemented and integration-tested — noting that §5.6 lists none, deliberately. Where a server component or a query-layer function is the sole consumer, the contract and its tests live at that layer and **no endpoint is built to satisfy this line.** An endpoint whose only caller is its own test satisfies this checklist and fails the app.
- All eleven E2E flows in §11 passing.
- `npm run build` clean with TypeScript strict mode, no `any` outside genuinely untyped external payloads.
- Deployed to Vercel with the cron job registered and all env vars documented in `.env.example`.
- README covers: local setup, running migrations, obtaining a Discogs token, running each test suite, and deploying.
- `package.json` defines these scripts, all of which must pass: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint`, `test` (Vitest unit + integration), `test:e2e` (Playwright), `db:generate`, `db:migrate`, `db:test:up` (start the Docker test database), `db:test:reset`.
- `docker-compose.yml` provides the local Postgres test database. `TEST_DATABASE_URL` documented in `.env.example` alongside the rest.