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

**`llm_requests`** — one row per outbound Anthropic request, for §9.2's and §10b's rate limit.

| Column | Type | Notes |
|---|---|---|
| id | UUID PRIMARY KEY DEFAULT gen_random_uuid() | |
| kind | TEXT NOT NULL | `gap_analysis` \| `snippet` — the two callers, counted together |
| requested_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Index on `requested_at`, which is the only column the limit reads.

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

**`GET /api/discogs/search` accepts all of the following as optional query params**, mapped one-to-one onto Discogs' search parameters. At least one must be present.

| Param | Maps to | Why it matters |
|---|---|---|
| `artist` | `artist` | |
| `title` | `release_title` | |
| `label` | `label` | |
| `catno` | `catno` | **Catalog number — the single most effective way to pin down a specific pressing.** |
| `barcode` | `barcode` | Near-unique for modern pressings; strongest possible identifier when present. |
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

**Master → release drill-down.** If a search result is a master, the UI must let the user open it and see every version underneath (`/api/discogs/master/:id/versions`), displayed as a comparison table with country, year, label, catalog number, format descriptors and cover thumbnail. This is the step where the user identifies *their* pressing rather than just the album.

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
3. **Acquiring a want-list item** never deletes the want-list row — it marks it acquired and links the new record. The want-list doubles as acquisition history.

   The rule is about *implicit* loss: acquiring must not discard history as a side effect of a different action. An **explicit** user delete of an acquired item is permitted. Mistakes happen, this is a personal tool, and the record itself retains its own `purchase_date`, `purchase_price` and `store_id` — so deleting the want-list row loses the wanting, not the acquisition. Deleting it must never touch the linked record: `acquired_record_id` points from want-list to record, never the reverse.

   The UI must make the consequence legible before it happens — a confirmation naming what is lost, not a bare delete button on an acquired row.

   **A record fulfils at most one want-list entry.** Enforce with a partial unique index on `want_list.acquired_record_id WHERE acquired_record_id IS NOT NULL`. Two entries pointing at one record would give that record two contradictory acquisition histories — it was acquired once. Duplicate *unacquired* entries stay legal: wanting two copies, or the same album in two pressings, is a real intention, and each is fulfilled by its own record. §5.7's import makes this reachable, since importing the same release to the want list twice creates two rows.
4. **Deleting an artist/genre/label/store that is in use** is rejected with `409`, never cascaded.
5. **Price history is append-only.** Never `UPDATE` a `price_history` row; always insert a new one.
6. **Estimated collection value** = for each record, the most recent `price_history` row of type `used` (falling back to `new`, then to `purchase_price`). Sum.
7. **Ownership matching** (the "do I already own this?" check on `/lookup`) resolves in three tiers, and the UI must show which tier matched — never a bare yes/no:
   - **Exact pressing match** — a `records` row whose `pressing_id` points to a pressing with the same `discogs_release_id`, **and** which also satisfies the same artist/title match tier 2 uses. Badge: "You own this pressing."

     The corroboration is not redundant. `discogs_release_id` is a plain integer a client can assert through `POST /api/pressings` without the server verifying it names anything, so the id alone lets a wrong or forged value produce "you own this pressing" for a record with an entirely different artist and title. Requiring the id *and* the album means a bad id degrades to tier 2 rather than to a confident wrong answer — the direction the asymmetry below demands.

     Separately, `discogsReleaseId` supplied to `POST` or `PATCH /api/pressings` must be verified against the release it names before being stored. The server holds the release detail and the cache; a client asserting a fact the server can establish is the pattern to eliminate wherever it appears.
   - **Different pressing of the same album** — a `records` row matching on artist + fuzzy title but a different `discogs_release_id`. Badge: "You own a different pressing" plus the year/country/catalog of the one owned. **This case must never be collapsed into the exact match** — it is the whole reason the distinction exists, and getting it wrong is what causes a bad buying decision in a store.
   - **On the want list** — matching `want_list` row not yet acquired. Badge shows priority and, if `target_pressing_id` is set, whether this result *is* that target pressing.
   - No match: no badge.

   **In a version table, the badge belongs to the table, not to every row.** §7.7's tiers were written for a single candidate — one record in hand, one answer. A master's version table is a different shape: every row shares the album, so every non-owned row is genuinely "a different pressing of something you own", and rendering that on all of them makes the badge the table's background rather than a signal about any row.

   So: state the ownership fact **once at the head** — "100 versions · 1 already on your shelf. You own: 1978 US BSK 3266" — and badge **only the row that is actually owned**. The asymmetry says the unmissable answer is "you own *this* one", and it is unmissable precisely because nothing else is marked.
