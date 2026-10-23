import { NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { getDb, merchantAuditLogs, shopSources, shops } from "@workspace/db"
import { getMerchantUser, isMerchantAdmin } from "@/lib/merchant-session"
import { parsePublicHttpsUrl } from "@/lib/safe-url"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"
import { z } from "zod"

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["active", "rejected"]),
})
const createSchema = z.object({
  shopId: z.string().trim().min(1).max(128),
  url: z.string().url().max(2048),
})

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 }
    )
  const actor = await getMerchantUser(request)
  if (!actor || !isMerchantAdmin(actor.email))
    return NextResponse.json(
      { error: "Admin access required." },
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
  const parsed = createSchema.safeParse(payload.value)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid shop source." }, { status: 400 })
  const url = parsePublicHttpsUrl(parsed.data.url)
  if (!url)
    return NextResponse.json(
      { error: "Source must be a public HTTPS URL." },
      { status: 400 }
    )
  const db = getDb()
  const [shop] = await db
    .select({ shopId: shops.shopId })
    .from(shops)
    .where(eq(shops.shopId, parsed.data.shopId))
    .limit(1)
  if (!shop)
    return NextResponse.json({ error: "Shop not found." }, { status: 404 })
  const now = new Date()
  const [source] = await db
    .insert(shopSources)
    .values({
      shopId: shop.shopId,
      sourceType: "website",
      url: url.toString(),
      status: "active",
      createdBy: actor.id,
      approvedBy: actor.id,
      approvedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [shopSources.shopId, shopSources.sourceType, shopSources.url],
      set: {
        status: "active",
        approvedBy: actor.id,
        approvedAt: now,
        updatedAt: now,
      },
    })
    .returning({
      id: shopSources.id,
      shopId: shopSources.shopId,
      status: shopSources.status,
      url: shopSources.url,
    })
  await db
    .insert(merchantAuditLogs)
    .values({
      actorId: actor.id,
      shopId: shop.shopId,
      action: "shop.source.admin_create",
      entityType: "shop_source",
      entityId: source!.id,
      afterValue: {
        url: source!.url,
        sourceType: "website",
        status: source!.status,
      },
    })
  return NextResponse.json({ source }, { status: 201 })
}

export async function GET(request: Request) {
  const actor = await getMerchantUser(request)
  if (!actor || !isMerchantAdmin(actor.email))
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    )
  const sources = await getDb()
    .select({
      id: shopSources.id,
      shopId: shops.shopId,
      shopName: shops.name,
      type: shopSources.sourceType,
      url: shopSources.url,
      status: shopSources.status,
      createdAt: shopSources.createdAt,
    })
    .from(shopSources)
    .innerJoin(shops, eq(shops.shopId, shopSources.shopId))
    .where(eq(shopSources.status, "pending"))
    .orderBy(desc(shopSources.createdAt))
    .limit(200)
  return NextResponse.json({ sources })
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 }
    )
  const actor = await getMerchantUser(request)
  if (!actor || !isMerchantAdmin(actor.email))
    return NextResponse.json(
      { error: "Admin access required." },
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
      { error: "Invalid source review." },
      { status: 400 }
    )
  const now = new Date()
  const [source] = await getDb()
    .update(shopSources)
    .set({
      status: parsed.data.decision,
      approvedBy: actor.id,
      approvedAt: parsed.data.decision === "active" ? now : null,
      updatedAt: now,
    })
    .where(
      and(eq(shopSources.id, parsed.data.id), eq(shopSources.status, "pending"))
    )
    .returning({
      id: shopSources.id,
      shopId: shopSources.shopId,
      status: shopSources.status,
      url: shopSources.url,
    })
  if (!source)
    return NextResponse.json(
      { error: "Pending source not found." },
      { status: 404 }
    )
  await getDb()
    .insert(merchantAuditLogs)
    .values({
      actorId: actor.id,
      shopId: source.shopId,
      action: `shop.source.${parsed.data.decision}`,
      entityType: "shop_source",
      entityId: source.id,
      afterValue: { status: source.status, url: source.url },
    })
  return NextResponse.json({ source })
}
