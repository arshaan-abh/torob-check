import "server-only"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

type Database = NodePgDatabase<typeof schema>

const globalForDatabase = globalThis as typeof globalThis & {
  torobPool?: Pool
  torobDatabase?: Database
}
let productionPool: Pool | undefined
let productionDatabase: Database | undefined

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL")
  }

  if (process.env.NODE_ENV === "production") {
    productionPool ??= new Pool({ connectionString })
    return productionPool
  }

  globalForDatabase.torobPool ??= new Pool({ connectionString })
  return globalForDatabase.torobPool
}

export function getDb(): Database {
  if (process.env.NODE_ENV === "production") {
    productionDatabase ??= drizzle(getPool(), { schema })
    return productionDatabase
  }

  globalForDatabase.torobDatabase ??= drizzle(getPool(), { schema })
  return globalForDatabase.torobDatabase
}
