import "server-only"
import { and, desc, eq, gt } from "drizzle-orm"
import { getDb, researchObservations, shopSources, shops } from "@workspace/db"
import { hostMatchesDomain, parsePublicHttpsUrl } from "@/lib/safe-url"
import { getRuntimeSettings } from "@/lib/runtime-settings"

type PublicFinding = {
  title: string
  url: string
  excerpt: string
  observedAt: string
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

export async function researchShopSources(
  shopId: string,
  userQuestion: string
) {
  const question = userQuestion.trim().slice(0, 240)
  if (question.length < 2)
    return { status: "no_question", findings: [] as PublicFinding[] }

  const db = getDb()
  const [shop] = await db
    .select({ name: shops.name })
    .from(shops)
    .where(eq(shops.shopId, shopId))
    .limit(1)
  if (!shop)
    return { status: "shop_not_found", findings: [] as PublicFinding[] }

  const [sources, cached] = await Promise.all([
    db
      .select({ id: shopSources.id, url: shopSources.url })
      .from(shopSources)
      .where(
        and(
          eq(shopSources.shopId, shopId),
          eq(shopSources.status, "active"),
          eq(shopSources.sourceType, "website")
        )
      ),
    db
      .select({
        title: researchObservations.title,
        url: researchObservations.url,
        excerpt: researchObservations.excerpt,
        observedAt: researchObservations.observedAt,
      })
      .from(researchObservations)
      .where(
        and(
          eq(researchObservations.shopId, shopId),
          gt(researchObservations.expiresAt, new Date())
        )
      )
      .orderBy(desc(researchObservations.observedAt))
      .limit(10),
  ])
  const cachedFindings = cached.map((row) => ({
    title: row.title ?? "یادداشت عمومی فروشگاه",
    url: row.url,
    excerpt: row.excerpt ?? "",
    observedAt: row.observedAt.toISOString(),
  }))
  const domains = [
    ...new Set(
      sources.flatMap((source) => {
        const url = parsePublicHttpsUrl(source.url)
        return url ? [url.hostname.replace(/^www\./, "")] : []
      })
    ),
  ]
  const settings = await getRuntimeSettings()
  if (!settings.tavilyApiKey || domains.length === 0) {
    return {
      status: domains.length ? "research_unavailable" : "no_approved_sources",
      findings: cachedFindings,
    }
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: settings.tavilyApiKey,
      query: `${shop.name ?? "فروشگاه"} ${question}`.slice(0, 400),
      include_domains: domains,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null)
  if (!response?.ok) {
    return { status: "research_unavailable", findings: cachedFindings }
  }
  const body = asObject(await response.json().catch(() => null))
  const results = Array.isArray(body?.results) ? body.results : []
  const searchResults = results
    .flatMap((value) => {
      const row = asObject(value)
      const url = typeof row?.url === "string" ? row.url : ""
      const title =
        typeof row?.title === "string"
          ? row.title.slice(0, 200)
          : "منبع عمومی فروشگاه"
      const content =
        typeof row?.content === "string" ? row.content.slice(0, 1200) : ""
      const allowedDomain = domains.find((domain) =>
        hostMatchesDomain(url, domain)
      )
      const sourceId =
        sources.find((source) => {
          const allowedUrl = parsePublicHttpsUrl(source.url)
          return Boolean(
            allowedUrl && hostMatchesDomain(url, allowedUrl.hostname)
          )
        })?.id ?? null
      return allowedDomain && content ? [{ url, title, content, sourceId }] : []
    })
    .slice(0, 5)

  let extracted = new Map<string, string>()
  if (searchResults.length) {
    const extractResponse = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: settings.tavilyApiKey,
        urls: searchResults.map((row) => row.url),
        extract_depth: "basic",
      }),
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null)
    if (extractResponse?.ok) {
      const extractBody = asObject(
        await extractResponse.json().catch(() => null)
      )
      const extractResults = Array.isArray(extractBody?.results)
        ? extractBody.results
        : []
      for (const value of extractResults) {
        const row = asObject(value)
        if (
          typeof row?.url === "string" &&
          typeof row?.raw_content === "string"
        ) {
          extracted.set(row.url, row.raw_content.slice(0, 1600))
        }
      }
    }
  }

  const now = new Date()
  const findings = searchResults.map((row) => ({
    title: row.title,
    url: row.url,
    excerpt: (extracted.get(row.url) || row.content).slice(0, 1000),
    observedAt: now.toISOString(),
  }))
  for (const [index, finding] of findings.entries()) {
    const row = searchResults[index]
    if (!row) continue
    await db.insert(researchObservations).values({
      shopId,
      sourceId: row.sourceId,
      query: "on-demand approved-source lookup",
      url: finding.url,
      title: finding.title,
      excerpt: finding.excerpt,
      observedAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      payload: {
        confirmation: "public_unverified",
        researchProvider: "tavily",
      },
    })
  }
  return {
    status: findings.length ? "public_findings" : "no_public_findings",
    findings: [...findings, ...cachedFindings].slice(0, 8),
  }
}
