-- SPEC.md §4.2 and §7's correction note: `price_type` never contains
-- `best_dig`. Its three values are `new`, `used` and `asking`.
--
-- WHY: `best_dig` describes a PRESSING — the highest-fidelity copy worth
-- hunting for — and putting it in a price enum models a pressing as a price.
-- That is exactly the conflation CLAUDE.md §8 and §7 rule 3 forbid, written
-- into the schema. A record displaying "£120.00 best dig" reads as "best
-- price", which is the error the rule exists to prevent.
--
-- DESTRUCTIVE TYPE CHANGE, flagged per CLAUDE.md §7 and confirmed before
-- writing. It loses no rows and no amounts: every existing `best_dig` row
-- becomes `asking`, which is the honest reading — a price somebody wanted and
-- nobody paid. Verified against the dev database beforehand: 3 rows totalling
-- £138.00, of which exactly one (£120.00) carries `best_dig`. Both figures are
-- re-checked after this runs.
--
-- Postgres cannot remove a value from an enum in place, so the type is
-- replaced. Forward-only (CLAUDE.md §7): 0000 created the original type and is
-- never edited.
--
-- `asking` is deliberately NOT part of §7.6's estimated-value chain
-- (`used` -> `new` -> `purchase_price`). A price nobody paid must not inflate a
-- headline figure — asserted in records-stats.test.ts.

CREATE TYPE "public"."price_type_new" AS ENUM('new', 'used', 'asking');--> statement-breakpoint

ALTER TABLE "price_history"
  ALTER COLUMN "price_type" TYPE "public"."price_type_new"
  USING (
    CASE "price_type"::text
      WHEN 'best_dig' THEN 'asking'
      ELSE "price_type"::text
    END
  )::"public"."price_type_new";--> statement-breakpoint

DROP TYPE "public"."price_type";--> statement-breakpoint

ALTER TYPE "public"."price_type_new" RENAME TO "price_type";
