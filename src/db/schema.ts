import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * SPEC.md §4. Every table carries `id`, `created_at` and `updated_at` unless the
 * spec says otherwise; `updated_at` is maintained by the single set_updated_at()
 * Postgres trigger, never by application code.
 */

const id = uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const timestamps = { createdAt, updatedAt };

// --- Enums (SPEC.md §4.2) ---------------------------------------------------

export const conditionGrade = pgEnum('condition_grade', [
  'M',
  'NM',
  'VG+',
  'VG',
  'G+',
  'G',
  'F',
  'P',
]);
// §4.2 as amended, and §7's correction note: `best_dig` described a PRESSING
// and modelling it as a price was CLAUDE.md §8's conflation in the schema.
// `asking` is a price somebody wants that nobody has paid — a shop tag or an
// open listing — and is deliberately NOT in §7.6's value chain.
export const priceType = pgEnum('price_type', ['new', 'used', 'asking']);
/**
 * §4.2 as amended by A21a. The order tracks how a sleeve is examined — front,
 * back, inside, then the detail shots — so the two inner leaves sit together
 * after `back` and before the close-ups.
 *
 * **`gatefold` became two values** when §10b specified the inner as two square
 * photographs rather than one wide spread: a real gatefold inner is continuous,
 * but photographing it as one shot asks for a picture most phones take badly
 * and makes the inner the only non-square image in the collection.
 *
 * Drizzle does not enforce this list against the database; migration 0013
 * replaces the type and `record-images.test.ts` round-trips a real upload,
 * because this list, the Postgres type and the route's `z.enum` are three
 * places that can disagree two-against-one.
 */
export const imageType = pgEnum('image_type', [
  'cover',
  'back',
  'gatefold_left',
  'gatefold_right',
  'label',
  'matrix',
  'other',
]);

// --- 4.1 Reference tables ---------------------------------------------------

