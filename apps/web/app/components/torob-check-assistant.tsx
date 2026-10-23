"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  AlertCircle,
  ArrowUp,
  Bot,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Search,
  Square,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@workspace/ui/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@workspace/ui/components/message-scroller"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@workspace/ui/components/trace"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { TorobCheckCharacter } from "@/app/components/torob-check-character"
import { useTorobCheck } from "@/app/components/torob-check-provider"
import type {
  ShoppingAssistantMapContext,
  ShoppingAssistantOfferSelection,
} from "@/components/shopping-assistant-panel"

type AssistantLocation = {
  latitude: number
  longitude: number
} | null

type AssistantOffer = {
  offerId: string
  shopId: string
  productTitle: string | null
  sellerTitle: string | null
  brandName: string | null
  model: string | null
  categoryName: string | null
  priceToman: string | null
  budgetFit: "within" | "outside" | "unknown" | null
  priceFreshness: "fresh" | "stale" | "unknown"
  priceConfirmation: string
  stockStatus: "in_stock" | "out_of_stock" | "unknown"
  stockFreshness: "fresh" | "stale" | "unknown"
  stockConfirmation: string
  evidenceUrl: string | null
  shopName: string | null
  address: string | null
  locationLabel: string | null
  lat: number | null
  lon: number | null
  distanceKm: number | null
}

type AssistantTools = {
  searchProducts: {
    input: {
      query: string
      category?: string
      brand?: string
      attributes?: string[]
      minPriceToman?: number
      maxPriceToman?: number
      inStockOnly?: boolean
    }
    output: { offers: AssistantOffer[] }
  }
  getShopDetails: {
    input: { shopId: string }
    output: {
      shop: {
        name: string | null
        address: string | null
        weeklyHours: unknown
        hoursFreshness: string
        hoursObservedAt: string | null
        sources: Array<{ url: string; sourceType: string }>
      } | null
    }
  }
  researchShop: {
    input: { shopId: string; question: string }
    output: {
      status?: string
      findings?: Array<{
        title: string
        url: string
        excerpt: string
        observedAt: string
      }>
    }
  }
  prepareContact: {
    input: { shopId: string; question: string }
    output: {
      draft?: string
      userMustSend?: boolean
      links?: Array<{ label: string; href: string }>
    }
  }
}

type AssistantMessage = UIMessage<never, never, AssistantTools>

type TorobCheckAssistantProps = {
  location: AssistantLocation
  mapContext: ShoppingAssistantMapContext
  onOpenChange: (open: boolean) => void
  onSelectOffer: (offer: ShoppingAssistantOfferSelection) => void
}

const assistantTransport = new DefaultChatTransport({
  api: "/api/assistant",
  prepareSendMessagesRequest: ({ messages, body }) => ({
    body: {
      ...body,
      messages: messages.slice(-16).map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts.filter((part) => part.type === "text"),
      })),
    },
  }),
})

const welcomeMessage: AssistantMessage = {
  id: "torobcheck-welcome",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "سلام! من ترب‌چک هستم. بگو دنبال چه محصولی می‌گردی تا فروشگاه‌های حضوری و قیمت‌هاشون رو با هم پیدا و مقایسه کنیم.",
    },
  ],
}

const quickPrompts = [
  "یک فشارسنج مناسب پیدا کن",
  "فروشگاه‌های نزدیکم را مقایسه کن",
]

function getMessageText(message: AssistantMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
}

const HISTORY_STORAGE_KEY = "torob-check:shopping-assistant:v1"
const MAX_HISTORY_MESSAGES = 80
const MAX_HISTORY_STORAGE_CHARS = 500_000
const numberFormat = new Intl.NumberFormat("fa-IR")

type AssistantToolPart = {
  type: string
  state?: string
  toolCallId?: string
  output?: unknown
}

function isStoredMessage(value: unknown): value is AssistantMessage {
  if (!value || typeof value !== "object") return false
  const message = value as { id?: unknown; role?: unknown; parts?: unknown }
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    Array.isArray(message.parts) &&
    message.parts.every(
      (part) =>
        part !== null &&
        typeof part === "object" &&
        typeof (part as { type?: unknown }).type === "string"
    )
  )
}

