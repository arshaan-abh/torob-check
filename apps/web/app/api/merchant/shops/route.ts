import { NextResponse } from "next/server"
import { z } from "zod"
import { getDb, merchantClaims } from "@workspace/db"
import { getMerchantUser } from "@/lib/merchant-session"
import { searchClaimableShops } from "@/lib/merchant-data"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"
import { parsePublicHttpsUrl } from "@/lib/safe-url"

const claimSchema = z.object({
  shopId: z.string().min(1).max(128),
  evidenceUrl: z.string().url().max(2048).optional(),
  message: z.string().trim().max(1000).optional(),
})

export async function GET(request: Request) {
  const user = await getMerchantUser(request)
  if (!user)
    return NextResponse.json(
      { error: "Sign in with a verified email." },
      { status: 401 }
    )
  const query = new URL(request.url).searchParams.get("q") ?? ""
  return NextResponse.json({ shops: await searchClaimableShops(query) })
}

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
  const parsed = claimSchema.safeParse(payload.value)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid shop claim." }, { status: 400 })
  if (
    parsed.data.evidenceUrl &&
    !parsePublicHttpsUrl(parsed.data.evidenceUrl)
  ) {
    return NextResponse.json(
      { error: "Evidence links must use a public HTTPS address." },
      { status: 400 }
    )
  }

  const [claim] = await getDb()
    .insert(merchantClaims)
    .values({
      userId: user.id,
      shopId: parsed.data.shopId,
      evidenceUrl: parsed.data.evidenceUrl,
      message: parsed.data.message,
    })
    .onConflictDoNothing()
    .returning({ id: merchantClaims.id, status: merchantClaims.status })

  if (!claim) {
    return NextResponse.json(
      { error: "A claim for this shop is already pending." },
      { status: 409 }
    )
  }
  return NextResponse.json({ claim }, { status: 201 })
}
