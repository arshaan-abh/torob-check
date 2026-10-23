import { NextResponse } from "next/server"
import { z } from "zod"
import { getMerchantUser } from "@/lib/merchant-session"
import {
  hasShopAccess,
  listShopOffers,
  updateShopFacts,
} from "@/lib/merchant-data"
import { parsePublicHttpsUrl } from "@/lib/safe-url"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"

const hoursSchema = z.record(
  z.string(),
  z.object({
    status: z.string().max(40),
    shifts: z
      .array(
        z.object({
          start_time: z.string().max(20),
          end_time: z.string().max(20),
        })
      )
      .max(4),
  })
)
const contactSchema = z
  .array(
    z
      .object({
        channel: z.string().max(40),
        display_number: z.string().max(80).optional(),
      })
      .passthrough()
  )
  .max(20)
const shopFactsSchema = z.object({
  weeklyHours: hoursSchema.optional(),
  contacts: contactSchema.optional(),
  websiteUrl: z.string().url().max(2048).nullable().optional(),
  timeZone: z.string().max(80).optional(),
})

export async function GET(
  request: Request,
  context: { params: Promise<{ shopId: string }> }
) {
  const user = await getMerchantUser(request)
  if (!user)
    return NextResponse.json(
      { error: "Sign in with a verified email." },
      { status: 401 }
    )
  const { shopId } = await context.params
  if (!(await hasShopAccess(user.id, shopId)))
    return NextResponse.json(
      { error: "Shop access is not approved." },
      { status: 403 }
    )
  return NextResponse.json({ offers: await listShopOffers(shopId) })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ shopId: string }> }
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
  const { shopId } = await context.params
  if (!(await hasShopAccess(user.id, shopId)))
    return NextResponse.json(
      { error: "Shop access is not approved." },
      { status: 403 }
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
  const parsed = shopFactsSchema.safeParse(payload.value)
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid shop details." },
      { status: 400 }
    )
  if (parsed.data.websiteUrl && !parsePublicHttpsUrl(parsed.data.websiteUrl)) {
    return NextResponse.json(
      { error: "Website must be a public HTTPS address." },
      { status: 400 }
    )
  }
  if (parsed.data.timeZone) {
    try {
      new Intl.DateTimeFormat("fa-IR", { timeZone: parsed.data.timeZone })
    } catch {
      return NextResponse.json(
        { error: "Invalid IANA time zone." },
        { status: 400 }
      )
    }
  }
  await updateShopFacts({ userId: user.id, shopId, ...parsed.data })
  return NextResponse.json({ ok: true })
}
