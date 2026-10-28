CREATE TABLE "discogs_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report" jsonb NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
