CREATE TABLE "genre_parent_rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"genre_id" uuid NOT NULL,
	"rejected_parent_id" uuid NOT NULL,
	"rejected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "genre_parent_rejections_pair_key" UNIQUE("genre_id","rejected_parent_id")
);
--> statement-breakpoint
ALTER TABLE "genre_parent_rejections" ADD CONSTRAINT "genre_parent_rejections_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre_parent_rejections" ADD CONSTRAINT "genre_parent_rejections_rejected_parent_id_genres_id_fk" FOREIGN KEY ("rejected_parent_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "genre_parent_rejections_genre_id_idx" ON "genre_parent_rejections" USING btree ("genre_id");