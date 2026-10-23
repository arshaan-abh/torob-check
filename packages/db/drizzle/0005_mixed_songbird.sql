ALTER TABLE "offer_current_facts" ADD COLUMN "price_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD COLUMN "price_valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD COLUMN "price_evidence_url" text;--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD COLUMN "stock_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD COLUMN "stock_valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD COLUMN "stock_evidence_url" text;--> statement-breakpoint
ALTER TABLE "offer_fact_observations" ADD COLUMN "fact_key" text DEFAULT 'offer' NOT NULL;