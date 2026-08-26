CREATE TABLE "gap_analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suggestions" jsonb NOT NULL,
	"dropped" integer DEFAULT 0 NOT NULL
);
