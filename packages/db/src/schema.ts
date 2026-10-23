import {
  boolean,
  doublePrecision,
  integer,
  index,
  jsonb,
  numeric,
  pgTable,
  pgEnum,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { account, session, user, verification } from "./auth-schema"

export { account, session, user, verification }

export type ShopContact = {
  channel: string
  display_number?: string
  [key: string]: unknown
}

export type WeeklyHours = Record<
  string,
  {
    status: string
    shifts: Array<{ start_time: string; end_time: string }>
  }
>

export type ProductSpec = {
  key: string
  section: string
  value: string
}

export const shops = pgTable(
  "shops",
  {
    shopId: varchar("shop_id", { length: 128 }).primaryKey(),
    name: text("name"),
    address: text("address"),
    locationLabel: text("location_label"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    categoryNames: jsonb("category_names").$type<string[] | null>(),
    contacts: jsonb("contacts").$type<ShopContact[] | null>(),
    instagram: text("instagram"),
    websiteUrl: text("website_url"),
    paymentOptions: jsonb("payment_options").$type<
      Record<string, unknown>[] | null
    >(),
    supportsFastDelivery: boolean("supports_fast_delivery"),
    weeklyHours: jsonb("weekly_hours").$type<WeeklyHours | null>(),
    timeZone: text("time_zone").default("Asia/Tehran").notNull(),
  },
  (table) => [
    index("shops_coordinates_idx").on(table.lat, table.lon),
    index("shops_name_shop_id_idx").on(table.name, table.shopId),
    index("shops_name_trgm_idx").using("gin", table.name.op("gin_trgm_ops")),
    index("shops_location_label_trgm_idx").using(
      "gin",
      table.locationLabel.op("gin_trgm_ops")
    ),
    index("shops_address_trgm_idx").using(
      "gin",
      table.address.op("gin_trgm_ops")
    ),
  ]
)

export const products = pgTable(
  "products",
  {
    productId: varchar("product_id", { length: 128 }).primaryKey(),
    brandName: text("brand_name"),
    categoryName: text("category_name"),
    imageUrls: jsonb("image_urls").$type<string[] | null>(),
    model: text("model"),
    persianTitle: text("persian_title"),
    specs: jsonb("specs").$type<ProductSpec[] | null>(),
  },
  (table) => [
    index("products_category_idx").on(table.categoryName),
    index("products_title_trgm_idx").using(
      "gin",
      table.persianTitle.op("gin_trgm_ops")
    ),
    index("products_brand_trgm_idx").using(
      "gin",
      table.brandName.op("gin_trgm_ops")
    ),
    index("products_model_trgm_idx").using(
      "gin",
      table.model.op("gin_trgm_ops")
    ),
    index("products_category_trgm_idx").using(
      "gin",
      table.categoryName.op("gin_trgm_ops")
    ),
  ]
)

export const offers = pgTable(
  "offers",
  {
    offerId: varchar("offer_id", { length: 128 }).primaryKey(),
    productId: varchar("product_id", { length: 128 })
      .notNull()
      .references(() => products.productId),
    shopId: varchar("shop_id", { length: 128 })
      .notNull()
      .references(() => shops.shopId),
    description: text("description"),
    sellerTitle: text("seller_title"),
    priceToman: numeric("price_toman", { precision: 20, scale: 0 }),
    lastPriceChangedAt: timestamp("last_price_changed_at", {
      withTimezone: true,
      mode: "date",
    }),
    warranty: text("warranty"),
  },
  (table) => [
    index("offers_product_price_idx").on(table.productId, table.priceToman),
    index("offers_shop_idx").on(table.shopId),
    index("offers_seller_title_trgm_idx").using(
      "gin",
      table.sellerTitle.op("gin_trgm_ops")
    ),
    index("offers_description_trgm_idx").using(
      "gin",
      table.description.op("gin_trgm_ops")
    ),
    index("offers_warranty_trgm_idx").using(
      "gin",
      table.warranty.op("gin_trgm_ops")
    ),
  ]
)

export const merchantRoleEnum = pgEnum("merchant_role", ["owner", "manager"])
export const merchantClaimStatusEnum = pgEnum("merchant_claim_status", [
  "pending",
  "approved",
  "rejected",
])
export const shopSourceTypeEnum = pgEnum("shop_source_type", [
  "website",
  "instagram",
  "merchant_feed",
])
export const shopSourceStatusEnum = pgEnum("shop_source_status", [
  "pending",
  "active",
  "rejected",
])
export const factSourceTypeEnum = pgEnum("fact_source_type", [
  "merchant_portal",
  "merchant_feed",
  "catalog",
  "public_website",
  "instagram",
])
export const factConfirmationEnum = pgEnum("fact_confirmation", [
  "merchant_confirmed",
  "public_unverified",
])
export const stockStatusEnum = pgEnum("stock_status", [
  "in_stock",
  "out_of_stock",
  "unknown",
])
export const productSubmissionStatusEnum = pgEnum("product_submission_status", [
  "pending",
  "approved",
  "rejected",
])

export const merchantClaims = pgTable(
  "merchant_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    shopId: varchar("shop_id", { length: 128 })
      .notNull()
      .references(() => shops.shopId, { onDelete: "cascade" }),
    status: merchantClaimStatusEnum("status").default("pending").notNull(),
    evidenceUrl: text("evidence_url"),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
  },
  (table) => [
    index("merchant_claims_user_status_idx").on(table.userId, table.status),
    index("merchant_claims_shop_status_idx").on(table.shopId, table.status),
    uniqueIndex("merchant_claims_pending_user_shop_idx")
      .on(table.userId, table.shopId)
      .where(sql`${table.status} = 'pending'`),
  ]
)

export const merchantShopMemberships = pgTable(
  "merchant_shop_memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    shopId: varchar("shop_id", { length: 128 })
      .notNull()
      .references(() => shops.shopId, { onDelete: "cascade" }),
    role: merchantRoleEnum("role").default("manager").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.shopId] }),
    index("merchant_shop_memberships_shop_idx").on(table.shopId),
  ]
)

