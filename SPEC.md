# Record Collection Tracker — Implementation Spec

## 0. How to use this document

This is a complete build specification for a single-developer project. Implement it in the order given in §12 (Build Order). Do not deviate from the stack in §2 or the schema in §4 without flagging the reason first. Where this spec is silent on a detail, prefer the simplest option that does not require a schema migration to undo later.

---

## 1. Overview

A personal vinyl record collection tracker. Two core datasets: **records owned** and a **want-list** of records to acquire. Around those sit reference data (artists, genres, labels, stores, pressings) that make two signature features possible:

1. **Network graph** — a force-directed visualization of the collection where artists and genres are nodes and influence/membership relationships are edges.
2. **Shelf order** — a derived linear ordering of the physical collection based on graph clustering, so the shelf reads as a genealogy rather than an alphabet.

Plus a **suggestion engine** that recommends records to acquire based on gaps in the graph.

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
| Graph viz | D3 (`d3-force`) rendered to SVG |
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
- Secrets (`DISCOGS_TOKEN`, `ANTHROPIC_API_KEY`, `APP_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`) live in env vars and are only ever read server-side. Never expose them to a client component. Validate all of them at boot with Zod and fail fast with a clear message naming the missing variable.

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
| name | TEXT NOT NULL UNIQUE | |
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
| acquired_record_id | UUID REFERENCES records(id) | set when fulfilled; see §7.3 |
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
| price_type | price_type enum NOT NULL | `'new' \| 'used' \| 'best_dig'`. **NOT NULL** — §7.6's fallback chain has no defined behavior for an untyped price. |
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
| image_type | image_type enum | `'cover' \| 'back' \| 'label' \| 'matrix' \| 'other'` |
| caption | TEXT | |

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

These power the network graph. All are composite-PK, no separate `id`.

**`record_genres`** — `(record_id, genre_id)`
**`want_list_genres`** — `(want_list_id, genre_id)`
**`artist_genres`** — `(artist_id, genre_id)`
**`record_tags`** — `(record_id, tag_id)`

**Cascade rule for junction tables — directional, not blanket.** A junction row has two FKs and they behave differently:

- **Toward the owning entity** (`record_id`, `want_list_id`, `artist_id` on `artist_genres`): `ON DELETE CASCADE`. Deleting a record removes its links.
- **Toward the reference row** (`genre_id`, `tag_id`): `NO ACTION`. Deleting a genre or tag that is still linked must be *refused*, surfacing as `409 IN_USE` (§5.4, §7.4). Cascading here would silently strip a tag from every record that had it — precisely the data loss the 409 exists to prevent.

`artist_influences` cascades on both FKs, since both point at `artists` as owner and an edge to a deleted artist is meaningless. A junction row is a *link*, not an entity — deleting a record must remove "this record is tagged punk" while leaving the genre itself untouched. This does not weaken §7.4: the reference row is protected by the NO ACTION FK on the owning table (`records.artist_id`, `records.label_id`, `records.pressing_id`, `genres.parent_genre_id`), which still produces a `409 IN_USE`. Without junction cascade, `DELETE /api/records/:id` (§5.2) would fail on an FK violation, so this is required, not optional.

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
| GET | `/api/records/stats` | `{ totalRecords, totalSpend, estimatedValue, byGenre: [...], byDecade: [...], byStore: [...] }` |

Note: `app/api/records/stats/route.ts` is a static segment and must not be swallowed by `app/api/records/[id]/route.ts`. Next.js resolves static before dynamic, so this works — but `[id]` must still reject a non-UUID param with `400` rather than attempting a lookup.

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

### 5.6 Graph & shelf
| Method | Path | Notes |
|---|---|---|
| GET | `/api/graph` | Returns `{ nodes, links }` — see §8.1 for shape. Query params: `include=owned\|wanted\|both` (default both), `genreId` to subset. |
| GET | `/api/shelf-order` | Returns ordered records with section breaks — see §8.2. |

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

**Master → release drill-down.** If a search result is a master, the UI must let the user open it and see every version underneath (`/api/discogs/master/:id/versions`), displayed as a comparison table with country, year, label, catalog number, format descriptors and cover thumbnail. This is the step where the user identifies *their* pressing rather than just the album.

**Honest limits — surface these in the UI, do not paper over them:**
- Discogs data is user-submitted. Distinct pressings are sometimes merged into one release entry, and identical ones sometimes split across two. Treat a matched release as a strong starting point, never as proof.
- `matrixRunout` is frequently missing or partial. Always let the user hand-enter it from the dead wax, and never overwrite a user-entered matrix value with a Discogs one on re-sync.
- When a search returns several plausible pressings, present them for comparison rather than auto-selecting the top hit.

