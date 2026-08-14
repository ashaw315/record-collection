-- SPEC.md §4.3 — a possible duplicate artist, recorded rather than asked about
-- mid-import.
--
-- A TABLE, not a column on `artists`: a column holds one candidate, and an
-- imported name may match two hand-entered rows. And the decision must persist
-- -- "these are distinct" has to be remembered or every re-import asks again,
-- where a column would be nulled on resolution and lose the fact that it was
-- ever answered.
--
-- UNIQUE NULLS NOT DISTINCT so a re-import raises nothing new, for the reason
-- migration 0007 records: without the clause ON CONFLICT never fires on a null
-- and each pass accumulates a duplicate silently.

CREATE TABLE "artist_match_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"candidate_artist_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_match_candidates_pair_reason_key" UNIQUE NULLS NOT DISTINCT("artist_id","candidate_artist_id","reason"),
	CONSTRAINT "artist_match_candidates_no_self_match" CHECK ("artist_match_candidates"."artist_id" <> "artist_match_candidates"."candidate_artist_id")
);
--> statement-breakpoint
ALTER TABLE "artist_match_candidates" ADD CONSTRAINT "artist_match_candidates_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_match_candidates" ADD CONSTRAINT "artist_match_candidates_candidate_artist_id_artists_id_fk" FOREIGN KEY ("candidate_artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_match_candidates_candidate_artist_id_idx" ON "artist_match_candidates" USING btree ("candidate_artist_id");