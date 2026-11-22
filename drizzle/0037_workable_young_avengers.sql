ALTER TABLE "record_matched_text" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "record_matched_text" ADD COLUMN "checks" jsonb;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "snippet_reviewed_at" timestamp with time zone;
-- Additive only, so Code may push it (Adam's ruling, 14 Nov; test/repo/migrations-additive.test.ts). The backfill of
-- these columns from the record of how each of the 55 texts was stored is a write to existing rows and is Adam's to
-- run: the statement, with its evidence row by row, is in NOTES ("22 Nov, midday"). Until he runs it every stored text
-- reads as unread, which is the honest state of a column nobody has yet filled.
