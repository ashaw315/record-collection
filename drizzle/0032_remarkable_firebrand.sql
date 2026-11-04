CREATE TABLE "discogs_release_text" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discogs_release_id" integer NOT NULL,
	"kind" text NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE INDEX "discogs_release_text_release_idx" ON "discogs_release_text" USING btree ("discogs_release_id");--> statement-breakpoint
CREATE INDEX "discogs_release_text_trgm_idx" ON "discogs_release_text" USING gin ("text" gin_trgm_ops);