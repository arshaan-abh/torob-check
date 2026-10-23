import "server-only"
import { getAuth } from "@/lib/auth"

export type VerifiedUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
}

export async function getVerifiedUser(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session || !session.user.emailVerified) return null

  return session.user as VerifiedUser
}

export async function getMerchantUser(request: Request) {
  return getVerifiedUser(request)
}

function configuredSystemAdmins() {
  const configuredEmails =
    process.env.SYSTEM_ADMIN_EMAILS || process.env.MERCHANT_ADMIN_EMAILS || ""
  return configuredEmails
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function isSystemAdminConfigured() {
  return configuredSystemAdmins().length > 0
}

export function isSystemAdmin(email: string) {
  return configuredSystemAdmins().includes(email.trim().toLowerCase())
}
