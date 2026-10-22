import "dotenv/config"
import { defineConfig } from "drizzle-kit"

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://torob:torob_dev@localhost:5432/torob"

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
})
