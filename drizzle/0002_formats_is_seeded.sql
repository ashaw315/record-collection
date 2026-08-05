ALTER TABLE "formats" ADD COLUMN "is_seeded" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: the seven rows seeded by migration 0000 are the seeded set
-- (SPEC.md §4.1). Drizzle generates only the ADD COLUMN, which would leave every
-- existing row false and therefore unprotected — the guard would exist and
-- protect nothing.
--
-- Matching by name is correct HERE and only here: at this point in the migration
-- sequence no rename can have happened, because the column that makes renaming
-- observable is being introduced by this very statement. Everywhere after this,
-- seeded rows are identified by the column alone.
UPDATE "formats"
   SET "is_seeded" = true
 WHERE "name" IN ('LP', '2xLP', '7"', '10"', '12" Single', 'Box Set', 'Picture Disc');
