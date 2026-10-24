CREATE TABLE "record_moods" (
	"record_id" uuid PRIMARY KEY NOT NULL,
	"moods" text[] NOT NULL,
	"tagged_at" timestamp with time zone NOT NULL,
	"tagged_by_model" text,
	"overridden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "record_moods_one_to_four" CHECK (cardinality("record_moods"."moods") BETWEEN 1 AND 4)
);
--> statement-breakpoint
ALTER TABLE "record_moods" ADD CONSTRAINT "record_moods_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;