### 5.8 Suggestions
| Method | Path | Notes |
|---|---|---|
| GET | `/api/suggestions` | Graph-based suggestions, §9.1. Query: `limit` (default 10). |
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
- **Field mapping** (Discogs → ours): `title`→`title`, `artists[0].name`→`artists.name`, `labels[0].name`→`labels.name`, `labels[0].catno`→`pressings.catalog_number`, `year`→`pressings.year_pressed`, `country`→`pressings.country_pressed`, `formats[0].name`→`formats.name`, `identifiers` where `type == "Matrix / Runout"`→`pressings.matrix_runout`, `genres` + `styles`→`genres` (find-or-create; prefer `styles` since it's more specific).
- **Price refresh:** `/api/discogs/refresh-prices` runs via Vercel Cron weekly. Pull the marketplace price suggestions endpoint, write `price_history` rows with `source: "discogs"`. Do not overwrite manual entries.

---

## 7. Business rules

1. **Genre nesting**: a record tagged with a child genre is implicitly a member of all ancestor genres for filtering and graph purposes. Compute this with a recursive CTE; do not denormalize.
2. **Best dig ≠ best price.** `target_pressing_id` and `best_dig_notes` describe the highest-fidelity pressing worth hunting for. `max_price` is a separate, independent field. Never conflate them in logic or copy.
3. **Acquiring a want-list item** never deletes the want-list row — it marks it acquired and links the new record. The want-list doubles as acquisition history.

   The rule is about *implicit* loss: acquiring must not discard history as a side effect of a different action. An **explicit** user delete of an acquired item is permitted. Mistakes happen, this is a personal tool, and the record itself retains its own `purchase_date`, `purchase_price` and `store_id` — so deleting the want-list row loses the wanting, not the acquisition. Deleting it must never touch the linked record: `acquired_record_id` points from want-list to record, never the reverse.

   The UI must make the consequence legible before it happens — a confirmation naming what is lost, not a bare delete button on an acquired row.
4. **Deleting an artist/genre/label/store that is in use** is rejected with `409`, never cascaded.
5. **Price history is append-only.** Never `UPDATE` a `price_history` row; always insert a new one.
6. **Estimated collection value** = for each record, the most recent `price_history` row of type `used` (falling back to `new`, then to `purchase_price`). Sum.
7. **Ownership matching** (the "do I already own this?" check on `/lookup`) resolves in three tiers, and the UI must show which tier matched — never a bare yes/no:
   - **Exact pressing match** — a `records` row whose `pressing_id` points to a pressing with the same `discogs_release_id`. Badge: "You own this pressing."
   - **Different pressing of the same album** — a `records` row matching on artist + fuzzy title but a different `discogs_release_id`. Badge: "You own a different pressing" plus the year/country/catalog of the one owned. **This case must never be collapsed into the exact match** — it is the whole reason the distinction exists, and getting it wrong is what causes a bad buying decision in a store.
   - **On the want list** — matching `want_list` row not yet acquired. Badge shows priority and, if `target_pressing_id` is set, whether this result *is* that target pressing.
   - No match: no badge.
8. **Never overwrite user-entered data with external data.** On any Discogs re-sync or re-import, fields the user has edited are preserved. `matrix_runout` in particular is user-authoritative.

---

## 8. Graph & shelf ordering

### 8.1 Network graph

`GET /api/graph` returns:

```ts
{
  nodes: Array<{
    id: string;                  // prefixed: "artist:<uuid>" | "genre:<uuid>"
    type: "artist" | "genre";
    label: string;
    ownedCount: number;          // records owned attributable to this node
    wantedCount: number;
    priorityTier: number | null; // min priority across linked want-list items
    parentGenreId: string | null;
  }>,
  links: Array<{
    source: string;
    target: string;
    type: "influence" | "member_of" | "genre_parent";
    weight: number;              // influence: artist_influences.strength (1-5).
                                 // member_of: count of records linking the pair.
                                 // genre_parent: always 1.
  }>
}
```

Rendering:
- Client component only, `'use client'`, dynamically imported with `ssr: false`. D3 force simulation touches `window`/DOM and will break SSR otherwise.
- Node radius scales with `ownedCount + wantedCount`; owned and wanted are visually distinguished (fill vs. outline).
- Colour by top-level ancestor genre.
- Clicking a node filters the collection list to that artist/genre.
- Must be usable on mobile: pinch-zoom and pan, and a fallback list view for very small screens.

### 8.2 Shelf order

`GET /api/shelf-order` produces a **linear ordering of owned records** derived from graph structure, so physically adjacent records are musically related.

Algorithm:
1. Build the artist graph: nodes = artists with owned records; edges = `artist_influences` (weight = `strength` × `INFLUENCE_WEIGHT`) plus shared-genre edges (weight = number of shared genres × `GENRE_WEIGHT`).

   **`INFLUENCE_WEIGHT` and `GENRE_WEIGHT` are exported named constants in the shelf-order module, not inline numbers.** Start at `1.0` each. This ratio is the single knob that determines whether the output is useful: weight genre too heavily and the shelf collapses into plain genre sorting, adding nothing over a manual sort; weight influence too heavily and a densely cross-referenced scene merges into one undifferentiated blob. Expect to tune it against real data. Keep it trivially findable.
2. Detect communities using **greedy modularity (Louvain/CNM)**. Do not use label propagation: it is non-deterministic, and a shelf order that reshuffles between page loads is useless for a physical shelf. **The same collection must always produce the same shelf order.** Add a unit test asserting this — run the algorithm twice on the same fixture and assert identical output. Ties at any stage break on artist name, never on insertion order or object key order.
3. Order communities so that adjacent communities are the ones with the most inter-community edge weight (greedy nearest-neighbour walk over the community adjacency matrix).
4. Within a community, order artists by a similar greedy walk, then by name as tiebreak.
5. Within an artist, order records by `release_year`, then title.
6. **Bridge records** — records whose artist has edges into the *next* community — are placed at the end of their community, forming the transition point.

Response:

```ts
{
  sections: Array<{
    label: string;              // derived from dominant genre of the community
    records: Array<{ id, title, artistName, releaseYear, isBridge: boolean }>
  }>
}
```

UI shows this as a printable/checkable list, with bridge records visually marked as section transitions. Include a toggle to fall back to plain alphabetical-by-artist.

---

## 9. Suggestion engine

### 9.1 Graph-based (default, always on)

`GET /api/suggestions`. Pure computation, no external calls.

For each artist **not** in the collection but reachable in the graph (i.e. appearing in `artist_influences` linked to an owned artist), compute:

```
score =
    (2.0 × number of owned artists directly linked, weighted by edge strength)
  + (1.5 × genre overlap with the user's top 3 genres by owned count)
  + (1.0 × label overlap with labels appearing 2+ times in the collection)
  - (3.0 if already on the want-list)   // suppress, don't hide
```

Return the top `limit` sorted descending, each with a **reason string** assembled from which terms contributed — e.g. "Linked to 3 artists you own; shares the UK82 genre; on Clay Records, a label you own 4 records from."

Suggestions must be explainable. Never return a bare score with no reasoning.

### 9.2 LLM-assisted (on-demand)

`POST /api/suggestions/ai`. Server-side call to the Anthropic API.

- Build a compact summary of the collection: owned artists grouped by genre, want-list with priorities, label counts. Do not dump raw rows.
- Prompt asks for **gap analysis**: named records that are conspicuous absences given what's owned, with a one-sentence rationale each. Ask explicitly for genre-accurate reasoning — the distinctions between UK first-wave punk, UK82, US hardcore, horror punk, and psychobilly are meaningful and should not be flattened into "punk".
- Require JSON-only output: `{ suggestions: [{ artist, title, reason, genre }] }`. Strip markdown fences before parsing. Handle parse failure gracefully with a user-visible error, not a crash.
- Rate limit to 10 requests/hour. Never call this on page load — user-initiated only.
- Results are ephemeral (not persisted) but the UI offers a one-click "add to want-list" per suggestion.

---

## 10. Screens

Responsive throughout — **desktop and mobile are equal priorities**, not desktop-with-a-mobile-fallback. Assume the mobile case is "standing in a record store checking whether I already own this," which means search and want-list must be fast and thumb-reachable.

| Screen | Route | Contents |
|---|---|---|
| Login | `/login` | Password field only. |
| Collection | `/` | Filterable, sortable list/grid of owned records. Prominent search. Filter chips for genre/label/store/tag. Toggle grid ↔ table. |
| Record detail | `/records/:id` | All fields, pressing details incl. matrix number, images gallery, price history sparkline, journal entries with add-entry form. |
| Record lookup | `/lookup` | **Structured search form** — fields for artist, title, label, catalog number, barcode, country, year, format. Results as cards with cover art, year, country, label, catalog number and format descriptors. Masters expand into a version-comparison table to pin down the exact pressing. Each result offers: "Add to collection", "Add to want list", and an ownership badge (see §7.7). Mobile-optimized — this is the in-store screen. No result may link out to a purchase page (§13). |
| Add/edit record | `/records/new`, `/records/:id/edit` | Form prefilled from a lookup result, or blank for manual entry. All prefilled fields remain editable — the user verifies against the physical record and corrects. Inline create for artist/label/store/tag. Pressing details are entered here, not on a separate screen: catalog number, matrix/runout, country, year pressed, pressing plant, vinyl weight, colour variant, and whether it is a reissue. All optional — the in-store case must stay enterable in seconds. |
| Want list | `/want-list` | Sorted by priority. Each row shows target pressing and best-dig notes. "Mark acquired" action opens the record form prefilled. |
| Graph | `/graph` | The force-directed network. Controls: include owned/wanted/both, genre subset, reset zoom. |
| Shelf order | `/shelf` | Ordered sections, bridge records marked, print stylesheet, alphabetical toggle. |
| Suggestions | `/suggestions` | Graph-based list with reasons, always present. Separate "Ask Claude for gap analysis" button for §9.2. Add-to-want-list on each. |
| Stores | `/stores` | List with favorite toggle; each store shows records acquired there and total spend. |
| Stats | `/stats` | Total records, total spend, estimated value, breakdown charts by genre/decade/store/label. |
| Manage | `/manage` | CRUD for genres (incl. hierarchy editor), labels, formats, tags, artists, influences. **Not pressings** — see below. |

**Pressing entry is inline, and a pressing is never created empty.** A pressing has no meaning apart from the record it describes: nobody enters a catalog number with no record in mind. So there is no standalone pressing screen and `/manage` does not list them. On save, the record's pressing fields resolve through §4's find-or-create rules.

**"Identifying field" is a wider set than §4's match key, and the difference matters.** The match key is `discogs_release_id`, or the tuple `(catalog_number, country_pressed, year_pressed)`. The identifying set is *all eight* pressing fields on the form. A user who enters only a matrix runout has identified their pressing precisely — it is the dead-wax fingerprint — even though nothing in the match key is populated. That entry must create a pressing (matching nothing, per §4's empty-key rule) rather than being discarded. Only when all eight are blank is no pressing created and `pressing_id` left null.