8. **Never overwrite user-entered data with external data.** On any Discogs re-sync or re-import, fields the user has edited are preserved. `matrix_runout` in particular is user-authoritative.

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

Merging also destroys the distinction the membership import was built to expose. A tribute act shares one hired player with a band the user owns; a genuine side project shares several (§4.3). In a sum, four shared members and one strong influence edge are the same number, and the tribute is indistinguishable from the side project — the one comparison this data answers.

**Weight the shared-member term by people in common**, not by whether any exist: the count is the signal. Ties break on artist name, so the same collection scores the same way on every call.

Return the top `limit` sorted descending, each with a **reason string** assembled from which terms contributed — e.g. "Linked to 3 artists you own; shares 4 members with Discharge."

The two link terms appear as separate clauses, naming which one fired. "Linked to 3 artists you own" and "shares 4 members with Discharge" are different claims about different evidence, and a reader who can see which one produced a suggestion can judge it; a merged clause asks them to trust an arithmetic they cannot see.

The example previously continued *"; shares the UK82 genre; on Clay Records, a label you own 4 records from"* — clauses from the two terms now at §9.1a. They return when their terms do.

Suggestions must be explainable. Never return a bare score with no reasoning.

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

- Build a compact summary of the collection: owned artists grouped by genre, want-list with priorities, label counts. Do not dump raw rows.
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
- **Rate limit to 10 requests/hour, enforced server-side against `llm_requests` (§4.3)** — never trusted from the client, and shared with §10b's snippet since both spend the same account. Exhaustion is a legible refusal naming when capacity returns, not a 500 and not silence: an exhausted quota is a fact the app knows, and reporting it as an internal error sends the reader to application logs for something the app could have said. Never call this on page load — user-initiated only.
- Results are ephemeral (not persisted) but the UI offers an "add to want-list" action per suggestion.
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
| Record lookup | `/lookup` | **Structured search form** — fields for artist, title, label, catalog number, barcode, country, year, format. Results as cards with cover art, year, country, label, catalog number and format descriptors. Masters expand into a version-comparison table to pin down the exact pressing. Each result offers: "Add to collection", "Add to want list", and an ownership badge (see §7.7). Mobile-optimized — this is the in-store screen. No result may link out to a purchase page (§13). |
| Add/edit record | `/records/new`, `/records/:id/edit` | Form prefilled from a lookup result, or blank for manual entry. All prefilled fields remain editable — the user verifies against the physical record and corrects. Inline create for artist/label/store/tag. Pressing details are entered here, not on a separate screen: catalog number, matrix/runout, country, year pressed, pressing plant, vinyl weight, colour variant, and whether it is a reissue. All optional — the in-store case must stay enterable in seconds. |
| Add/edit want-list item | `/want-list/new`, `/want-list/:id/edit` | Form for a wanted record, mirroring the record form's structure. Fields: title, artist, label, priority, target pressing, best-dig notes, max price. Prefilled from a `/lookup` result via `?discogsReleaseId=`, or blank. **`best_dig_notes` and `max_price` are visually and structurally separate** (§7.2) — never one section, never one label. Reference rows are matched, never created: a prefill is not a commitment, and an artist created for an abandoned form is debris nothing points at. When a Discogs value matches no existing row, leave the field empty and name what could not be found. |
| Want list | `/want-list` | Sorted by priority. Each row shows target pressing and best-dig notes. "Mark acquired" action opens the record form prefilled. |
| Suggestions | `/suggestions` | Relationship-based list with reasons, always present. Separate "Ask Claude for gap analysis" button for §9.2. Add-to-want-list on each. |
| Stores | `/stores` | List with favorite toggle; each store shows records acquired there and total spend. |
| Stats | `/stats` | Total records, total spend, estimated value, breakdown charts by genre/decade/store/label. |
| Manage | `/manage` | CRUD for genres (incl. hierarchy editor), labels, formats, tags, artists, influences. **Not pressings** — see below. |

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
**The wall is at least four shelves deep, and grows beyond that with the collection.** A shelf is furniture and a room has a size. Filtering to 26 records collapsed the wall to a single row — the room shrink-wrapping its contents, which is the same failure as every rejected minimum-width candidate in units 20-22 arriving vertically rather than horizontally. Four rows of empty shelf below a filtered result says *these are the ones that matched*; one row that fits the result says *this is the whole collection*, which is false.

