import "server-only"
import { getAuth } from "@/lib/auth"
import { isSystemAdmin } from "@/lib/system-admin"

export type AuthenticatedUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
}

export async function getAuthenticatedUser(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session) return null

  return session.user as AuthenticatedUser
}

export async function getVerifiedUser(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user?.emailVerified) return null
  return user
}

export async function getSystemAdminUser(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user || !(await isSystemAdmin(user.id, user.email))) return null
  return user
}

export async function getMerchantUser(request: Request) {
  return getVerifiedUser(request)
}

export { isSystemAdminConfigured } from "@/lib/system-admin"
