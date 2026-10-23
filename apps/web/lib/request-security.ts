import "server-only"
import { createHmac } from "node:crypto"
import { sql } from "drizzle-orm"
import { apiRateLimits, getDb } from "@workspace/db"

export type JsonBodyResult =
  { ok: true; value: unknown } | { ok: false; status: 400 | 413 }

export async function readJsonBody(
  request: Request,
  maxBytes: number
): Promise<JsonBodyResult> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  if (contentType !== "application/json") return { ok: false, status: 400 }
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await request.body?.cancel().catch(() => undefined)
    return { ok: false, status: 413 }
  }
  if (!request.body) return { ok: false, status: 400 }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return { ok: false, status: 413 }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, status: 400 }
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      ),
    }
  } catch {
    return { ok: false, status: 400 }
  }
}

export function hasTrustedOrigin(request: Request) {
  const originHeader = request.headers.get("origin")
  const referer = request.headers.get("referer")
  let suppliedOrigin: string | null = null
  try {
    suppliedOrigin = originHeader
      ? new URL(originHeader).origin
      : referer
        ? new URL(referer).origin
        : null
  } catch {
    return false
  }
  if (!suppliedOrigin) return false

  const allowedOrigins = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].flatMap((value) => {
    if (!value) return []
    try {
      return [new URL(value).origin]
    } catch {
      return []
    }
  })
  if (process.env.NODE_ENV !== "production") {
    try {
      allowedOrigins.push(new URL(request.url).origin)
    } catch {
      /* invalid request URL */
    }
  }
  return allowedOrigins.includes(suppliedOrigin)
}

export function getCanonicalAppUrl(request: Request) {
  const configuredUrl =
    process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (configuredUrl) {
    try {
      return new URL("/", new URL(configuredUrl).origin)
    } catch {
      return null
    }
  }
  if (process.env.NODE_ENV !== "production") {
    try {
      return new URL("/", request.url)
    } catch {
      return null
    }
  }
  return null
}

function requestAddress(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim()
  const address =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwarded ||
    "unknown"
  return address.slice(0, 128)
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000
) {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret)
    throw new Error(
      "BETTER_AUTH_SECRET must be configured for request rate limiting"
    )
  const key = createHmac("sha256", secret)
    .update(`${scope}:${requestAddress(request)}`)
    .digest("hex")
  const now = new Date()
  const boundary = new Date(now.getTime() - windowMs)
  const [row] = await getDb()
    .insert(apiRateLimits)
    .values({ key, windowStartedAt: now, requestCount: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: apiRateLimits.key,
      set: {
        windowStartedAt: sql`CASE WHEN ${apiRateLimits.windowStartedAt} <= ${boundary} THEN ${now} ELSE ${apiRateLimits.windowStartedAt} END`,
        requestCount: sql`CASE WHEN ${apiRateLimits.windowStartedAt} <= ${boundary} THEN 1 ELSE ${apiRateLimits.requestCount} + 1 END`,
        updatedAt: now,
      },
    })
    .returning({
      startedAt: apiRateLimits.windowStartedAt,
      count: apiRateLimits.requestCount,
    })
  if (!row) throw new Error("Unable to reserve request rate-limit slot")
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((row.startedAt.getTime() + windowMs - now.getTime()) / 1000)
  )
  return { allowed: row.count <= limit, retryAfterSeconds }
}
