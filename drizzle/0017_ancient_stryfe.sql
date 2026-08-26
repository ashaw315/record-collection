ALTER TABLE "llm_requests" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "stop_reason" text;