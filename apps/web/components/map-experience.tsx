"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import Link from "next/link"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import {
  ChevronDown,
  ChevronUp,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Search,
  Settings,
  Store,
  X,
} from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Separator } from "@workspace/ui/components/separator"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerSwipeRegion,
  DrawerTitle,
  DrawerVirtualKeyboardProvider,
} from "@workspace/ui/components/drawer"
import { cn } from "@workspace/ui/lib/utils"
import { TorobCheckAssistant } from "@/app/components/torob-check-assistant"
import type {
  ShoppingAssistantMapContext,
  ShoppingAssistantOfferSelection,
} from "@/components/shopping-assistant-panel"

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/fiord"
const COMPACT_DRAWER_SNAP_POINT = "5.75rem"
const DEFAULT_DRAWER_SNAP_POINT = 0.66
const SELECTED_SHOP_ZOOM = 18
const SHOP_LIST_LOAD_AHEAD_PX = 240
const SHOP_POPOVER_COLLISION_PADDING = {
  top: 70,
  right: 12,
  bottom: 92,
  left: 12,
}
const DRAWER_SNAP_POINTS = [
  COMPACT_DRAWER_SNAP_POINT,
  DEFAULT_DRAWER_SNAP_POINT,
]
const SHOP_SOURCE_ID = "torob-shops"
const SHOP_POINT_LAYER_ID = "torob-shop-points"
const LOCATION_SOURCE_ID = "user-location"
const TEHRAN_CENTER: [number, number] = [51.389, 35.6892]

type Shop = {
  shopId: string
  name: string | null
  address: string | null
  locationLabel: string | null
  lat: number
  lon: number
  categoryNames: string[] | null
  offerCount: number
  lowestPrice: string | null
}

type ShopMapPosition = { x: number; y: number }
type ShopListScope = "all" | "visible"
type ShopBounds = {
  west: number
  south: number
  east: number
  north: number
}

type ShopResponse = {
  shops: Shop[]
  truncated: boolean
  error?: string
}

type ShopPageResponse = {
  shops: Shop[]
  total?: number
  nextCursor: string | null
  error?: string
}

type ShopFeatureCollection = Parameters<GeoJSONSource["setData"]>[0]

const persianNumber = new Intl.NumberFormat("fa-IR")

function formatPrice(price: string | null) {
  if (!price) return null

  const amount = Number(price)

  if (!Number.isFinite(amount)) return null

  return `${persianNumber.format(amount)} تومان`
}

function makeShopFeatures(shops: Shop[]): ShopFeatureCollection {
  return {
    type: "FeatureCollection",
    features: shops.map((shop) => ({
      type: "Feature",
      id: shop.shopId,
      geometry: {
        type: "Point",
        coordinates: [shop.lon, shop.lat],
      },
      properties: {
        shopId: shop.shopId,
        name: shop.name ?? "فروشگاه",
        locationLabel: shop.locationLabel ?? "",
      },
    })),
  } as ShopFeatureCollection
}

function emptyFeatureCollection(): ShopFeatureCollection {
  return { type: "FeatureCollection", features: [] } as ShopFeatureCollection
}

function getShopBounds(map: MapLibreMap): ShopBounds {
  const bounds = map.getBounds()

  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  }
}

