import { relations } from 'drizzle-orm';
import {
  artistGenres,
  artistInfluences,
  artists,
  discogsCache,
  formats,
  genres,
  images,
  journalEntries,
  labels,
  priceHistory,
  pressings,
  recordGenres,
  recordStores,
  recordTags,
  records,
  tags,
  wantList,
  wantListGenres,
} from './schema';

/**
 * Drizzle relations for every FK in SPEC.md §4. These drive the hydrated reads
 * in §5.2 (record detail returns artist, label, format, store, pressing,
 * genres, tags, images, journal entries) and §5.3.
 *
 * `discogs_cache` has no relations: it is keyed by Discogs release id, not by a
 * FK into our tables (§4.2).
 */

export const artistsRelations = relations(artists, ({ many }) => ({
  records: many(records),
  wantList: many(wantList),
  artistGenres: many(artistGenres),
  influencesAsSource: many(artistInfluences, { relationName: 'influenceSource' }),
  influencesAsTarget: many(artistInfluences, { relationName: 'influenceTarget' }),
}));

export const genresRelations = relations(genres, ({ one, many }) => ({
  parent: one(genres, {
    fields: [genres.parentGenreId],
    references: [genres.id],
    relationName: 'genreHierarchy',
  }),
  children: many(genres, { relationName: 'genreHierarchy' }),
  recordGenres: many(recordGenres),
  wantListGenres: many(wantListGenres),
  artistGenres: many(artistGenres),
}));

export const labelsRelations = relations(labels, ({ many }) => ({
  records: many(records),
  wantList: many(wantList),
}));

export const formatsRelations = relations(formats, ({ many }) => ({
  records: many(records),
}));

export const recordStoresRelations = relations(recordStores, ({ many }) => ({
  records: many(records),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  recordTags: many(recordTags),
}));

export const pressingsRelations = relations(pressings, ({ many }) => ({
  records: many(records),
  wantListTargets: many(wantList),
  priceHistory: many(priceHistory),
}));

export const recordsRelations = relations(records, ({ one, many }) => ({
  artist: one(artists, { fields: [records.artistId], references: [artists.id] }),
  label: one(labels, { fields: [records.labelId], references: [labels.id] }),
  format: one(formats, { fields: [records.formatId], references: [formats.id] }),
  pressing: one(pressings, { fields: [records.pressingId], references: [pressings.id] }),
  store: one(recordStores, { fields: [records.storeId], references: [recordStores.id] }),
  recordGenres: many(recordGenres),
  recordTags: many(recordTags),
  images: many(images),
  journalEntries: many(journalEntries),
  priceHistory: many(priceHistory),
  // The want-list row this record fulfilled, if any (§7.3).
  fulfilledWantList: many(wantList, { relationName: 'acquiredRecord' }),
}));

export const wantListRelations = relations(wantList, ({ one, many }) => ({
  artist: one(artists, { fields: [wantList.artistId], references: [artists.id] }),
  label: one(labels, { fields: [wantList.labelId], references: [labels.id] }),
  // The "best dig" — highest-fidelity pressing worth hunting, not the cheapest.
  targetPressing: one(pressings, {
    fields: [wantList.targetPressingId],
    references: [pressings.id],
  }),
  acquiredRecord: one(records, {
    fields: [wantList.acquiredRecordId],
    references: [records.id],
    relationName: 'acquiredRecord',
  }),
  wantListGenres: many(wantListGenres),
  priceHistory: many(priceHistory),
}));

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  record: one(records, { fields: [priceHistory.recordId], references: [records.id] }),
  wantList: one(wantList, { fields: [priceHistory.wantListId], references: [wantList.id] }),
  pressing: one(pressings, { fields: [priceHistory.pressingId], references: [pressings.id] }),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  record: one(records, { fields: [images.recordId], references: [records.id] }),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one }) => ({
  record: one(records, { fields: [journalEntries.recordId], references: [records.id] }),
}));

export const recordGenresRelations = relations(recordGenres, ({ one }) => ({
  record: one(records, { fields: [recordGenres.recordId], references: [records.id] }),
  genre: one(genres, { fields: [recordGenres.genreId], references: [genres.id] }),
}));

export const wantListGenresRelations = relations(wantListGenres, ({ one }) => ({
  wantList: one(wantList, { fields: [wantListGenres.wantListId], references: [wantList.id] }),
  genre: one(genres, { fields: [wantListGenres.genreId], references: [genres.id] }),
}));

export const artistGenresRelations = relations(artistGenres, ({ one }) => ({
  artist: one(artists, { fields: [artistGenres.artistId], references: [artists.id] }),
  genre: one(genres, { fields: [artistGenres.genreId], references: [genres.id] }),
}));

export const recordTagsRelations = relations(recordTags, ({ one }) => ({
  record: one(records, { fields: [recordTags.recordId], references: [records.id] }),
  tag: one(tags, { fields: [recordTags.tagId], references: [tags.id] }),
}));

export const artistInfluencesRelations = relations(artistInfluences, ({ one }) => ({
  // Directed: source influenced target, never the reverse by implication.
  sourceArtist: one(artists, {
    fields: [artistInfluences.sourceArtistId],
    references: [artists.id],
    relationName: 'influenceSource',
  }),
  targetArtist: one(artists, {
    fields: [artistInfluences.targetArtistId],
    references: [artists.id],
    relationName: 'influenceTarget',
  }),
}));

export const discogsCacheRelations = relations(discogsCache, () => ({}));
