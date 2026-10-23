import { NextResponse } from "next/server"
import { and, eq, gt } from "drizzle-orm"
import {
  getDb,
  instagramOAuthStates,
  merchantAuditLogs,
  shops,
  shopSources,
} from "@workspace/db"
import { encryptSetting, getRuntimeSettings } from "@/lib/runtime-settings"
import { parsePublicHttpsUrl } from "@/lib/safe-url"
import { getCanonicalAppUrl } from "@/lib/request-security"

type TokenResult = {
  access_token?: string
  user_id?: string | number
  expires_in?: number
  error_message?: string
}

function redirectToMerchant(request: Request, result: "connected" | "error") {
  const appUrl = getCanonicalAppUrl(request)
  if (!appUrl)
    return NextResponse.json(
      { error: "BETTER_AUTH_URL is not configured." },
      { status: 503 }
    )
  const destination = new URL("/merchant", appUrl)
  destination.searchParams.set("instagram", result)
  return NextResponse.redirect(destination)
}

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url)
  const state = callbackUrl.searchParams.get("state") ?? ""
  const code = callbackUrl.searchParams.get("code") ?? ""
  if (!state || !code || callbackUrl.searchParams.get("error"))
    return redirectToMerchant(request, "error")

  const db = getDb()
  const [oauthState] = await db
    .select()
    .from(instagramOAuthStates)
    .where(
      and(
        eq(instagramOAuthStates.state, state),
        gt(instagramOAuthStates.expiresAt, new Date())
      )
    )
    .limit(1)
  await db
    .delete(instagramOAuthStates)
    .where(eq(instagramOAuthStates.state, state))
  if (!oauthState) return redirectToMerchant(request, "error")

  const settings = await getRuntimeSettings()
  if (!settings.instagramAppId || !settings.instagramAppSecret)
    return redirectToMerchant(request, "error")
  const appUrl = getCanonicalAppUrl(request)
  if (!appUrl)
    return NextResponse.json(
      { error: "BETTER_AUTH_URL is not configured." },
      { status: 503 }
    )
  const redirectUri = new URL(
    "/api/merchant/instagram/callback",
    appUrl
  ).toString()
  const tokenBody = new URLSearchParams({
    client_id: settings.instagramAppId,
    client_secret: settings.instagramAppSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  })
  const shortResponse = await fetch(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody,
      signal: AbortSignal.timeout(10_000),
    }
  ).catch(() => null)
  if (!shortResponse?.ok) return redirectToMerchant(request, "error")
  const shortToken = (await shortResponse
    .json()
    .catch(() => null)) as TokenResult | null
  if (!shortToken?.access_token) return redirectToMerchant(request, "error")

  const exchangeUrl = new URL("https://graph.instagram.com/access_token")
  exchangeUrl.searchParams.set("grant_type", "ig_exchange_token")
  exchangeUrl.searchParams.set("client_secret", settings.instagramAppSecret)
  exchangeUrl.searchParams.set("access_token", shortToken.access_token)
  const longResponse = await fetch(exchangeUrl, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!longResponse?.ok) return redirectToMerchant(request, "error")
  const longToken = (await longResponse
    .json()
    .catch(() => null)) as TokenResult | null
  if (!longToken?.access_token) return redirectToMerchant(request, "error")

  const profileUrl = new URL("https://graph.instagram.com/me")
  profileUrl.pathname = `/${settings.instagramApiVersion}/me`
  profileUrl.searchParams.set("fields", "id,user_id,username")
  profileUrl.searchParams.set("access_token", longToken.access_token)
  const profileResponse = await fetch(profileUrl, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!profileResponse?.ok) return redirectToMerchant(request, "error")
  const profile = (await profileResponse.json().catch(() => null)) as {
    id?: string
    user_id?: string
    username?: string
  } | null
  const username = profile?.username?.trim()
  const externalId = String(
    profile?.id ?? profile?.user_id ?? shortToken.user_id ?? ""
  )
  if (!username || !/^[A-Za-z0-9._]{1,30}$/.test(username) || !externalId)
    return redirectToMerchant(request, "error")

  const sourceUrl = parsePublicHttpsUrl(
    `https://www.instagram.com/${username}/`
  )
  if (!sourceUrl) return redirectToMerchant(request, "error")
  const expiresIn = Number(longToken.expires_in)
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : null
  const now = new Date()
  await db.transaction(async (tx) => {
    const [source] = await tx
      .insert(shopSources)
      .values({
        shopId: oauthState.shopId,
        sourceType: "instagram",
        url: sourceUrl.toString(),
        status: "active",
        displayName: username,
        externalAccountId: externalId,
        oauthUsername: username,
        encryptedAccessToken: encryptSetting(longToken.access_token!),
        tokenExpiresAt: expiresAt,
        createdBy: oauthState.userId,
        approvedAt: now,
      })
      .onConflictDoUpdate({
        target: [shopSources.shopId, shopSources.sourceType, shopSources.url],
        set: {
          status: "active",
          displayName: username,
          externalAccountId: externalId,
          oauthUsername: username,
          encryptedAccessToken: encryptSetting(longToken.access_token!),
          tokenExpiresAt: expiresAt,
          approvedAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: shopSources.id })
    if (!source) throw new Error("Instagram source could not be saved")
    await tx
      .update(shops)
      .set({ instagram: sourceUrl.toString() })
      .where(eq(shops.shopId, oauthState.shopId))
    await tx
      .insert(merchantAuditLogs)
      .values({
        actorId: oauthState.userId,
        shopId: oauthState.shopId,
        action: "shop.instagram.connect",
        entityType: "shop_source",
        entityId: source.id,
        afterValue: { username, status: "active" },
      })
  })
  return redirectToMerchant(request, "connected")
}