Four shelves' worth of room, scrolling if the viewport is shorter. Spine height stays at the value chosen by looking — the room does not shrink to fit the window, any more than a bookcase does. At 240px spines that is roughly 1000px, which exceeds a laptop viewport once the nav and controls are accounted for, and that is correct: you scroll.

The empty shelves are SHELVES, not void: a row with nothing on it gets the same plane, lip and wall-behind treatment as an occupied one.

**A filtered wall keeps its shape, and the room is what keeps it.** The original rule asked for gaps — each record staying where it was, with holes where the others had been — because a wall of five spines packed at the left is indistinguishable from a collection of five records. That honesty is what mattered, and holding positions for records that are not rendered is a hard mechanism with many ways to be subtly wrong. **The four-shelf room achieves it far more simply:** the results pack from the left as usual, and the empty shelves below them say plainly that most of the collection is hidden. A24d is satisfied by the room's size rather than by position-holding.

This is the absent-versus-unknown distinction (§10a, and the rule this project keeps meeting) applied to a layout: the gaps are the feedback. The filter chips already carry the counts, and `?view=table` shares the same URL state, so the numeric answer is available in both views without the wall having to state it.

- **A spine's colour is the average colour of its cover**, computed once when the cover is attached and stored in `records.spine_colour` (§4.2). The average is taken in linear light and weighted by alpha, not by the most populous colour bucket — measured against real sleeves, a dominant-bucket rule gives a warm brown portrait a near-black spine, which is a wrong answer rather than a different one. Saturation is never boosted: a spine is a claim about a cover, and a shelf prettier than the sleeves on it is inventing colour the record does not have. A record with no cover gets a plain spine — an honest absence, not a gap in the wall.
- **Spine text is artist, title and catalogue number**, set in mono, rotated. The catalogue number is the collector's identifier and earns its space.
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

**The object takes four textures, all square.** `cover` on the front, `back` on the back, and `gatefold_left` and `gatefold_right` across the two leaves of the open sleeve. Nothing else is mapped onto it.

Square because a 12″ sleeve is square. **The stored images frequently are not**, and that is measured rather than assumed: Discogs serves whatever a contributor uploaded, and the first cover checked was 591×599.

**A non-square image is cropped to square from its centre when it is mapped onto the object**, matching what the wall already does with `object-cover`. The alternative — fitting the whole image and letterboxing the remainder — puts a border on a record that has none, which is the app asserting something false about a physical object; and filling that border with the spine colour, considered and rejected, invents a sleeve edge that was never photographed.

Cropping loses artwork at the edges. That is a real cost and it is the right one: a sleeve photographed slightly off-square loses a few pixels of its own border, where a letterboxed one gains a band that belongs to no record.

**The crop happens at mapping time, not on the stored file.** The image in the gallery is the whole photograph, unmodified — it is the user's data (§7.8) and the object's needs are not a reason to alter it. In practice that means adjusting the texture's UV mapping rather than re-processing bytes.

The inner is **two photographs, not one spread.** A real gatefold inner is continuous, and mapping one wide image across both leaves would be more faithful — but it asks for a photograph most phones take badly, and it makes the inner the only non-square image in the collection. Two straight-on shots are what someone can actually take. The cost is a seam down the middle wherever the two differ in lighting or crop, and that is accepted: a visible seam is honest about being two photographs.

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

