import { NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import {
  getDb,
  merchantAuditLogs,
  merchantClaims,
  merchantShopMemberships,
  shops,
  user,
} from "@workspace/db"
import { getSystemAdminUser } from "@/lib/merchant-session"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"
import { z } from "zod"

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).optional(),
})

export async function GET(request: Request) {
  const actor = await getSystemAdminUser(request)
  if (!actor)
    return NextResponse.json(
      { error: "System administrator access required." },
      { status: 403 }
    )
  const status = new URL(request.url).searchParams.get("status") ?? "pending"
  if (!["pending", "approved", "rejected"].includes(status))
    return NextResponse.json({ error: "Invalid status." }, { status: 400 })
  const claims = await getDb()
    .select({
      id: merchantClaims.id,
      userId: merchantClaims.userId,
      email: user.email,
      name: user.name,
      shopId: shops.shopId,
      shopName: shops.name,
      address: shops.address,
      evidenceUrl: merchantClaims.evidenceUrl,
      message: merchantClaims.message,
      status: merchantClaims.status,
      createdAt: merchantClaims.createdAt,
    })
    .from(merchantClaims)
    .innerJoin(user, eq(user.id, merchantClaims.userId))
    .innerJoin(shops, eq(shops.shopId, merchantClaims.shopId))
    .where(
      eq(merchantClaims.status, status as "pending" | "approved" | "rejected")
    )
    .orderBy(desc(merchantClaims.createdAt))
    .limit(200)
  return NextResponse.json({ claims })
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 }
    )
  const actor = await getSystemAdminUser(request)
  if (!actor)
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
    return NextResponse.json({ error: "Invalid review." }, { status: 400 })
  const db = getDb()
  const result = await db.transaction(async (tx) => {
    const [claim] = await tx
      .select()
      .from(merchantClaims)
      .where(
        and(
          eq(merchantClaims.id, parsed.data.id),
          eq(merchantClaims.status, "pending")
        )
      )
      .limit(1)
    if (!claim) return false
    const now = new Date()
    await tx
      .update(merchantClaims)
      .set({
        status: parsed.data.decision,
        reviewedAt: now,
        reviewedBy: actor.id,
        reviewNote: parsed.data.note,
      })
      .where(eq(merchantClaims.id, claim.id))
    if (parsed.data.decision === "approved") {
      await tx
        .insert(merchantShopMemberships)
        .values({
          userId: claim.userId,
          shopId: claim.shopId,
          role: "owner",
          verifiedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            merchantShopMemberships.userId,
            merchantShopMemberships.shopId,
          ],
          set: { role: "owner", verifiedAt: now },
        })
    }
    await tx.insert(merchantAuditLogs).values({
      actorId: actor.id,
      shopId: claim.shopId,
      action: `merchant.claim.${parsed.data.decision}`,
      entityType: "merchant_claim",
      entityId: claim.id,
      beforeValue: { status: "pending" },
      afterValue: { status: parsed.data.decision, note: parsed.data.note },
    })
    return true
  })
  return result
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Pending claim not found." }, { status: 404 })
}