export const shopSources = pgTable(
  "shop_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: varchar("shop_id", { length: 128 })
      .notNull()
      .references(() => shops.shopId, { onDelete: "cascade" }),
    sourceType: shopSourceTypeEnum("source_type").notNull(),
    url: text("url").notNull(),
    status: shopSourceStatusEnum("status").default("pending").notNull(),
    displayName: text("display_name"),
    externalAccountId: text("external_account_id"),
    oauthUsername: text("oauth_username"),
    encryptedAccessToken: text("encrypted_access_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("shop_sources_shop_status_idx").on(table.shopId, table.status),
    uniqueIndex("shop_sources_shop_type_url_idx").on(
      table.shopId,
      table.sourceType,
      table.url
    ),
  ]
)

export const instagramOAuthStates = pgTable("instagram_oauth_states", {
  state: varchar("state", { length: 128 }).primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  shopId: varchar("shop_id", { length: 128 })
    .notNull()
    .references(() => shops.shopId, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const offerCurrentFacts = pgTable(
  "offer_current_facts",
  {
    offerId: varchar("offer_id", { length: 128 })
      .primaryKey()
      .references(() => offers.offerId, { onDelete: "cascade" }),
    priceToman: numeric("price_toman", { precision: 20, scale: 0 }),
    stockStatus: stockStatusEnum("stock_status").default("unknown").notNull(),
    stockQuantity: integer("stock_quantity"),
    sourceType: factSourceTypeEnum("source_type").default("catalog").notNull(),
    confirmation: factConfirmationEnum("confirmation")
      .default("public_unverified")
      .notNull(),
    priceObservedAt: timestamp("price_observed_at", { withTimezone: true }),
    priceValidUntil: timestamp("price_valid_until", { withTimezone: true }),
    priceEvidenceUrl: text("price_evidence_url"),
    priceSourceType: factSourceTypeEnum("price_source_type"),
    priceConfirmation: factConfirmationEnum("price_confirmation"),
    stockObservedAt: timestamp("stock_observed_at", { withTimezone: true }),
    stockValidUntil: timestamp("stock_valid_until", { withTimezone: true }),
    stockEvidenceUrl: text("stock_evidence_url"),
    stockSourceType: factSourceTypeEnum("stock_source_type"),
    stockConfirmation: factConfirmationEnum("stock_confirmation"),
    // Kept as legacy aggregate metadata for older writers during rollout.
    observedAt: timestamp("observed_at", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    evidenceUrl: text("evidence_url"),
    sourceId: uuid("source_id").references(() => shopSources.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("offer_current_facts_freshness_idx").on(
      table.confirmation,
      table.validUntil
    ),
  ]
)

export const offerFactObservations = pgTable(
  "offer_fact_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    offerId: varchar("offer_id", { length: 128 })
      .notNull()
      .references(() => offers.offerId, { onDelete: "cascade" }),
    factKey: text("fact_key").default("offer").notNull(),
    priceToman: numeric("price_toman", { precision: 20, scale: 0 }),
    stockStatus: stockStatusEnum("stock_status").default("unknown").notNull(),
    stockQuantity: integer("stock_quantity"),
    sourceType: factSourceTypeEnum("source_type").notNull(),
    confirmation: factConfirmationEnum("confirmation").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    evidenceUrl: text("evidence_url"),
    sourceId: uuid("source_id").references(() => shopSources.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index("offer_fact_observations_offer_observed_idx").on(
      table.offerId,
      table.observedAt
    ),
  ]
)

export const shopFactObservations = pgTable(
  "shop_fact_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: varchar("shop_id", { length: 128 })
      .notNull()
      .references(() => shops.shopId, { onDelete: "cascade" }),
    factKey: text("fact_key").notNull(),
    factValue: jsonb("fact_value").notNull(),
    sourceType: factSourceTypeEnum("source_type").notNull(),
    confirmation: factConfirmationEnum("confirmation").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    evidenceUrl: text("evidence_url"),
    sourceId: uuid("source_id").references(() => shopSources.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("shop_fact_observations_shop_key_observed_idx").on(
      table.shopId,
      table.factKey,
      table.observedAt
    ),
  ]
)

export const researchObservations = pgTable(
  "research_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: varchar("shop_id", { length: 128 })
      .notNull()
      .references(() => shops.shopId, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => shopSources.id, {
      onDelete: "set null",
    }),
    query: text("query").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    excerpt: text("excerpt"),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index("research_observations_shop_observed_idx").on(
      table.shopId,
      table.observedAt
    ),
    index("research_observations_expiry_idx").on(table.expiresAt),
    uniqueIndex("research_observations_source_url_observed_idx").on(
      table.sourceId,
      table.url,
      table.observedAt
    ),
  ]
)

export const productSubmissions = pgTable(
  "product_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    shopId: varchar("shop_id", { length: 128 })
      .notNull()
      .references(() => shops.shopId, { onDelete: "cascade" }),
    linkedProductId: varchar("linked_product_id", { length: 128 }).references(
      () => products.productId,
      { onDelete: "set null" }
    ),
    title: text("title").notNull(),
    brandName: text("brand_name"),
    model: text("model"),
    categoryName: text("category_name"),
    specs: jsonb("specs").$type<ProductSpec[] | null>(),
    imageUrls: jsonb("image_urls").$type<string[] | null>(),
    priceToman: numeric("price_toman", { precision: 20, scale: 0 }),
    stockStatus: stockStatusEnum("stock_status").default("unknown").notNull(),
    status: productSubmissionStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
  },
  (table) => [
    index("product_submissions_status_created_idx").on(
      table.status,
      table.createdAt
    ),
    index("product_submissions_shop_idx").on(table.shopId),
  ]
)

export const merchantAuditLogs = pgTable(
  "merchant_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    shopId: varchar("shop_id", { length: 128 }).references(() => shops.shopId, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeValue: jsonb("before_value").$type<Record<string, unknown> | null>(),
    afterValue: jsonb("after_value").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("merchant_audit_logs_shop_created_idx").on(
      table.shopId,
      table.createdAt
    ),
    index("merchant_audit_logs_actor_created_idx").on(
      table.actorId,
      table.createdAt
    ),
  ]
)

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  isSecret: boolean("is_secret").default(false).notNull(),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    key: text("key").primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestCount: integer("request_count").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("api_rate_limits_updated_at_idx").on(table.updatedAt)]
)
