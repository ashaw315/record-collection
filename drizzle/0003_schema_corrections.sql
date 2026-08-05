-- SPEC.md §4.1/§4.2 corrections that were specified after step 2 was built.
--
-- 1. price_history.record_id / want_list_id -> ON DELETE CASCADE (§4.2). The
--    urgent one: without it a record with ANY price history could never be
--    deleted, breaking DELETE /api/records/:id (§5.2) before step 5 is written.
--    Append-only restricts UPDATE, not DELETE (§7.5). pressing_id is
--    deliberately NOT cascaded — a pressing is a shared reference row, not this
--    row's parent.
-- 2. price_history.price_type -> NOT NULL (§4.2): §7.6's fallback chain has no
--    defined behavior for an untyped price.
-- 3. DROP price_history.created_at / updated_at (§4.2). DESTRUCTIVE, and
--    verified safe before writing: the table holds 0 rows, no code reads either
--    column, and the only trigger on the table is reject_price_history_update.
--    recorded_at is its only timestamp; created_at duplicated it and updated_at
--    is meaningless on an append-only table.
-- 4. labels.discogs_label_id -> partial unique index (§4.1), matching
--    artists.discogs_artist_id and pressings.discogs_release_id. All three are
--    §5.7 find-or-create keys and must behave identically; without uniqueness
--    the import can create duplicate labels for one Discogs entity.
-- 5. DROP the redundant plain index on pressings.discogs_release_id: the
--    partial unique index covers the same column.

ALTER TABLE "price_history" DROP CONSTRAINT "price_history_record_id_records_id_fk";
--> statement-breakpoint
ALTER TABLE "price_history" DROP CONSTRAINT "price_history_want_list_id_want_list_id_fk";
--> statement-breakpoint
DROP INDEX "labels_discogs_label_id_idx";--> statement-breakpoint
DROP INDEX "pressings_discogs_release_id_idx";--> statement-breakpoint
ALTER TABLE "price_history" ALTER COLUMN "price_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_want_list_id_want_list_id_fk" FOREIGN KEY ("want_list_id") REFERENCES "public"."want_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_discogs_label_id_key" ON "labels" USING btree ("discogs_label_id") WHERE "labels"."discogs_label_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "price_history" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "price_history" DROP COLUMN "updated_at";