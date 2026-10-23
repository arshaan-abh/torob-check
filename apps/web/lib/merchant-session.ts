import "server-only"
import { getAuth } from "@/lib/auth"

export type MerchantUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
}

export async function getMerchantUser(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session || !session.user.emailVerified) return null

  return session.user as MerchantUser
}

export function isMerchantAdmin(email: string) {
  const admins = (process.env.MERCHANT_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(email.toLowerCase())
}
