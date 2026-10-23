import type { MapShopBounds, ShopSortCenter } from "@workspace/db"

const DEFAULT_BOUNDS: MapShopBounds = {
  west: 51.2,
  south: 35.55,
  east: 51.6,
  north: 35.85,
}

export type ShopFilters = {
  searchTerm: string
  bounds: MapShopBounds | null
  allShops: boolean
  sortCenter: ShopSortCenter | null
}

export type ParsedShopFilters =
  { filters: ShopFilters; error: null } | { filters: null; error: string }

function readBounds(
  searchParams: URLSearchParams,
  useDefaultBounds: boolean
): MapShopBounds | null {
  const values = [
    searchParams.get("west"),
    searchParams.get("south"),
    searchParams.get("east"),
    searchParams.get("north"),
  ]
  const hasBounds = values.some((value) => value !== null)

  if (!hasBounds) return useDefaultBounds ? DEFAULT_BOUNDS : null
  if (values.some((value) => value === null || value.trim() === "")) return null

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

export function parseShopFilters(
  searchParams: URLSearchParams
): ParsedShopFilters {
  const rawSearch = searchParams.get("q")?.trim() ?? ""
  const searchTerm = rawSearch.replace(/[\\%_]/g, "").slice(0, 80)

  if (rawSearch && searchTerm.length < 2) {
    return {
      filters: null,
      error: "Search must contain at least two characters.",
    }
  }

  const hasExplicitBounds = ["west", "south", "east", "north"].some((key) =>
    searchParams.has(key)
  )
  const allShops = searchParams.get("all") === "1"
  const bounds = readBounds(searchParams, !searchTerm && !allShops)
  const sort = searchParams.get("sort")
  const centerLonValue = searchParams.get("centerLon")
  const centerLatValue = searchParams.get("centerLat")
  const hasCenter = centerLonValue !== null || centerLatValue !== null
  let sortCenter: ShopSortCenter | null = null

  if (
    sort === "distance" &&
    centerLonValue !== null &&
    centerLatValue !== null
  ) {
    const lon = Number(centerLonValue)
    const lat = Number(centerLatValue)

    if (
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      lon >= -180 &&
      lon <= 180 &&
      lat >= -90 &&
      lat <= 90
    ) {
      sortCenter = { lon, lat }
    }
  }
  const invalidSort =
    (sort !== null && sort !== "distance") ||
    (sort === "distance" && !sortCenter) ||
    (sort !== "distance" && hasCenter)

  if (
    invalidSort ||
    (hasExplicitBounds && !bounds) ||
    (allShops && hasExplicitBounds) ||
    (!searchTerm && !allShops && !bounds)
  ) {
    return { filters: null, error: "Map bounds are invalid." }
  }

  return {
    filters: { searchTerm, bounds, allShops, sortCenter },
    error: null,
  }
}

export function getShopFilterKey(filters: ShopFilters) {
  return JSON.stringify({
    searchTerm: filters.searchTerm,
    bounds: filters.bounds,
    sortCenter: filters.sortCenter,
  })
}