export const artists = pgTable(
  'artists',
  {
    id,
    /**
     * §4.1 as amended: **not unique.**
     *
     * Two different bands genuinely share a name — MusicBrainz carries two
     * distinct UK groups called Discharge — and a unique constraint asserts
     * they are one artist. That is §8's pressing-is-not-an-album hazard at the
     * artist level, and it fuses two bands' lineups and records silently.
     *
     * Uniqueness lives on the external ids below, which IDENTIFY an artist. A
     * name does not. The duplicate warning survives as a §5.4 soft 409 the user
     * may override — a constraint the database enforced becomes a question the
     * user answers.
     */
    name: text('name').notNull(),
    formedYear: integer('formed_year'),
    originCountry: text('origin_country'),
    notes: text('notes'),
    discogsArtistId: integer('discogs_artist_id'),
    musicbrainzId: text('musicbrainz_id'),
    ...timestamps,
  },
  (t) => [
    // Unique only when present, per §4.1.
    uniqueIndex('artists_discogs_artist_id_key')
      .on(t.discogsArtistId)
      .where(sql`${t.discogsArtistId} IS NOT NULL`),
    /**
     * §4.1: "matching `discogs_artist_id` — §4.1's find-or-create keys must
     * behave identically." Now that a name identifies nothing, this is the key
     * a re-import matches on.
     */
    uniqueIndex('artists_musicbrainz_id_key')
      .on(t.musicbrainzId)
      .where(sql`${t.musicbrainzId} IS NOT NULL`),
    index('artists_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);

export const genres = pgTable(
  'genres',
  {
    id,
    name: text('name').notNull().unique(),
    // Self-referencing. Cycle prevention is an application concern (§4.1); the
    // FK exists so step 4's guard has something to enforce against.
    parentGenreId: uuid('parent_genre_id').references((): AnyPgColumn => genres.id),
    description: text('description'),
    ...timestamps,
  },
  (t) => [index('genres_parent_genre_id_idx').on(t.parentGenreId)],
);

export const labels = pgTable(
  'labels',
  {
    id,
    name: text('name').notNull().unique(),
    notes: text('notes'),
    discogsLabelId: integer('discogs_label_id'),
    ...timestamps,
  },
  (t) => [
    // Partial unique index, matching artists.discogs_artist_id and
    // pressings.discogs_release_id. SPEC.md §4.1 requires all three to behave
    // identically: they are the find-or-create keys for §5.7 import, and
    // without uniqueness the import can create duplicate labels for one
    // Discogs entity. A partial unique index also serves the lookups the plain
    // index was there for, so no separate index is needed.
    uniqueIndex('labels_discogs_label_id_key')
      .on(t.discogsLabelId)
      .where(sql`${t.discogsLabelId} IS NOT NULL`),
  ],
);

export const formats = pgTable('formats', {
  id,
  name: text('name').notNull().unique(),
  // SPEC.md §4.1: true for the seven rows seeded by migration 0000. Never set
  // through the API — a seeded row cannot be deleted even when unreferenced,
  // because nothing re-seeds it. Identified by this column and never by name,
  // since PATCH may rename a seeded row and a name-matched guard would then
  // stop protecting it silently.
  isSeeded: boolean('is_seeded').notNull().default(false),
  ...timestamps,
});

export const recordStores = pgTable('record_stores', {
  id,
  name: text('name').notNull(),
  city: text('city'),
  stateRegion: text('state_region'),
  country: text('country'),
  address: text('address'),
  website: text('website'),
  notes: text('notes'),
  isFavorite: boolean('is_favorite').notNull().default(false),
  ...timestamps,
});

export const tags = pgTable('tags', {
  id,
  name: text('name').notNull().unique(),
  ...timestamps,
});

// --- 4.2 Core tables --------------------------------------------------------

export const pressings = pgTable(
  'pressings',
  {
    id,
    catalogNumber: text('catalog_number'),
    matrixRunout: text('matrix_runout'),
    pressingPlant: text('pressing_plant'),
    yearPressed: integer('year_pressed'),
    countryPressed: text('country_pressed'),
    vinylWeightGrams: integer('vinyl_weight_grams'),
    colorVariant: text('color_variant'),
    discogsReleaseId: integer('discogs_release_id'),
    isReissue: boolean('is_reissue').notNull().default(false),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    // The partial unique index covers the same column, so a separate plain
    // index is redundant write cost for no read benefit (SPEC.md §4.4 asks for
    // an index on this column, not two).
    uniqueIndex('pressings_discogs_release_id_key')
      .on(t.discogsReleaseId)
      .where(sql`${t.discogsReleaseId} IS NOT NULL`),
  ],
);

export const records = pgTable(
  'records',
  {
    id,
    userId: uuid('user_id'),
    title: text('title').notNull(),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id),
    labelId: uuid('label_id').references(() => labels.id),
    formatId: uuid('format_id').references(() => formats.id),
    pressingId: uuid('pressing_id').references(() => pressings.id),
    storeId: uuid('store_id').references(() => recordStores.id),
    releaseYear: integer('release_year'),
    conditionMedia: conditionGrade('condition_media'),
    conditionSleeve: conditionGrade('condition_sleeve'),
    purchasePrice: numeric('purchase_price', { precision: 10, scale: 2 }),
    purchaseDate: date('purchase_date'),
    notes: text('notes'),
    /**
     * §10b: "a spine's colour is the average colour of its cover, computed once
     * at import and stored."
     *
     * On `records` rather than `images`, because the spine is a property of the
     * record AS SHELVED. Deriving it from an image row would need a rule for
     * which cover wins the moment a second one is uploaded, and the shelf would
     * change colour when someone photographs a sleeve.
     *
     * `#rrggbb` lowercase, or NULL for a record with no cover — §10b calls that
     * "a plain spine, an honest absence, not a gap in the wall". NULL and
     * "black" must stay distinguishable, which is why there is no default.
     *
     * Stored rather than computed per render: decoding every cover on every
     * page load would be absurd, and §10b says once, at import.
     */
    spineColour: text('spine_colour'),

    /**
     * SPEC.md §10b's generated note about the album (§4.2). Nullable, and
     * absence is normal — a record with no snippet shows none.
     */
    snippet: text('snippet'),

    /**
     * §4.2: what makes §7.8 enforceable here. Null means the text is as
     * generated and a regeneration may replace it; non-null means the USER owns
     * it, and a regeneration must refuse unless they explicitly confirm the
     * replacement (A31a).
     *
     * A TIMESTAMP rather than a boolean, and §4.2 gives the reason: `false`
     * would mean both "generated" and "never asked", which are different facts
     * that become indistinguishable at write time.
     *
     * These two columns reached §4.2 with A4 and never reached the schema —
     * three steps of spec describing storage that did not exist (NOTES).
     */
    snippetEditedAt: timestamp('snippet_edited_at', { withTimezone: true }),
    ...timestamps,
  },
  // No unique constraint on (artist_id, title): duplicate records are legal and
  // expected (SPEC.md §4 schema-wide rules).
  (t) => [
    index('records_artist_id_idx').on(t.artistId),
    index('records_label_id_idx').on(t.labelId),
    index('records_format_id_idx').on(t.formatId),
    index('records_pressing_id_idx').on(t.pressingId),
    index('records_store_id_idx').on(t.storeId),
    index('records_purchase_date_idx').on(t.purchaseDate),
    index('records_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
  ],
);

export const wantList = pgTable(
  'want_list',
  {
    id,
    userId: uuid('user_id'),
    title: text('title').notNull(),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id),
    labelId: uuid('label_id').references(() => labels.id),
    priority: integer('priority').notNull().default(3),
    targetPressingId: uuid('target_pressing_id').references(() => pressings.id),
    bestDigNotes: text('best_dig_notes'),
    maxPrice: numeric('max_price', { precision: 10, scale: 2 }),
    acquiredRecordId: uuid('acquired_record_id').references(() => records.id),
    isAcquired: boolean('is_acquired').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('want_list_artist_id_idx').on(t.artistId),
    index('want_list_label_id_idx').on(t.labelId),
    index('want_list_target_pressing_id_idx').on(t.targetPressingId),
    index('want_list_acquired_record_id_idx').on(t.acquiredRecordId),
    /**
     * §4.2 and §7.3: a record fulfils AT MOST ONE want-list entry. Two entries
     * pointing at one record would give it two contradictory acquisition
     * histories, and §7.3 makes the want list exactly that history.
     *
     * PARTIAL, and the predicate is the design rather than an optimisation:
     * duplicate UNACQUIRED entries stay legal, because wanting two copies or
     * the same album in two pressings is a real intention (§4) and each is
     * fulfilled by its own record. A blanket unique index would forbid that.
     *
     * §5.7's import is what made the violation reachable — importing the same
     * release to the want list twice creates two rows.
     */
    uniqueIndex('want_list_acquired_record_id_unique')
      .on(t.acquiredRecordId)
      .where(sql`${t.acquiredRecordId} IS NOT NULL`),
    // Partial: the want list is almost always queried for what is still wanted.
    index('want_list_priority_idx')
      .on(t.priority)
      .where(sql`${t.isAcquired} = false`),
  ],
);

export const priceHistory = pgTable(
  'price_history',
  {
    id,
    // ON DELETE CASCADE per SPEC.md §4.2: append-only restricts UPDATE, not
    // DELETE (§7.5), and without cascade a record with any price history could
    // never be deleted at all — breaking DELETE /api/records/:id (§5.2). Price
    // history is a property of its parent.
    recordId: uuid('record_id').references(() => records.id, { onDelete: 'cascade' }),
    wantListId: uuid('want_list_id').references(() => wantList.id, { onDelete: 'cascade' }),
    // NOT cascaded: a pressing is a shared reference row, not this row's parent.
    pressingId: uuid('pressing_id').references(() => pressings.id),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    // NOT NULL per §4.2: §7.6's fallback chain has no defined behavior for an
    // untyped price.
    priceType: priceType('price_type').notNull(),
    source: text('source'),
    // §4.2 exempts this table from the created_at/updated_at rule: recorded_at
    // is its only timestamp. created_at would duplicate it, and updated_at is
    // meaningless on an append-only table.
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('price_history_record_id_idx').on(t.recordId),
    index('price_history_want_list_id_idx').on(t.wantListId),
    index('price_history_pressing_id_idx').on(t.pressingId),
    index('price_history_recorded_at_idx').on(t.recordedAt),
    // Exactly one parent — XOR, so both-set and neither-set are both rejected.
    check(
      'price_history_one_parent',
      sql`(${t.recordId} IS NOT NULL) <> (${t.wantListId} IS NOT NULL)`,
    ),
  ],
);

export const images = pgTable(
  'images',
  {
    id,
    recordId: uuid('record_id').references(() => records.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    imageType: imageType('image_type'),
    caption: text('caption'),
    ...timestamps,
  },
  (t) => [index('images_record_id_idx').on(t.recordId)],
);

// No updated_at: §4.2 specifies only fetched_at for this table.
export const discogsCache = pgTable('discogs_cache', {
  id,
  discogsReleaseId: integer('discogs_release_id').notNull().unique(),
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * §10a: marketplace figures, cached separately from release detail.
 *
 * **Not `discogs_cache`.** That table is keyed by the same id but holds release
 * *detail*, which the §5.7 import path reads to build records — marketplace
 * figures stored under the same key would be handed to the importer as a
 * release payload.
 */
export const marketCache = pgTable('market_cache', {
  id,
  discogsReleaseId: integer('discogs_release_id').notNull().unique(),
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntries = pgTable(
  'journal_entries',
  {
    id,
    userId: uuid('user_id'),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    entryDate: date('entry_date')
      .notNull()
      .default(sql`CURRENT_DATE`),
    note: text('note').notNull(),
    ...timestamps,
  },
  (t) => [index('journal_entries_record_id_idx').on(t.recordId)],
);

// --- 4.3 Junction tables ----------------------------------------------------
// Composite PK, no separate id.

export const recordGenres = pgTable(
  'record_genres',
  {
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id),
  },
  (t) => [
    primaryKey({ columns: [t.recordId, t.genreId] }),
    index('record_genres_genre_id_idx').on(t.genreId),
  ],
);

export const wantListGenres = pgTable(
  'want_list_genres',
  {
    wantListId: uuid('want_list_id')
      .notNull()
      .references(() => wantList.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id),
  },
  (t) => [
    primaryKey({ columns: [t.wantListId, t.genreId] }),
    index('want_list_genres_genre_id_idx').on(t.genreId),
  ],
);

export const artistGenres = pgTable(
  'artist_genres',
  {
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id),
  },
  (t) => [
    primaryKey({ columns: [t.artistId, t.genreId] }),
    index('artist_genres_genre_id_idx').on(t.genreId),
  ],
);

export const recordTags = pgTable(
  'record_tags',
  {
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (t) => [
    primaryKey({ columns: [t.recordId, t.tagId] }),
    index('record_tags_tag_id_idx').on(t.tagId),
  ],
);

/**
 * §4.3 — MusicBrainz artist relation payloads, keyed by MBID.
 *
 * **Not `discogs_cache` or `market_cache`**: both are keyed by
 * `discogs_release_id`, and this holds a different entity type under a
 * different key. Writing artist relations into a release-keyed table is the
 * collision `market_cache` was created to avoid.
 */
/**
 * SPEC.md §12c (A44) — pairings the user has REJECTED, so they are never
 * proposed again.
 *
 * **A rejection is a first-class outcome, not an absence.** Without this, a
 * user who declines "UK82 under Rock" is offered it again on the next run, and
 * a feature that must be dismissed repeatedly is one nobody uses twice — the
 * noise argument A37's variant limit and the §9.2 dismissal decline both turn
 * on.
 *
 * **Cheap here where §9.2's dismissal state was not, and the difference is
 * identity.** A dismissed SUGGESTION names a record that is neither owned nor
 * wanted, so it has no row to point at and would need `(artist, title)` string
 * matching — brittle, and failing OPEN. Both halves of a genre pairing are real
 * rows with real ids, so this is a join table over two foreign keys.
 *
 * **`ON DELETE CASCADE` on both.** A rejection is a fact ABOUT a pair of
 * genres; if either is deleted the rejection is meaningless, and keeping it
 * would resurrect as a dangling row the moment a name was reused.
 */
export const genreParentRejections = pgTable(
  'genre_parent_rejections',
  {
    id,
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
    rejectedParentId: uuid('rejected_parent_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per pairing: rejecting the same pair twice is the same fact.
    unique('genre_parent_rejections_pair_key').on(t.genreId, t.rejectedParentId),
    index('genre_parent_rejections_genre_id_idx').on(t.genreId),
    /*
     * §4.4: every FK column indexed. Not decoration here — BOTH columns cascade
     * on delete, so removing a genre scans this table by whichever side it
     * appears on, and the unique index above only serves lookups leading with
     * `genre_id`.
     */
    index('genre_parent_rejections_rejected_parent_id_idx').on(t.rejectedParentId),
  ],
);

/**
 * SPEC.md §9.2 (A39) — the last gap analysis, kept for DISPLAY.
 *
 * **A record of what was said, never a cache.** Nothing is served from here in
 * place of a request the user made: "Suggest" always performs a fresh call. A
 * button that silently returned a previous answer would lie about what it did,
 * and one that refused the call would give the user nothing for the click.
 * Persisting removes the REASON to re-ask rather than intercepting the ask.
 *
 * **Why it exists:** the result used to live in component state, so navigating
 * away destroyed it, and seeing the same answer again meant spending one of ten
 * hourly requests to be told what you had already been told.
 *
 * **Suggestions are stored as JSON, deliberately.** They are the model's
 * output, not the app's data: nothing joins to them and nothing queries inside
 * them. Giving them columns would invite exactly that — a schema implying these
 * are facts about the collection rather than a transcript of one answer. §9.2's
 * rule that a suggestion never becomes a row in the collection is untouched and
 * enforced elsewhere; this table is not the collection.
 *
 * **One row.** The screen shows the last analysis, so a superseded one is
 * debris. `storeGapAnalysis` deletes before inserting rather than relying on a
 * scheduled cleanup — the same reasoning §4.3 gives for rows carrying their own
 * timestamps: no job exists to fail.
 */
export const gapAnalysisResults = pgTable('gap_analysis_results', {
  id,
  /** When the call was made — what the UI shows as "asked N minutes ago". */
  askedAt: timestamp('asked_at', { withTimezone: true }).notNull().defaultNow(),
  /** The model's suggestions, exactly as parsed and validated (A29d). */
  suggestions: jsonb('suggestions').notNull(),
  /** A29d's count of suggestions discarded for an out-of-vocabulary genre. */
  dropped: integer('dropped').notNull().default(0),
});


/**
 * §4.3 `llm_requests` — one row per outbound Anthropic request, for §9.2's and
 * §10b's shared 10/hour rate limit.
 *
 * **A log, not a counter.** A single mutable `count` row needs resetting on a
 * schedule nothing runs, and answers "how many this hour" only if that reset
 * fired. Rows carry their own timestamps, so the window is a `WHERE` clause and
 * there is no scheduled job to fail. Old rows may be deleted at any time or
 * never — the query is correct either way.
 *
 * **Both callers share one budget**, because they spend the same account. Two
 * independent 10/hour limits would be a 20/hour limit nobody specified. `kind`
 * records which asked, for diagnosis, and takes no part in the count.
 */
export const llmRequests = pgTable(
  'llm_requests',
  {
    id,
    kind: text('kind').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * When the call finished, or NULL if it never did.
     *
     * **Step 16: the only way a serverless timeout can give its slot back.**
     * A function killed at `maxDuration` runs no `finally` and no cleanup —
     * the isolate simply stops — so `releaseLlmRequest` cannot be reached on
     * the path that most needs it. R6 finding 5. A claim with no completion is
     * therefore the timeout signature, and `claimLlmRequest` stops counting it
     * once it is older than the function ceiling.
     *
     * Nullable rather than defaulted: NULL is the load-bearing state here, and
     * a default would erase the distinction the column exists to record.
     */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /**
     * What the call COST, recorded on success as well as failure (A38).
     *
     * **NEVER READ BY THE LIMITER, and this is a rule rather than a
     * description.** It will look wrong to someone reasonably concluding that
     * tokens are a better quota than requests — a request that returns 4,000
     * tokens plainly costs more than one returning 200, so counting requests
     * looks like a crude proxy for the thing that actually matters.
     *
     * **It is not a proxy. The quota protects a REQUEST budget agreed with
     * Anthropic, not a token budget.** §9.2 says ten requests an hour, and
     * swapping the unit silently changes what "ten" means: a user who asked ten
     * cheap questions would find themselves with capacity left over under one
     * rule and exhausted under the other, and nothing in the UI or the spec
     * would explain the difference. Metering on tokens is a different feature
     * with a different agreement behind it, and it needs its own specification
     * before any of these columns gates anything.
     *
     * These exist to answer "how has this changed over time" — whether output
     * grows with the collection, and whether A37's six-suggestion count still
     * leaves the headroom it was estimated to leave. A log line answers "what
     * happened just now"; a column answers the question that outlives the
     * incident.
     *
     * **Nullable, never defaulted.** Rows predating this migration have unknown
     * usage, not zero usage, and a `DEFAULT 0` would fabricate a measurement
     * for a call nobody measured. Same reasoning as `completed_at` above, and
     * the same distinction as the two rows whose NULL means "this predates the
     * question".
     */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /** `end_turn` finished; `max_tokens` ran out of room. NULL if unreported. */
    stopReason: text('stop_reason'),
  },
  (t) => [index('llm_requests_requested_at_idx').on(t.requestedAt)],
);

export const musicbrainzCache = pgTable('musicbrainz_cache', {
  id,
  musicbrainzId: text('musicbrainz_id').notNull().unique(),
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * §4.3 — a possible duplicate artist, recorded rather than asked about
 * mid-import.
 *
 * **A table, not a column on `artists`, for two reasons the spec states.** A
 * column holds ONE candidate and an imported name may match two hand-entered
 * rows — a column would silently drop one. And the decision must persist:
 * "these are distinct" has to be remembered or every re-import asks again,
 * whereas a column would be nulled on resolution, losing the fact that it was
 * ever answered.
 */
export const artistMatchCandidates = pgTable(
  'artist_match_candidates',
  {
    id,
    /** The row the import just created. */
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    /** The existing local row it might be the same as. */
    candidateArtistId: uuid('candidate_artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** `merged` | `distinct`, once the user has decided. */
    resolution: text('resolution'),
    ...timestamps,
  },
  (t) => [
    // §4.3: "so a re-import raises nothing new." NULLS NOT DISTINCT for the
    // reason unit 3 established — without it the clause does not fire and each
    // pass adds a duplicate silently.
    unique('artist_match_candidates_pair_reason_key')
      .on(t.artistId, t.candidateArtistId, t.reason)
      .nullsNotDistinct(),
    index('artist_match_candidates_candidate_artist_id_idx').on(t.candidateArtistId),
    check(
      'artist_match_candidates_no_self_match',
      sql`${t.artistId} <> ${t.candidateArtistId}`,
    ),
  ],
);

/**
 * §4.3 — a person's membership of a group, imported from MusicBrainz.
 *
 * **A fact with a source, deliberately not `artist_influences`.** MusicBrainz
 * has no influence relationship; mapping membership onto influence would fill a
 * 1-5 `strength` with a number nobody measured. §8.1's graph draws the two
 * differently because they mean different things.
 *
 * **A surrogate id plus a UNIQUE constraint, not the composite PK §4.3
 * describes.** Postgres forbids a nullable column in a primary key, and
 * `instrument` is nullable — MusicBrainz omits it routinely. The identity rule
 * §4.3 asks for is preserved by the constraint below; only its mechanism
 * differs, and every other table here already carries a uuid `id`.
 */
export const artistMemberships = pgTable(
  'artist_memberships',
  {
    id,
    personArtistId: uuid('person_artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    groupArtistId: uuid('group_artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    instrument: text('instrument'),
    beganYear: integer('began_year'),
    endedYear: integer('ended_year'),
    musicbrainzId: text('musicbrainz_id'),
    ...timestamps,
  },
  (t) => [
    /**
     * **`NULLS NOT DISTINCT`, and it is load-bearing.**
     *
     * §4.3 identifies a membership by (person, group, instrument), and
     * `instrument` is null whenever MusicBrainz does not record one. Under
     * Postgres' DEFAULT semantics two NULLs are distinct, so this constraint
     * would not see two null-instrument rows for the same pair as conflicting:
     * `ON CONFLICT DO NOTHING` would never fire and every re-import would
     * insert another copy. Measured on Postgres 16.14 — default yields 2 rows,
     * this yields 1.
     *
     * The failure that avoids is silent: nothing errors, the import
     * "succeeds", and the pair is weighted more heavily in the graph on every
     * pass. A cache that looks like it is working while the data drifts.
     */
    unique('artist_memberships_person_group_instrument_key')
      .on(t.personArtistId, t.groupArtistId, t.instrument)
      .nullsNotDistinct(),
    index('artist_memberships_group_artist_id_idx').on(t.groupArtistId),
    check(
      'artist_memberships_no_self_membership',
      sql`${t.personArtistId} <> ${t.groupArtistId}`,
    ),
  ],
);

export const artistInfluences = pgTable(
  'artist_influences',
  {
    sourceArtistId: uuid('source_artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    targetArtistId: uuid('target_artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    strength: integer('strength').notNull().default(1),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.sourceArtistId, t.targetArtistId] }),
    index('artist_influences_target_artist_id_idx').on(t.targetArtistId),
    check('artist_influences_no_self_edge', sql`${t.sourceArtistId} <> ${t.targetArtistId}`),
  ],
);
