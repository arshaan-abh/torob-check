import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { getDb, instagramOAuthStates } from "@workspace/db"
import { getMerchantUser } from "@/lib/merchant-session"
import { hasShopAccess } from "@/lib/merchant-data"
import { getRuntimeSettings } from "@/lib/runtime-settings"
import { getCanonicalAppUrl, hasTrustedOrigin } from "@/lib/request-security"

export async function GET(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 }
    )
  const actor = await getMerchantUser(request)
  if (!actor)
    return NextResponse.json(
      { error: "Sign in with a verified email." },
      { status: 401 }
    )
  const url = new URL(request.url)
  const shopId = url.searchParams.get("shopId") ?? ""
  if (!(await hasShopAccess(actor.id, shopId)))
    return NextResponse.json(
      { error: "Shop access is not approved." },
      { status: 403 }
    )
  const settings = await getRuntimeSettings()
  if (!settings.instagramAppId || !settings.instagramAppSecret)
    return NextResponse.json(
      { error: "Instagram app settings are incomplete." },
      { status: 503 }
    )
  const canonicalAppUrl = getCanonicalAppUrl(request)
  if (!canonicalAppUrl)
    return NextResponse.json(
      {
        error:
          "BETTER_AUTH_URL must be configured before connecting Instagram.",
      },
      { status: 503 }
    )
  const state = randomBytes(32).toString("hex")
  await getDb()
    .insert(instagramOAuthStates)
    .values({
      userId: actor.id,
      shopId,
      state,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    })
  const redirectUri = new URL(
    "/api/merchant/instagram/callback",
    canonicalAppUrl
  ).toString()
  const authUrl = new URL("https://www.instagram.com/oauth/authorize")
  authUrl.searchParams.set("client_id", settings.instagramAppId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", "instagram_business_basic")
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("enable_fb_login", "0")
  return NextResponse.redirect(authUrl)
}
