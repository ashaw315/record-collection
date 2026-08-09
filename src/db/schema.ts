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
export const priceType = pgEnum('price_type', ['new', 'used', 'best_dig']);
export const imageType = pgEnum('image_type', ['cover', 'back', 'label', 'matrix', 'other']);

// --- 4.1 Reference tables ---------------------------------------------------

export const artists = pgTable(
  'artists',
  {
    id,
    name: text('name').notNull().unique(),
    formedYear: integer('formed_year'),
    originCountry: text('origin_country'),
    notes: text('notes'),
    discogsArtistId: integer('discogs_artist_id'),
    ...timestamps,
  },
  (t) => [
    // Unique only when present, per §4.1.
    uniqueIndex('artists_discogs_artist_id_key')
      .on(t.discogsArtistId)
      .where(sql`${t.discogsArtistId} IS NOT NULL`),
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
