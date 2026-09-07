CREATE TABLE "artist_derived_acts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_artist_id" uuid NOT NULL,
	"derived_artist_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_derived_acts_pair_key" UNIQUE("origin_artist_id","derived_artist_id","kind"),
	CONSTRAINT "artist_derived_acts_no_self_reference" CHECK ("artist_derived_acts"."origin_artist_id" <> "artist_derived_acts"."derived_artist_id")
);
--> statement-breakpoint
ALTER TABLE "artist_derived_acts" ADD CONSTRAINT "artist_derived_acts_origin_artist_id_artists_id_fk" FOREIGN KEY ("origin_artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_derived_acts" ADD CONSTRAINT "artist_derived_acts_derived_artist_id_artists_id_fk" FOREIGN KEY ("derived_artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_derived_acts_derived_artist_id_idx" ON "artist_derived_acts" USING btree ("derived_artist_id");