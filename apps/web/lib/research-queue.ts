import "server-only"
import { createHash } from "node:crypto"
import { PgBoss } from "pg-boss"

export const ON_DEMAND_RESEARCH_QUEUE = "torob-check.shop-research"

type ShopResearchJob = {
  shopId: string
  question: string
  requestedAt: string
}

type QueuePublisher = {
  boss: PgBoss
  started?: Promise<void>
}

type ResearchQueueGlobal = typeof globalThis & {
  __torobCheckResearchQueue?: QueuePublisher
}

const globalForQueue = globalThis as ResearchQueueGlobal

function publisher() {
  if (globalForQueue.__torobCheckResearchQueue) {
    return globalForQueue.__torobCheckResearchQueue
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required")

  const boss = new PgBoss({
    connectionString,
    connectionTimeoutMillis: 2_000,
    registerInstance: false,
  })
  boss.on("error", (error) => console.error("Research queue error", error))
  const state: QueuePublisher = { boss }
  globalForQueue.__torobCheckResearchQueue = state
  return state
}

export async function enqueueShopResearch(
  input: ShopResearchJob
): Promise<string | null> {
  const state = publisher()
  state.started ??= (async () => {
    await state.boss.start()
    await state.boss.createQueue(ON_DEMAND_RESEARCH_QUEUE, {
      expireInSeconds: 120,
      retryLimit: 4,
      retryDelay: 20,
      retryBackoff: true,
      retentionSeconds: 60 * 60,
      deleteAfterSeconds: 60 * 60,
    })
  })()

  try {
    await state.started
    const questionHash = createHash("sha256")
      .update(input.question.toLocaleLowerCase("fa-IR"))
      .digest("hex")
    return await state.boss.send(ON_DEMAND_RESEARCH_QUEUE, input, {
      singletonKey: `${input.shopId}:${questionHash}`,
      singletonSeconds: 10 * 60,
      retryLimit: 4,
      retryDelay: 20,
      retryBackoff: true,
      retentionSeconds: 60 * 60,
      deleteAfterSeconds: 60 * 60,
    })
  } catch (error) {
    state.started = undefined
    throw error
  }
}
