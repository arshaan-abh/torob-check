CREATE TYPE "public"."fact_confirmation" AS ENUM('merchant_confirmed', 'public_unverified');--> statement-breakpoint
CREATE TYPE "public"."fact_source_type" AS ENUM('merchant_portal', 'merchant_feed', 'catalog', 'public_website', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."merchant_claim_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."merchant_role" AS ENUM('owner', 'manager');--> statement-breakpoint
CREATE TYPE "public"."product_submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."shop_source_status" AS ENUM('pending', 'active', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."shop_source_type" AS ENUM('website', 'instagram', 'merchant_feed');--> statement-breakpoint
CREATE TYPE "public"."stock_status" AS ENUM('in_stock', 'out_of_stock', 'unknown');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_oauth_states" (
	"state" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"shop_id" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"shop_id" varchar(128),
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_value" jsonb,
	"after_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"shop_id" varchar(128) NOT NULL,
	"status" "merchant_claim_status" DEFAULT 'pending' NOT NULL,
	"evidence_url" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "merchant_shop_memberships" (
	"user_id" text NOT NULL,
	"shop_id" varchar(128) NOT NULL,
	"role" "merchant_role" DEFAULT 'manager' NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_shop_memberships_user_id_shop_id_pk" PRIMARY KEY("user_id","shop_id")
);
--> statement-breakpoint
CREATE TABLE "offer_current_facts" (
	"offer_id" varchar(128) PRIMARY KEY NOT NULL,
	"price_toman" numeric(20, 0),
	"stock_status" "stock_status" DEFAULT 'unknown' NOT NULL,
	"stock_quantity" integer,
	"source_type" "fact_source_type" DEFAULT 'catalog' NOT NULL,
	"confirmation" "fact_confirmation" DEFAULT 'public_unverified' NOT NULL,
	"observed_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"evidence_url" text,
	"source_id" uuid,
	"actor_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_fact_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" varchar(128) NOT NULL,
	"price_toman" numeric(20, 0),
	"stock_status" "stock_status" DEFAULT 'unknown' NOT NULL,
	"stock_quantity" integer,
	"source_type" "fact_source_type" NOT NULL,
	"confirmation" "fact_confirmation" NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"evidence_url" text,
	"source_id" uuid,
	"actor_id" text,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "product_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitted_by" text NOT NULL,
	"shop_id" varchar(128) NOT NULL,
	"linked_product_id" varchar(128),
	"title" text NOT NULL,
	"brand_name" text,
	"model" text,
	"category_name" text,
	"specs" jsonb,
	"image_urls" jsonb,
	"price_toman" numeric(20, 0),
	"stock_status" "stock_status" DEFAULT 'unknown' NOT NULL,
	"status" "product_submission_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "research_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" varchar(128) NOT NULL,
	"source_id" uuid,
	"query" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"excerpt" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shop_fact_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" varchar(128) NOT NULL,
	"fact_key" text NOT NULL,
	"fact_value" jsonb NOT NULL,
	"source_type" "fact_source_type" NOT NULL,
	"confirmation" "fact_confirmation" NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"evidence_url" text,
	"source_id" uuid,
	"actor_id" text
);
--> statement-breakpoint
CREATE TABLE "shop_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" varchar(128) NOT NULL,
	"source_type" "shop_source_type" NOT NULL,
	"url" text NOT NULL,
	"status" "shop_source_status" DEFAULT 'pending' NOT NULL,
	"display_name" text,
	"external_account_id" text,
	"oauth_username" text,
	"encrypted_access_token" text,
	"token_expires_at" timestamp with time zone,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "time_zone" text DEFAULT 'Asia/Tehran' NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_oauth_states" ADD CONSTRAINT "instagram_oauth_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_oauth_states" ADD CONSTRAINT "instagram_oauth_states_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_audit_logs" ADD CONSTRAINT "merchant_audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_audit_logs" ADD CONSTRAINT "merchant_audit_logs_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_claims" ADD CONSTRAINT "merchant_claims_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_claims" ADD CONSTRAINT "merchant_claims_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_claims" ADD CONSTRAINT "merchant_claims_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_shop_memberships" ADD CONSTRAINT "merchant_shop_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_shop_memberships" ADD CONSTRAINT "merchant_shop_memberships_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD CONSTRAINT "offer_current_facts_offer_id_offers_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("offer_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD CONSTRAINT "offer_current_facts_source_id_shop_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."shop_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_current_facts" ADD CONSTRAINT "offer_current_facts_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_fact_observations" ADD CONSTRAINT "offer_fact_observations_offer_id_offers_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("offer_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_fact_observations" ADD CONSTRAINT "offer_fact_observations_source_id_shop_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."shop_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_fact_observations" ADD CONSTRAINT "offer_fact_observations_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_submissions" ADD CONSTRAINT "product_submissions_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_submissions" ADD CONSTRAINT "product_submissions_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_submissions" ADD CONSTRAINT "product_submissions_linked_product_id_products_product_id_fk" FOREIGN KEY ("linked_product_id") REFERENCES "public"."products"("product_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_submissions" ADD CONSTRAINT "product_submissions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_observations" ADD CONSTRAINT "research_observations_source_id_shop_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."shop_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_fact_observations" ADD CONSTRAINT "shop_fact_observations_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_fact_observations" ADD CONSTRAINT "shop_fact_observations_source_id_shop_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."shop_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_fact_observations" ADD CONSTRAINT "shop_fact_observations_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sources" ADD CONSTRAINT "shop_sources_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sources" ADD CONSTRAINT "shop_sources_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sources" ADD CONSTRAINT "shop_sources_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "merchant_audit_logs_shop_created_idx" ON "merchant_audit_logs" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "merchant_audit_logs_actor_created_idx" ON "merchant_audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "merchant_claims_user_status_idx" ON "merchant_claims" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "merchant_claims_shop_status_idx" ON "merchant_claims" USING btree ("shop_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_claims_pending_user_shop_idx" ON "merchant_claims" USING btree ("user_id","shop_id") WHERE "merchant_claims"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "merchant_shop_memberships_shop_idx" ON "merchant_shop_memberships" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "offer_current_facts_freshness_idx" ON "offer_current_facts" USING btree ("confirmation","valid_until");--> statement-breakpoint
CREATE INDEX "offer_fact_observations_offer_observed_idx" ON "offer_fact_observations" USING btree ("offer_id","observed_at");--> statement-breakpoint
CREATE INDEX "product_submissions_status_created_idx" ON "product_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "product_submissions_shop_idx" ON "product_submissions" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "research_observations_shop_observed_idx" ON "research_observations" USING btree ("shop_id","observed_at");--> statement-breakpoint
CREATE INDEX "research_observations_expiry_idx" ON "research_observations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shop_fact_observations_shop_key_observed_idx" ON "shop_fact_observations" USING btree ("shop_id","fact_key","observed_at");--> statement-breakpoint
CREATE INDEX "shop_sources_shop_status_idx" ON "shop_sources" USING btree ("shop_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_sources_shop_type_url_idx" ON "shop_sources" USING btree ("shop_id","source_type","url");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");