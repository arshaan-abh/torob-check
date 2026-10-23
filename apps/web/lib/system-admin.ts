import "server-only"
import { eq } from "drizzle-orm"
import { appSettings, getDb, merchantAuditLogs, user } from "@workspace/db"

export const SYSTEM_ADMIN_BOOTSTRAP_SETTING = "system_admin_bootstrap_user_id"

export function configuredSystemAdmins() {
  const configuredEmails =
    process.env.SYSTEM_ADMIN_EMAILS || process.env.MERCHANT_ADMIN_EMAILS || ""
  return configuredEmails
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function isConfiguredSystemAdminEmail(email: string) {
  return configuredSystemAdmins().includes(email.trim().toLowerCase())
}

async function getBootstrapAdminId() {
  const [bootstrapAdmin] = await getDb()
    .select({ userId: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SYSTEM_ADMIN_BOOTSTRAP_SETTING))
    .limit(1)
  return bootstrapAdmin?.userId ?? null
}

export async function isBootstrapSystemAdmin(userId: string) {
  return (await getBootstrapAdminId()) === userId
}

async function claimBootstrapAdmin(userId: string, email: string) {
  const db = getDb()
  await db.transaction(async (tx) => {
    const [claim] = await tx
      .insert(appSettings)
      .values({
        key: SYSTEM_ADMIN_BOOTSTRAP_SETTING,
        value: userId,
        isSecret: false,
        updatedBy: userId,
      })
      .onConflictDoNothing({ target: appSettings.key })
      .returning({ value: appSettings.value })

    if (!claim) return
    await tx
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, userId))
    await tx.insert(merchantAuditLogs).values({
      actorId: userId,
      action: "system_admin.bootstrap",
      entityType: "user",
      entityId: userId,
      afterValue: { email: email.trim().toLowerCase() },
    })
  })

  return (await getBootstrapAdminId()) === userId
}

export async function isSystemAdminConfigured() {
  if (configuredSystemAdmins().length > 0) return true
  return Boolean(await getBootstrapAdminId())
}

export async function isSystemAdmin(userId: string, email: string) {
  if (isConfiguredSystemAdminEmail(email)) return true
  return isBootstrapSystemAdmin(userId)
}

/**
 * Assigns the first new account as bootstrap admin once. The unique settings
 * key serializes concurrent signups; env-listed accounts remain additional admins.
 */
export async function claimBootstrapAdminOnSignup(
  userId: string,
  email: string
) {
  if (await getBootstrapAdminId()) return
  await claimBootstrapAdmin(userId, email)
}
