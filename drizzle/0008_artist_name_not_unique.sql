-- SPEC.md §4.1 as amended.
--
-- **DESTRUCTIVE: drops a unique constraint.** Flagged and confirmed before
-- writing, per CLAUDE.md §7. It is effectively irreversible — once two artists
-- share a name the constraint cannot be restored without deciding which rows to
-- merge or delete, and that decision is exactly the one this change exists to
-- stop the database making silently.
--
-- Two different bands genuinely share a name: MusicBrainz carries two distinct
-- UK groups called Discharge (0c9bfbdc-... the d-beat band, a2ceee73-... a
-- different punk band with one release). A UNIQUE constraint on `name` asserts
-- they are one artist, which is §8's pressing-is-not-an-album hazard at the
-- artist level, and it fuses two bands' lineups and records with no error.
--
-- Uniqueness moves to the external ids, which identify an artist; a name does
-- not. `musicbrainz_id` matches `discogs_artist_id` exactly -- nullable, unique
-- when present via a partial index -- because §4.1 requires the find-or-create
-- keys to behave identically.
--
-- The duplicate WARNING is not dropped with the constraint: POST /api/artists
-- keeps its 409 with `existingId` and a count, and the client may override it.
-- A constraint the database enforced becomes a question the user answers.

ALTER TABLE "artists" DROP CONSTRAINT "artists_name_unique";--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "musicbrainz_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "artists_musicbrainz_id_key" ON "artists" USING btree ("musicbrainz_id") WHERE "artists"."musicbrainz_id" IS NOT NULL;