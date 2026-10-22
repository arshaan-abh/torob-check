import {
  and,
  asc,
  count,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  min,
  or,
} from "drizzle-orm"

import { getDb } from "./client"
import { offers, shops } from "./schema"

export type MapShopBounds = {
  west: number
  south: number
  east: number
  north: number
}

type GetMapShopsOptions = {
  bounds: MapShopBounds | null
  searchTerm: string
  limit: number
}

export async function getMapShops({
  bounds,
  searchTerm,
  limit,
}: GetMapShopsOptions) {
  const conditions = [isNotNull(shops.lat), isNotNull(shops.lon)]

  if (searchTerm) {
    const pattern = `%${searchTerm}%`
    const matchingShop = or(
      ilike(shops.name, pattern),
      ilike(shops.locationLabel, pattern),
      ilike(shops.address, pattern)
    )

    if (matchingShop) conditions.push(matchingShop)
  } else if (bounds) {
    conditions.push(
      gte(shops.lon, bounds.west),
      lte(shops.lon, bounds.east),
      gte(shops.lat, bounds.south),
      lte(shops.lat, bounds.north)
    )
  }

  const where = and(...conditions)
  const db = getDb()
  const [shopRows, totalRows] = await Promise.all([
    db
      .select({
        shopId: shops.shopId,
        name: shops.name,
        address: shops.address,
        locationLabel: shops.locationLabel,
        lat: shops.lat,
        lon: shops.lon,
        categoryNames: shops.categoryNames,
      })
      .from(shops)
      .where(where)
      .orderBy(asc(shops.name))
      .limit(limit),
    db.select({ total: count() }).from(shops).where(where),
  ])

  const offerSummaries = shopRows.length
    ? await db
        .select({
          shopId: offers.shopId,
          offerCount: count(),
          lowestPrice: min(offers.priceToman),
        })
        .from(offers)
        .where(
          inArray(
            offers.shopId,
            shopRows.map((shop) => shop.shopId)
          )
        )
        .groupBy(offers.shopId)
    : []
  const summaryByShopId = new Map(
    offerSummaries.map((summary) => [summary.shopId, summary])
  )

  return {
    shops: shopRows.flatMap((shop) => {
      if (shop.lat === null || shop.lon === null) {
        return []
      }

      const summary = summaryByShopId.get(shop.shopId)

      return [
        {
          ...shop,
          lat: shop.lat,
          lon: shop.lon,
          offerCount: summary?.offerCount ?? 0,
          lowestPrice: summary?.lowestPrice ?? null,
        },
      ]
    }),
    total: totalRows[0]?.total ?? 0,
    truncated: (totalRows[0]?.total ?? 0) > limit,
  }
}
