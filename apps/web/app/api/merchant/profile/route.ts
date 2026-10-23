import { NextResponse } from "next/server"
import { getMerchantUser } from "@/lib/merchant-session"
import { listMerchantShops, listUserClaims } from "@/lib/merchant-data"

export async function GET(request: Request) {
  const user = await getMerchantUser(request)
  if (!user)
    return NextResponse.json(
      { error: "Sign in with a verified email." },
      { status: 401 }
    )
  const [shops, claims] = await Promise.all([
    listMerchantShops(user.id),
    listUserClaims(user.id),
  ])
  return NextResponse.json({ shops, claims })
}
