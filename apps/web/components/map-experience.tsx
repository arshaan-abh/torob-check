"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import {
  ChevronDown,
  ChevronUp,
  LocateFixed,
  Minus,
  Plus,
  Search,
  Store,
  X,
} from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerVirtualKeyboardProvider,
} from "@workspace/ui/components/drawer"
import { cn } from "@workspace/ui/lib/utils"
import { TorobCheckCharacter } from "@/app/components/torob-check-character"

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/fiord"
const COMPACT_DRAWER_SNAP_POINT = "6.25rem"
const DEFAULT_DRAWER_SNAP_POINT = 0.66
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

type ShopResponse = {
  shops: Shop[]
  total: number
  truncated: boolean
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

function formatShopCount(total: number, truncated: boolean) {
  const count = persianNumber.format(total)
  return truncated ? `بیش از ${count} فروشگاه` : `${count} فروشگاه`
}

export default function MapExperience() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const activeSearchRef = useRef("")
  const selectedShopIdRef = useRef<string | null>(null)

  const [shops, setShops] = useState<Shop[]>([])
  const [totalShops, setTotalShops] = useState(0)
  const [shopsTruncated, setShopsTruncated] = useState(false)
  const [shopsStatus, setShopsStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  )
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  )
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState(TEHRAN_CENTER)
  const [drawerSnapPoint, setDrawerSnapPoint] = useState<
    number | string | null
  >(DEFAULT_DRAWER_SNAP_POINT)

  const selectedShop = shops.find((shop) => shop.shopId === selectedShopId)
  const nearestShops = useMemo(() => {
    const longitudeScale = Math.cos((mapCenter[1] * Math.PI) / 180)

    return [...shops].sort((first, second) => {
      const firstLongitude = (first.lon - mapCenter[0]) * longitudeScale
      const firstLatitude = first.lat - mapCenter[1]
      const secondLongitude = (second.lon - mapCenter[0]) * longitudeScale
      const secondLatitude = second.lat - mapCenter[1]

      return (
        firstLongitude ** 2 +
        firstLatitude ** 2 -
        (secondLongitude ** 2 + secondLatitude ** 2)
      )
    })
  }, [mapCenter, shops])

  const loadShops = useCallback(async (map: MapLibreMap, searchTerm = "") => {
    requestRef.current?.abort()

    const controller = new AbortController()
    requestRef.current = controller
    setShopsStatus("loading")
    setSearchError(null)

    const searchParams = new URLSearchParams()

    if (searchTerm) {
      searchParams.set("q", searchTerm)
    } else {
      const bounds = map.getBounds()
      searchParams.set("west", String(bounds.getWest()))
      searchParams.set("south", String(bounds.getSouth()))
      searchParams.set("east", String(bounds.getEast()))
      searchParams.set("north", String(bounds.getNorth()))
    }

    try {
      const response = await fetch(`/api/shops?${searchParams}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      const result = (await response.json()) as ShopResponse

      if (!response.ok) {
        throw new Error(result.error ?? "Shop data could not be loaded.")
      }

      if (controller.signal.aborted) return null

      setShops(result.shops)
      setTotalShops(result.total)
      setShopsTruncated(result.truncated)
      setShopsStatus("ready")

      const source = map.getSource(SHOP_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(makeShopFeatures(result.shops))

      return result
    } catch {
      if (controller.signal.aborted) return null

      setShops([])
      setTotalShops(0)
      setShopsTruncated(false)
      setShopsStatus("error")
      setSearchError(
        "اطلاعات فروشگاه‌ها در دسترس نیست. اتصال دیتابیس را بررسی کنید."
      )

      const source = map.getSource(SHOP_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(emptyFeatureCollection())

      return null
    }
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
            if (typeof shopId === "string") setSelectedShopId(shopId)
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
            if (activeMap) {
              const center = activeMap.getCenter()
              setMapCenter([center.lng, center.lat])
            }

            if (!activeSearchRef.current) void loadShops(activeMap!)
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
      activeMap?.remove()
      mapRef.current = null
    }
  }, [loadShops])

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

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const searchTerm = query.trim()
    const map = mapRef.current

    if (!map) return

    if (searchTerm.length === 1) {
      setSearchError("برای جستجو، دست‌کم دو حرف وارد کنید.")
      return
    }

    activeSearchRef.current = searchTerm
    setSelectedShopId(null)
    setIsSearching(true)
    setDrawerSnapPoint(DEFAULT_DRAWER_SNAP_POINT)

    const result = await loadShops(map, searchTerm)
    setIsSearching(false)

    if (!result || !searchTerm || result.shops.length === 0) return

    if (result.shops.length === 1) {
      const shop = result.shops[0]

      if (!shop) return

      setSelectedShopId(shop.shopId)
      map.flyTo({ center: [shop.lon, shop.lat], zoom: 16, duration: 700 })
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

  const clearSearch = () => {
    setQuery("")
    setSelectedShopId(null)
    activeSearchRef.current = ""

    const map = mapRef.current
    if (map) void loadShops(map)
  }

  const selectShop = (shop: Shop) => {
    const map = mapRef.current
    setSelectedShopId(shop.shopId)
    setDrawerSnapPoint(DEFAULT_DRAWER_SNAP_POINT)
    map?.flyTo({
      center: [shop.lon, shop.lat],
      zoom: Math.max(map?.getZoom() ?? 15, 15),
      duration: 650,
    })
  }

  const requestUserLocation = () => {
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
      () => {
        setLocationError("دسترسی به موقعیت مکانی داده نشد.")
        setDrawerSnapPoint(DEFAULT_DRAWER_SNAP_POINT)
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
    )
  }

  const shopCountLabel = useMemo(
    () => formatShopCount(totalShops, shopsTruncated),
    [shopsTruncated, totalShops]
  )

  const isCompactDrawer = drawerSnapPoint === COMPACT_DRAWER_SNAP_POINT
  const drawerExpandLabel = isCompactDrawer
    ? "نمایش جستجو و فهرست فروشگاه‌ها"
    : "کوچک کردن فهرست فروشگاه‌ها"

  const advanceDrawerSnapPoint = () => {
    setDrawerSnapPoint(
      isCompactDrawer ? DEFAULT_DRAWER_SNAP_POINT : COMPACT_DRAWER_SNAP_POINT
    )
  }

  const mapStatusLabel =
    mapStatus === "ready"
      ? "نقشه آماده است"
      : mapStatus === "error"
        ? "نقشه در دسترس نیست"
        : "در حال بارگذاری نقشه"

  return (
    <main className="relative h-dvh min-h-[540px] w-full overflow-hidden bg-background text-foreground">
      <div
        ref={mapContainerRef}
        className="torob-map absolute inset-0"
        data-drawer-snap={isCompactDrawer ? "peek" : "default"}
        aria-label="نقشه فروشگاه‌های تهران"
      />

      <div
        aria-label="منابع نقشه"
        dir="ltr"
        data-drawer-snap={isCompactDrawer ? "peek" : "default"}
        className="torob-map-attribution absolute left-3 z-10 flex items-center gap-1.5 rounded-2xl border border-border/70 bg-card/95 px-3 py-2 text-xs leading-4 text-muted-foreground shadow-lg shadow-black/10 backdrop-blur-xl"
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

      <TorobCheckCharacter className="absolute top-28 left-[18%] z-10 md:top-[18%] md:left-[25%]" />

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
        defaultOpen
        snapPoints={DRAWER_SNAP_POINTS}
        snapPoint={drawerSnapPoint}
        onSnapPointChange={setDrawerSnapPoint}
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
            className="torob-map-drawer max-h-none rounded-t-3xl border-border/70 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur-xl"
            initialFocus={false}
          >
            <DrawerHeader className="gap-0 px-4 pt-1 pb-3 text-right sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Store aria-hidden="true" />
                  </span>
                  <div className="min-w-0 text-right">
                    <DrawerTitle className="truncate text-base font-bold">
                      فروشگاه‌های این محدوده
                    </DrawerTitle>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      تربِ حضوری · {shopCountLabel}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
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
              <DrawerDescription className="mt-2 text-right text-xs">
                {isCompactDrawer
                  ? "برای جستجو و دیدن فروشگاه‌ها، به بالا بکشید"
                  : "برای تغییر اندازه، دسته را به بالا یا پایین بکشید"}
              </DrawerDescription>
            </DrawerHeader>

            <div className="flex min-h-0 flex-1 flex-col">
              <form
                role="search"
                onSubmit={handleSearch}
                className="shrink-0 px-4 pt-1 pb-3 sm:px-6"
              >
                <FieldGroup className="gap-0">
                  <Field>
                    <FieldLabel htmlFor="shop-search" className="sr-only">
                      جستجوی فروشگاه یا محله
                    </FieldLabel>
                    <div className="flex items-center gap-2">
                      <Input
                        id="shop-search"
                        type="text"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="نام فروشگاه، کالا یا محله"
                        autoComplete="off"
                        inputMode="search"
                        className="h-11 min-w-0 rounded-xl bg-background text-sm"
                      />
                      {query && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label="پاک کردن جستجو"
                          onClick={clearSearch}
                          className="shrink-0 rounded-xl"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        type="submit"
                        size="icon-lg"
                        aria-label="جستجوی فروشگاه‌ها"
                        disabled={isSearching}
                        className="shrink-0 rounded-xl"
                      >
                        <Search aria-hidden="true" />
                      </Button>
                    </div>
                  </Field>
                </FieldGroup>
              </form>

              <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 sm:px-6">
                <Badge variant="outline" className="gap-1.5 font-normal">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      mapStatus === "ready"
                        ? "bg-primary"
                        : mapStatus === "error"
                          ? "bg-destructive"
                          : "animate-pulse bg-muted-foreground"
                    )}
                  />
                  {mapStatusLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {shopsStatus === "loading" && shops.length === 0
                    ? "در حال بارگذاری فروشگاه‌ها…"
                    : shopCountLabel}
                </span>
              </div>

              {(searchError || locationError || mapStatus === "error") && (
                <div className="flex shrink-0 flex-col gap-2 px-4 pb-2 sm:px-6">
                  {searchError && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                    >
                      {searchError}
                    </p>
                  )}
                  {locationError && (
                    <p
                      role="status"
                      className="rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                    >
                      {locationError}
                    </p>
                  )}
                  {mapStatus === "error" && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                    >
                      بارگذاری نقشه انجام نشد. اتصال اینترنت یا دسترسی به سرویس
                      نقشه را بررسی کنید.
                    </p>
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 sm:px-4">
                {shopsStatus === "error" ? (
                  <div className="rounded-2xl bg-muted/70 px-4 py-5 text-center text-sm leading-6 text-muted-foreground">
                    اطلاعات فروشگاه‌ها بارگذاری نشد. مطمئن شوید دیتابیس آماده و
                    داده‌ها وارد شده‌اند.
                  </div>
                ) : shops.length === 0 && shopsStatus === "ready" ? (
                  <div className="rounded-2xl bg-muted/70 px-4 py-5 text-center text-sm leading-6 text-muted-foreground">
                    {activeSearchRef.current
                      ? "فروشگاهی با این نام یا محدوده پیدا نشد."
                      : "در این محدوده فروشگاهی با موقعیت ثبت‌شده پیدا نشد."}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {nearestShops.slice(0, 80).map((shop) => {
                      const isSelected = shop.shopId === selectedShopId
                      const price = formatPrice(shop.lowestPrice)

                      return (
                        <button
                          key={shop.shopId}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => selectShop(shop)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-2xl p-3 text-right transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            isSelected && "bg-primary/10"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            <Store aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {shop.name || "فروشگاه بدون نام"}
                            </span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {shop.locationLabel || shop.address || "تهران"}
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                              {shop.categoryNames?.[0] && (
                                <span className="truncate">
                                  {shop.categoryNames[0]}
                                </span>
                              )}
                              {shop.offerCount > 0 && (
                                <span>
                                  {persianNumber.format(shop.offerCount)} کالا
                                </span>
                              )}
                              {price && (
                                <span className="font-medium text-foreground">
                                  از {price}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedShop && (
                <div className="shrink-0 border-t border-border/70 bg-muted/30 px-4 py-3 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {selectedShop.locationLabel || "فروشگاه انتخاب‌شده"}
                      </p>
                      <h3 className="mt-1 truncate text-sm font-bold">
                        {selectedShop.name || "فروشگاه بدون نام"}
                      </h3>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="بستن جزئیات فروشگاه"
                      onClick={() => setSelectedShopId(null)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                  {selectedShop.address && (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {selectedShop.address}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      {persianNumber.format(selectedShop.offerCount)} پیشنهاد
                      کالا
                    </span>
                    {formatPrice(selectedShop.lowestPrice) && (
                      <span className="font-semibold text-primary">
                        از {formatPrice(selectedShop.lowestPrice)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </DrawerContent>
        </DrawerVirtualKeyboardProvider>
      </Drawer>
    </main>
  )
}
