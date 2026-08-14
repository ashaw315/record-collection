-- SPEC.md §4.3 — a person's membership of a group, imported from MusicBrainz.
--
-- A FACT WITH A SOURCE, deliberately not written to `artist_influences`.
-- MusicBrainz has no influence relationship at all; mapping membership onto
-- influence would fill a 1-5 `strength` with a number nobody measured.
--
-- **UNIQUE NULLS NOT DISTINCT, and it is load-bearing.** §4.3 identifies a
-- membership by (person, group, instrument), and `instrument` is null whenever
-- MusicBrainz records no instrument. Under Postgres' DEFAULT semantics two
-- NULLs are distinct, so the constraint would not see two null-instrument rows
-- for the same pair as conflicting: `ON CONFLICT DO NOTHING` would never fire
-- and every re-import would insert another copy. Measured on Postgres 16.14 --
-- default yields 2 rows, this yields 1.
--
-- Step 11 is on-demand and cached, so re-import is the NORMAL path, and the
-- failure this prevents is silent: nothing errors, the import "succeeds", and
-- the pair gains weight in the graph on every pass.
--
-- A surrogate `id` rather than the composite PK §4.3 describes: Postgres
-- forbids a nullable column in a primary key. The identity rule is preserved by
-- the constraint; only its mechanism differs.

CREATE TABLE "artist_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_artist_id" uuid NOT NULL,
	"group_artist_id" uuid NOT NULL,
	"instrument" text,
	"began_year" integer,
	"ended_year" integer,
	"musicbrainz_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_memberships_person_group_instrument_key" UNIQUE NULLS NOT DISTINCT("person_artist_id","group_artist_id","instrument"),
	CONSTRAINT "artist_memberships_no_self_membership" CHECK ("artist_memberships"."person_artist_id" <> "artist_memberships"."group_artist_id")
);
--> statement-breakpoint
ALTER TABLE "artist_memberships" ADD CONSTRAINT "artist_memberships_person_artist_id_artists_id_fk" FOREIGN KEY ("person_artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_memberships" ADD CONSTRAINT "artist_memberships_group_artist_id_artists_id_fk" FOREIGN KEY ("group_artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_memberships_group_artist_id_idx" ON "artist_memberships" USING btree ("group_artist_id");