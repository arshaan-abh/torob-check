import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

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
  },
  (table) => [index("shops_coordinates_idx").on(table.lat, table.lon)]
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
  (table) => [index("products_category_idx").on(table.categoryName)]
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
  ]
)
