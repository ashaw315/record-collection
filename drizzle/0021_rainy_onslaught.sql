CREATE TABLE "pressing_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"want_list_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"pressings" jsonb NOT NULL,
	"dropped" integer DEFAULT 0 NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pressing_assessments_want_list_id_unique" UNIQUE("want_list_id")
);
--> statement-breakpoint
ALTER TABLE "pressing_assessments" ADD CONSTRAINT "pressing_assessments_want_list_id_want_list_id_fk" FOREIGN KEY ("want_list_id") REFERENCES "public"."want_list"("id") ON DELETE cascade ON UPDATE no action;