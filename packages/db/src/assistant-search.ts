import { and, asc, eq, ilike, isNotNull, or, sql } from "drizzle-orm"

import { getDb } from "./client"
import { offers, products, shops } from "./schema"

const MAX_QUERY_LENGTH = 120
const CATALOG_RESULT_LIMIT = 80
const ASSISTANT_RESULT_LIMIT = 8

const stopWords = new Set([
  "از",
  "برای",
  "با",
  "به",
  "را",
  "رو",
  "و",
  "در",
  "یک",
  "یه",
  "من",
  "میخوام",
  "می‌خوام",
  "میخواهم",
  "می‌خواهم",
  "دنبال",
  "پیدا",
  "کن",
  "کنم",
  "کنید",
  "مناسب",
  "لطفا",
  "لطفاً",
  "قیمت",
  "فروشگاه",
  "فروشگاه‌ها",
  "نزدیک",
  "نزدیکم",
])

const searchableFields = [
  products.persianTitle,
  products.brandName,
  products.model,
  products.categoryName,
  shops.name,
  shops.address,
]

export type AssistantCatalogLocation = {
  latitude: number
  longitude: number
} | null

export type AssistantCatalogSearchResult = {
  matches: number
  catalogAvailable: boolean
  locationAvailable: boolean
  offers: Array<{
    product: string
    brand: string | null
    model: string | null
    category: string | null
    specs: Array<{ key: string; section: string; value: string }> | null
    priceToman: string | null
    priceUpdatedAt: string | null
    warranty: string | null
    shop: string
    address: string | null
    locationLabel: string | null
    distanceKm: number | null
    contacts: Array<{ channel: string; display_number?: string }> | null
    weeklyHours: Record<
      string,
      {
        status: string
        shifts: Array<{ start_time: string; end_time: string }>
      }
    > | null
    paymentOptions: Record<string, unknown>[] | null
  }>
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function getSearchTerms(query: string) {
  const tokens = normalizeSearchText(query)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token))
  return [...new Set(tokens)].slice(0, 5)
}

function escapeLikeToken(token: string) {
  return token.replace(/[\\%_]/g, "\\$&")
}

function getDistanceInKm(
  location: AssistantCatalogLocation,
  latitude: number | null,
  longitude: number | null
) {
  if (!location || latitude === null || longitude === null) return null

  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(latitude - location.latitude)
  const longitudeDelta = radians(longitude - location.longitude)
  const arc =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(location.latitude)) *
      Math.cos(radians(latitude)) *
      Math.sin(longitudeDelta / 2) ** 2

  return (
    Math.round(6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)) * 10) /
    10
  )
}

export async function searchAssistantCatalog({
  query,
  sortBy = "price",
  location,
}: {
  query: string
  sortBy?: "price" | "distance"
  location: AssistantCatalogLocation
}): Promise<AssistantCatalogSearchResult> {
  const trimmedQuery = query.trim().slice(0, MAX_QUERY_LENGTH)
  const terms = getSearchTerms(trimmedQuery)
  const patterns = (
    terms.length > 0 ? terms : [normalizeSearchText(trimmedQuery)]
  )
    .filter(Boolean)
    .map((term) => `%${escapeLikeToken(term)}%`)
  const queryConditions = patterns.map((pattern) =>
    or(...searchableFields.map((field) => ilike(field, pattern)))
  )
  const where = and(...queryConditions)
  const nearestFirst = sortBy === "distance" && location !== null
  const distanceOrder =
    nearestFirst && location
      ? sql`power(${shops.lat} - ${location.latitude}, 2) + power((${shops.lon} - ${location.longitude}) * cos(radians(${location.latitude})), 2)`
      : undefined

  const rows = await getDb()
    .select({
      product: products.persianTitle,
      brand: products.brandName,
      model: products.model,
      category: products.categoryName,
      specs: products.specs,
      priceToman: offers.priceToman,
      priceUpdatedAt: offers.lastPriceChangedAt,
      warranty: offers.warranty,
      shop: shops.name,
      address: shops.address,
      locationLabel: shops.locationLabel,
      latitude: shops.lat,
      longitude: shops.lon,
      contacts: shops.contacts,
      weeklyHours: shops.weeklyHours,
      paymentOptions: shops.paymentOptions,
    })
    .from(offers)
    .innerJoin(products, eq(products.productId, offers.productId))
    .innerJoin(shops, eq(shops.shopId, offers.shopId))
    .where(
      nearestFirst
        ? and(where, isNotNull(shops.lat), isNotNull(shops.lon))
        : where
    )
    .orderBy(
      ...(distanceOrder ? [asc(distanceOrder)] : []),
      asc(offers.priceToman)
    )
    .limit(CATALOG_RESULT_LIMIT)

  const results = rows.slice(0, ASSISTANT_RESULT_LIMIT).map((row) => ({
    product: row.product ?? row.model ?? row.category ?? "کالا",
    brand: row.brand,
    model: row.model,
    category: row.category,
    specs: row.specs,
    priceToman: row.priceToman,
    priceUpdatedAt: row.priceUpdatedAt?.toISOString() ?? null,
    warranty: row.warranty,
    shop: row.shop ?? "فروشگاه بدون نام",
    address: row.address,
    locationLabel: row.locationLabel,
    distanceKm: getDistanceInKm(location, row.latitude, row.longitude),
    contacts: row.contacts,
    weeklyHours: row.weeklyHours,
    paymentOptions: row.paymentOptions,
  }))

  return {
    matches: results.length,
    catalogAvailable: true,
    locationAvailable: location !== null,
    offers: results,
  }
}
