CREATE TABLE "app_latches" (
	"name" text PRIMARY KEY NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
