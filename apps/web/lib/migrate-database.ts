import "server-only"
import { existsSync } from "node:fs"
import path from "node:path"
import { getPool } from "@workspace/db"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"

const MIGRATION_LOCK_ID = 1_641_212_026

function getMigrationsFolder() {
  const candidates = [
    path.resolve(process.cwd(), "packages/db/drizzle"),
    path.resolve(process.cwd(), "../../packages/db/drizzle"),
  ]

  const migrationsFolder = candidates.find((candidate) =>
    existsSync(path.join(candidate, "meta", "_journal.json"))
  )

  if (!migrationsFolder) {
    throw new Error(`Could not find Drizzle migrations from ${process.cwd()}`)
  }

  return migrationsFolder
}

export async function migrateDatabase() {
  const pool = getPool()
  const connection = await pool.connect()
  let lockAcquired = false

  try {
    await connection.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID])
    lockAcquired = true

    await migrate(drizzle(connection), {
      migrationsFolder: getMigrationsFolder(),
    })
    console.info("Database migrations are up to date.")
  } finally {
    if (lockAcquired) {
      await connection
        .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
        .catch(() => undefined)
    }
    connection.release()
  }
}
