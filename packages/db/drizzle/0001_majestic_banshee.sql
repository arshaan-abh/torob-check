CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "offers_seller_title_trgm_idx" ON "offers" USING gin ("seller_title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "offers_description_trgm_idx" ON "offers" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_title_trgm_idx" ON "products" USING gin ("persian_title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_brand_trgm_idx" ON "products" USING gin ("brand_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_model_trgm_idx" ON "products" USING gin ("model" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "shops_name_trgm_idx" ON "shops" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "shops_location_label_trgm_idx" ON "shops" USING gin ("location_label" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "shops_address_trgm_idx" ON "shops" USING gin ("address" gin_trgm_ops);
