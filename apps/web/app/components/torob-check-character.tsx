"use client"

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react"
import { Alignment, Fit, Layout, useRive } from "@rive-app/react-canvas"

import { useTorobCheck } from "@/app/components/torob-check-provider"

const IDLE_ANIMATION = "Timeline 1"
const WALKING_ANIMATION = "Walking"
const BLINK_ANIMATION = "Blink"
const TALK_ANIMATION = "Talk"
const CHARACTER_SRC = "/radish.riv"
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"
const CHARACTER_LAYOUT = new Layout({
  fit: Fit.Contain,
  alignment: Alignment.Center,
})

const subscribeToReducedMotion = (onChange: () => void) => {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
  mediaQuery.addEventListener("change", onChange)

  return () => mediaQuery.removeEventListener("change", onChange)
}

const getReducedMotionSnapshot = () =>
  window.matchMedia(REDUCED_MOTION_QUERY).matches

const getReducedMotionServerSnapshot = () => false

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
  size = 112,
  label = "تربچِک، دستیار خرید حضوری",
}: TorobCheckCharacterProps) {
  const { state } = useTorobCheck()
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  )
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )

  const handleLoad = useCallback(() => setLoadState("ready"), [])
  const handleLoadError = useCallback(() => setLoadState("error"), [])

  const { rive, RiveComponent, setContainerRef } = useRive(
    {
      src: CHARACTER_SRC,
      autoplay: false,
      layout: CHARACTER_LAYOUT,
      onLoad: handleLoad,
      onLoadError: handleLoadError,
    },
    { shouldResizeCanvasToContainer: true }
  )

  useEffect(() => {
    if (!rive || loadState !== "ready") return

    // The current .riv stores these as separate linear animation timelines.
    // Stop and rebuild the active set so movement and speech can combine.
    rive.stop()

    if (prefersReducedMotion) return

    rive.play(state.movement === "walking" ? WALKING_ANIMATION : IDLE_ANIMATION)
    rive.play(BLINK_ANIMATION)

    if (state.speech === "talking") {
      rive.play(TALK_ANIMATION)
    }
  }, [loadState, prefersReducedMotion, rive, state.movement, state.speech])

  return (
    <figure
      className={`pointer-events-none flex flex-col items-center gap-0.5 ${className ?? ""}`}
      style={style}
    >
      <div
        ref={setContainerRef}
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <RiveComponent
          aria-label={label}
          role="img"
          className="block size-full"
        />
        {loadState === "loading" && (
          <span
            role="status"
            className="absolute inset-x-1 bottom-1 rounded-full bg-background/90 px-2 py-1 text-center text-[10px] text-muted-foreground shadow-sm"
          >
            تربچِک آماده می‌شود…
          </span>
        )}
        {loadState === "error" && (
          <span
            role="status"
            className="absolute inset-x-1 bottom-1 rounded-full bg-background/95 px-2 py-1 text-center text-[10px] text-destructive shadow-sm"
          >
            تربچِک بارگذاری نشد
          </span>
        )}
      </div>
      <figcaption className="text-[10px] leading-4 text-muted-foreground">
        <a
          className="pointer-events-auto underline decoration-muted-foreground/50 underline-offset-2 hover:text-foreground"
          href="https://openrive.upstand.dev"
          target="_blank"
          rel="noreferrer"
        >
          Made with OpenRive
        </a>
      </figcaption>
    </figure>
  )
}
