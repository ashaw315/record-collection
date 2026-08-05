CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."condition_grade" AS ENUM('M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P');--> statement-breakpoint
CREATE TYPE "public"."image_type" AS ENUM('cover', 'back', 'label', 'matrix', 'other');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('new', 'used', 'best_dig');--> statement-breakpoint
CREATE TABLE "artist_genres" (
	"artist_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "artist_genres_artist_id_genre_id_pk" PRIMARY KEY("artist_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "artist_influences" (
	"source_artist_id" uuid NOT NULL,
	"target_artist_id" uuid NOT NULL,
	"strength" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_influences_source_artist_id_target_artist_id_pk" PRIMARY KEY("source_artist_id","target_artist_id"),
	CONSTRAINT "artist_influences_no_self_edge" CHECK ("artist_influences"."source_artist_id" <> "artist_influences"."target_artist_id")
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"formed_year" integer,
	"origin_country" text,
	"notes" text,
	"discogs_artist_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artists_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "discogs_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discogs_release_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discogs_cache_discogs_release_id_unique" UNIQUE("discogs_release_id")
);
--> statement-breakpoint
CREATE TABLE "formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formats_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_genre_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "genres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid,
	"url" text NOT NULL,
	"image_type" "image_type",
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"record_id" uuid NOT NULL,
	"entry_date" date DEFAULT CURRENT_DATE NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"discogs_label_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "pressings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_number" text,
	"matrix_runout" text,
	"pressing_plant" text,
	"year_pressed" integer,
	"country_pressed" text,
	"vinyl_weight_grams" integer,
	"color_variant" text,
	"discogs_release_id" integer,
	"is_reissue" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid,
	"want_list_id" uuid,
	"pressing_id" uuid,
	"price" numeric(10, 2) NOT NULL,
	"price_type" "price_type",
	"source" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_history_one_parent" CHECK (("price_history"."record_id" IS NOT NULL) <> ("price_history"."want_list_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "record_genres" (
	"record_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "record_genres_record_id_genre_id_pk" PRIMARY KEY("record_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "record_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state_region" text,
	"country" text,
	"address" text,
	"website" text,
	"notes" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_tags" (
	"record_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "record_tags_record_id_tag_id_pk" PRIMARY KEY("record_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"title" text NOT NULL,
	"artist_id" uuid NOT NULL,
	"label_id" uuid,
	"format_id" uuid,
	"pressing_id" uuid,
	"store_id" uuid,
	"release_year" integer,
	"condition_media" "condition_grade",
	"condition_sleeve" "condition_grade",
	"purchase_price" numeric(10, 2),
	"purchase_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "want_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"title" text NOT NULL,
	"artist_id" uuid NOT NULL,
	"label_id" uuid,
	"priority" integer DEFAULT 3 NOT NULL,
	"target_pressing_id" uuid,
	"best_dig_notes" text,
	"max_price" numeric(10, 2),
	"acquired_record_id" uuid,
	"is_acquired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "want_list_genres" (
	"want_list_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "want_list_genres_want_list_id_genre_id_pk" PRIMARY KEY("want_list_id","genre_id")
);
--> statement-breakpoint
ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_influences" ADD CONSTRAINT "artist_influences_source_artist_id_artists_id_fk" FOREIGN KEY ("source_artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_influences" ADD CONSTRAINT "artist_influences_target_artist_id_artists_id_fk" FOREIGN KEY ("target_artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genres" ADD CONSTRAINT "genres_parent_genre_id_genres_id_fk" FOREIGN KEY ("parent_genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_want_list_id_want_list_id_fk" FOREIGN KEY ("want_list_id") REFERENCES "public"."want_list"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_pressing_id_pressings_id_fk" FOREIGN KEY ("pressing_id") REFERENCES "public"."pressings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_genres" ADD CONSTRAINT "record_genres_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_genres" ADD CONSTRAINT "record_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_tags" ADD CONSTRAINT "record_tags_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_tags" ADD CONSTRAINT "record_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_pressing_id_pressings_id_fk" FOREIGN KEY ("pressing_id") REFERENCES "public"."pressings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_store_id_record_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."record_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "want_list" ADD CONSTRAINT "want_list_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "want_list" ADD CONSTRAINT "want_list_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "want_list" ADD CONSTRAINT "want_list_target_pressing_id_pressings_id_fk" FOREIGN KEY ("target_pressing_id") REFERENCES "public"."pressings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "want_list" ADD CONSTRAINT "want_list_acquired_record_id_records_id_fk" FOREIGN KEY ("acquired_record_id") REFERENCES "public"."records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "want_list_genres" ADD CONSTRAINT "want_list_genres_want_list_id_want_list_id_fk" FOREIGN KEY ("want_list_id") REFERENCES "public"."want_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "want_list_genres" ADD CONSTRAINT "want_list_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_genres_genre_id_idx" ON "artist_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "artist_influences_target_artist_id_idx" ON "artist_influences" USING btree ("target_artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artists_discogs_artist_id_key" ON "artists" USING btree ("discogs_artist_id") WHERE "artists"."discogs_artist_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "artists_name_trgm_idx" ON "artists" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "genres_parent_genre_id_idx" ON "genres" USING btree ("parent_genre_id");--> statement-breakpoint
CREATE INDEX "images_record_id_idx" ON "images" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "journal_entries_record_id_idx" ON "journal_entries" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "labels_discogs_label_id_idx" ON "labels" USING btree ("discogs_label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pressings_discogs_release_id_key" ON "pressings" USING btree ("discogs_release_id") WHERE "pressings"."discogs_release_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pressings_discogs_release_id_idx" ON "pressings" USING btree ("discogs_release_id");--> statement-breakpoint
CREATE INDEX "price_history_record_id_idx" ON "price_history" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "price_history_want_list_id_idx" ON "price_history" USING btree ("want_list_id");--> statement-breakpoint
CREATE INDEX "price_history_pressing_id_idx" ON "price_history" USING btree ("pressing_id");--> statement-breakpoint
CREATE INDEX "price_history_recorded_at_idx" ON "price_history" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "record_genres_genre_id_idx" ON "record_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "record_tags_tag_id_idx" ON "record_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "records_artist_id_idx" ON "records" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "records_label_id_idx" ON "records" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "records_format_id_idx" ON "records" USING btree ("format_id");--> statement-breakpoint
CREATE INDEX "records_pressing_id_idx" ON "records" USING btree ("pressing_id");--> statement-breakpoint
CREATE INDEX "records_store_id_idx" ON "records" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "records_purchase_date_idx" ON "records" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "records_title_trgm_idx" ON "records" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "want_list_artist_id_idx" ON "want_list" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "want_list_label_id_idx" ON "want_list" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "want_list_target_pressing_id_idx" ON "want_list" USING btree ("target_pressing_id");--> statement-breakpoint
CREATE INDEX "want_list_acquired_record_id_idx" ON "want_list" USING btree ("acquired_record_id");--> statement-breakpoint
CREATE INDEX "want_list_priority_idx" ON "want_list" USING btree ("priority") WHERE "want_list"."is_acquired" = false;--> statement-breakpoint
CREATE INDEX "want_list_genres_genre_id_idx" ON "want_list_genres" USING btree ("genre_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DO $$
DECLARE
	t text;
BEGIN
	-- One function, attached to every table carrying updated_at (SPEC.md §4).
	-- discogs_cache is excluded: it tracks fetched_at only.
	FOREACH t IN ARRAY ARRAY[
		'artists', 'genres', 'labels', 'formats', 'record_stores', 'tags',
		'pressings', 'records', 'want_list', 'price_history', 'images',
		'journal_entries', 'artist_influences'
	] LOOP
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
			t || '_set_updated_at', t
		);
	END LOOP;
END;
$$;--> statement-breakpoint
INSERT INTO "formats" ("name") VALUES
	('LP'), ('2xLP'), ('7"'), ('10"'), ('12" Single'), ('Box Set'), ('Picture Disc')
ON CONFLICT ("name") DO NOTHING;
