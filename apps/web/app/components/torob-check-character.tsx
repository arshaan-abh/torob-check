"use client"

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react"
import RiveCanvas, {
  type Artboard,
  type File as RiveFile,
  type LinearAnimationInstance,
  type RiveCanvas as RiveRuntime,
  type WrappedRenderer,
} from "@rive-app/canvas-advanced"
import { CircleAlert, LoaderCircle } from "lucide-react"

import {
  type TorobCheckState,
  useTorobCheck,
} from "@/app/components/torob-check-provider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

const CHARACTER_SRC = "/radish.riv"
const RIVE_WASM_BASE_URL = "https://unpkg.com/@rive-app/canvas-advanced@2.45.0/"
const RIVE_WASM_URL = new URL("rive.wasm", RIVE_WASM_BASE_URL).toString()
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

let riveWasmPromise: Promise<ArrayBuffer> | undefined

const loadRiveWasm = () => {
  if (!riveWasmPromise) {
    riveWasmPromise = fetch(RIVE_WASM_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Rive WASM request failed with ${response.status}`)
        }

        return response.arrayBuffer()
      })
      .catch((error: unknown) => {
        riveWasmPromise = undefined
        throw error
      })
  }

  return riveWasmPromise
}

const ANIMATION = {
  idle: "Timeline 1",
  walking: "Walking",
  blinking: "Blink",
  talking: "Talk",
} as const

const subscribeToReducedMotion = (onChange: () => void) => {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
  mediaQuery.addEventListener("change", onChange)

  return () => mediaQuery.removeEventListener("change", onChange)
}

const getReducedMotionSnapshot = () =>
  window.matchMedia(REDUCED_MOTION_QUERY).matches

const getReducedMotionServerSnapshot = () => false

type PlaybackController = {
  update: (state: TorobCheckState, prefersReducedMotion: boolean) => void
}

type RiveResources = {
  runtime: RiveRuntime
  file: RiveFile
  artboard: Artboard
  renderer: WrappedRenderer
  animations: Map<string, LinearAnimationInstance>
  resizeObserver: ResizeObserver
  frameId: number
  lastTimestamp: number | null
  activeAnimations: string[]
  canvas: HTMLCanvasElement
  disposed: boolean
}

const renderFrame = (resources: RiveResources, timestamp: number) => {
  if (resources.disposed) return

  resources.frameId = 0
  const delta =
    resources.lastTimestamp === null
      ? 0
      : Math.min((timestamp - resources.lastTimestamp) / 1000, 0.1)
  resources.lastTimestamp = timestamp

  resources.renderer.beginFrame()

  for (const name of resources.activeAnimations) {
    const animation = resources.animations.get(name)
    if (!animation) continue

    animation.advance(delta)
    animation.apply(1)
  }

  resources.artboard.advance(delta)
  resources.renderer.save()
  resources.renderer.align(
    resources.runtime.Fit.contain,
    resources.runtime.Alignment.center,
    {
      minX: 0,
      minY: 0,
      maxX: resources.canvas.width,
      maxY: resources.canvas.height,
    },
    resources.artboard.bounds
  )
  resources.artboard.draw(resources.renderer)
  resources.renderer.restore()

  if (resources.activeAnimations.length > 0) {
    resources.frameId = resources.runtime.requestAnimationFrame(
      (nextTimestamp) => renderFrame(resources, nextTimestamp)
    )
  }
}

const scheduleFrame = (resources: RiveResources) => {
  if (resources.disposed || resources.frameId !== 0) return

  resources.frameId = resources.runtime.requestAnimationFrame((timestamp) =>
    renderFrame(resources, timestamp)
  )
}

const resizeCanvas = (resources: RiveResources) => {
  const bounds = resources.canvas.getBoundingClientRect()
  const pixelRatio = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(bounds.width * pixelRatio))
  const height = Math.max(1, Math.round(bounds.height * pixelRatio))

  if (resources.canvas.width === width && resources.canvas.height === height) {
    return
  }

  resources.canvas.width = width
  resources.canvas.height = height
  resources.artboard.devicePixelRatioUsed = pixelRatio
  scheduleFrame(resources)
}

const updatePlayback = (
  resources: RiveResources,
  state: TorobCheckState,
  prefersReducedMotion: boolean
) => {
  for (const animation of resources.animations.values()) {
    animation.time = 0
  }

  resources.lastTimestamp = null
  resources.activeAnimations = prefersReducedMotion
    ? []
    : [
        state.movement === "walking" ? ANIMATION.walking : ANIMATION.idle,
        ANIMATION.blinking,
        ...(state.speech === "talking" ? [ANIMATION.talking] : []),
      ]

  if (prefersReducedMotion) {
    // Render Torob Check's idle pose once while honoring the OS motion setting.
    const idleAnimation = resources.animations.get(ANIMATION.idle)
    idleAnimation?.advance(0)
    idleAnimation?.apply(1)
    resources.artboard.advance(0)
  }

  scheduleFrame(resources)
}

const safelyDispose = (dispose: () => void) => {
  try {
    dispose()
  } catch {
    // Continue releasing the remaining WASM resources during teardown.
  }
}

const disposeResources = (resources: RiveResources) => {
  if (resources.disposed) return

  resources.disposed = true
  resources.resizeObserver.disconnect()

  if (resources.frameId !== 0) {
    resources.runtime.cancelAnimationFrame(resources.frameId)
    resources.frameId = 0
  }

  for (const animation of resources.animations.values()) {
    safelyDispose(() => animation.delete())
  }

  safelyDispose(() => resources.artboard.delete())
  safelyDispose(() => resources.renderer.delete())
  safelyDispose(() => resources.file.unref())
  safelyDispose(() => resources.runtime.cleanup())
}

export type TorobCheckCharacterProps = {
  /** CSS positioning for placing the character over the map. */
  className?: string
  /** CSS positioning or transforms for map-projected movement. */
  style?: CSSProperties
  /** Width and height, in pixels, of the Rive canvas. */
  size?: number
  label?: string
}

export function TorobCheckCharacter({
  className,
  style,
  size = 76,
  label = "تربچِک، دستیار خرید حضوری",
}: TorobCheckCharacterProps) {
  const { state } = useTorobCheck()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playbackControllerRef = useRef<PlaybackController | null>(null)
  const playbackStateRef = useRef(state)
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )
  const reducedMotionRef = useRef(prefersReducedMotion)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  )

  playbackStateRef.current = state
  reducedMotionRef.current = prefersReducedMotion

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    let resources: RiveResources | null = null
    let runtime: RiveRuntime | null = null
    let file: RiveFile | null = null
    let artboard: Artboard | null = null
    let renderer: WrappedRenderer | null = null
    const animations = new Map<string, LinearAnimationInstance>()

    const cleanupPartialResources = () => {
      for (const animation of animations.values()) {
        safelyDispose(() => animation.delete())
      }
      animations.clear()
      if (artboard) {
        const current = artboard
        artboard = null
        safelyDispose(() => current.delete())
      }
      if (renderer) {
        const current = renderer
        renderer = null
        safelyDispose(() => current.delete())
      }
      if (file) {
        const current = file
        file = null
        safelyDispose(() => current.unref())
      }
      if (runtime) {
        const current = runtime
        runtime = null
        safelyDispose(() => current.cleanup())
      }
    }

    void (async () => {
      try {
        const wasmBinary = await loadRiveWasm()
        if (cancelled) return

        runtime = await RiveCanvas({
          locateFile: () => RIVE_WASM_URL,
          wasmBinary,
        })
        if (cancelled) {
          cleanupPartialResources()
          return
        }

        const response = await fetch(CHARACTER_SRC)
        if (!response.ok) {
          throw new Error(`Rive asset request failed with ${response.status}`)
        }

        const riveBuffer = await response.arrayBuffer()
        if (cancelled) {
          cleanupPartialResources()
          return
        }

        file = await runtime.load(new Uint8Array(riveBuffer))
        artboard = file.defaultArtboard()
        renderer = runtime.makeRenderer(canvas)

        for (const name of Object.values(ANIMATION)) {
          const animation = artboard.animationByName(name)
          animations.set(
            name,
            new runtime.LinearAnimationInstance(animation, artboard)
          )
        }

        const resizeObserver = new ResizeObserver(() => {
          if (resources) resizeCanvas(resources)
        })
        resources = {
          runtime,
          file,
          artboard,
          renderer,
          animations,
          resizeObserver,
          frameId: 0,
          lastTimestamp: null,
          activeAnimations: [],
          canvas,
          disposed: false,
        }

        if (cancelled) {
          disposeResources(resources)
          return
        }

        playbackControllerRef.current = {
          update: (nextState, reduceMotion) =>
            updatePlayback(resources!, nextState, reduceMotion),
        }
        resizeObserver.observe(canvas)
        resizeCanvas(resources)
        updatePlayback(
          resources,
          playbackStateRef.current,
          reducedMotionRef.current
        )
        setLoadState("ready")
      } catch {
        if (resources) disposeResources(resources)
        else cleanupPartialResources()
        if (!cancelled) setLoadState("error")
      }
    })()

    return () => {
      cancelled = true
      playbackControllerRef.current = null
      if (resources) disposeResources(resources)
      else cleanupPartialResources()
    }
  }, [])

  useEffect(() => {
    playbackControllerRef.current?.update(state, prefersReducedMotion)
  }, [prefersReducedMotion, state])

  return (
    <figure
      aria-busy={loadState === "loading"}
      className={`pointer-events-none flex flex-col items-center gap-0.5 ${className ?? ""}`}
      style={style}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <canvas
          ref={canvasRef}
          aria-label={label}
          aria-hidden={loadState !== "ready"}
          role="img"
          className={`block size-full transition-opacity duration-200 ${loadState === "ready" ? "opacity-100" : "opacity-0"}`}
        />
        {loadState === "loading" && (
          <div
            role="status"
            aria-live="polite"
            aria-label="تربچِک در حال بارگذاری است"
            className="absolute inset-0 grid place-items-center rounded-full border border-chart-2/30 bg-card/95 shadow-lg shadow-black/10 backdrop-blur-xl"
          >
            <LoaderCircle
              aria-hidden="true"
              className="size-7 text-chart-2 motion-safe:animate-spin"
            />
          </div>
        )}
        {loadState === "error" && (
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label="تربچِک بارگذاری نشد"
              className="pointer-events-auto absolute inset-0 grid place-items-center rounded-full border border-destructive/30 bg-card/95 shadow-lg shadow-black/10 backdrop-blur-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <CircleAlert
                aria-hidden="true"
                className="size-7 text-destructive"
              />
            </TooltipTrigger>
            <TooltipContent dir="rtl" className="max-w-56 text-center">
              تربچِک بارگذاری نشد. اتصال اینترنت یا فایل انیمیشن در دسترس نیست.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <figcaption dir="ltr" className="invisible">
        <a href="https://openrive.upstand.dev" target="_blank" rel="noreferrer">
          Made with OpenRive
        </a>
      </figcaption>
    </figure>
  )
}