function readLocalHistory() {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "null"
    )
    if (!value || typeof value !== "object") return { messages: [], draft: "" }
    const record = value as {
      version?: unknown
      messages?: unknown
      draft?: unknown
    }
    if (record.version !== 1) return { messages: [], draft: "" }
    return {
      messages: Array.isArray(record.messages)
        ? record.messages.filter(isStoredMessage).slice(-MAX_HISTORY_MESSAGES)
        : [],
      draft:
        typeof record.draft === "string" ? record.draft.slice(0, 1000) : "",
    }
  } catch {
    return { messages: [], draft: "" }
  }
}

function saveLocalHistory(messages: AssistantMessage[], draft: string) {
  try {
    let savedMessages = messages
      .filter((message) => message.id !== welcomeMessage.id)
      .slice(-MAX_HISTORY_MESSAGES)
    let serialized = JSON.stringify({
      version: 1,
      messages: savedMessages,
      draft: draft.slice(0, 1000),
    })
    while (
      serialized.length > MAX_HISTORY_STORAGE_CHARS &&
      savedMessages.length > 2
    ) {
      savedMessages = savedMessages.slice(2)
      serialized = JSON.stringify({
        version: 1,
        messages: savedMessages,
        draft: draft.slice(0, 1000),
      })
    }
    window.localStorage.setItem(HISTORY_STORAGE_KEY, serialized)
  } catch {
    // Storage can be unavailable in private browsing or after its quota is full.
  }
}

function getToolPart(part: AssistantMessage["parts"][number]) {
  return part.type.startsWith("tool-")
    ? (part as unknown as AssistantToolPart)
    : null
}

function offerPriceLabel(offer: AssistantOffer) {
  if (!offer.priceToman) {
    return offer.priceFreshness === "stale"
      ? "آخرین قیمت ثبت‌شده قدیمی است؛ قیمت امروز تأیید نشده"
      : "قیمت تازه و تأییدشده در دسترس نیست"
  }
  const amount = Number(offer.priceToman)
  if (!Number.isFinite(amount)) return "قیمت ثبت نشده"
  const freshness =
    offer.priceFreshness === "fresh" &&
    offer.priceConfirmation === "merchant_confirmed"
      ? "تأییدشده توسط فروشگاه"
      : offer.priceFreshness === "stale"
        ? "قیمت نیازمند بررسی دوباره"
        : "قیمت تأییدنشده"
  return `${numberFormat.format(amount)} تومان · ${freshness}`
}

