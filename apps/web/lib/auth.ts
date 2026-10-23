import "server-only"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"
import { getDb } from "@workspace/db"
import { account, session, user, verification } from "@workspace/db/schema"
import { sendAuthLink } from "@/lib/auth-mailer"
import {
  claimBootstrapAdminOnSignup,
  isBootstrapSystemAdmin,
} from "@/lib/system-admin"

function createAuth() {
  return betterAuth({
    appName: "Torob Check",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [
      process.env.BETTER_AUTH_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter((origin): origin is string => Boolean(origin)),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user: accountUser, url }) => {
        await sendAuthLink(accountUser.email, url, "بازنشانی گذرواژه ترب‌چک")
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user: accountUser, url }) => {
        if (await isBootstrapSystemAdmin(accountUser.id)) return
        await sendAuthLink(accountUser.email, url, "تأیید ایمیل ترب‌چک")
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            await claimBootstrapAdminOnSignup(createdUser.id, createdUser.email)
          },
        },
      },
    },
  })
}

let authInstance: ReturnType<typeof createAuth> | undefined

export function getAuth(): ReturnType<typeof createAuth> {
  authInstance ??= createAuth()
  return authInstance
}