This is deliberately not the same as §4's API-side rule, and both are right for their layer. `POST /api/pressings` is told "make me a pressing" and must never silently share one. The form is told "here is a record", and an empty pressing section means the user did not fill it in — a form that created an empty pressing per record would generate a junk row for every quick in-store entry.

**Clearing every pressing field on an existing record detaches, never deletes.** Set `pressing_id` to null and leave the row alone. Pressings are shared (§4), so deleting one could silently alter another record — the pressing-is-not-an-album hazard in reverse. An orphaned pressing is visible and harmless; a deleted shared one is neither.

**`matrix_runout` is user-authoritative** (§4, CLAUDE.md §8). It is read off the dead wax by hand and is frequently absent or wrong in Discogs. Nothing may overwrite a user-entered value — not a re-import, not a re-sync, not a later edit that leaves the field untouched.

---

## 11. Testing

### Unit (Vitest)
- Suggestion scoring function — every scoring term independently, plus the want-list suppression case.
- Shelf-order algorithm — community detection and ordering on fixture graphs, incl. degenerate cases (zero artists; one artist; no edges at all; every artist in one community; two disconnected components).
- Shelf-order **determinism** — same fixture in, byte-identical output across repeated runs.
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
6. Load the graph, click a node, verify the collection filters.
7. Load the shelf order and verify sections render with bridge markers.
8. Request graph-based suggestions and add one to the want-list.
9. Upload an image to a record and verify it appears in the gallery.
10. Run the collection list and lookup flows at a mobile viewport (390×844) — search and filter must be usable one-handed.
11. Add the same album twice in two different pressings and verify both persist as separate records.

Mock the Discogs and Anthropic APIs in tests. Never hit live external APIs in CI.

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
10. Graph endpoint + visualization. E2E #6.
11. Shelf order. E2E #7.
12. Suggestions — graph-based first, then LLM-assisted. E2E #8.
13. Mobile pass across all screens. E2E #10.
14. Vercel deploy config + cron for price refresh.

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
- Every endpoint in §5 implemented and integration-tested.
- All eleven E2E flows in §11 passing.
- `npm run build` clean with TypeScript strict mode, no `any` outside genuinely untyped external payloads.
- Deployed to Vercel with the cron job registered and all env vars documented in `.env.example`.
- README covers: local setup, running migrations, obtaining a Discogs token, running each test suite, and deploying.
- `package.json` defines these scripts, all of which must pass: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint`, `test` (Vitest unit + integration), `test:e2e` (Playwright), `db:generate`, `db:migrate`, `db:test:up` (start the Docker test database), `db:test:reset`.
- `docker-compose.yml` provides the local Postgres test database. `TEST_DATABASE_URL` documented in `.env.example` alongside the rest.