function AssistantToolResult({
  part,
  onSelectOffer,
}: {
  part: AssistantToolPart
  onSelectOffer: (offer: ShoppingAssistantOfferSelection) => void
}) {
  if (
    part.state !== "output-available" ||
    !part.output ||
    typeof part.output !== "object"
  ) {
    return null
  }

  const output = part.output as Record<string, unknown>
  if (part.type === "tool-searchProducts") {
    const offers = Array.isArray(output.offers)
      ? (output.offers as AssistantOffer[])
      : []
    return (
      <div className="mt-2 grid gap-2">
        {offers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            در این محدوده نتیجه‌ای پیدا نشد.
          </p>
        ) : (
          offers.map((offer) => (
            <article
              key={offer.offerId}
              className="rounded-xl border border-border/70 bg-background p-3"
            >
              <h3 className="font-semibold">
                {offer.productTitle ?? offer.sellerTitle ?? "کالا"}
              </h3>
              <p className="mt-1 text-sm">{offerPriceLabel(offer)}</p>
              {offer.budgetFit === "unknown" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  قیمت تازه نداریم و نمی‌توانیم قرارگرفتن در بودجه را تأیید
                  کنیم.
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {offer.shopName ?? "فروشگاه"}
                {offer.address ? ` · ${offer.address}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {offer.stockFreshness === "fresh" &&
                offer.stockConfirmation === "merchant_confirmed" &&
                offer.stockStatus === "in_stock"
                  ? "موجودی تازه تأیید شده"
                  : offer.stockFreshness === "fresh" &&
                      offer.stockConfirmation === "merchant_confirmed" &&
                      offer.stockStatus === "out_of_stock"
                    ? "ناموجودی تازه تأیید شده"
                    : offer.stockFreshness === "stale"
                      ? "آخرین وضعیت موجودی قدیمی است"
                      : "موجودی تازه تأیید نشده"}
                {offer.distanceKm !== null
                  ? ` · ${numberFormat.format(Math.round(offer.distanceKm * 10) / 10)} کیلومتر`
                  : ""}
              </p>
              {offer.evidenceUrl && (
                <a
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4"
                  href={offer.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  منبع قیمت
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              )}
              {offer.lat !== null && offer.lon !== null && (
                <button
                  type="button"
                  className="mt-2 block text-xs font-medium text-primary underline underline-offset-4"
                  onClick={() =>
                    onSelectOffer({
                      shopId: offer.shopId,
                      shopName: offer.shopName,
                      address: offer.address,
                      locationLabel: offer.locationLabel,
                      categoryName: offer.categoryName,
                      lat: offer.lat,
                      lon: offer.lon,
                      priceToman: offer.priceToman,
                    })
                  }
                >
                  نمایش فروشگاه روی نقشه
                </button>
              )}
            </article>
          ))
        )}
      </div>
    )
  }

  if (part.type === "tool-getShopDetails") {
    const shop = output.shop as {
      name?: string | null
      address?: string | null
      weeklyHours?: unknown
      hoursFreshness?: string
      hoursObservedAt?: string | null
      sources?: Array<{ url: string; sourceType: string }>
    } | null
    if (!shop) return null
    return (
      <article className="mt-2 rounded-xl border border-border/70 bg-background p-3 text-sm">
        <h3 className="font-semibold">{shop.name ?? "فروشگاه"}</h3>
        {shop.address && (
          <p className="mt-1 text-xs text-muted-foreground">{shop.address}</p>
        )}
        <p className="mt-2 text-xs">
          ساعت کاری:{" "}
          {shop.hoursFreshness === "fresh" && shop.weeklyHours
            ? "تأیید فروشگاه در هفت روز اخیر"
            : "اطلاعات تازه در دسترس نیست"}
        </p>
        {shop.hoursObservedAt && (
          <time
            className="mt-1 block text-xs text-muted-foreground"
            dateTime={shop.hoursObservedAt}
          >
            آخرین تأیید:{" "}
            {new Intl.DateTimeFormat("fa-IR", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(shop.hoursObservedAt))}
          </time>
        )}
        {shop.sources?.map((source) => (
          <a
            key={source.url}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4"
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            منبع {source.sourceType === "instagram" ? "اینستاگرام" : "فروشگاه"}
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        ))}
      </article>
    )
  }

  if (part.type === "tool-researchShop") {
    const findings = Array.isArray(output.findings)
      ? (output.findings as Array<{
          title: string
          url: string
          excerpt: string
          observedAt: string
        }>)
      : []
    const queued = output.status === "research_queued"
    if (!findings.length && !queued) return null
    return (
      <div className="mt-2 grid gap-2">
        {queued && (
          <p role="status" className="text-xs text-muted-foreground">
            پژوهش منبع فروشگاه در پس‌زمینه آغاز شد؛ پاسخ فعلی منتظر آن نمی‌ماند.
          </p>
        )}
        {findings.length > 0 && (
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            یافته عمومی · تأییدنشده
          </p>
        )}
        {findings.map((finding) => (
          <a
            key={finding.url}
            className="rounded-xl border border-border/70 bg-background p-3"
            href={finding.url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
              {finding.title}
              <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {finding.excerpt.slice(0, 220)}
            </span>
            <time
              className="mt-2 block text-[11px] text-muted-foreground"
              dateTime={finding.observedAt}
            >
              مشاهده‌شده:{" "}
              {new Intl.DateTimeFormat("fa-IR", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(finding.observedAt))}
            </time>
          </a>
        ))}
      </div>
    )
  }

  if (part.type === "tool-prepareContact") {
    const draft = typeof output.draft === "string" ? output.draft : ""
    const links = Array.isArray(output.links)
      ? (output.links as Array<{ label: string; href: string }>)
      : []
    if (!draft && links.length === 0) return null
    return (
      <article className="mt-2 rounded-xl border border-border/70 bg-background p-3 text-xs">
        <p className="whitespace-pre-wrap">{draft}</p>
        <p className="mt-2 text-muted-foreground">
          پیام ارسال نمی‌شود؛ خودت لینک تماس را انتخاب کن.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.href}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground"
              href={link.href}
              target={link.href.startsWith("https:") ? "_blank" : undefined}
              rel={link.href.startsWith("https:") ? "noreferrer" : undefined}
            >
              {link.label}
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          ))}
        </div>
      </article>
    )
  }

  return null
}

export function TorobCheckAssistant({
  location,
  mapContext,
  onOpenChange,
  onSelectOffer,
}: TorobCheckAssistantProps) {
  const { setMovement, setSpeech } = useTorobCheck()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [characterReady, setCharacterReady] = useState(false)
  const [characterError, setCharacterError] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const introTimersRef = useRef<number[]>([])
  const previousStatusRef = useRef<string>("ready")
  const historyRef = useRef<AssistantMessage[]>([])
  const pendingDraftRef = useRef("")
  const discardStreamOnFinishRef = useRef(false)
  const handledSearchToolsRef = useRef(new Set<string>())
  const setMessagesRef = useRef<(messages: AssistantMessage[]) => void>(
    () => {}
  )
  const handleFinish = useCallback(
    ({
      messages: finishedMessages,
      isAbort,
      isDisconnect,
      isError,
    }: {
      messages: AssistantMessage[]
      isAbort: boolean
      isDisconnect: boolean
      isError: boolean
    }) => {
      if (discardStreamOnFinishRef.current) {
        discardStreamOnFinishRef.current = false
        return
      }
      if (isAbort || isDisconnect || isError) {
        saveLocalHistory(historyRef.current, pendingDraftRef.current)
        setMessagesRef.current([welcomeMessage, ...historyRef.current])
        if (pendingDraftRef.current) setInput(pendingDraftRef.current)
        return
      }
      historyRef.current = finishedMessages.filter(
        (message) => message.id !== welcomeMessage.id
      )
      pendingDraftRef.current = ""
      saveLocalHistory(historyRef.current, "")
    },
    []
  )
  const handleError = useCallback(() => {
    if (discardStreamOnFinishRef.current) return
    setMessagesRef.current([welcomeMessage, ...historyRef.current])
    if (pendingDraftRef.current) setInput(pendingDraftRef.current)
    saveLocalHistory(historyRef.current, pendingDraftRef.current)
  }, [])
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    clearError,
    stop,
  } = useChat<AssistantMessage>({
    id: "torobcheck-assistant",
    messages: [welcomeMessage],
    transport: assistantTransport,
    onFinish: handleFinish,
    onError: handleError,
  })
  setMessagesRef.current = setMessages
  const isBusy = status === "submitted" || status === "streaming"

  useEffect(() => {
    const history = readLocalHistory()
    historyRef.current = history.messages
    pendingDraftRef.current = history.draft
    for (const message of history.messages) {
      message.parts.forEach((part, index) => {
        const toolPart = getToolPart(part)
        if (
          toolPart?.type === "tool-searchProducts" &&
          toolPart.state === "output-available"
        ) {
          handledSearchToolsRef.current.add(
            toolPart.toolCallId ?? `${message.id}:${index}`
          )
        }
      })
    }
    setMessages([welcomeMessage, ...history.messages])
    setInput(history.draft)
    setHistoryLoaded(true)
  }, [setMessages])

  useEffect(() => {
    if (!isBusy && discardStreamOnFinishRef.current) {
      discardStreamOnFinishRef.current = false
    }
  }, [isBusy])

  useEffect(() => {
    for (const message of [...messages].reverse()) {
      for (let index = message.parts.length - 1; index >= 0; index--) {
        const toolPart = getToolPart(message.parts[index]!)
        if (
          toolPart?.type !== "tool-searchProducts" ||
          toolPart.state !== "output-available" ||
          !toolPart.output ||
          typeof toolPart.output !== "object"
        ) {
          continue
        }

        const eventId = toolPart.toolCallId ?? `${message.id}:${index}`
        if (handledSearchToolsRef.current.has(eventId)) return
        handledSearchToolsRef.current.add(eventId)
        if (handledSearchToolsRef.current.size > 100) {
          const oldest = handledSearchToolsRef.current.values().next().value
          if (oldest) handledSearchToolsRef.current.delete(oldest)
        }

        const output = toolPart.output as { offers?: unknown }
        if (!Array.isArray(output.offers)) return
        const bestOffer = (output.offers as AssistantOffer[]).find(
          (offer) =>
            typeof offer.shopId === "string" &&
            typeof offer.lat === "number" &&
            typeof offer.lon === "number"
        )
        if (bestOffer) {
          onSelectOffer({
            shopId: bestOffer.shopId,
            shopName: bestOffer.shopName,
            address: bestOffer.address,
            locationLabel: bestOffer.locationLabel,
            categoryName: bestOffer.categoryName,
            lat: bestOffer.lat,
            lon: bestOffer.lon,
            priceToman: bestOffer.priceToman,
          })
        }
        return
      }
    }
  }, [messages, onSelectOffer])

  const cancelIntro = useCallback(() => {
    for (const timer of introTimersRef.current) {
      window.clearTimeout(timer)
    }
    introTimersRef.current = []
  }, [])

  useEffect(() => {
    if (!characterReady) return

    const openAndTalk = window.setTimeout(() => {
      setOpen(true)
      onOpenChange(true)
      setSpeech("talking")
    }, 900)
    const settle = window.setTimeout(() => {
      setSpeech("silent")
      setMovement("idle")
    }, 3300)

    introTimersRef.current = [openAndTalk, settle]

    return cancelIntro
  }, [cancelIntro, characterReady, onOpenChange, setMovement, setSpeech])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    onOpenChange(nextOpen)
    if (nextOpen) cancelIntro()
  }

  useEffect(() => {
    if (previousStatusRef.current === status) return
    previousStatusRef.current = status

    if (status === "ready" || status === "error") {
      setMovement("idle")
      setSpeech("silent")
      return
    }

    setOpen(true)
    onOpenChange(true)
    setMovement("walking")
    setSpeech(status === "streaming" ? "talking" : "silent")
  }, [onOpenChange, setMovement, setSpeech, status])

  const submitMessage = useCallback(
    (text: string) => {
      const trimmedText = text.trim()
      if (!trimmedText || isBusy) return

      cancelIntro()
      clearError()
      setOpen(true)
      onOpenChange(true)
      setMovement("walking")
      setSpeech("silent")
      setInput("")
      discardStreamOnFinishRef.current = false
      pendingDraftRef.current = trimmedText
      saveLocalHistory(historyRef.current, trimmedText)
      const requestMapContext = location
        ? {
            ...mapContext,
            center: { lat: location.latitude, lon: location.longitude },
          }
        : mapContext
      void sendMessage(
        { text: trimmedText },
        {
          body: {
            mapContext: requestMapContext,
          },
        }
      )
    },
    [
      cancelIntro,
      clearError,
      isBusy,
      location,
      mapContext,
      onOpenChange,
      sendMessage,
      setMovement,
      setSpeech,
    ]
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitMessage(input)
  }

  const clearConversation = () => {
    if (isBusy) {
      discardStreamOnFinishRef.current = true
      stop()
    }
    historyRef.current = []
    pendingDraftRef.current = ""
    setMessages([welcomeMessage])
    setInput("")
    clearError()
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY)
    } catch {
      // Keep the in-memory conversation cleared when storage is blocked.
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <Popover open={open} modal={false} onOpenChange={handleOpenChange}>
      <div className="relative size-[76px]">
        <PopoverTrigger
          aria-label="گفت‌وگو با ترب‌چک"
          className="pointer-events-auto rounded-full border-0 bg-transparent p-0 shadow-none outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <TorobCheckCharacter
            className="size-[76px]"
            onReady={() => setCharacterReady(true)}
            onError={() => setCharacterError(true)}
          />
        </PopoverTrigger>
        {characterError && (
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label="تربچِک بارگذاری نشد"
              onClick={() => handleOpenChange(true)}
              className="pointer-events-auto absolute inset-0 z-10 rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="sr-only">تربچِک بارگذاری نشد</span>
            </TooltipTrigger>
            <TooltipContent dir="rtl" className="max-w-56 text-center">
              تربچِک بارگذاری نشد. اتصال اینترنت یا فایل انیمیشن در دسترس نیست.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <PopoverContent
        dir="rtl"
        side="top"
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="flex h-[min(26rem,calc(100dvh-5rem))] w-[min(22rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-card/95 p-0 shadow-2xl shadow-black/20 backdrop-blur-xl"
      >
        <PopoverHeader className="flex-row items-start gap-3 border-b border-border/60 px-3.5 py-3">
          <Avatar size="sm" className="mt-0.5 bg-primary/10 text-primary">
            <AvatarFallback className="bg-primary/10 text-primary">
              <Bot aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <PopoverTitle className="text-sm font-bold">ترب‌چک</PopoverTitle>
            <PopoverDescription className="mt-0.5 text-xs leading-5">
              دستیار خرید حضوری تهران
            </PopoverDescription>
          </div>
          {(messages.length > 1 || input.length > 0) && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="پاک‌کردن گفت‌وگو و شروع دوباره"
              title="پاک‌کردن گفت‌وگو"
              onClick={clearConversation}
              className="-me-1 -mt-1 rounded-full text-muted-foreground"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="بستن گفت‌وگو"
            onClick={() => handleOpenChange(false)}
            className="-me-1 -mt-1 rounded-full text-muted-foreground"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </PopoverHeader>

        <MessageScrollerProvider autoScroll scrollPreviousItemPeek={28}>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport
              aria-label="گفت‌وگو با ترب‌چک"
              aria-live="polite"
            >
              <MessageScrollerContent className="gap-3 p-3">
                {messages.map((message) => {
                  if (message.role !== "assistant" && message.role !== "user") {
                    return null
                  }

                  const isAssistant = message.role === "assistant"
                  const messageText = getMessageText(message)

                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={message.role === "user"}
                    >
                      <Message
                        align={isAssistant ? "start" : "end"}
                        className="gap-2"
                      >
                        {isAssistant && (
                          <MessageAvatar className="mb-0.5 w-7 min-w-7">
                            <Avatar size="sm">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                <Bot aria-hidden="true" />
                              </AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                        )}
                        <MessageContent className="gap-1.5">
                          <MessageHeader className="px-2 text-[11px]">
                            {isAssistant ? "ترب‌چک" : "شما"}
                          </MessageHeader>
                          {messageText && (
                            <Bubble
                              align={isAssistant ? "start" : "end"}
                              variant={isAssistant ? "secondary" : "muted"}
                              className="max-w-[92%]"
                            >
                              <BubbleContent className="border-border/40 px-3 py-2.5 text-[13px] leading-6 whitespace-pre-wrap">
                                {messageText}
                              </BubbleContent>
                            </Bubble>
                          )}
                          {isAssistant &&
                            message.parts.flatMap((part, index) => {
                              const toolPart = getToolPart(part)
                              if (!toolPart) return []
                              const isRunning =
                                toolPart.state === "input-streaming" ||
                                toolPart.state === "input-available"
                              const title =
                                toolPart.type === "tool-searchProducts"
                                  ? "دارم کالاها و فروشگاه‌ها را بررسی می‌کنم"
                                  : toolPart.type === "tool-getShopDetails"
                                    ? "دارم اطلاعات فروشگاه را بررسی می‌کنم"
                                    : toolPart.type === "tool-researchShop"
                                      ? "دارم منابع عمومی فروشگاه را بررسی می‌کنم"
                                      : "دارم راه ارتباط با فروشگاه را آماده می‌کنم"
                              return [
                                <Trace key={`${message.id}-tool-${index}`}>
                                  <TraceLine
                                    status={
                                      toolPart.state === "output-error"
                                        ? "error"
                                        : isRunning
                                          ? "running"
                                          : undefined
                                    }
                                    className="text-xs"
                                  >
                                    <TraceIcon>
                                      {toolPart.type ===
                                      "tool-searchProducts" ? (
                                        <Search aria-hidden="true" />
                                      ) : toolPart.type ===
                                        "tool-getShopDetails" ? (
                                        <MapPin aria-hidden="true" />
                                      ) : (
                                        <ExternalLink aria-hidden="true" />
                                      )}
                                    </TraceIcon>
                                    <TraceTitle>
                                      {toolPart.state === "output-error"
                                        ? "بررسی ناموفق بود"
                                        : isRunning
                                          ? title
                                          : "بررسی انجام شد"}
                                    </TraceTitle>
                                  </TraceLine>
                                  <AssistantToolResult
                                    part={toolPart}
                                    onSelectOffer={onSelectOffer}
                                  />
                                </Trace>,
                              ]
                            })}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton
              aria-label="رفتن به تازه‌ترین پیام"
              className="size-7"
            />
          </MessageScroller>
        </MessageScrollerProvider>

        {historyLoaded && messages.length === 1 && status === "ready" && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {quickPrompts.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submitMessage(prompt)}
                className="h-7 rounded-full px-2.5 text-[11px] font-normal"
              >
                {prompt}
              </Button>
            ))}
          </div>
        )}

        {!historyLoaded && (
          <div className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 animate-spin"
            />
            <span>در حال بازیابی گفت‌وگوی ذخیره‌شده</span>
          </div>
        )}

        {status === "submitted" && (
          <div className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 animate-spin"
            />
            <span>دارم درخواستت را بررسی می‌کنم…</span>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="mx-3 mb-2 w-auto">
            <AlertCircle aria-hidden="true" />
            <AlertTitle className="text-xs">پاسخی دریافت نشد</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-2 text-xs">
              <span>
                پیکربندی دستیار یا اتصال به سرویس را بررسی کن و دوباره تلاش کن.
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  clearError()
                  submitMessage(input || pendingDraftRef.current)
                }}
              >
                تلاش دوباره
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="px-3 pb-2.5">
          <FieldGroup className="gap-0">
            <Field>
              <FieldLabel
                htmlFor="torobcheck-assistant-input"
                className="sr-only"
              >
                پیام شما
              </FieldLabel>
              <InputGroup className="rounded-xl bg-background/70">
                <InputGroupTextarea
                  id="torobcheck-assistant-input"
                  dir="rtl"
                  value={input}
                  maxLength={500}
                  disabled={!historyLoaded || isBusy}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="دنبال چه محصولی هستی؟"
                  className="max-h-24 min-h-11 px-3 py-2 text-sm leading-5"
                />
                <InputGroupAddon align="inline-end" className="self-end pb-1.5">
                  <InputGroupButton
                    type={isBusy ? "button" : "submit"}
                    variant={isBusy ? "secondary" : "default"}
                    size="icon-sm"
                    disabled={!isBusy && (!historyLoaded || !input.trim())}
                    aria-label={isBusy ? "توقف پاسخ" : "ارسال پیام"}
                    onClick={isBusy ? stop : undefined}
                    className="rounded-lg"
                  >
                    {isBusy ? (
                      <Square aria-hidden="true" />
                    ) : (
                      <ArrowUp aria-hidden="true" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>
        </form>
      </PopoverContent>
    </Popover>
  )
}
