import {
  and,
  asc,
  count,
  eq,
  gte,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  min,
  or,
  exists,
  sql,
} from "drizzle-orm"

import { getDb } from "./client"
import { offers, products, shops } from "./schema"

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

export type ShopCursor =
  | { sort: "name"; name: string | null; shopId: string }
  | { sort: "distance"; distance: number; shopId: string }

export type ShopSortCenter = { lon: number; lat: number }

type GetShopPageOptions = {
  bounds: MapShopBounds | null
  searchTerm: string
  sortCenter: ShopSortCenter | null
  cursor: ShopCursor | null
  pageSize: number
}

function getDistanceExpression(center: ShopSortCenter) {
  const longitudeScale = Math.cos((center.lat * Math.PI) / 180)

  return sql<number>`power((${shops.lon} - ${center.lon}) * ${longitudeScale}, 2) + power(${shops.lat} - ${center.lat}, 2)`
}

function getShopConditions(
  db: ReturnType<typeof getDb>,
  bounds: MapShopBounds | null,
  searchTerm: string
) {
  const conditions = [isNotNull(shops.lat), isNotNull(shops.lon)]

  if (searchTerm) {
    const pattern = `%${searchTerm}%`
    const matchingProductOrOffer = exists(
      db
        .select({ offerId: offers.offerId })
        .from(offers)
        .innerJoin(products, eq(offers.productId, products.productId))
        .where(
          and(
            eq(offers.shopId, shops.shopId),
            or(
              ilike(products.persianTitle, pattern),
              ilike(products.brandName, pattern),
              ilike(products.model, pattern),
              ilike(products.categoryName, pattern),
              ilike(offers.sellerTitle, pattern),
              ilike(offers.description, pattern),
              ilike(offers.warranty, pattern)
            )
          )
        )
    )
    const matchingShop = or(
      ilike(shops.name, pattern),
      ilike(shops.locationLabel, pattern),
      ilike(shops.address, pattern),
      matchingProductOrOffer
    )

    if (matchingShop) conditions.push(matchingShop)
  }

  if (bounds) {
    conditions.push(
      gte(shops.lon, bounds.west),
      lte(shops.lon, bounds.east),
      gte(shops.lat, bounds.south),
      lte(shops.lat, bounds.north)
    )
  }

  return conditions
}

async function addOfferSummaries<T extends { shopId: string }>(
  db: ReturnType<typeof getDb>,
  shopRows: T[]
) {
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

  return shopRows.map((shop) => {
    const summary = summaryByShopId.get(shop.shopId)

    return {
      ...shop,
      offerCount: summary?.offerCount ?? 0,
      lowestPrice: summary?.lowestPrice ?? null,
    }
  })
}

export async function getMapShops({
  bounds,
  searchTerm,
  limit,
}: GetMapShopsOptions) {
  const db = getDb()
  const conditions = getShopConditions(db, bounds, searchTerm)
  const where = and(...conditions)
  const rowsWithLookahead = await db
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
    .orderBy(asc(shops.name), asc(shops.shopId))
    .limit(limit + 1)
  const truncated = rowsWithLookahead.length > limit
  const shopRows = truncated
    ? rowsWithLookahead.slice(0, limit)
    : rowsWithLookahead

  return {
    shops: (await addOfferSummaries(db, shopRows)).flatMap((shop) => {
      if (shop.lat === null || shop.lon === null) {
        return []
      }

      return [
        {
          ...shop,
          lat: shop.lat,
          lon: shop.lon,
        },
      ]
    }),
    truncated,
  }
}

export async function getShopPage({
  bounds,
  searchTerm,
  sortCenter,
  cursor,
  pageSize,
}: GetShopPageOptions) {
  if (
    cursor &&
    ((sortCenter !== null && cursor.sort !== "distance") ||
      (sortCenter === null && cursor.sort !== "name"))
  ) {
    throw new Error("Shop cursor sort does not match the requested ordering.")
  }

  const db = getDb()
  const conditions = getShopConditions(db, bounds, searchTerm)
  const distanceExpression = sortCenter
    ? getDistanceExpression(sortCenter)
    : null
  const cursorCondition =
    cursor?.sort === "distance" && distanceExpression
      ? or(
          gt(distanceExpression, cursor.distance),
          and(
            eq(distanceExpression, cursor.distance),
            gt(shops.shopId, cursor.shopId)
          )
        )
      : cursor?.sort === "name"
        ? cursor.name === null
          ? and(isNull(shops.name), gt(shops.shopId, cursor.shopId))
          : or(
              gt(shops.name, cursor.name),
              and(eq(shops.name, cursor.name), gt(shops.shopId, cursor.shopId)),
              isNull(shops.name)
            )
        : undefined
  const pageConditions = cursorCondition
    ? [...conditions, cursorCondition]
    : conditions

  const pageQuery = db
    .select({
      shopId: shops.shopId,
      name: shops.name,
      address: shops.address,
      locationLabel: shops.locationLabel,
      lat: shops.lat,
      lon: shops.lon,
      categoryNames: shops.categoryNames,
      sortDistance: distanceExpression ?? sql<null>`NULL`,
    })
    .from(shops)
    .where(and(...pageConditions))
    .orderBy(
      ...(distanceExpression
        ? [asc(distanceExpression), asc(shops.shopId)]
        : [asc(shops.name), asc(shops.shopId)])
    )
    .limit(pageSize + 1)

  const [rowsWithLookahead, totalRows] = await Promise.all([
    pageQuery,
    cursor
      ? Promise.resolve(null)
      : db
          .select({ total: count() })
          .from(shops)
          .where(and(...conditions)),
  ])

  const hasMore = rowsWithLookahead.length > pageSize
  const shopRowsWithSort = hasMore
    ? rowsWithLookahead.slice(0, pageSize)
    : rowsWithLookahead
  const lastShop = shopRowsWithSort.at(-1)
  const nextCursor: ShopCursor | null =
    hasMore && lastShop
      ? distanceExpression && lastShop.sortDistance !== null
        ? {
            sort: "distance",
            distance: lastShop.sortDistance,
            shopId: lastShop.shopId,
          }
        : {
            sort: "name",
            name: lastShop.name,
            shopId: lastShop.shopId,
          }
      : null
  const shopRows = shopRowsWithSort.map(
    ({ sortDistance: _sortDistance, ...shop }) => shop
  )

  return {
    shops: await addOfferSummaries(db, shopRows),
    total: totalRows?.[0]?.total,
    nextCursor,
  }
}
