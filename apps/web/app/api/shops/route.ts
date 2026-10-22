import { getMapShops, type MapShopBounds } from "@workspace/db"

const MAP_SHOP_LIMIT = 1000
const SEARCH_SHOP_LIMIT = 200
const DEFAULT_BOUNDS: MapShopBounds = {
  west: 51.2,
  south: 35.55,
  east: 51.6,
  north: 35.85,
}

function readBounds(searchParams: URLSearchParams): MapShopBounds | null {
  const values = [
    searchParams.get("west"),
    searchParams.get("south"),
    searchParams.get("east"),
    searchParams.get("north"),
  ]
  const hasBounds = values.some((value) => value !== null)

  if (!hasBounds) return DEFAULT_BOUNDS
  if (values.some((value) => value === null)) return null

  const [westValue, southValue, eastValue, northValue] = values

  if (
    westValue === null ||
    southValue === null ||
    eastValue === null ||
    northValue === null
  ) {
    return null
  }

  const west = Number(westValue)
  const south = Number(southValue)
  const east = Number(eastValue)
  const north = Number(northValue)

  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    return null
  }

  return { west, south, east, north }
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Shop data is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  const searchParams = new URL(request.url).searchParams
  const rawSearch = searchParams.get("q")?.trim() ?? ""
  const searchTerm = rawSearch.replace(/[\\%_]/g, "").slice(0, 80)

  if (rawSearch && searchTerm.length < 2) {
    return Response.json(
      { error: "Search must contain at least two characters." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  const bounds = readBounds(searchParams)

  if (!searchTerm && !bounds) {
    return Response.json(
      { error: "Map bounds are invalid." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  try {
    const result = await getMapShops({
      bounds,
      searchTerm,
      limit: searchTerm ? SEARCH_SHOP_LIMIT : MAP_SHOP_LIMIT,
    })

    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch {
    return Response.json(
      { error: "Shop data could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}
