CREATE TABLE "offers" (
	"offer_id" varchar(128) PRIMARY KEY NOT NULL,
	"product_id" varchar(128) NOT NULL,
	"shop_id" varchar(128) NOT NULL,
	"description" text,
	"seller_title" text,
	"price_toman" numeric(20, 0),
	"last_price_changed_at" timestamp with time zone,
	"warranty" text
);
--> statement-breakpoint
CREATE TABLE "products" (
	"product_id" varchar(128) PRIMARY KEY NOT NULL,
	"brand_name" text,
	"category_name" text,
	"image_urls" jsonb,
	"model" text,
	"persian_title" text,
	"specs" jsonb
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"shop_id" varchar(128) PRIMARY KEY NOT NULL,
	"name" text,
	"address" text,
	"location_label" text,
	"lat" double precision,
	"lon" double precision,
	"category_names" jsonb,
	"contacts" jsonb,
	"instagram" text,
	"website_url" text,
	"payment_options" jsonb,
	"supports_fast_delivery" boolean,
	"weekly_hours" jsonb
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offers_product_price_idx" ON "offers" USING btree ("product_id","price_toman");--> statement-breakpoint
CREATE INDEX "offers_shop_idx" ON "offers" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_name");--> statement-breakpoint
CREATE INDEX "shops_coordinates_idx" ON "shops" USING btree ("lat","lon");