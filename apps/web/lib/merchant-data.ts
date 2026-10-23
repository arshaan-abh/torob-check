import "server-only"
import { and, desc, eq, ilike, or } from "drizzle-orm"
import {
  getDb,
  merchantAuditLogs,
  merchantClaims,
  merchantShopMemberships,
  offers,
  offerCurrentFacts,
  offerFactObservations,
  productSubmissions,
  products,
  shopFactObservations,
  shops,
  shopSources,
  type ShopContact,
  type WeeklyHours,
} from "@workspace/db"

export async function hasShopAccess(userId: string, shopId: string) {
  const rows = await getDb()
    .select({ shopId: merchantShopMemberships.shopId })
    .from(merchantShopMemberships)
    .where(
      and(
        eq(merchantShopMemberships.userId, userId),
        eq(merchantShopMemberships.shopId, shopId)
      )
    )
    .limit(1)
  return rows.length > 0
}

export async function searchClaimableShops(query: string) {
  const term = query
    .trim()
    .replace(/[\\%_]/g, "")
    .slice(0, 80)
  if (term.length < 2) return []
  return getDb()
    .select({
      shopId: shops.shopId,
      name: shops.name,
      address: shops.address,
      locationLabel: shops.locationLabel,
    })
    .from(shops)
    .where(
      or(
        ilike(shops.name, `%${term}%`),
        ilike(shops.address, `%${term}%`),
        ilike(shops.locationLabel, `%${term}%`)
      )
    )
    .limit(20)
}

export async function listMerchantShops(userId: string) {
  return getDb()
    .select({
      shopId: shops.shopId,
      name: shops.name,
      address: shops.address,
      locationLabel: shops.locationLabel,
      contacts: shops.contacts,
      weeklyHours: shops.weeklyHours,
      websiteUrl: shops.websiteUrl,
      instagram: shops.instagram,
      timeZone: shops.timeZone,
      role: merchantShopMemberships.role,
    })
    .from(merchantShopMemberships)
    .innerJoin(shops, eq(shops.shopId, merchantShopMemberships.shopId))
    .where(eq(merchantShopMemberships.userId, userId))
    .orderBy(shops.name)
}

export async function listShopOffers(shopId: string) {
  return getDb()
    .select({
      offerId: offers.offerId,
      productId: products.productId,
      title: products.persianTitle,
      brandName: products.brandName,
      model: products.model,
      sellerTitle: offers.sellerTitle,
      priceToman: offers.priceToman,
      stockStatus: offerCurrentFacts.stockStatus,
      stockQuantity: offerCurrentFacts.stockQuantity,
      priceObservedAt: offerCurrentFacts.priceObservedAt,
      stockObservedAt: offerCurrentFacts.stockObservedAt,
    })
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.productId))
    .leftJoin(offerCurrentFacts, eq(offers.offerId, offerCurrentFacts.offerId))
    .where(eq(offers.shopId, shopId))
    .orderBy(products.persianTitle, offers.offerId)
    .limit(250)
}

export async function recordOfferUpdate(input: {
  userId: string
  shopId: string
  offerId: string
  priceToman?: number
  stockStatus?: "in_stock" | "out_of_stock" | "unknown"
  stockQuantity?: number | null
}) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const [offer] = await tx
      .select({
        offerId: offers.offerId,
        shopId: offers.shopId,
        priceToman: offers.priceToman,
      })
      .from(offers)
      .where(
        and(eq(offers.offerId, input.offerId), eq(offers.shopId, input.shopId))
      )
      .limit(1)
    if (!offer) return false

    const [before] = await tx
      .select()
      .from(offerCurrentFacts)
      .where(eq(offerCurrentFacts.offerId, input.offerId))
      .limit(1)
    const now = new Date()
    const changed: Record<string, unknown> = {}
    const factUpdates: Partial<typeof offerCurrentFacts.$inferInsert> = {
      sourceType: "merchant_portal",
      confirmation: "merchant_confirmed",
      actorId: input.userId,
      updatedAt: now,
    }

    if (input.priceToman !== undefined) {
      const validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      changed.priceToman = input.priceToman
      factUpdates.priceToman = String(input.priceToman)
      factUpdates.priceObservedAt = now
      factUpdates.priceValidUntil = validUntil
      factUpdates.priceEvidenceUrl = null
      factUpdates.priceSourceType = "merchant_portal"
      factUpdates.priceConfirmation = "merchant_confirmed"
      await tx
        .update(offers)
        .set({ priceToman: String(input.priceToman), lastPriceChangedAt: now })
        .where(eq(offers.offerId, input.offerId))
      await tx.insert(offerFactObservations).values({
        offerId: input.offerId,
        factKey: "price",
        priceToman: String(input.priceToman),
        stockStatus: "unknown",
        sourceType: "merchant_portal",
        confirmation: "merchant_confirmed",
        observedAt: now,
        validUntil,
        actorId: input.userId,
        payload: { priceToman: input.priceToman },
      })
    }

    if (input.stockStatus !== undefined) {
      const validUntil = new Date(now.getTime() + 30 * 60 * 1000)
      changed.stockStatus = input.stockStatus
      changed.stockQuantity = input.stockQuantity ?? null
      factUpdates.stockStatus = input.stockStatus
      factUpdates.stockQuantity = input.stockQuantity ?? null
      factUpdates.stockObservedAt = now
      factUpdates.stockValidUntil = validUntil
      factUpdates.stockEvidenceUrl = null
      factUpdates.stockSourceType = "merchant_portal"
      factUpdates.stockConfirmation = "merchant_confirmed"
      await tx.insert(offerFactObservations).values({
        offerId: input.offerId,
        factKey: "stock",
        stockStatus: input.stockStatus,
        stockQuantity: input.stockQuantity ?? null,
        sourceType: "merchant_portal",
        confirmation: "merchant_confirmed",
        observedAt: now,
        validUntil,
        actorId: input.userId,
        payload: {
          stockStatus: input.stockStatus,
          stockQuantity: input.stockQuantity ?? null,
        },
      })
    }

    if (input.priceToman !== undefined || input.stockStatus !== undefined) {
      await tx
        .insert(offerCurrentFacts)
        .values({ offerId: input.offerId, ...factUpdates })
        .onConflictDoUpdate({
          target: offerCurrentFacts.offerId,
          set: factUpdates,
        })
    }
    await tx.insert(merchantAuditLogs).values({
      actorId: input.userId,
      shopId: input.shopId,
      action: "offer.fact.update",
      entityType: "offer",
      entityId: input.offerId,
      beforeValue: before
        ? {
            priceToman: before.priceToman,
            stockStatus: before.stockStatus,
            stockQuantity: before.stockQuantity,
          }
        : { priceToman: offer.priceToman, stockStatus: "unknown" },
      afterValue: changed,
    })
    return true
  })
}

