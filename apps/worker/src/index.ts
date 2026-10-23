import { and, asc, eq, gt, lt } from "drizzle-orm"
import {
  apiRateLimits,
  appSettings,
  getDb,
  researchObservations,
  shopSources,
} from "@workspace/db"
import { decryptSecret, encryptSecret } from "@workspace/db/settings-crypto"
import { PgBoss, type Job } from "pg-boss"

const DISCOVER_QUEUE = "torob-check.source-refresh-discover"
const REFRESH_QUEUE = "torob-check.source-refresh"
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL)
  throw new Error("DATABASE_URL is required by the refresh worker")

const boss = new PgBoss({ connectionString: DATABASE_URL })
const db = getDb()
const MAX_INSTAGRAM_PAGES = 4
const MAX_MEDIA_PER_SOURCE = 80

type SourceJob = { sourceId: string }
type ResearchItem = { url: string; title: string; excerpt: string }

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function publicHttpsUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":")
  )
    return null
  url.hash = ""
  return url
}

function hostMatches(value: string, approvedHost: string) {
  const url = publicHttpsUrl(value)
  const host = url?.hostname.toLowerCase().replace(/^www\./, "")
  const allowed = approvedHost.toLowerCase().replace(/^www\./, "")
  return Boolean(host && (host === allowed || host.endsWith(`.${allowed}`)))
}

async function getTavilyKey() {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "tavilyApiKey"))
    .limit(1)
  if (row) return row.isSecret ? decryptSecret(row.value) : row.value
  return process.env.TAVILY_API_KEY ?? ""
}

function stableDailyObservationTime() {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

async function saveFindings(
  shopId: string,
  sourceId: string,
  query: string,
  items: ResearchItem[]
) {
  const observedAt = stableDailyObservationTime()
  const expiresAt = new Date(observedAt.getTime() + 36 * 60 * 60 * 1000)
  for (const item of items) {
    const safeUrl = publicHttpsUrl(item.url)
    if (!safeUrl) continue
    await db
      .insert(researchObservations)
      .values({
        shopId,
        sourceId,
        query,
        url: safeUrl.toString(),
        title: item.title.slice(0, 200),
        excerpt: item.excerpt.slice(0, 1600),
        observedAt,
        expiresAt,
        payload: {
          confirmation: "public_unverified",
          sourceType: "approved_shop_source",
        },
      })
      .onConflictDoUpdate({
        target: [
          researchObservations.sourceId,
          researchObservations.url,
          researchObservations.observedAt,
        ],
        set: {
          query,
          title: item.title.slice(0, 200),
          excerpt: item.excerpt.slice(0, 1600),
          expiresAt,
          payload: {
            confirmation: "public_unverified",
            sourceType: "approved_shop_source",
          },
        },
      })
  }
}

async function refreshWebsite(
  source: { sourceId: string; shopId: string; url: string },
  tavilyApiKey: string
) {
  const approvedUrl = publicHttpsUrl(source.url)
  if (!approvedUrl) throw new Error("Approved website URL is no longer safe")
  const response = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyApiKey,
      urls: [approvedUrl.toString()],
      extract_depth: "basic",
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok)
    throw new Error(`Tavily extraction failed (${response.status})`)
  const body = object(await response.json())
  const results = Array.isArray(body?.results) ? body.results : []
  const items = results
    .flatMap((value) => {
      const row = object(value)
      const url = typeof row?.url === "string" ? row.url : ""
      const content =
        typeof row?.raw_content === "string" ? row.raw_content.trim() : ""
      if (!content || !hostMatches(url, approvedUrl.hostname)) return []
      return [{ url, title: approvedUrl.hostname, excerpt: content }]
    })
    .slice(0, 1)
  await saveFindings(
    source.shopId,
    source.sourceId,
    "daily approved website refresh",
    items
  )
}

