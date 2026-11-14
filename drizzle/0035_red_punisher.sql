CREATE TABLE "record_matched_text" (
	"record_id" uuid PRIMARY KEY NOT NULL,
	"generated" text,
	"generated_model" text,
	"generated_at" timestamp with time zone,
	"edited" text,
	"edited_at" timestamp with time zone,
	CONSTRAINT "record_matched_text_generated_not_blank" CHECK ("record_matched_text"."generated" IS NULL OR btrim("record_matched_text"."generated") <> ''),
	CONSTRAINT "record_matched_text_edited_not_blank" CHECK ("record_matched_text"."edited" IS NULL OR btrim("record_matched_text"."edited") <> '')
);
--> statement-breakpoint
ALTER TABLE "record_matched_text" ADD CONSTRAINT "record_matched_text_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;