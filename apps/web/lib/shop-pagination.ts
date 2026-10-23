import type { ShopCursor } from "@workspace/db"
import { getShopFilterKey, type ShopFilters } from "@/lib/shop-query"

type EncodedShopCursor = {
  version: 2
  filterKey: string
  sort: "name" | "distance"
  name?: string | null
  distance?: number
  shopId: string
}

const MAX_CURSOR_LENGTH = 8192

export function encodeShopCursor(cursor: ShopCursor, filters: ShopFilters) {
  const payload: EncodedShopCursor = {
    version: 2,
    filterKey: getShopFilterKey(filters),
    sort: cursor.sort,
    shopId: cursor.shopId,
    ...(cursor.sort === "distance"
      ? { distance: cursor.distance }
      : { name: cursor.name }),
  }

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

export function decodeShopCursor(
  value: string,
  filters: ShopFilters
): ShopCursor | null {
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH) return null

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8")

    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) {
      return null
    }

    const payload = JSON.parse(decoded) as Partial<EncodedShopCursor>

    if (
      payload.version !== 2 ||
      payload.filterKey !== getShopFilterKey(filters) ||
      typeof payload.shopId !== "string" ||
      payload.shopId.length === 0 ||
      payload.shopId.length > 128 ||
      (filters.sortCenter
        ? payload.sort !== "distance" ||
          typeof payload.distance !== "number" ||
          !Number.isFinite(payload.distance)
        : payload.sort !== "name" ||
          (payload.name !== null && typeof payload.name !== "string"))
    ) {
      return null
    }

    return payload.sort === "distance"
      ? {
          sort: "distance",
          distance: payload.distance as number,
          shopId: payload.shopId,
        }
      : {
          sort: "name",
          name: payload.name as string | null,
          shopId: payload.shopId,
        }
  } catch {
    return null
  }
}
