import { NextResponse } from "next/server"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import {
  getDb,
  merchantAuditLogs,
  offerCurrentFacts,
  offerFactObservations,
  offers,
  productSubmissions,
  products,
  shops,
} from "@workspace/db"
import { getVerifiedUser, isSystemAdmin } from "@/lib/merchant-session"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  productId: z.string().max(128).optional(),
  note: z.string().max(1000).optional(),
})

export async function GET(request: Request) {
  const actor = await getVerifiedUser(request)
  if (!actor || !isSystemAdmin(actor.email))
    return NextResponse.json(
      { error: "System administrator access required." },
      { status: 403 }
    )
  const submissions = await getDb()
    .select({
      id: productSubmissions.id,
      shopId: shops.shopId,
      shopName: shops.name,
      title: productSubmissions.title,
      brandName: productSubmissions.brandName,
      model: productSubmissions.model,
      categoryName: productSubmissions.categoryName,
      priceToman: productSubmissions.priceToman,
      stockStatus: productSubmissions.stockStatus,
      createdAt: productSubmissions.createdAt,
    })
    .from(productSubmissions)
    .innerJoin(shops, eq(shops.shopId, productSubmissions.shopId))
    .where(eq(productSubmissions.status, "pending"))
    .orderBy(asc(productSubmissions.createdAt))
    .limit(200)
  return NextResponse.json({ submissions })
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 }
    )
  const actor = await getVerifiedUser(request)
  if (!actor || !isSystemAdmin(actor.email))
    return NextResponse.json(
      { error: "System administrator access required." },
      { status: 403 }
    )
  const rateLimit = await enforceRateLimit(request, "admin-write", 60)
  if (!rateLimit.allowed)
    return NextResponse.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      }
    )
  const payload = await readJsonBody(request, 8 * 1024)
  if (!payload.ok)
    return NextResponse.json(
      { error: "Invalid or oversized JSON request." },
      { status: payload.status }
    )
  const parsed = reviewSchema.safeParse(payload.value)
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid product review." },
      { status: 400 }
    )
  const db = getDb()
  const result = await db
    .transaction(async (tx) => {
      const [submission] = await tx
        .select()
        .from(productSubmissions)
        .where(
          and(
            eq(productSubmissions.id, parsed.data.id),
            eq(productSubmissions.status, "pending")
          )
        )
        .limit(1)
      if (!submission) return false
      const now = new Date()
      let linkedProductId = submission.linkedProductId
      if (parsed.data.decision === "approved") {
        if (parsed.data.productId) {
          const [existing] = await tx
            .select({ id: products.productId })
            .from(products)
            .where(eq(products.productId, parsed.data.productId))
            .limit(1)
          if (!existing) throw new Error("Linked product does not exist.")
          linkedProductId = existing.id
        } else if (!linkedProductId) {
          linkedProductId = `merchant-${randomUUID()}`
          await tx.insert(products).values({
            productId: linkedProductId,
            persianTitle: submission.title,
            brandName: submission.brandName,
            model: submission.model,
            categoryName: submission.categoryName,
            specs: submission.specs,
            imageUrls: submission.imageUrls,
          })
        }
        const offerId = `merchant-${submission.id}`
        await tx.insert(offers).values({
          offerId,
          productId: linkedProductId!,
          shopId: submission.shopId,
          sellerTitle: submission.title,
          priceToman: submission.priceToman,
          lastPriceChangedAt: submission.priceToman ? now : null,
        })
        if (submission.priceToman || submission.stockStatus !== "unknown") {
          const validPriceUntil = submission.priceToman
            ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
            : null
          const validStockUntil =
            submission.stockStatus !== "unknown"
              ? new Date(now.getTime() + 30 * 60 * 1000)
              : null
          await tx.insert(offerCurrentFacts).values({
            offerId,
            priceToman: submission.priceToman,
            stockStatus: submission.stockStatus,
            sourceType: "merchant_portal",
            confirmation: "merchant_confirmed",
            actorId: submission.submittedBy,
            priceObservedAt: submission.priceToman ? now : null,
            priceValidUntil: validPriceUntil,
            priceSourceType: submission.priceToman ? "merchant_portal" : null,
            priceConfirmation: submission.priceToman
              ? "merchant_confirmed"
              : null,
            stockObservedAt: submission.stockStatus !== "unknown" ? now : null,
            stockValidUntil: validStockUntil,
            stockSourceType:
              submission.stockStatus !== "unknown" ? "merchant_portal" : null,
            stockConfirmation:
              submission.stockStatus !== "unknown"
                ? "merchant_confirmed"
                : null,
          })
          if (submission.priceToman)
            await tx.insert(offerFactObservations).values({
              offerId,
              factKey: "price",
              priceToman: submission.priceToman,
              stockStatus: "unknown",
              sourceType: "merchant_portal",
              confirmation: "merchant_confirmed",
              observedAt: now,
              validUntil: validPriceUntil,
              actorId: submission.submittedBy,
            })
          if (submission.stockStatus !== "unknown")
            await tx.insert(offerFactObservations).values({
              offerId,
              factKey: "stock",
              stockStatus: submission.stockStatus,
              sourceType: "merchant_portal",
              confirmation: "merchant_confirmed",
              observedAt: now,
              validUntil: validStockUntil,
              actorId: submission.submittedBy,
            })
        }
      }
      await tx
        .update(productSubmissions)
        .set({
          status: parsed.data.decision,
          linkedProductId,
          reviewedAt: now,
          reviewedBy: actor.id,
          reviewNote: parsed.data.note,
        })
        .where(eq(productSubmissions.id, submission.id))
      await tx.insert(merchantAuditLogs).values({
        actorId: actor.id,
        shopId: submission.shopId,
        action: `product.submission.${parsed.data.decision}`,
        entityType: "product_submission",
        entityId: submission.id,
        afterValue: {
          status: parsed.data.decision,
          productId: linkedProductId,
          note: parsed.data.note,
        },
      })
      return true
    })
    .catch((error: unknown) =>
      error instanceof Error &&
      error.message === "Linked product does not exist."
        ? null
        : Promise.reject(error)
    )
  if (result === null)
    return NextResponse.json(
      { error: "Linked product does not exist." },
      { status: 404 }
    )
  return result
    ? NextResponse.json({ ok: true })
    : NextResponse.json(
        { error: "Pending submission not found." },
        { status: 404 }
      )
}
