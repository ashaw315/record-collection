-- SPEC.md §7.5: price history is append-only. Corrections arrive as new rows,
-- never as edits, so a price series stays an accurate record of what was
-- observed and when. Enforced in the database because a convention the query
-- layer is merely trusted to honour is one bad UPDATE away from silently
-- rewriting history.

-- set_updated_at implies rows are expected to change, which contradicts the
-- rule and could never fire once UPDATE is blocked.
DROP TRIGGER IF EXISTS price_history_set_updated_at ON price_history;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_price_history_update() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'price_history is append-only (SPEC.md 7.5): UPDATE is not permitted, insert a new row instead'
		USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER price_history_reject_update
	BEFORE UPDATE ON price_history
	FOR EACH ROW
	EXECUTE FUNCTION reject_price_history_update();
