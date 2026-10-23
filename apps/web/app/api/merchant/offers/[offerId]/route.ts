import { NextResponse } from "next/server"
import { z } from "zod"
import { getMerchantUser } from "@/lib/merchant-session"
import { hasShopAccess, recordOfferUpdate } from "@/lib/merchant-data"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"

const updateSchema = z
  .object({
    shopId: z.string().min(1).max(128),
    priceToman: z.number().int().positive().max(1_000_000_000_000).optional(),
    stockStatus: z.enum(["in_stock", "out_of_stock", "unknown"]).optional(),
    stockQuantity: z
      .number()
      .int()
      .nonnegative()
      .max(1_000_000)
      .nullable()
      .optional(),
  })
  .refine(
    (data) => data.priceToman !== undefined || data.stockStatus !== undefined,
    "Provide a price or stock update."
  )

export async function PATCH(
  request: Request,
  context: { params: Promise<{ offerId: string }> }
) {
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
  const { offerId } = await context.params
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
  const parsed = updateSchema.safeParse(payload.value)
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid offer update." },
      { status: 400 }
    )
  if (!(await hasShopAccess(user.id, parsed.data.shopId)))
    return NextResponse.json(
      { error: "Shop access is not approved." },
      { status: 403 }
    )
  const ok = await recordOfferUpdate({
    userId: user.id,
    offerId,
    ...parsed.data,
  })
  if (!ok)
    return NextResponse.json(
      { error: "Offer does not belong to this shop." },
      { status: 404 }
    )
  return NextResponse.json({ ok: true })
}
