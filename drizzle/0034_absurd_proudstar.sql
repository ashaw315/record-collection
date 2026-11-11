CREATE TABLE "record_embeddings" (
	"record_id" uuid PRIMARY KEY NOT NULL,
	"about_hash" text NOT NULL,
	"model" text NOT NULL,
	"dims" integer NOT NULL,
	"vector" jsonb NOT NULL,
	"embedded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_embeddings" ADD CONSTRAINT "record_embeddings_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;