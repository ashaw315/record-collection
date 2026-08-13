-- SPEC.md §10a, "Where it is cached".
--
-- A SEPARATE table from `discogs_cache`, deliberately. Both are keyed by
-- `discogs_release_id`, but `discogs_cache` holds release *detail* payloads
-- that the §5.7 import path reads to build records. Writing marketplace figures
-- under that key would hand the importer a price blob and let it build a record
-- from it.
--
-- Same 7-day freshness rule as §6, enforced in the query layer rather than
-- here: a stale row reads as a miss but is LEFT IN PLACE, so a Discogs outage
-- serves week-old figures rather than nothing. A DB-level expiry would delete
-- exactly the fallback that behaviour depends on.

CREATE TABLE "market_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discogs_release_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_cache_discogs_release_id_unique" UNIQUE("discogs_release_id")
);