function ShopListSkeleton() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری فروشگاه‌ها"
      className="flex flex-col gap-2"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={`shop-skeleton-${index}`}
          aria-hidden="true"
          className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/40 p-3"
        >
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
            <div className="mt-1 flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ShopDetailPopover({
  map,
  shop,
  open,
  onOpenChange,
  onClose,
}: {
  map: MapLibreMap
  shop: Shop
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: () => void
}) {
  const [anchorPosition, setAnchorPosition] = useState<ShopMapPosition>(() => {
    const point = map.project([shop.lon, shop.lat])
    return { x: point.x, y: point.y }
  })

  useEffect(() => {
    const updateAnchorPosition = () => {
      const point = map.project([shop.lon, shop.lat])
      setAnchorPosition((current) =>
        current.x === point.x && current.y === point.y
          ? current
          : { x: point.x, y: point.y }
      )
    }

    map.on("move", updateAnchorPosition)
    map.on("resize", updateAnchorPosition)

    return () => {
      map.off("move", updateAnchorPosition)
      map.off("resize", updateAnchorPosition)
    }
  }, [map, shop.lat, shop.lon])

  return (
    <Popover
      open={open}
      modal={false}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(open) => {
        if (!open) onClose()
      }}
    >
      <PopoverTrigger
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute z-20 size-px -translate-x-1/2 -translate-y-1/2 border-0 bg-transparent p-0 opacity-0"
        style={{ left: anchorPosition.x, top: anchorPosition.y }}
      />
      <PopoverContent
        showArrow
        side="top"
        sideOffset={12}
        collisionPadding={SHOP_POPOVER_COLLISION_PADDING}
        className="w-auto gap-0 overflow-visible bg-transparent p-0 shadow-none ring-0"
      >
        <Card
          role="article"
          dir="rtl"
          aria-label={`جزئیات ${shop.name || "فروشگاه"}`}
          className="w-[min(19rem,calc(100vw-2rem))] gap-0 rounded-2xl border border-border/70 bg-card/95 py-0 font-sans text-card-foreground shadow-2xl shadow-black/25 backdrop-blur-xl"
        >
          <CardHeader className="flex items-start gap-3 px-3.5 py-3.5">
            <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/10 bg-primary/10 text-primary">
              <Store aria-hidden="true" className="size-5" />
              <span className="absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-chart-2" />
            </span>
            <div className="min-w-0 pt-0.5">
              <CardTitle className="truncate text-sm leading-5 font-bold">
                {shop.name || "فروشگاه بدون نام"}
              </CardTitle>
              <CardDescription className="mt-0.5 truncate text-xs leading-5">
                {shop.locationLabel || "فروشگاه انتخاب‌شده"}
              </CardDescription>
            </div>
            <CardAction className="ms-auto -me-1 -mt-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="بستن جزئیات فروشگاه"
                onClick={() => onOpenChange(false)}
                className="size-8 rounded-full text-muted-foreground"
              >
                <X aria-hidden="true" />
              </Button>
            </CardAction>
          </CardHeader>

          {shop.address && (
            <>
              <Separator className="bg-border/60" />
              <CardContent className="flex items-start gap-2 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-primary/80"
                />
                <p className="line-clamp-2">{shop.address}</p>
              </CardContent>
            </>
          )}

          <Separator className="bg-border/60" />
          <CardContent className="grid grid-cols-2 gap-2 bg-muted/25 p-3">
            <div className="min-w-0 rounded-xl border border-border/50 bg-background/65 px-3 py-2">
              <p className="text-[10px] leading-4 text-muted-foreground">
                کالاهای فروشگاه
              </p>
              <Badge
                variant="secondary"
                className="mt-1 max-w-full px-1.5 text-xs font-semibold"
              >
                {persianNumber.format(shop.offerCount)} کالا
              </Badge>
            </div>
            <div className="min-w-0 rounded-xl border border-border/50 bg-background/65 px-3 py-2">
              <p className="text-[10px] leading-4 text-muted-foreground">
                کمترین قیمت
              </p>
              <Badge className="mt-1 max-w-full px-1.5 text-xs font-semibold">
                {formatPrice(shop.lowestPrice) || "ثبت نشده"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}

export default function MapExperience() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const shopListScrollAreaRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const shopListRequestRef = useRef<AbortController | null>(null)
  const activeSearchRef = useRef("")
  const activeSearchWithinMapRef = useRef(false)
  const selectedShopIdRef = useRef<string | null>(null)
  const suppressShopSelectionMoveEndsUntilRef = useRef(0)
  const activeShopRequestKeyRef = useRef<string | null>(null)
  const lastSuccessfulShopRequestKeyRef = useRef<string | null>(null)
  const hasLoadedShopsRef = useRef(false)
  const activeShopListRequestKeyRef = useRef<string | null>(null)
  const lastSuccessfulShopListRequestKeyRef = useRef<string | null>(null)
  const hasLoadedShopListRef = useRef(false)
  const shopListScopeRef = useRef<ShopListScope>("visible")
  const shopsRef = useRef<Shop[]>([])
  const hasUserLocationRef = useRef(false)
  const locationPermissionDeniedRef = useRef(false)

  const [shops, setShops] = useState<Shop[]>([])
  const [shopListItems, setShopListItems] = useState<Shop[]>([])
  const [shopListRequestKey, setShopListRequestKey] = useState("")
  const [shopListNextCursor, setShopListNextCursor] = useState<string | null>(
    null
  )
  const [shopListTotal, setShopListTotal] = useState(0)
  const [shopListScope, setShopListScope] = useState<ShopListScope>("visible")
  const [isLoadingMoreShops, setIsLoadingMoreShops] = useState(false)
  const [shopListPageError, setShopListPageError] = useState(false)
  const [shopsTruncated, setShopsTruncated] = useState(false)
  const [shopsStatus, setShopsStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  )
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  )
  const [assistantMapContext, setAssistantMapContext] =
    useState<ShoppingAssistantMapContext>({})
  const updateAssistantMapContext = useCallback((map: MapLibreMap) => {
    const center = map.getCenter()
    setAssistantMapContext({
      bounds: getShopBounds(map),
      center: { lat: center.lat, lon: center.lng },
    })
  }, [])
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null)
  const [openShopPopoverId, setOpenShopPopoverId] = useState<string | null>(
    null
  )
  const [query, setQuery] = useState("")
  const [searchWithinMap, setSearchWithinMap] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [drawerSnapPoint, setDrawerSnapPoint] = useState<
    number | string | null
  >(DEFAULT_DRAWER_SNAP_POINT)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)

  const handleDrawerSnapPointChange = useCallback(
    (snapPoint: number | string | null) => {
      setDrawerSnapPoint(snapPoint)
      if (snapPoint !== COMPACT_DRAWER_SNAP_POINT) {
        setIsAssistantOpen(false)
      }
    },
    []
  )

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      setIsDrawerOpen(true)
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  const selectedShop =
    shops.find((shop) => shop.shopId === selectedShopId) ??
    shopListItems.find((shop) => shop.shopId === selectedShopId)
  shopsRef.current = shops
  const displayedShops = shopListItems
  const shopListVirtualizer = useVirtualizer({
    count: displayedShops.length,
    getScrollElement: () =>
      shopListScrollAreaRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null,
    estimateSize: () => 112,
    getItemKey: (index) => displayedShops[index]?.shopId ?? index,
    gap: 8,
    overscan: 8,
  })

  const loadMapShops = useCallback(
    async (
      map: MapLibreMap,
      searchTerm = "",
      withinMap = false,
      preserveMapState = true
    ) => {
      const searchParams = new URLSearchParams()
      const viewportBounds = getShopBounds(map)

      if (searchTerm) searchParams.set("q", searchTerm)

      if (!searchTerm && shopListScopeRef.current === "all") {
        searchParams.set("all", "1")
      } else if (!searchTerm || withinMap) {
        searchParams.set("west", String(viewportBounds.west))
        searchParams.set("south", String(viewportBounds.south))
        searchParams.set("east", String(viewportBounds.east))
        searchParams.set("north", String(viewportBounds.north))
      }

      const requestKey = searchParams.toString()

      if (
        preserveMapState &&
        (lastSuccessfulShopRequestKeyRef.current === requestKey ||
          (requestRef.current &&
            !requestRef.current.signal.aborted &&
            activeShopRequestKeyRef.current === requestKey))
      ) {
        return null
      }

      requestRef.current?.abort()

      const controller = new AbortController()
      requestRef.current = controller
      activeShopRequestKeyRef.current = requestKey
      const keepCurrentMap = preserveMapState && hasLoadedShopsRef.current

      if (!keepCurrentMap) {
        hasLoadedShopsRef.current = false
        lastSuccessfulShopRequestKeyRef.current = null
      }

      try {
        const response = await fetch(`/api/shops/map?${searchParams}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const result = (await response.json()) as ShopResponse

        if (!response.ok) {
          throw new Error(result.error ?? "Shop data could not be loaded.")
        }

        if (controller.signal.aborted) return null

        lastSuccessfulShopRequestKeyRef.current = requestKey
        if (requestRef.current === controller) {
          requestRef.current = null
          activeShopRequestKeyRef.current = null
        }
        hasLoadedShopsRef.current = true
        setShops(result.shops)
        setShopsTruncated(result.truncated)

        const source = map.getSource(SHOP_SOURCE_ID) as
          GeoJSONSource | undefined
        source?.setData(makeShopFeatures(result.shops))

        return result
      } catch {
        if (controller.signal.aborted) return null

        if (requestRef.current === controller) {
          requestRef.current = null
          activeShopRequestKeyRef.current = null
        }

        if (keepCurrentMap) {
          setSearchError(
            "به‌روزرسانی فروشگاه‌ها انجام نشد. اطلاعات قبلی همچنان نمایش داده می‌شود."
          )
          return null
        }

        hasLoadedShopsRef.current = false
        lastSuccessfulShopRequestKeyRef.current = null
        setShops([])
        setShopsTruncated(false)
        setSearchError(
          "اطلاعات فروشگاه‌ها در دسترس نیست. اتصال دیتابیس را بررسی کنید."
        )

        const source = map.getSource(SHOP_SOURCE_ID) as
          GeoJSONSource | undefined
        source?.setData(emptyFeatureCollection())

        return null
      }
    },
    []
  )

  const loadShopList = useCallback(
    async (
      map: MapLibreMap,
      searchTerm = "",
      withinMap = false,
      preserveListState = true
    ) => {
      const searchParams = new URLSearchParams()
      const viewportBounds = getShopBounds(map)

      if (searchTerm) searchParams.set("q", searchTerm)

      if (withinMap || shopListScopeRef.current === "visible") {
        searchParams.set("west", String(viewportBounds.west))
        searchParams.set("south", String(viewportBounds.south))
        searchParams.set("east", String(viewportBounds.east))
        searchParams.set("north", String(viewportBounds.north))
      } else {
        searchParams.set("all", "1")
      }

      if (shopListScopeRef.current === "visible") {
        const center = map.getCenter()
        searchParams.set("sort", "distance")
        searchParams.set("centerLon", String(center.lng))
        searchParams.set("centerLat", String(center.lat))
      }

      const requestKey = searchParams.toString()

      if (
        preserveListState &&
        (lastSuccessfulShopListRequestKeyRef.current === requestKey ||
          (shopListRequestRef.current &&
            !shopListRequestRef.current.signal.aborted &&
            activeShopListRequestKeyRef.current === requestKey))
      ) {
        return null
      }

      shopListRequestRef.current?.abort()

      const controller = new AbortController()
      shopListRequestRef.current = controller
      activeShopListRequestKeyRef.current = requestKey
      const keepCurrentList = preserveListState && hasLoadedShopListRef.current

      if (!keepCurrentList) {
        hasLoadedShopListRef.current = false
        lastSuccessfulShopListRequestKeyRef.current = null
      }

      setIsLoadingMoreShops(false)
      setShopListPageError(false)
      if (keepCurrentList) {
        setShopsStatus("ready")
      } else {
        setShopListNextCursor(null)
        setShopsStatus("loading")
        setShopListItems([])
        setShopListTotal(0)
        setShopListRequestKey(requestKey)
      }

      try {
        const response = await fetch(`/api/shops?${searchParams}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const result = (await response.json()) as ShopPageResponse

        if (!response.ok) {
          throw new Error(result.error ?? "Shop data could not be loaded.")
        }

        if (controller.signal.aborted) return null

        lastSuccessfulShopListRequestKeyRef.current = requestKey
        hasLoadedShopListRef.current = true
        const scrollViewport =
          shopListScrollAreaRef.current?.querySelector<HTMLElement>(
            '[data-slot="scroll-area-viewport"]'
          )
        if (scrollViewport) scrollViewport.scrollTop = 0
        setShopListItems(result.shops)
        setShopListTotal(result.total ?? 0)
        setShopListNextCursor(result.nextCursor)
        setShopListRequestKey(requestKey)
        setShopsStatus("ready")

        if (shopListRequestRef.current === controller) {
          shopListRequestRef.current = null
          activeShopListRequestKeyRef.current = null
        }

        return result
      } catch {
        if (controller.signal.aborted) return null

        if (shopListRequestRef.current === controller) {
          shopListRequestRef.current = null
          activeShopListRequestKeyRef.current = null
        }

        if (keepCurrentList) {
          setSearchError(
            "به‌روزرسانی فهرست انجام نشد. اطلاعات قبلی همچنان نمایش داده می‌شود."
          )
          return null
        }

        hasLoadedShopListRef.current = false
        lastSuccessfulShopListRequestKeyRef.current = null
        setShopListItems([])
        setShopListTotal(0)
        setShopListNextCursor(null)
        setShopsStatus("error")
        setSearchError(
          "اطلاعات فروشگاه‌ها در دسترس نیست. اتصال دیتابیس را بررسی کنید."
        )

        return null
      }
    },
    []
  )

  const loadShops = useCallback(
    async (
      map: MapLibreMap,
      searchTerm = "",
      withinMap = false,
      preserveListState = true
    ) => {
      setSearchError(null)

      const [mapResult] = await Promise.all([
        loadMapShops(map, searchTerm, withinMap, preserveListState),
        loadShopList(map, searchTerm, withinMap, preserveListState),
      ])

      return mapResult
    },
    [loadMapShops, loadShopList]
  )

  const loadMoreShops = useCallback(
    async (retry = false) => {
      if (
        !shopListNextCursor ||
        isLoadingMoreShops ||
        !shopListRequestKey ||
        shopsStatus !== "ready" ||
        (shopListRequestRef.current &&
          !shopListRequestRef.current.signal.aborted) ||
        (shopListPageError && !retry)
      ) {
        return
      }

      const controller = new AbortController()
      shopListRequestRef.current = controller
      activeShopListRequestKeyRef.current = shopListRequestKey
      setIsLoadingMoreShops(true)
      setShopListPageError(false)
      setSearchError(null)

      const searchParams = new URLSearchParams(shopListRequestKey)
      searchParams.set("cursor", shopListNextCursor)

      try {
        const response = await fetch(`/api/shops?${searchParams}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const result = (await response.json()) as ShopPageResponse

        if (!response.ok) {
          throw new Error(result.error ?? "More shops could not be loaded.")
        }

        if (controller.signal.aborted) return

        setShopListItems((currentItems) => [...currentItems, ...result.shops])
        setShopListNextCursor(result.nextCursor)
        setIsLoadingMoreShops(false)
        setShopListPageError(false)
      } catch {
        if (controller.signal.aborted) return

        setIsLoadingMoreShops(false)
        setShopListPageError(true)
      } finally {
        if (shopListRequestRef.current === controller) {
          shopListRequestRef.current = null
          activeShopListRequestKeyRef.current = null
        }
      }
    },
    [
      isLoadingMoreShops,
      shopListNextCursor,
      shopListPageError,
      shopListRequestKey,
      shopsStatus,
    ]
  )

  const selectShop = useCallback((shop: Shop) => {
    const map = mapRef.current
    setSelectedShopId(shop.shopId)
    setOpenShopPopoverId(shop.shopId)
    setDrawerSnapPoint(COMPACT_DRAWER_SNAP_POINT)

    if (!map) return

    if (!shopsRef.current.some((item) => item.shopId === shop.shopId)) {
      const nextShops = [...shopsRef.current, shop]
      shopsRef.current = nextShops
      setShops(nextShops)

      const source = map.getSource(SHOP_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(makeShopFeatures(nextShops))
    }

    const targetZoom = Math.max(map.getZoom(), SELECTED_SHOP_ZOOM)
    const currentCenter = map.getCenter()
    const needsCameraMove =
      Math.abs(currentCenter.lng - shop.lon) > 0.000001 ||
      Math.abs(currentCenter.lat - shop.lat) > 0.000001 ||
      Math.abs(map.getZoom() - targetZoom) > 0.001

    if (!needsCameraMove) return

    suppressShopSelectionMoveEndsUntilRef.current = Date.now() + 1200
    map.flyTo({
      center: [shop.lon, shop.lat],
      zoom: targetZoom,
      duration: 700,
    })
  }, [])

  const handleAssistantOpenChange = useCallback((open: boolean) => {
    setIsAssistantOpen(open)
    if (open) {
      setIsDrawerOpen(true)
      setDrawerSnapPoint(COMPACT_DRAWER_SNAP_POINT)
    }
  }, [])

  const selectAssistantOffer = useCallback(
    (offer: ShoppingAssistantOfferSelection) => {
      if (offer.lat === null || offer.lon === null) return
      const existingShop =
        shopsRef.current.find((shop) => shop.shopId === offer.shopId) ??
        shopListItems.find((shop) => shop.shopId === offer.shopId)
      const shop: Shop = {
        shopId: offer.shopId,
        name: existingShop?.name ?? offer.shopName,
        address: existingShop?.address ?? offer.address,
        locationLabel: existingShop?.locationLabel ?? offer.locationLabel,
        lat: offer.lat,
        lon: offer.lon,
        categoryNames:
          existingShop?.categoryNames ??
          (offer.categoryName ? [offer.categoryName] : null),
        offerCount: existingShop?.offerCount ?? 1,
        lowestPrice: existingShop?.lowestPrice ?? offer.priceToman,
      }
      setIsDrawerOpen(true)
      setDrawerSnapPoint(COMPACT_DRAWER_SNAP_POINT)
      selectShop(shop)
    },
    [selectShop, shopListItems]
  )

  const clearSelectedShop = useCallback((shopId: string) => {
    setOpenShopPopoverId((currentShopId) =>
      currentShopId === shopId ? null : currentShopId
    )
    setSelectedShopId((currentShopId) =>
      currentShopId === shopId ? null : currentShopId
    )
  }, [])

  const clearUserLocation = useCallback(() => {
    const source = mapRef.current?.getSource(LOCATION_SOURCE_ID) as
      GeoJSONSource | undefined

    source?.setData(emptyFeatureCollection())
    setUserLocation(null)
  }, [])

  useEffect(() => {
    let disposed = false
    let activeMap: MapLibreMap | null = null

    async function initializeMap() {
      try {
        const maplibre = await import("@/lib/maplibre-client")

        if (disposed || !mapContainerRef.current) return

        activeMap = new maplibre.Map({
          container: mapContainerRef.current,
          style: OPENFREEMAP_STYLE,
          center: TEHRAN_CENTER,
          zoom: 12.2,
          minZoom: 4,
          maxZoom: 19,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
        })
        mapRef.current = activeMap

        let loaded = false

        activeMap.on("error", () => {
          if (!loaded && !disposed) setMapStatus("error")
        })

        activeMap.once("load", () => {
          if (!activeMap || disposed) return

          loaded = true
          updateAssistantMapContext(activeMap)
          const firstSymbolLayerId = activeMap
            .getStyle()
            .layers?.find((layer) => layer.type === "symbol")?.id

          activeMap.addSource(SHOP_SOURCE_ID, {
            type: "geojson",
            data: emptyFeatureCollection(),
            cluster: true,
            clusterRadius: 48,
            clusterMaxZoom: 15,
            promoteId: "shopId",
          })
          activeMap.addSource(LOCATION_SOURCE_ID, {
            type: "geojson",
            data: emptyFeatureCollection(),
          })

          activeMap.addLayer(
            {
              id: "torob-shop-clusters",
              type: "circle",
              source: SHOP_SOURCE_ID,
              filter: ["has", "point_count"],
              paint: {
                "circle-color": [
                  "step",
                  ["get", "point_count"],
                  "#ee4058",
                  24,
                  "#db304b",
                  90,
                  "#bd1f3b",
                ],
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  17,
                  24,
                  21,
                  90,
                  25,
                ],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 3,
              },
            },
            firstSymbolLayerId
          )
          activeMap.addLayer(
            {
              id: SHOP_POINT_LAYER_ID,
              type: "circle",
              source: SHOP_SOURCE_ID,
              filter: ["!", ["has", "point_count"]],
              paint: {
                "circle-radius": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  10,
                  7,
                ],
                "circle-color": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  "#a91531",
                  "#ee4058",
                ],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2.5,
                "circle-opacity": 0.96,
              },
            },
            firstSymbolLayerId
          )
          activeMap.addLayer(
            {
              id: "torob-shop-cluster-count",
              type: "symbol",
              source: SHOP_SOURCE_ID,
              filter: ["has", "point_count"],
              layout: {
                "text-field": ["get", "point_count_abbreviated"],
                "text-font": ["Noto Sans Regular"],
                "text-size": 12,
                "text-allow-overlap": true,
              },
              paint: { "text-color": "#ffffff" },
            },
            firstSymbolLayerId
          )
          activeMap.addLayer(
            {
              id: "user-location-dot",
              type: "circle",
              source: LOCATION_SOURCE_ID,
              paint: {
                "circle-radius": 8,
                "circle-color": "#3285f6",
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 3,
                "circle-blur": 0.05,
              },
            },
            firstSymbolLayerId
          )

          activeMap.on("click", "torob-shop-clusters", (event) => {
            const feature = event.features?.[0]
            const coordinates = feature?.geometry as
              { coordinates: [number, number] } | undefined
            const clusterId = Number(feature?.properties?.cluster_id)
            const source = activeMap?.getSource(SHOP_SOURCE_ID) as
              GeoJSONSource | undefined

            if (!source || !coordinates || !Number.isFinite(clusterId)) return

            void source
              .getClusterExpansionZoom(clusterId)
              .then((zoom) => {
                activeMap?.easeTo({
                  center: coordinates.coordinates,
                  zoom,
                  duration: 500,
                })
              })
              .catch(() => undefined)
          })

          activeMap.on("click", SHOP_POINT_LAYER_ID, (event) => {
            const shopId = event.features?.[0]?.properties?.shopId
            if (typeof shopId !== "string") return

            const shop = shopsRef.current.find((item) => item.shopId === shopId)
            if (shop) selectShop(shop)
          })

          activeMap.on("mouseenter", SHOP_POINT_LAYER_ID, () => {
            if (activeMap) activeMap.getCanvas().style.cursor = "pointer"
          })
          activeMap.on("mouseleave", SHOP_POINT_LAYER_ID, () => {
            if (activeMap) activeMap.getCanvas().style.cursor = ""
          })
          activeMap.on("mouseenter", "torob-shop-clusters", () => {
            if (activeMap) activeMap.getCanvas().style.cursor = "pointer"
          })
          activeMap.on("mouseleave", "torob-shop-clusters", () => {
            if (activeMap) activeMap.getCanvas().style.cursor = ""
          })

          activeMap.on("moveend", () => {
            updateAssistantMapContext(activeMap!)
            if (Date.now() < suppressShopSelectionMoveEndsUntilRef.current) {
              if (shopListScopeRef.current === "visible") {
                void loadShopList(
                  activeMap!,
                  activeSearchRef.current,
                  activeSearchWithinMapRef.current,
                  true
                )
              }
              return
            }

            if (activeSearchWithinMapRef.current && activeSearchRef.current) {
              void loadShops(
                activeMap!,
                activeSearchRef.current,
                activeSearchWithinMapRef.current,
                true
              )
            } else if (
              !activeSearchRef.current &&
              shopListScopeRef.current === "visible"
            ) {
              void loadShops(activeMap!, "", false, true)
            } else if (
              activeSearchRef.current &&
              shopListScopeRef.current === "visible"
            ) {
              void loadShopList(
                activeMap!,
                activeSearchRef.current,
                activeSearchWithinMapRef.current,
                true
              )
            }
          })

          setMapStatus("ready")
          void loadShops(activeMap)
        })
      } catch {
        if (!disposed) setMapStatus("error")
      }
    }

    void initializeMap()

    return () => {
      disposed = true
      requestRef.current?.abort()
      shopListRequestRef.current?.abort()
      activeMap?.remove()
      mapRef.current = null
    }
  }, [loadShopList, loadShops, selectShop, updateAssistantMapContext])

  useEffect(() => {
    if (!navigator.permissions?.query) return

    let disposed = false
    let permissionStatus: PermissionStatus | null = null

    const handlePermissionChange = () => {
      if (permissionStatus?.state === "denied") {
        if (!hasUserLocationRef.current) return

        hasUserLocationRef.current = false
        locationPermissionDeniedRef.current = true
        clearUserLocation()
        setLocationError("دسترسی به موقعیت مکانی داده نشد.")
        setDrawerSnapPoint(DEFAULT_DRAWER_SNAP_POINT)
        return
      }

      if (
        permissionStatus?.state === "granted" &&
        locationPermissionDeniedRef.current
      ) {
        locationPermissionDeniedRef.current = false
        setLocationError(null)
      }
    }

    void navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (disposed) return

        permissionStatus = status
        permissionStatus.addEventListener("change", handlePermissionChange)
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      permissionStatus?.removeEventListener("change", handlePermissionChange)
    }
  }, [clearUserLocation])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(SHOP_SOURCE_ID) as GeoJSONSource | undefined

    if (!map || !source) return

    if (selectedShopIdRef.current) {
      map.setFeatureState(
        { source: SHOP_SOURCE_ID, id: selectedShopIdRef.current },
        { selected: false }
      )
    }

    if (selectedShopId) {
      map.setFeatureState(
        { source: SHOP_SOURCE_ID, id: selectedShopId },
        { selected: true }
      )
    }

    selectedShopIdRef.current = selectedShopId
  }, [selectedShopId, shops])

  const searchShops = async (searchTerm: string, withinMap: boolean) => {
    const map = mapRef.current

    if (!map) return

    activeSearchRef.current = searchTerm
    activeSearchWithinMapRef.current = Boolean(searchTerm && withinMap)
    setSelectedShopId(null)
    setOpenShopPopoverId(null)
    setIsSearching(true)
    setDrawerSnapPoint(DEFAULT_DRAWER_SNAP_POINT)

    const result = await loadShops(map, searchTerm, withinMap, false)
    setIsSearching(false)

    if (!result || !searchTerm || withinMap || result.shops.length === 0) return

    if (result.shops.length === 1) {
      const shop = result.shops[0]

      if (!shop) return

      selectShop(shop)
      return
    }

    const longitudes = result.shops.map((shop) => shop.lon)
    const latitudes = result.shops.map((shop) => shop.lat)
    const west = Math.min(...longitudes)
    const east = Math.max(...longitudes)
    const south = Math.min(...latitudes)
    const north = Math.max(...latitudes)

    if (west === east && south === north) {
      map.flyTo({ center: [west, south], zoom: 15, duration: 700 })
      return
    }

    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      {
        padding: {
          top: 88,
          bottom:
            Math.round(window.innerHeight * DEFAULT_DRAWER_SNAP_POINT) + 16,
          left: 24,
          right: 24,
        },
        maxZoom: 15,
        duration: 700,
      }
    )
  }

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const searchTerm = query.trim()

    if (searchTerm.length === 1) {
      setSearchError("برای جستجو، دست‌کم دو حرف وارد کنید.")
      return
    }

    await searchShops(searchTerm, searchWithinMap)
  }

  const toggleSearchScope = () => {
    const nextSearchWithinMap = !searchWithinMap
    setSearchWithinMap(nextSearchWithinMap)

    const activeSearch = activeSearchRef.current

    if (activeSearch && activeSearch === query.trim()) {
      void searchShops(activeSearch, nextSearchWithinMap)
    }
  }

  const handleShopListScopeChange = (values: string[]) => {
    const nextScope = values[0]

    if (nextScope !== "all" && nextScope !== "visible") return
    if (nextScope === shopListScopeRef.current) return

    shopListScopeRef.current = nextScope
    setShopListScope(nextScope)

    const map = mapRef.current
    if (!map) return

    if (activeSearchRef.current) {
      void loadShopList(
        map,
        activeSearchRef.current,
        activeSearchWithinMapRef.current,
        false
      )
      return
    }

    void loadShops(map, "", false, false)
  }

  const clearSearch = () => {
    setQuery("")
    setSelectedShopId(null)
    setOpenShopPopoverId(null)
    activeSearchRef.current = ""
    activeSearchWithinMapRef.current = false

    const map = mapRef.current
    if (map) void loadShops(map, "", false, false)
  }

  const requestUserLocation = () => {
    locationPermissionDeniedRef.current = false
    setLocationError(null)

    if (!navigator.geolocation) {
      setLocationError("موقعیت‌یابی در این مرورگر پشتیبانی نمی‌شود.")
      setDrawerSnapPoint(DEFAULT_DRAWER_SNAP_POINT)
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const map = mapRef.current
        const source = map?.getSource(LOCATION_SOURCE_ID) as
          GeoJSONSource | undefined

        if (!map || !source) return

        hasUserLocationRef.current = true
        locationPermissionDeniedRef.current = false
        setUserLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        })

        source.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [coords.longitude, coords.latitude],
              },
              properties: {},
            },
          ],
        })
        setDrawerSnapPoint(DEFAULT_DRAWER_SNAP_POINT)
        map.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 15,
          duration: 800,
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          hasUserLocationRef.current = false
          locationPermissionDeniedRef.current = true
          clearUserLocation()
          setLocationError("دسترسی به موقعیت مکانی داده نشد.")
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationError("موقعیت مکانی فعلاً در دسترس نیست.")
        } else {
          setLocationError(
            "دریافت موقعیت مکانی بیش از حد طول کشید. دوباره تلاش کنید."
          )
        }
        setDrawerSnapPoint(DEFAULT_DRAWER_SNAP_POINT)
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
    )
  }

  const shopCountLabel =
    shopListScope === "all"
      ? `${persianNumber.format(shopListTotal)} فروشگاه`
      : `${persianNumber.format(shopListTotal)} ${activeSearchRef.current ? "نتیجه" : "فروشگاه"} در نمای نقشه`

  const isCompactDrawer = drawerSnapPoint === COMPACT_DRAWER_SNAP_POINT
  const drawerExpandLabel = isCompactDrawer
    ? "نمایش جستجو و فهرست فروشگاه‌ها"
    : "کوچک کردن فهرست فروشگاه‌ها"

  const advanceDrawerSnapPoint = () => {
    handleDrawerSnapPointChange(
      isCompactDrawer ? DEFAULT_DRAWER_SNAP_POINT : COMPACT_DRAWER_SNAP_POINT
    )
  }

  return (
    <main className="relative h-dvh min-h-[540px] w-full overflow-hidden bg-background text-foreground">
      <div
        ref={mapContainerRef}
        className="torob-map absolute inset-0 bg-map-background"
        data-drawer-snap={isCompactDrawer ? "peek" : "default"}
        aria-label="نقشه فروشگاه‌های تهران"
      />

      <div
        aria-label="منابع نقشه"
        dir="ltr"
        data-drawer-snap={isCompactDrawer ? "peek" : "default"}
        className="torob-map-overlay torob-map-attribution invisible absolute left-3 z-10 flex items-center gap-1.5 rounded-2xl border border-border/70 bg-card/95 px-3 py-2 text-xs leading-4 text-muted-foreground shadow-lg shadow-black/10 backdrop-blur-xl"
      >
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          © OpenStreetMap contributors
        </a>
        <span aria-hidden="true">·</span>
        <a
          href="https://openmaptiles.org/"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          © OpenMapTiles
        </a>
      </div>

      <div
        data-drawer-snap={isCompactDrawer ? "peek" : "default"}
        className="torob-map-overlay absolute right-3 z-10"
      >
        <TorobCheckAssistant
          location={userLocation}
          mapContext={assistantMapContext}
          open={isAssistantOpen}
          onOpenChange={handleAssistantOpenChange}
          onSelectOffer={selectAssistantOffer}
        />
      </div>

      <Link
        href="/admin/settings"
        aria-label="تنظیمات"
        title="تنظیمات"
        className="absolute top-3 right-3 z-20 grid size-11 place-items-center rounded-full border border-border/70 bg-card/95 text-foreground shadow-lg shadow-black/10 backdrop-blur-xl transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:top-4 md:right-4"
      >
        <Settings aria-hidden="true" className="size-5" />
      </Link>

      <div
        role="group"
        aria-label="کنترل‌های نقشه"
        className="absolute top-3 left-3 z-20 flex items-center gap-1 rounded-2xl border border-border/70 bg-card/95 p-1 shadow-lg shadow-black/10 backdrop-blur-xl md:top-4 md:left-4"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="rounded-full"
          aria-label="بزرگ‌نمایی نقشه"
          onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="rounded-full"
          aria-label="کوچک‌نمایی نقشه"
          onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="rounded-full"
          aria-label="رفتن به موقعیت من"
          onClick={requestUserLocation}
        >
          <LocateFixed aria-hidden="true" />
        </Button>
      </div>

      <Drawer
        open={isDrawerOpen}
        snapPoints={DRAWER_SNAP_POINTS}
        snapPoint={drawerSnapPoint}
        onSnapPointChange={handleDrawerSnapPointChange}
        snapToSequentialPoints
        swipeDirection="down"
        modal={false}
        disablePointerDismissal
        showSwipeHandle
        onOpenChange={(open, eventDetails) => {
          if (!open) eventDetails.cancel()
        }}
      >
        <DrawerVirtualKeyboardProvider>
          <DrawerContent
            className="torob-map-drawer max-h-none rounded-t-3xl border-border/70 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur-xl **:data-[slot=drawer-content]:overflow-visible"
            initialFocus={false}
            onPointerDownCapture={(event) => {
              if (
                selectedShopId &&
                event.target instanceof Element &&
                event.target.closest(
                  '[data-slot="drawer-swipe-handle"], [data-slot="drawer-swipe-region"]'
                )
              ) {
                setOpenShopPopoverId(null)
              }
            }}
          >
            <DrawerSwipeRegion className="h-20">
              <DrawerHeader className="h-full gap-0 px-4 pt-1 pb-3 text-right sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Store aria-hidden="true" />
                    </span>
                    <div className="min-w-0 text-right">
                      <DrawerTitle className="flex items-center gap-2 truncate text-base font-bold">
                        فروشگاه‌های
                        <ToggleGroup
                          aria-label="محدودهٔ فهرست فروشگاه‌ها"
                          onValueChange={handleShopListScopeChange}
                          variant="outline"
                          size="sm"
                          spacing={0}
                          value={[shopListScope]}
                        >
                          <ToggleGroupItem
                            value="all"
                            aria-label="نمایش همهٔ نتایج"
                            title="نمایش همهٔ نتایج"
                            className="h-6 rounded-full data-pressed:bg-primary"
                          >
                            همه جا
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value="visible"
                            aria-label="نمایش نتایج در محدودهٔ نقشه"
                            title="نمایش فقط موارد داخل محدودهٔ قابل‌مشاهدهٔ نقشه"
                            className="h-6 rounded-full data-pressed:bg-primary"
                          >
                            <MapPin
                              aria-hidden="true"
                              data-icon="inline-start"
                            />
                            این محدوده
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </DrawerTitle>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        تربِ حضوری / {shopCountLabel}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    data-base-ui-swipe-ignore
                    aria-label={drawerExpandLabel}
                    title={drawerExpandLabel}
                    onClick={advanceDrawerSnapPoint}
                    className="shrink-0 rounded-xl"
                  >
                    {isCompactDrawer ? (
                      <ChevronUp aria-hidden="true" />
                    ) : (
                      <ChevronDown aria-hidden="true" />
                    )}
                  </Button>
                </div>
                <DrawerDescription className="mt-1 text-right text-xs">
                  {isCompactDrawer
                    ? "برای جستجو و دیدن فروشگاه‌ها، به بالا بکشید"
                    : "برای کوچک‌کردن فهرست، دسته را به پایین بکشید"}
                </DrawerDescription>
              </DrawerHeader>
            </DrawerSwipeRegion>

            <div className="flex min-h-0 flex-1 flex-col">
              <form
                role="search"
                onSubmit={handleSearch}
                className="shrink-0 px-4 pt-1 sm:px-6"
              >
                <FieldGroup className="gap-0">
                  <Field>
                    <FieldLabel htmlFor="shop-search" className="sr-only">
                      جستجوی فروشگاه یا محله
                    </FieldLabel>
                    <div className="flex items-center gap-2">
                      <InputGroup className="relative z-10 h-11 rounded-full bg-background">
                        <InputGroupInput
                          id="shop-search"
                          type="text"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="نام فروشگاه، کالا یا محله"
                          autoComplete="off"
                          inputMode="search"
                          className="h-11 px-4 text-sm"
                        />
                        <InputGroupAddon align="inline-start" className="ps-1">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <InputGroupButton
                                  aria-label="جستجو در محدودهٔ نقشه"
                                  aria-pressed={searchWithinMap}
                                  className={cn(
                                    "ms-1.5 rounded-full",
                                    searchWithinMap &&
                                      "bg-chart-3 hover:bg-chart-4"
                                  )}
                                  onClick={toggleSearchScope}
                                  size="icon-sm"
                                  type="button"
                                  variant={
                                    searchWithinMap ? "default" : "outline"
                                  }
                                >
                                  <MapPin aria-hidden="true" />
                                </InputGroupButton>
                              }
                            />
                            <TooltipContent
                              dir="rtl"
                              className="max-w-60 text-center leading-5"
                            >
                              {searchWithinMap
                                ? "جستجو فقط در محدودهٔ قابل‌مشاهدهٔ نقشه"
                                : "برای محدودکردن نتایج به محدودهٔ قابل‌مشاهدهٔ نقشه، فعال کنید"}
                            </TooltipContent>
                          </Tooltip>
                        </InputGroupAddon>
                      </InputGroup>
                      {query && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label="پاک کردن جستجو"
                          onClick={clearSearch}
                          className="size-11 shrink-0 rounded-full"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        type="submit"
                        size="icon-lg"
                        aria-label="جستجوی فروشگاه‌ها"
                        disabled={isSearching}
                        className="size-11 shrink-0 rounded-full"
                      >
                        <Search aria-hidden="true" />
                      </Button>
                    </div>
                  </Field>
                </FieldGroup>
              </form>

              {(searchError ||
                locationError ||
                mapStatus === "error" ||
                shopsTruncated) && (
                <div className="flex shrink-0 flex-col gap-2 px-4 pb-2 sm:px-6">
                  {searchError && (
                    <p
                      role="alert"
                      className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                    >
                      {searchError}
                    </p>
                  )}
                  {locationError && (
                    <p
                      role="status"
                      className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                    >
                      {locationError}
                    </p>
                  )}
                  {mapStatus === "error" && (
                    <p
                      role="alert"
                      className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                    >
                      بارگذاری نقشه انجام نشد. اتصال اینترنت یا دسترسی به سرویس
                      نقشه را بررسی کنید.
                    </p>
                  )}
                  {shopsTruncated && (
                    <p
                      role="status"
                      className="mt-4 rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground"
                    >
                      نقشه حداکثر ۱۰٬۰۰۰ فروشگاه را نشان می‌دهد؛ فهرست کامل از
                      همین‌جا صفحه‌به‌صفحه بارگذاری می‌شود.
                    </p>
                  )}
                </div>
              )}

              <ScrollArea
                ref={shopListScrollAreaRef}
                className="min-h-0 flex-1 px-4 **:data-[slot=scroll-area-viewport]:py-4 sm:px-6"
                onScrollCapture={(event) => {
                  const viewport = event.target

                  if (!(viewport instanceof HTMLElement)) return

                  const distanceFromBottom =
                    viewport.scrollHeight -
                    viewport.scrollTop -
                    viewport.clientHeight

                  if (distanceFromBottom <= SHOP_LIST_LOAD_AHEAD_PX) {
                    loadMoreShops()
                  }
                }}
              >
                {shopsStatus === "loading" ? (
                  <ShopListSkeleton />
                ) : shopsStatus === "error" ? (
                  <div className="rounded-2xl bg-muted/70 px-4 py-5 text-center text-sm leading-6 text-muted-foreground">
                    اطلاعات فروشگاه‌ها بارگذاری نشد. مطمئن شوید دیتابیس آماده و
                    داده‌ها وارد شده‌اند.
                  </div>
                ) : displayedShops.length === 0 && shopsStatus === "ready" ? (
                  <div className="rounded-2xl bg-muted/70 px-4 py-5 text-center text-sm leading-6 text-muted-foreground">
                    {activeSearchRef.current
                      ? shopListScope === "visible" &&
                        !activeSearchWithinMapRef.current
                        ? "در محدودهٔ فعلی فروشگاهی از نتایج جستجو پیدا نشد."
                        : "فروشگاهی با این نام یا محدوده پیدا نشد."
                      : shopListScope === "visible"
                        ? "در این محدوده فروشگاهی با موقعیت ثبت‌شده پیدا نشد."
                        : "فروشگاهی با موقعیت ثبت‌شده پیدا نشد."}
                  </div>
                ) : (
                  <div
                    className="relative w-full"
                    style={{ height: shopListVirtualizer.getTotalSize() }}
                  >
                    {shopListVirtualizer
                      .getVirtualItems()
                      .map((virtualShop) => {
                        const shop = displayedShops[virtualShop.index]

                        if (!shop) return null

                        const isSelected = shop.shopId === selectedShopId
                        const price = formatPrice(shop.lowestPrice)

                        return (
                          <button
                            ref={shopListVirtualizer.measureElement}
                            data-index={virtualShop.index}
                            key={shop.shopId}
                            type="button"
                            aria-pressed={isSelected}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              transform: `translateY(${virtualShop.start}px)`,
                            }}
                            onClick={() => selectShop(shop)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-background/40 p-3 text-right transition-colors hover:border-border hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              isSelected && "border-primary/30 bg-primary/10"
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-10 shrink-0 place-items-center rounded-xl border border-border/60 bg-muted/70 text-muted-foreground transition-colors",
                                isSelected
                                  ? "border-primary/20 bg-primary text-primary-foreground"
                                  : ""
                              )}
                            >
                              <Store aria-hidden="true" />
                            </span>
                            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm leading-5 font-semibold">
                                  {shop.name || "فروشگاه بدون نام"}
                                </span>
                                <span className="mt-1 block truncate text-xs leading-5 text-muted-foreground">
                                  {shop.locationLabel ||
                                    shop.address ||
                                    "تهران"}
                                </span>
                                <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                                  {shop.categoryNames?.[0] && (
                                    <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                                      {shop.categoryNames[0]}
                                    </span>
                                  )}
                                  {shop.offerCount > 0 && (
                                    <Badge
                                      variant="secondary"
                                      className="shrink-0 px-1.5 text-[10px] font-normal"
                                    >
                                      {persianNumber.format(shop.offerCount)}{" "}
                                      کالا
                                    </Badge>
                                  )}
                                  {price && (
                                    <Badge className="shrink-0 px-1.5 text-[10px] font-normal">
                                      از {price}
                                    </Badge>
                                  )}
                                </span>
                              </span>
                            </span>
                          </button>
                        )
                      })}
                  </div>
                )}
                {isLoadingMoreShops && <ShopListSkeleton />}
                {shopListPageError && (
                  <div
                    role="alert"
                    className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground"
                  >
                    <span>بارگذاری ادامهٔ فهرست انجام نشد.</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadMoreShops(true)}
                    >
                      تلاش دوباره
                    </Button>
                  </div>
                )}
              </ScrollArea>
            </div>
          </DrawerContent>
        </DrawerVirtualKeyboardProvider>
      </Drawer>

      {mapStatus === "ready" && selectedShop && mapRef.current ? (
        <ShopDetailPopover
          key={selectedShop.shopId}
          map={mapRef.current}
          shop={selectedShop}
          open={openShopPopoverId === selectedShop.shopId}
          onOpenChange={(open) => {
            setOpenShopPopoverId((currentShopId) => {
              if (open) return selectedShop.shopId
              return currentShopId === selectedShop.shopId
                ? null
                : currentShopId
            })
          }}
          onClose={() => clearSelectedShop(selectedShop.shopId)}
        />
      ) : null}
    </main>
  )
}
