import "server-only"
import { and, desc, eq, gt } from "drizzle-orm"
import { getDb, researchObservations, shopSources, shops } from "@workspace/db"
import { parsePublicHttpsUrl } from "@/lib/safe-url"
import { getRuntimeSettings } from "@/lib/runtime-settings"
import { enqueueShopResearch } from "@/lib/research-queue"

type PublicFinding = {
  title: string
  url: string
  excerpt: string
  observedAt: string
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
  const approvedSources = sources.filter((source) =>
    parsePublicHttpsUrl(source.url)
  )
  if (approvedSources.length === 0) {
    return { status: "no_approved_sources", findings: cachedFindings }
  }

  const settings = await getRuntimeSettings()
  if (!settings.tavilyApiKey) {
    return { status: "research_unavailable", findings: cachedFindings }
  }

  try {
    await enqueueShopResearch({
      shopId,
      question,
      requestedAt: new Date().toISOString(),
    })
    return {
      status: "research_queued",
      pending: true,
      findings: cachedFindings,
    }
  } catch {
    return { status: "research_unavailable", findings: cachedFindings }
  }
}
