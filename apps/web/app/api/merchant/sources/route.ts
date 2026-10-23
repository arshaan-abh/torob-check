import { NextResponse } from "next/server"
import { z } from "zod"
import { getDb, merchantAuditLogs, shopSources } from "@workspace/db"
import { getMerchantUser } from "@/lib/merchant-session"
import { hasShopAccess } from "@/lib/merchant-data"
import { parsePublicHttpsUrl } from "@/lib/safe-url"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"

const sourceSchema = z.object({
  shopId: z.string().min(1).max(128),
  url: z.string().url().max(2048),
})

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 }
    )
  const user = await getMerchantUser(request)
  if (!user)
    return NextResponse.json(
      { error: "Sign in with a verified email." },
      { status: 401 }
    )
  const rateLimit = await enforceRateLimit(request, "merchant-write", 30)
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
  const parsed = sourceSchema.safeParse(payload.value)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid source." }, { status: 400 })
  const url = parsePublicHttpsUrl(parsed.data.url)
  if (!url)
    return NextResponse.json(
      { error: "Source must be a public HTTPS website." },
      { status: 400 }
    )
  if (!(await hasShopAccess(user.id, parsed.data.shopId)))
    return NextResponse.json(
      { error: "Shop access is not approved." },
      { status: 403 }
    )
  const [source] = await getDb()
    .insert(shopSources)
    .values({
      shopId: parsed.data.shopId,
      sourceType: "website",
      url: url.toString(),
      status: "pending",
      createdBy: user.id,
    })
    .onConflictDoNothing()
    .returning({ id: shopSources.id, status: shopSources.status })
  if (source) {
    await getDb()
      .insert(merchantAuditLogs)
      .values({
        actorId: user.id,
        shopId: parsed.data.shopId,
        action: "shop.source.request",
        entityType: "shop_source",
        entityId: source.id,
        afterValue: { url: url.toString(), status: source.status },
      })
  }
  return NextResponse.json(
    { source: source ?? { status: "already_requested" } },
    { status: source ? 201 : 200 }
  )
}
