export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.DB_MIGRATE_ON_START !== "true"
  ) {
    return
  }

  const { migrateDatabase } = await import("./lib/migrate-database")
  await migrateDatabase()
}