**The facts live in fixed panels beside the record.** Artist, title, year, label, catalogue number, pressing details, condition, and purchase information — laid out beside the object, static while it turns, as the reference does. They do not track the record's geometry and never need to agree with it about anything.

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
14a. **Measure Discogs' inner images, then build slot assignment.** Discogs carries gatefold artwork on some releases, which makes 13a reachable — but three things are assumptions rather than facts and this project's record on assuming API shapes is poor (`format.text`, the versions payload, the master-year fallback each cost a round).

    Measure against the live API on a known gatefold release, before designing anything on top: how the payload types an inner image, given `images[].type` is only `primary`/`secondary`; whether it is one wide spread or two square leaves; and what §6's field mapping would have to gain for the importer to carry them at all.

    Then build the assignment UI. **The importer does not assign slots automatically** — Discogs' types cannot distinguish a left leaf from a right leaf from a back cover, and a wrong guess opens a hinge onto artwork that is not the inner sleeve, which is the invented-stand-in failure §10b's strictest rule forbids. The add-record form surfaces the release's images as candidates and the user assigns them, the same shape §5.7 already uses for every other field: Discogs supplies the material, the user supplies the judgement.

    A single wide scan of an open gatefold cannot fill two square slots (A21b). It goes to the gallery as `other`, and a user who wants the hinge photographs the sleeve themselves. That is honest — splitting a scan down the middle and hoping the seam lands right is not.
15. Mobile pass across all screens. E2E #10. **Unit 1 was the E2E flake, fixed by per-spec cleanup rather than the per-worker isolation originally prescribed** — see below.
16. Vercel deploy config + cron for price refresh.

**Why 10 and 11 come before 12.** The original order put the graph immediately after the stats screen, and it read its edges from `artist_influences` — a table nothing populated automatically. Built in that order it would have rendered unconnected dots, with no way to tell whether the layout or the clustering was at fault. Seeding first made it verifiable, and what that verification eventually showed was that the screen was not worth keeping (§8) — which is a better outcome than shipping it blind. Step 11's membership data survives the screen and now feeds §9. Market data moved ahead of both because it has no dependency at all and answers the question the app exists for.

**Deferred out of step 13, each with a trigger.** These are §10b features, built later rather than never:

This block is in **execution order** — 13c, then 13a, then 13b. The numbering is by feature and does not run in sequence: 13c happens first, at step 14.

**13c. The snippet** (§10b), in THREE UNITS. **Trigger: step 14**, immediately after §9.2 and built on the module §9.2 extracts — the Anthropic client, the shared rate limit (§4.3's `llm_requests`) and the JSON-parse boundary. R5 still reviews one boundary, because there is one.

- **Unit 1 — the column and the ownership rule.** The migration A4 implied and never produced (`snippet`, `snippet_edited_at` reached §4.2 and never reached the schema), the query-layer writes, and §7.8's rule as pure state: a regeneration without confirmation refuses when `snippet_edited_at` is set; a delete clears the text and keeps the timestamp. **No LLM** — testable with no mock, no fixture and no injected client, because a rule about who owns a piece of text is pure state.
- **Unit 2 — the generation path.** The prompt, `kind: 'snippet'` through the shared limiter, the parse boundary, and `POST`. Consumes unit 1's refusal rather than defining it. R5's finding 4 (no count limit on LLM output) is decided here, since it is the same client and the same question.
- **Unit 3 — the panel UI.** Display with the generated label, edit, delete, and A31a's confirmation.

**Why the ownership rule is judged alone.** Every other failure in this feature is recoverable: a bad snippet is regenerated, a 500 is retried. Silently overwriting text the user wrote is permanent. Judging that rule in the same unit as a prompt, a route and a UI is how it gets waved through — the same argument that split §9.1 from §9.2, and that R5 found worth having.

**Separate units, and the original reasoning is why.** This note used to say building it alongside §9.2 was necessary to avoid building that boundary twice. Having read both features, the shared part is satisfied by a shared *module*; what is not shared is where each one's difficulty lives. §9.2 sends a summary of the whole collection and returns something ephemeral, so its hard question is disclosure — R5's first attack line, field by field. The snippet sends one record and its hard question is **storage and ownership**: the text is written to `records.snippet`, `snippet_edited_at` transfers ownership to the user on edit, and a regeneration must then refuse (§7.8).

Judging a disclosure decision and a stored-ownership decision in one review is what splitting §9.1 from §9.2 was meant to avoid.

**13a. The gatefold hinge.** Two leaves about a shared edge, and the affordance only where both inner photographs exist (§10b, A21c). **Trigger: after the Discogs inner-image measurement and the add-record slot-assignment UI** (14a). Nothing in the collection can open a gatefold until images can be assigned to `gatefold_left` and `gatefold_right`, so the hinge has nothing to act on. The scene already wires both slots through the surface-kind rule, so the geometry is what is missing.

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