export async function updateShopFacts(input: {
  userId: string
  shopId: string
  weeklyHours?: WeeklyHours
  contacts?: ShopContact[]
  websiteUrl?: string | null
  timeZone?: string
}) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const [shop] = await tx
      .select()
      .from(shops)
      .where(eq(shops.shopId, input.shopId))
      .limit(1)
    if (!shop) return false
    const now = new Date()
    const patch: Partial<typeof shops.$inferInsert> = {}
    const updated: Record<string, unknown> = {}
    const facts: Array<{ key: string; value: unknown; ttlMs: number }> = []

    if (input.weeklyHours !== undefined) {
      patch.weeklyHours = input.weeklyHours
      updated.weeklyHours = input.weeklyHours
      facts.push({
        key: "weeklyHours",
        value: input.weeklyHours,
        ttlMs: 7 * 24 * 60 * 60 * 1000,
      })
    }
    if (input.contacts !== undefined) {
      patch.contacts = input.contacts
      updated.contacts = input.contacts
      facts.push({
        key: "contacts",
        value: input.contacts,
        ttlMs: 30 * 24 * 60 * 60 * 1000,
      })
    }
    if (input.websiteUrl !== undefined) {
      patch.websiteUrl = input.websiteUrl
      updated.websiteUrl = input.websiteUrl
      facts.push({
        key: "websiteUrl",
        value: input.websiteUrl,
        ttlMs: 30 * 24 * 60 * 60 * 1000,
      })
    }
    if (input.timeZone !== undefined) {
      patch.timeZone = input.timeZone
      updated.timeZone = input.timeZone
    }
    if (Object.keys(patch).length === 0) return true

    await tx.update(shops).set(patch).where(eq(shops.shopId, input.shopId))
    for (const fact of facts) {
      await tx.insert(shopFactObservations).values({
        shopId: input.shopId,
        factKey: fact.key,
        factValue: fact.value,
        sourceType: "merchant_portal",
        confirmation: "merchant_confirmed",
        observedAt: now,
        validUntil: new Date(now.getTime() + fact.ttlMs),
        actorId: input.userId,
      })
    }
    await tx.insert(merchantAuditLogs).values({
      actorId: input.userId,
      shopId: input.shopId,
      action: "shop.facts.update",
      entityType: "shop",
      entityId: input.shopId,
      beforeValue: {
        weeklyHours: shop.weeklyHours,
        contacts: shop.contacts,
        websiteUrl: shop.websiteUrl,
        timeZone: shop.timeZone,
      },
      afterValue: updated,
    })
    return true
  })
}

export async function submitUnmatchedProduct(input: {
  userId: string
  shopId: string
  title: string
  brandName?: string
  model?: string
  categoryName?: string
  priceToman?: number
  stockStatus?: "in_stock" | "out_of_stock" | "unknown"
}) {
  const [submission] = await getDb()
    .insert(productSubmissions)
    .values({
      submittedBy: input.userId,
      shopId: input.shopId,
      title: input.title,
      brandName: input.brandName,
      model: input.model,
      categoryName: input.categoryName,
      priceToman:
        input.priceToman === undefined ? undefined : String(input.priceToman),
      stockStatus: input.stockStatus,
    })
    .returning({ id: productSubmissions.id })
  return submission
}

export async function addShopSource(input: {
  userId: string
  shopId: string
  url: string
}) {
  const [source] = await getDb()
    .insert(shopSources)
    .values({
      shopId: input.shopId,
      sourceType: "website",
      url: input.url,
      status: "pending",
      createdBy: input.userId,
    })
    .onConflictDoNothing()
    .returning({ id: shopSources.id, status: shopSources.status })
  return source ?? null
}

export async function listUserClaims(userId: string) {
  return getDb()
    .select({
      id: merchantClaims.id,
      status: merchantClaims.status,
      evidenceUrl: merchantClaims.evidenceUrl,
      message: merchantClaims.message,
      createdAt: merchantClaims.createdAt,
      reviewNote: merchantClaims.reviewNote,
      shopId: shops.shopId,
      shopName: shops.name,
      address: shops.address,
    })
    .from(merchantClaims)
    .innerJoin(shops, eq(shops.shopId, merchantClaims.shopId))
    .where(eq(merchantClaims.userId, userId))
    .orderBy(desc(merchantClaims.createdAt))
}
