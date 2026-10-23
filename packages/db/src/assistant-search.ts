import { and, asc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm"

import { getDb } from "./client"
import type { MapShopBounds } from "./map-shops"
import {
  offerCurrentFacts,
  offers,
  products,
  shopFactObservations,
  shopSources,
  shops,
  type ShopContact,
  type WeeklyHours,
} from "./schema"

export type AssistantSearchInput = {
  query: string
  category?: string
  brand?: string
  attributes?: string[]
  minPriceToman?: number
  maxPriceToman?: number
  bounds?: MapShopBounds
  center?: { lat: number; lon: number }
  inStockOnly?: boolean
  limit?: number
}

export type AssistantOfferResult = {
  offerId: string
  productId: string
  shopId: string
  productTitle: string | null
  brandName: string | null
  categoryName: string | null
  model: string | null
  imageUrls: string[] | null
  specs: Array<{ key: string; section: string; value: string }> | null
  sellerTitle: string | null
  priceToman: string | null
  budgetFit: "within" | "outside" | "unknown" | null
  stockStatus: "in_stock" | "out_of_stock" | "unknown"
  stockQuantity: number | null
  priceSourceType: string
  priceConfirmation: string
  stockSourceType: string
  stockConfirmation: string
  priceObservedAt: string | null
  stockObservedAt: string | null
  priceFreshness: "fresh" | "stale" | "unknown"
  stockFreshness: "fresh" | "stale" | "unknown"
  evidenceUrl: string | null
  shopName: string | null
  address: string | null
  locationLabel: string | null
  lat: number | null
  lon: number | null
  distanceKm: number | null
}

const PRICE_FRESHNESS_MS = 24 * 60 * 60 * 1000
const STOCK_FRESHNESS_MS = 30 * 60 * 1000
const CANDIDATE_LIMIT = 100

function cleanSearchValue(value: string | undefined) {
  return (
    value
      ?.trim()
      .replace(/[\\%_]/g, "")
      .slice(0, 100) ?? ""
  )
}

function safeEvidenceUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

function freshness(
  observedAt: Date | null,
  validUntil: Date | null,
  ttlMs: number
): "fresh" | "stale" | "unknown" {
  if (!observedAt) return "unknown"
  const now = Date.now()
  if (
    observedAt.getTime() > now + 60_000 ||
    observedAt.getTime() + ttlMs <= now ||
    (validUntil !== null && validUntil.getTime() <= now)
  ) {
    return "stale"
  }
  return "fresh"
}

function distanceKm(
  center: { lat: number; lon: number } | undefined,
  lat: number | null,
  lon: number | null
) {
  if (!center || lat === null || lon === null) return null
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(lat - center.lat)
  const longitudeDelta = toRadians(lon - center.lon)
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(center.lat)) *
      Math.cos(toRadians(lat)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function scoreCandidate(
  input: AssistantSearchInput,
  result: AssistantOfferResult
) {
  const haystack = [
    result.productTitle,
    result.brandName,
    result.categoryName,
    result.model,
    result.sellerTitle,
    ...(result.specs ?? []).map((spec) => `${spec.key} ${spec.value}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("fa-IR")
  const query = cleanSearchValue(input.query).toLocaleLowerCase("fa-IR")
  const tokens = query.split(/\s+/).filter((token) => token.length > 1)
  const matchedTokens = tokens.filter((token) =>
    haystack.includes(token)
  ).length
  let score = matchedTokens
  if (query && haystack.includes(query)) score += 8
  if (
    input.brand &&
    result.brandName
      ?.toLocaleLowerCase("fa-IR")
      .includes(input.brand.toLocaleLowerCase("fa-IR"))
  ) {
    score += 6
  }
  if (
    input.category &&
    result.categoryName
      ?.toLocaleLowerCase("fa-IR")
      .includes(input.category.toLocaleLowerCase("fa-IR"))
  ) {
    score += 4
  }
  for (const attribute of input.attributes ?? []) {
    if (haystack.includes(attribute.toLocaleLowerCase("fa-IR"))) score += 2
  }
  if (
    result.priceToman &&
    result.priceConfirmation === "merchant_confirmed" &&
    result.priceFreshness === "fresh"
  ) {
    score += 1
  }
  if (result.stockStatus === "in_stock" && result.stockFreshness === "fresh") {
    score += 2
  }
  return score
}

export async function searchAssistantOffers(input: AssistantSearchInput) {
  const db = getDb()
  const terms = [
    cleanSearchValue(input.query),
    cleanSearchValue(input.category),
    cleanSearchValue(input.brand),
    ...(input.attributes ?? []).map(cleanSearchValue),
  ].filter((term) => term.length > 1)
  const textFields = [
    products.persianTitle,
    products.brandName,
    products.categoryName,
    products.model,
    offers.sellerTitle,
    offers.description,
    offers.warranty,
  ]
  const textMatch = terms.length
    ? or(
        ...terms.flatMap((term) =>
          textFields.map((field) => ilike(field, `%${term}%`))
        ),
        sql`CAST(${products.specs} AS text) ILIKE ${`%${terms.join(" ")}%`}`
      )
    : undefined
  const conditions = []
  if (textMatch) conditions.push(textMatch)

  if (input.bounds) {
    conditions.push(
      gte(shops.lon, input.bounds.west),
      lte(shops.lon, input.bounds.east),
      gte(shops.lat, input.bounds.south),
      lte(shops.lat, input.bounds.north)
    )
  }

  const freshMerchantPrice = sql`
    ${offerCurrentFacts.priceToman} IS NOT NULL
    AND ${offerCurrentFacts.priceToman} > 0
    AND ${offerCurrentFacts.priceConfirmation} = 'merchant_confirmed'
    AND ${offerCurrentFacts.priceSourceType} IN ('merchant_portal', 'merchant_feed')
    AND ${offerCurrentFacts.priceObservedAt} > now() - interval '24 hours'
    AND ${offerCurrentFacts.priceObservedAt} <= now() + interval '1 minute'
    AND ${offerCurrentFacts.priceValidUntil} > now()
  `
  const priceBounds = []
  if (input.minPriceToman !== undefined) {
    priceBounds.push(
      sql`${offerCurrentFacts.priceToman} >= ${String(input.minPriceToman)}`
    )
  }
  if (input.maxPriceToman !== undefined) {
    priceBounds.push(
      sql`${offerCurrentFacts.priceToman} <= ${String(input.maxPriceToman)}`
    )
  }
  if (priceBounds.length > 0) {
    conditions.push(
      or(
        sql`NOT (${freshMerchantPrice})`,
        and(freshMerchantPrice, ...priceBounds)
      )!
    )
  }
  if (input.inStockOnly) {
    conditions.push(
      eq(offerCurrentFacts.stockStatus, "in_stock"),
      eq(offerCurrentFacts.stockConfirmation, "merchant_confirmed"),
      inArray(offerCurrentFacts.stockSourceType, [
        "merchant_portal",
        "merchant_feed",
      ]),
      sql`${offerCurrentFacts.stockValidUntil} > now()`,
      sql`${offerCurrentFacts.stockObservedAt} > now() - interval '30 minutes'`,
      sql`${offerCurrentFacts.stockObservedAt} <= now() + interval '1 minute'`
    )
  }

  const rows = await db
    .select({
      offerId: offers.offerId,
      productId: products.productId,
      shopId: shops.shopId,
      productTitle: products.persianTitle,
      brandName: products.brandName,
      categoryName: products.categoryName,
      model: products.model,
      imageUrls: products.imageUrls,
      specs: products.specs,
      sellerTitle: offers.sellerTitle,
      currentPriceToman: offerCurrentFacts.priceToman,
      stockStatus: offerCurrentFacts.stockStatus,
      stockQuantity: offerCurrentFacts.stockQuantity,
      priceSourceType: offerCurrentFacts.priceSourceType,
      priceConfirmation: offerCurrentFacts.priceConfirmation,
      stockSourceType: offerCurrentFacts.stockSourceType,
      stockConfirmation: offerCurrentFacts.stockConfirmation,
      priceObservedAt: offerCurrentFacts.priceObservedAt,
      priceValidUntil: offerCurrentFacts.priceValidUntil,
      priceEvidenceUrl: offerCurrentFacts.priceEvidenceUrl,
      stockObservedAt: offerCurrentFacts.stockObservedAt,
      stockValidUntil: offerCurrentFacts.stockValidUntil,
      shopName: shops.name,
      address: shops.address,
      locationLabel: shops.locationLabel,
      lat: shops.lat,
      lon: shops.lon,
    })
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.productId))
    .innerJoin(shops, eq(offers.shopId, shops.shopId))
    .leftJoin(offerCurrentFacts, eq(offers.offerId, offerCurrentFacts.offerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      sql`CASE WHEN ${freshMerchantPrice} THEN 0 ELSE 1 END`,
      sql`CASE WHEN ${freshMerchantPrice} THEN ${offerCurrentFacts.priceToman} END ASC`,
      asc(offers.offerId)
    )
    .limit(Math.min(Math.max(input.limit ?? 12, 1), CANDIDATE_LIMIT))

  const candidates = rows.map((row) => {
    const hasCurrentPrice = row.currentPriceToman !== null
    const hasReportedStock =
      row.stockStatus !== null && row.stockStatus !== "unknown"
    const priceObservedAt = row.priceObservedAt
    const stockObservedAt = row.stockObservedAt
    const priceConfirmation = row.priceConfirmation ?? "public_unverified"
    const stockConfirmation = row.stockConfirmation ?? "public_unverified"
    const priceFreshness = hasCurrentPrice
      ? freshness(priceObservedAt, row.priceValidUntil, PRICE_FRESHNESS_MS)
      : "unknown"
    const stockFreshness =
      hasReportedStock && row.stockObservedAt
        ? freshness(stockObservedAt, row.stockValidUntil, STOCK_FRESHNESS_MS)
        : "unknown"
    const currentPriceNumber = Number(row.currentPriceToman)
    const hasFreshMerchantPrice =
      hasCurrentPrice &&
      Number.isSafeInteger(currentPriceNumber) &&
      currentPriceNumber > 0 &&
      (row.priceSourceType === "merchant_portal" ||
        row.priceSourceType === "merchant_feed") &&
      priceConfirmation === "merchant_confirmed" &&
      priceFreshness === "fresh"
    const hasFreshMerchantStock =
      hasReportedStock &&
      (row.stockSourceType === "merchant_portal" ||
        row.stockSourceType === "merchant_feed") &&
      stockConfirmation === "merchant_confirmed" &&
      stockFreshness === "fresh"
    const hasBudget =
      input.minPriceToman !== undefined || input.maxPriceToman !== undefined
    const withinBudget =
      hasFreshMerchantPrice &&
      (input.minPriceToman === undefined ||
        currentPriceNumber >= input.minPriceToman) &&
      (input.maxPriceToman === undefined ||
        currentPriceNumber <= input.maxPriceToman)
    const kilometers = distanceKm(input.center, row.lat, row.lon)
    return {
      offerId: row.offerId,
      productId: row.productId,
      shopId: row.shopId,
      productTitle: row.productTitle,
      brandName: row.brandName,
      categoryName: row.categoryName,
      model: row.model,
      imageUrls: row.imageUrls,
      specs: row.specs,
      sellerTitle: row.sellerTitle,
      priceToman: hasFreshMerchantPrice ? row.currentPriceToman : null,
      budgetFit: hasBudget ? (withinBudget ? "within" : "unknown") : null,
      stockStatus: hasFreshMerchantStock
        ? (row.stockStatus ?? "unknown")
        : "unknown",
      stockQuantity: hasFreshMerchantStock ? row.stockQuantity : null,
      priceSourceType: row.priceSourceType ?? "catalog",
      priceConfirmation,
      stockSourceType: row.stockSourceType ?? "catalog",
      stockConfirmation,
      priceObservedAt: priceObservedAt?.toISOString() ?? null,
      stockObservedAt: stockObservedAt?.toISOString() ?? null,
      priceFreshness,
      stockFreshness,
      evidenceUrl: hasFreshMerchantPrice
        ? safeEvidenceUrl(row.priceEvidenceUrl)
        : null,
      shopName: row.shopName,
      address: row.address,
      locationLabel: row.locationLabel,
      lat: row.lat,
      lon: row.lon,
      distanceKm: kilometers,
    } satisfies AssistantOfferResult
  })

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(input, candidate),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.candidate.distanceKm ?? Number.POSITIVE_INFINITY) -
          (b.candidate.distanceKm ?? Number.POSITIVE_INFINITY) ||
        Number(a.candidate.priceToman ?? Number.POSITIVE_INFINITY) -
          Number(b.candidate.priceToman ?? Number.POSITIVE_INFINITY) ||
        a.candidate.offerId.localeCompare(b.candidate.offerId)
    )
    .slice(0, Math.min(Math.max(input.limit ?? 8, 1), 20))
    .map(({ candidate }) => candidate)
}

export async function getAssistantShopDetails(shopId: string) {
  const db = getDb()
  const [shopRows, hoursRows, contactRows, sourceRows] = await Promise.all([
    db
      .select({
        shopId: shops.shopId,
        name: shops.name,
        address: shops.address,
        locationLabel: shops.locationLabel,
        websiteUrl: shops.websiteUrl,
        instagram: shops.instagram,
        weeklyHours: shops.weeklyHours,
        contacts: shops.contacts,
        timeZone: shops.timeZone,
        lat: shops.lat,
        lon: shops.lon,
      })
      .from(shops)
      .where(eq(shops.shopId, shopId))
      .limit(1),
    db
      .select()
      .from(shopFactObservations)
      .where(
        and(
          eq(shopFactObservations.shopId, shopId),
          eq(shopFactObservations.factKey, "weeklyHours"),
          eq(shopFactObservations.confirmation, "merchant_confirmed"),
          sql`${shopFactObservations.observedAt} > now() - interval '7 days'`,
          sql`${shopFactObservations.observedAt} <= now() + interval '1 minute'`,
          sql`${shopFactObservations.validUntil} > now()`
        )
      )
      .orderBy(sql`${shopFactObservations.observedAt} DESC`)
      .limit(1),
    db
      .select()
      .from(shopFactObservations)
      .where(
        and(
          eq(shopFactObservations.shopId, shopId),
          eq(shopFactObservations.factKey, "contacts"),
          eq(shopFactObservations.confirmation, "merchant_confirmed"),
          sql`${shopFactObservations.observedAt} > now() - interval '30 days'`,
          sql`${shopFactObservations.observedAt} <= now() + interval '1 minute'`,
          sql`${shopFactObservations.validUntil} > now()`
        )
      )
      .orderBy(sql`${shopFactObservations.observedAt} DESC`)
      .limit(1),
    db
      .select({ sourceType: shopSources.sourceType, url: shopSources.url })
      .from(shopSources)
      .where(
        and(eq(shopSources.shopId, shopId), eq(shopSources.status, "active"))
      ),
  ])

  const shop = shopRows[0]
  if (!shop) return null
  const hoursObservation = hoursRows[0]
  const contactsObservation = contactRows[0]
  const hours = hoursObservation?.factValue ?? shop.weeklyHours
  const contacts = contactsObservation?.factValue ?? null

  return {
    ...shop,
    weeklyHours: hoursObservation ? (hours as WeeklyHours | null) : null,
    contacts: contacts as ShopContact[] | null,
    hoursFreshness: hoursObservation ? "fresh" : "unknown",
    contactsFreshness: contactsObservation ? "fresh" : "unknown",
    hoursObservedAt: hoursObservation?.observedAt.toISOString() ?? null,
    contactsObservedAt: contactsObservation?.observedAt.toISOString() ?? null,
    sources: sourceRows,
  }
}

export async function getFreshShopSources(shopIds: string[]) {
  if (shopIds.length === 0) return []
  return getDb()
    .select({
      id: shopSources.id,
      shopId: shopSources.shopId,
      sourceType: shopSources.sourceType,
      url: shopSources.url,
      encryptedAccessToken: shopSources.encryptedAccessToken,
      externalAccountId: shopSources.externalAccountId,
      oauthUsername: shopSources.oauthUsername,
    })
    .from(shopSources)
    .where(
      and(
        inArray(shopSources.shopId, shopIds),
        eq(shopSources.status, "active")
      )
    )
}
