-- SPEC.md §4.3 — MusicBrainz artist relation payloads, keyed by MBID.
--
-- NOT `discogs_cache` or `market_cache`: both are keyed by
-- `discogs_release_id`. This holds a different entity type under a different
-- key, and writing artist relations into a release-keyed table is the exact
-- collision `market_cache` was created to avoid.
--
-- **TTL is 90 DAYS, not the 7 used elsewhere** (enforced in the query layer).
-- Lineups change on the scale of years; prices change weekly. Inheriting §6's
-- rule would mean re-walking thirty-odd requests for a fact that has not moved
-- since 1982. The inconsistency is deliberate -- do not "fix" it to 7.
--
-- Stores the RAW payload, never the normalized relations: normalization is our
-- code and it changes, and caching its output would freeze today's decisions
-- into rows that outlive them by ninety days.
--
-- Keyed on the MBID rather than a local artist id, so the same person reached
-- through two different bands' lineups is one fetch.

CREATE TABLE "musicbrainz_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"musicbrainz_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "musicbrainz_cache_musicbrainz_id_unique" UNIQUE("musicbrainz_id")
);
