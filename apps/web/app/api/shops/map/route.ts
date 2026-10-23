import { getMapShops } from "@workspace/db"

import { parseShopFilters } from "@/lib/shop-query"

const MAP_SHOP_RESULT_LIMIT = 10000

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Shop data is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  const parsedFilters = parseShopFilters(new URL(request.url).searchParams)

  if (!parsedFilters.filters) {
    return Response.json(
      { error: parsedFilters.error },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  try {
    const result = await getMapShops({
      bounds: parsedFilters.filters.bounds,
      searchTerm: parsedFilters.filters.searchTerm,
      limit: MAP_SHOP_RESULT_LIMIT,
    })

    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Failed to load map shops:", error)
    }
    return Response.json(
      { error: "Shop data could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}
