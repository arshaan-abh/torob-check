"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import {
  ArrowLeft,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Search,
  Store,
  X,
} from "lucide-react"

import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { TorobCheckCharacter } from "@/app/components/torob-check-character"

const NESHAN_LIGHT_STYLE =
  "https://static.neshan.org/sdk/maplibre/styles/light.json"
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
        const [{ getNeshanApiKey }, sdkModule] = await Promise.all([
          import("@/lib/neshan-config"),
          import("@neshan-maps-platform/maplibre-sdk"),
        ])
        const apiKey = await getNeshanApiKey()

        if (disposed || !mapContainerRef.current) return

        activeMap = new sdkModule.default.Map({
          container: mapContainerRef.current,
          style: NESHAN_LIGHT_STYLE,
          center: TEHRAN_CENTER,
          zoom: 12.2,
          minZoom: 4,
          maxZoom: 19,
          apiKey,
          dragRotate: false,
          pitchWithRotate: false,
        }) as unknown as MapLibreMap
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
                "text-font": ["Vazir FD Regular"],
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
        padding:
          window.innerWidth < 1024
            ? { top: 170, bottom: 300, left: 32, right: 32 }
            : { top: 110, bottom: 90, left: 80, right: 380 },
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
        map.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 15,
          duration: 800,
        })
      },
      () => setLocationError("دسترسی به موقعیت مکانی داده نشد."),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
    )
  }

  const shopCountLabel = useMemo(
    () => formatShopCount(totalShops, shopsTruncated),
    [shopsTruncated, totalShops]
  )

  return (
    <main className="relative h-dvh min-h-[540px] w-full overflow-hidden bg-background text-foreground">
      <div
        ref={mapContainerRef}
        className="absolute inset-0"
        aria-label="نقشه فروشگاه‌های تهران"
      />

      <TorobCheckCharacter className="absolute top-36 left-[18%] z-10 md:top-auto md:bottom-[14%] md:left-[25%]" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-3 p-3 md:p-4">
        <div className="pointer-events-auto flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/95 p-2.5 shadow-lg shadow-black/5 backdrop-blur-xl md:px-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <MapPin aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold md:text-base">
                تربِ حضوری
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                خرید خوب، همین نزدیکی
              </span>
            </span>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-lg shadow-black/5 backdrop-blur-xl md:flex">
            <span
              className={`size-2 rounded-full ${mapStatus === "ready" ? "bg-emerald-500" : mapStatus === "error" ? "bg-destructive" : "bg-amber-500"}`}
            />
            تهران · نقشه خرید حضوری
          </div>

          <div className="w-10 md:hidden" aria-hidden="true" />
        </div>

        <form
          role="search"
          onSubmit={handleSearch}
          className="pointer-events-auto w-full max-w-xl rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl md:absolute md:top-4 md:left-1/2 md:w-[min(46vw,540px)] md:-translate-x-1/2 md:p-2"
        >
          <FieldGroup className="gap-0">
            <Field className="relative">
              <FieldLabel htmlFor="shop-search" className="sr-only">
                جستجوی فروشگاه یا محله
              </FieldLabel>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3 z-10 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="shop-search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="جستجوی فروشگاه یا محله"
                autoComplete="off"
                inputMode="search"
                className={cn(
                  "h-11 border-0 bg-transparent ps-24 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 md:h-12",
                  query ? "pe-24" : "pe-11"
                )}
              />
              <div className="absolute top-1/2 left-1 flex -translate-y-1/2 items-center gap-1">
                {query && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="پاک کردن جستجو"
                    onClick={clearSearch}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
                <Button
                  type="submit"
                  size="icon-lg"
                  aria-label="جستجو"
                  disabled={isSearching}
                >
                  <Search aria-hidden="true" />
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>
      </header>

      <div className="absolute top-1/2 left-3 z-10 flex -translate-y-1/2 flex-col gap-2 md:left-5">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-lg shadow-black/10 backdrop-blur-xl">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="بزرگ‌نمایی نقشه"
            onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
          >
            <Plus aria-hidden="true" />
          </Button>
          <div className="mx-2 h-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="کوچک‌نمایی نقشه"
            onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
          >
            <Minus aria-hidden="true" />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="رفتن به موقعیت من"
          onClick={requestUserLocation}
          className="rounded-2xl bg-card/95 shadow-lg shadow-black/10 backdrop-blur-xl"
        >
          <LocateFixed aria-hidden="true" />
        </Button>
      </div>

      {locationError && (
        <div
          role="status"
          className="absolute top-[calc(50%+5.5rem)] left-3 z-10 max-w-56 rounded-xl border border-border/70 bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur-xl md:left-5"
        >
          {locationError}
        </div>
      )}

      {mapStatus === "error" && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-5">
          <div
            role="alert"
            className="pointer-events-auto max-w-sm rounded-3xl border border-border bg-card/95 p-6 text-center shadow-2xl shadow-black/15 backdrop-blur-xl"
          >
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <MapPin aria-hidden="true" />
            </span>
            <h1 className="text-base font-bold">نقشه در دسترس نیست</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              مقدار NESHAN_API_KEY را در محیط اجرا تنظیم کنید و دامنه برنامه را
              در پنل نشان مجاز کنید.
            </p>
          </div>
        </div>
      )}

      <aside className="absolute inset-x-3 bottom-14 z-10 flex max-h-[37dvh] flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-2xl shadow-black/15 backdrop-blur-xl md:inset-x-auto md:top-28 md:right-5 md:bottom-20 md:max-h-none md:w-[350px]">
        <div className="border-b border-border/70 p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                جستجو در نقشه
              </p>
              <h2 className="mt-1 text-lg font-bold">فروشگاه‌های این محدوده</h2>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Store aria-hidden="true" />
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {shopsStatus === "loading" && shops.length === 0
                ? "در حال بارگذاری فروشگاه‌ها…"
                : shopCountLabel}
            </span>
            {activeSearchRef.current && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSearch}
              >
                پاک کردن جستجو
                <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              </Button>
            )}
          </div>
          {searchError && (
            <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
              {searchError}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 md:p-3">
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
                    className={`flex w-full items-start gap-3 rounded-2xl p-3 text-right transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${isSelected ? "bg-primary/10" : ""}`}
                  >
                    <span
                      className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
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
          <div className="border-t border-border/70 bg-muted/30 p-4">
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
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {persianNumber.format(selectedShop.offerCount)} پیشنهاد کالا
              </span>
              {formatPrice(selectedShop.lowestPrice) && (
                <span className="font-semibold text-primary">
                  از {formatPrice(selectedShop.lowestPrice)}
                </span>
              )}
            </div>
          </div>
        )}
      </aside>
    </main>
  )
}