async function refreshInstagram(
  source: {
    sourceId: string
    shopId: string
    externalAccountId: string | null
    encryptedAccessToken: string | null
    tokenExpiresAt: Date | null
  },
  apiVersion: string
) {
  if (!source.externalAccountId || !source.encryptedAccessToken)
    throw new Error("Instagram source has no authorized account token")
  let accessToken = decryptSecret(source.encryptedAccessToken)
  if (!accessToken) throw new Error("Instagram access token is empty")
  const tokenExpiresAt = source.tokenExpiresAt
  const now = new Date()
  if (tokenExpiresAt && tokenExpiresAt.getTime() <= now.getTime())
    throw new Error(
      "Instagram access token expired; the shop needs to reconnect its professional account"
    )
  if (
    tokenExpiresAt &&
    tokenExpiresAt.getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000
  ) {
    const refreshUrl = new URL(
      "https://graph.instagram.com/refresh_access_token"
    )
    refreshUrl.searchParams.set("grant_type", "ig_refresh_token")
    refreshUrl.searchParams.set("access_token", accessToken)
    const refreshResponse = await fetch(refreshUrl, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!refreshResponse.ok)
      throw new Error(
        `Instagram token refresh failed (${refreshResponse.status})`
      )
    const refreshed = object(await refreshResponse.json())
    if (typeof refreshed?.access_token !== "string" || !refreshed.access_token)
      throw new Error("Instagram token refresh returned no token")
    accessToken = refreshed.access_token
    const expiresIn = Number(refreshed.expires_in)
    const nextExpiry =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(now.getTime() + expiresIn * 1000)
        : tokenExpiresAt
    await db
      .update(shopSources)
      .set({
        encryptedAccessToken: encryptSecret(accessToken),
        tokenExpiresAt: nextExpiry,
        updatedAt: now,
      })
      .where(eq(shopSources.id, source.sourceId))
  }

  const media: Array<{
    id: string
    caption?: string
    permalink?: string
    timestamp?: string
  }> = []
  let after: string | undefined
  for (
    let page = 0;
    page < MAX_INSTAGRAM_PAGES && media.length < MAX_MEDIA_PER_SOURCE;
    page++
  ) {
    const url = new URL(
      `https://graph.instagram.com/${apiVersion}/${encodeURIComponent(source.externalAccountId)}/media`
    )
    url.searchParams.set("fields", "id,caption,permalink,timestamp,media_type")
    url.searchParams.set("limit", "25")
    url.searchParams.set("access_token", accessToken)
    if (after) url.searchParams.set("after", after)
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok)
      throw new Error(`Instagram media refresh failed (${response.status})`)
    const body = object(await response.json())
    const rows = Array.isArray(body?.data) ? body.data : []
    for (const value of rows) {
      const item = object(value)
      const permalink =
        typeof item?.permalink === "string" ? item.permalink : ""
      const caption =
        typeof item?.caption === "string" ? item.caption.trim() : ""
      const timestamp =
        typeof item?.timestamp === "string" ? item.timestamp : ""
      if (!permalink || !caption || !hostMatches(permalink, "instagram.com"))
        continue
      media.push({
        id: String(item?.id ?? permalink),
        caption: `${caption}${timestamp ? `\nمنتشرشده در ${timestamp}` : ""}`,
        permalink,
        timestamp,
      })
      if (media.length >= MAX_MEDIA_PER_SOURCE) break
    }
    const paging = object(body?.paging)
    const cursors = object(paging?.cursors)
    after = typeof cursors?.after === "string" ? cursors.after : undefined
    if (!after || !rows.length) break
  }

  await saveFindings(
    source.shopId,
    source.sourceId,
    "daily authorized Instagram profile refresh",
    media.map((post) => ({
      url: post.permalink!,
      title: "پست عمومی اینستاگرام فروشگاه · تأییدنشده",
      excerpt: post.caption!,
    }))
  )
}

async function refreshSource(sourceId: string) {
  const [source] = await db
    .select({
      sourceId: shopSources.id,
      shopId: shopSources.shopId,
      sourceType: shopSources.sourceType,
      url: shopSources.url,
      status: shopSources.status,
      externalAccountId: shopSources.externalAccountId,
      encryptedAccessToken: shopSources.encryptedAccessToken,
      tokenExpiresAt: shopSources.tokenExpiresAt,
    })
    .from(shopSources)
    .where(eq(shopSources.id, sourceId))
    .limit(1)
  if (!source || source.status !== "active") return

  if (source.sourceType === "website") {
    const tavilyApiKey = await getTavilyKey()
    if (!tavilyApiKey) throw new Error("Tavily API key is not configured")
    await refreshWebsite(source, tavilyApiKey)
  } else if (source.sourceType === "instagram") {
    const [versionSetting] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "instagramApiVersion"))
      .limit(1)
    const apiVersion =
      versionSetting?.value ?? process.env.INSTAGRAM_API_VERSION ?? "v26.0"
    if (!/^v\d{1,2}\.\d{1,2}$/.test(apiVersion))
      throw new Error("Instagram API version is not valid")
    await refreshInstagram(source, apiVersion)
  } else {
    return
  }

  await db
    .update(shopSources)
    .set({ lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(shopSources.id, sourceId))
}

async function enqueueActiveSources() {
  await db
    .delete(apiRateLimits)
    .where(
      lt(
        apiRateLimits.updatedAt,
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      )
    )
  let afterId: string | undefined
  while (true) {
    const filters = [eq(shopSources.status, "active" as const)]
    if (afterId) filters.push(gt(shopSources.id, afterId))
    const page = await db
      .select({ id: shopSources.id })
      .from(shopSources)
      .where(and(...filters))
      .orderBy(asc(shopSources.id))
      .limit(200)
    if (!page.length) break
    for (const source of page) {
      await boss.send(
        REFRESH_QUEUE,
        { sourceId: source.id } satisfies SourceJob,
        {
          singletonKey: `source:${source.id}`,
          singletonSeconds: 45 * 60,
          retryLimit: 5,
          retryDelay: 30,
          retryBackoff: true,
        }
      )
    }
    afterId = page[page.length - 1]!.id
    if (page.length < 200) break
  }
}

async function main() {
  boss.on("error", (error) => console.error("pg-boss error", error))
  await boss.start()
  await boss.createQueue(DISCOVER_QUEUE, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
  })
  await boss.createQueue(REFRESH_QUEUE, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
  })
  await boss.work(DISCOVER_QUEUE, { localConcurrency: 1 }, async () =>
    enqueueActiveSources()
  )
  await boss.work<SourceJob>(
    REFRESH_QUEUE,
    { localConcurrency: 3 },
    async (jobs: Job<SourceJob>[]) => {
      const job = jobs[0]
      if (job) await refreshSource(job.data.sourceId)
    }
  )
  await boss.schedule(
    DISCOVER_QUEUE,
    "0 3 * * *",
    {},
    { tz: "Asia/Tehran", missed: "once" }
  )
  await boss.send(
    DISCOVER_QUEUE,
    {},
    { singletonKey: "startup", singletonSeconds: 60 }
  )
  console.log("Source refresh worker started")

  const shutdown = async (signal: string) => {
    console.log(`Stopping source refresh worker (${signal})`)
    await boss.stop({ graceful: true })
    process.exit(0)
  }
  process.once("SIGTERM", () => void shutdown("SIGTERM"))
  process.once("SIGINT", () => void shutdown("SIGINT"))
}

main().catch((error: unknown) => {
  console.error("Unable to start source refresh worker", error)
  process.exitCode = 1
})
