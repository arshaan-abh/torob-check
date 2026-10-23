import { NextResponse } from "next/server"
import { z } from "zod"
import { getMerchantUser } from "@/lib/merchant-session"
import { hasShopAccess, submitUnmatchedProduct } from "@/lib/merchant-data"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"

const submissionSchema = z.object({
  shopId: z.string().min(1).max(128),
  title: z.string().trim().min(2).max(200),
  brandName: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  categoryName: z.string().trim().max(120).optional(),
  priceToman: z.number().int().positive().max(1_000_000_000_000).optional(),
  stockStatus: z.enum(["in_stock", "out_of_stock", "unknown"]).optional(),
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
  const payload = await readJsonBody(request, 16 * 1024)
  if (!payload.ok)
    return NextResponse.json(
      { error: "Invalid or oversized JSON request." },
      { status: payload.status }
    )
  const parsed = submissionSchema.safeParse(payload.value)
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid product submission." },
      { status: 400 }
    )
  if (!(await hasShopAccess(user.id, parsed.data.shopId)))
    return NextResponse.json(
      { error: "Shop access is not approved." },
      { status: 403 }
    )
  const submission = await submitUnmatchedProduct({
    userId: user.id,
    ...parsed.data,
  })
  return NextResponse.json({ submission }, { status: 201 })
}
