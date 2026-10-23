import { NextResponse } from "next/server"
import { getMerchantUser } from "@/lib/merchant-session"
import { listUserClaims } from "@/lib/merchant-data"

export async function GET(request: Request) {
  const user = await getMerchantUser(request)
  if (!user)
    return NextResponse.json(
      { error: "Sign in with a verified email." },
      { status: 401 }
    )
  return NextResponse.json({ claims: await listUserClaims(user.id) })
}
