import "server-only"
import { appSettings, getDb } from "@workspace/db"
import { decryptSecret, encryptSecret } from "@workspace/db/settings-crypto"

export type RuntimeSettings = {
  aiProvider: "gateway" | "google" | "openrouter" | "openai-compatible"
  aiModel: string
  aiGatewayApiKey: string
  googleApiKey: string
  openrouterApiKey: string
  openrouterBaseUrl: string
  compatibleApiKey: string
  compatibleBaseUrl: string
  tavilyApiKey: string
  instagramAppId: string
  instagramAppSecret: string
  instagramApiVersion: string
  smtpUrl: string
  smtpFrom: string
}

type SettingKey = keyof RuntimeSettings

const SECRET_KEYS = new Set<SettingKey>([
  "aiGatewayApiKey",
  "googleApiKey",
  "openrouterApiKey",
  "compatibleApiKey",
  "tavilyApiKey",
  "instagramAppSecret",
  "smtpUrl",
])

const ENV_KEYS: Record<SettingKey, string> = {
  aiProvider: "AI_PROVIDER",
  aiModel: "AI_MODEL",
  aiGatewayApiKey: "AI_GATEWAY_API_KEY",
  googleApiKey: "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouterApiKey: "OPENROUTER_API_KEY",
  openrouterBaseUrl: "OPENROUTER_BASE_URL",
  compatibleApiKey: "AI_PROVIDER_API_KEY",
  compatibleBaseUrl: "AI_PROVIDER_BASE_URL",
  tavilyApiKey: "TAVILY_API_KEY",
  instagramAppId: "INSTAGRAM_APP_ID",
  instagramAppSecret: "INSTAGRAM_APP_SECRET",
  instagramApiVersion: "INSTAGRAM_API_VERSION",
  smtpUrl: "SMTP_URL",
  smtpFrom: "SMTP_FROM",
}

let cache: { expiresAt: number; settings: RuntimeSettings } | undefined

export const encryptSetting = encryptSecret

export function invalidateRuntimeSettingsCache() {
  cache = undefined
}

export function runtimeSettingsFromEnvironment(): RuntimeSettings {
  return {
    aiProvider: (process.env.AI_PROVIDER ??
      "gateway") as RuntimeSettings["aiProvider"],
    aiModel: process.env.AI_MODEL ?? "",
    aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY ?? "",
    googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    openrouterBaseUrl:
      process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    compatibleApiKey: process.env.AI_PROVIDER_API_KEY ?? "",
    compatibleBaseUrl: process.env.AI_PROVIDER_BASE_URL ?? "",
    tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
    instagramAppId: process.env.INSTAGRAM_APP_ID ?? "",
    instagramAppSecret: process.env.INSTAGRAM_APP_SECRET ?? "",
    instagramApiVersion: process.env.INSTAGRAM_API_VERSION ?? "v26.0",
    smtpUrl: process.env.SMTP_URL ?? "",
    smtpFrom: process.env.SMTP_FROM ?? "",
  }
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.settings
  const settings = runtimeSettingsFromEnvironment()
  const rows = await getDb().select().from(appSettings)
  for (const row of rows) {
    const key = row.key as SettingKey
    if (!(key in settings)) continue
    const value = row.isSecret ? decryptSecret(row.value) : row.value
    ;(settings as Record<SettingKey, string>)[key] = value
  }
  cache = { settings, expiresAt: Date.now() + 20_000 }
  return settings
}

export function settingsAreSecret(key: SettingKey) {
  return SECRET_KEYS.has(key)
}

export function environmentKeyForSetting(key: SettingKey) {
  return ENV_KEYS[key]
}
