ALTER TABLE "offer_current_facts" ADD COLUMN "price_source_type" "fact_source_type";--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD COLUMN "price_confirmation" "fact_confirmation";--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD COLUMN "stock_source_type" "fact_source_type";--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD COLUMN "stock_confirmation" "fact_confirmation";
--> statement-breakpoint
UPDATE "offer_current_facts"
SET "price_observed_at" = COALESCE("price_observed_at", "observed_at"),
    "price_valid_until" = COALESCE("price_valid_until", "valid_until"),
    "price_source_type" = COALESCE("price_source_type", "source_type"),
    "price_confirmation" = COALESCE("price_confirmation", "confirmation")
WHERE "price_toman" IS NOT NULL;
--> statement-breakpoint
UPDATE "offer_current_facts"
SET "stock_observed_at" = COALESCE("stock_observed_at", "observed_at"),
    "stock_valid_until" = COALESCE("stock_valid_until", "valid_until"),
    "stock_source_type" = COALESCE("stock_source_type", "source_type"),
    "stock_confirmation" = COALESCE("stock_confirmation", "confirmation")
WHERE "stock_status" <> 'unknown';
--> statement-breakpoint
INSERT INTO "offer_current_facts" (
  "offer_id", "price_toman", "stock_status", "source_type", "confirmation",
  "price_observed_at", "price_valid_until", "price_source_type", "price_confirmation"
)
SELECT "offer_id", "price_toman", 'unknown', 'catalog', 'public_unverified',
       "last_price_changed_at", "last_price_changed_at" + interval '24 hours', 'catalog', 'public_unverified'
FROM "offers"
WHERE "price_toman" IS NOT NULL
ON CONFLICT ("offer_id") DO UPDATE SET
  "price_toman" = EXCLUDED."price_toman",
  "price_observed_at" = EXCLUDED."price_observed_at",
  "price_valid_until" = EXCLUDED."price_valid_until",
  "price_source_type" = EXCLUDED."price_source_type",
  "price_confirmation" = EXCLUDED."price_confirmation"
WHERE "offer_current_facts"."price_toman" IS NULL;
--> statement-breakpoint
INSERT INTO "offer_fact_observations" (
  "offer_id", "fact_key", "price_toman", "stock_status", "source_type", "confirmation", "observed_at", "valid_until"
)
SELECT "offer_id", 'price', "price_toman", 'unknown', 'catalog', 'public_unverified',
       "last_price_changed_at", "last_price_changed_at" + interval '24 hours'
FROM "offers"
WHERE "price_toman" IS NOT NULL AND "last_price_changed_at" IS NOT NULL;
