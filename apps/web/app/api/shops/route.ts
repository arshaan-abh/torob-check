import { getShopPage } from "@workspace/db"

import { decodeShopCursor, encodeShopCursor } from "@/lib/shop-pagination"
import { parseShopFilters } from "@/lib/shop-query"

const SHOP_PAGE_SIZE = 100

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Shop data is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  const searchParams = new URL(request.url).searchParams
  const parsedFilters = parseShopFilters(searchParams)

  if (!parsedFilters.filters) {
    return Response.json(
      { error: parsedFilters.error },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  const hasCursor = searchParams.has("cursor")
  const rawCursor = searchParams.get("cursor")
  const cursor =
    hasCursor && rawCursor !== null
      ? decodeShopCursor(rawCursor, parsedFilters.filters)
      : null

  if (hasCursor && !cursor) {
    return Response.json(
      { error: "The shop page cursor is invalid or expired." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  try {
    const result = await getShopPage({
      bounds: parsedFilters.filters.bounds,
      searchTerm: parsedFilters.filters.searchTerm,
      sortCenter: parsedFilters.filters.sortCenter,
      cursor,
      pageSize: SHOP_PAGE_SIZE,
    })

    return Response.json(
      {
        shops: result.shops,
        total: result.total,
        nextCursor: result.nextCursor
          ? encodeShopCursor(result.nextCursor, parsedFilters.filters)
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Failed to load shops:", error)
    }
    return Response.json(
      { error: "Shop data could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}
