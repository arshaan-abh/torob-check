import { NextResponse } from "next/server"
import { appSettings, getDb, merchantAuditLogs } from "@workspace/db"
import {
  getAuthenticatedUser,
  isSystemAdminConfigured,
} from "@/lib/merchant-session"
import { isSystemAdmin } from "@/lib/system-admin"
import {
  encryptSetting,
  getRuntimeSettings,
  invalidateRuntimeSettingsCache,
  settingsAreSecret,
  type RuntimeSettings,
} from "@/lib/runtime-settings"
import { parsePublicHttpsUrl } from "@/lib/safe-url"
import {
  enforceRateLimit,
  hasTrustedOrigin,
  readJsonBody,
} from "@/lib/request-security"
import { z } from "zod"

export const dynamic = "force-dynamic"

const secretKeys = [
  "aiGatewayApiKey",
  "googleApiKey",
  "openrouterApiKey",
  "compatibleApiKey",
  "tavilyApiKey",
  "instagramAppSecret",
  "smtpUrl",
  "resendApiKey",
] as const
const valuesSchema = z.object({
  aiProvider: z
    .enum(["gateway", "google", "openrouter", "openai-compatible"])
    .optional(),
  aiModel: z.string().trim().max(160).optional(),
  aiGatewayApiKey: z.string().max(4096).optional(),
  googleApiKey: z.string().max(4096).optional(),
  openrouterApiKey: z.string().max(4096).optional(),
  openrouterBaseUrl: z.string().max(500).optional(),
  compatibleApiKey: z.string().max(4096).optional(),
  compatibleBaseUrl: z.string().max(500).optional(),
  tavilyApiKey: z.string().max(4096).optional(),
  instagramAppId: z.string().trim().max(128).optional(),
  instagramAppSecret: z.string().max(4096).optional(),
  instagramApiVersion: z
    .string()
    .regex(/^v\d{1,2}\.\d{1,2}$/)
    .optional(),
  emailProvider: z.enum(["smtp", "resend"]).optional(),
  smtpUrl: z.string().max(4096).optional(),
  smtpFrom: z.string().trim().max(254).optional(),
  resendApiKey: z.string().max(4096).optional(),
})
const bodySchema = z.object({
  values: valuesSchema,
  clearSecrets: z.array(z.enum(secretKeys)).max(secretKeys.length).optional(),
})

function allowedProviderUrl(value: string) {
  if (
    process.env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(value)
  )
    return true
  return parsePublicHttpsUrl(value) !== null
}

export async function GET(request: Request) {
  if (!(await isSystemAdminConfigured()))
    return NextResponse.json(
      { error: "Admin setup required.", setupRequired: true },
      { status: 503 }
    )
  const actor = await getAuthenticatedUser(request)
  if (!actor)
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  if (!(await isSystemAdmin(actor.id, actor.email)))
    return NextResponse.json(
      { error: "System administrator access required." },
      { status: 403 }
    )
  const values = await getRuntimeSettings()
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    data[key] = settingsAreSecret(key as keyof RuntimeSettings)
      ? { configured: Boolean(value) }
      : value
  }
  return NextResponse.json({
    settings: data,
    encryptionReady: Boolean(process.env.SETTINGS_ENCRYPTION_KEY),
  })
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 }
    )
  if (!(await isSystemAdminConfigured()))
    return NextResponse.json(
      { error: "Admin setup required.", setupRequired: true },
      { status: 503 }
    )
  const actor = await getAuthenticatedUser(request)
  if (!actor)
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  if (!(await isSystemAdmin(actor.id, actor.email)))
    return NextResponse.json(
      { error: "System administrator access required." },
      { status: 403 }
    )
  const rateLimit = await enforceRateLimit(request, "admin-write", 20)
  if (!rateLimit.allowed)
    return NextResponse.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      }
    )
  const payload = await readJsonBody(request, 64 * 1024)
  if (!payload.ok)
    return NextResponse.json(
      { error: "Invalid or oversized JSON request." },
      { status: payload.status }
    )
  const parsed = bodySchema.safeParse(payload.value)
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid settings." }, { status: 400 })
  const { values, clearSecrets = [] } = parsed.data
  for (const key of ["openrouterBaseUrl", "compatibleBaseUrl"] as const) {
    const value = values[key]
    if (value && !allowedProviderUrl(value))
      return NextResponse.json(
        { error: `${key} must be a public HTTPS URL.` },
        { status: 400 }
      )
  }
  if (values.smtpUrl && !/^smtps?:\/\//i.test(values.smtpUrl))
    return NextResponse.json(
      { error: "SMTP URL must use smtp:// or smtps://." },
      { status: 400 }
    )
  if (values.smtpFrom && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.smtpFrom))
    return NextResponse.json(
      { error: "Enter a valid sender email address." },
      { status: 400 }
    )

  const changed: string[] = []
  const db = getDb()
  const now = new Date()
  try {
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        if (
          value === undefined ||
          (secretKeys.includes(key as (typeof secretKeys)[number]) &&
            value === "")
        )
          continue
        const settingKey = key as keyof RuntimeSettings
        const storedValue = settingsAreSecret(settingKey)
          ? encryptSetting(value)
          : value
        await tx
          .insert(appSettings)
          .values({
            key,
            value: storedValue,
            isSecret: settingsAreSecret(settingKey),
            updatedBy: actor.id,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: {
              value: storedValue,
              isSecret: settingsAreSecret(settingKey),
              updatedBy: actor.id,
              updatedAt: now,
            },
          })
        changed.push(key)
      }
      for (const key of clearSecrets) {
        await tx
          .insert(appSettings)
          .values({
            key,
            value: encryptSetting(""),
            isSecret: true,
            updatedBy: actor.id,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: {
              value: encryptSetting(""),
              isSecret: true,
              updatedBy: actor.id,
              updatedAt: now,
            },
          })
        changed.push(key)
      }
      await tx.insert(merchantAuditLogs).values({
        actorId: actor.id,
        action: "admin.settings.update",
        entityType: "app_settings",
        afterValue: { keys: [...new Set(changed)] },
      })
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save settings."
    return NextResponse.json({ error: message }, { status: 503 })
  }
  invalidateRuntimeSettingsCache()
  return NextResponse.json({ ok: true, updatedKeys: [...new Set(changed)] })
}
