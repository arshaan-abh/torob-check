"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  ExternalLink,
  LoaderCircle,
  MapPin,
  Send,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { TorobCheckCharacter } from "@/app/components/torob-check-character"
import { useTorobCheck } from "@/app/components/torob-check-provider"

export type ShoppingAssistantMapContext = {
  bounds?: { west: number; south: number; east: number; north: number }
  center?: { lat: number; lon: number }
}

export type ShoppingAssistantOfferSelection = {
  shopId: string
  shopName: string | null
  address: string | null
  locationLabel: string | null
  categoryName: string | null
  lat: number | null
  lon: number | null
  priceToman: string | null
}

type Props = {
  isOpen: boolean
  mapContext: ShoppingAssistantMapContext
  onClose: () => void
  onSelectOffer: (offer: ShoppingAssistantOfferSelection) => void
}
type ToolPart = {
  type: string
  state?: string
  toolCallId?: string
  output?: unknown
}
type Offer = {
  offerId: string
  shopId: string
  productTitle: string | null
  sellerTitle?: string | null
  brandName: string | null
  model: string | null
  priceToman: string | null
  budgetFit: "within" | "outside" | "unknown" | null
  priceFreshness: string
  stockStatus: string
  stockFreshness: string
  priceConfirmation: string
  stockConfirmation: string
  evidenceUrl: string | null
  shopName: string | null
  address: string | null
  locationLabel: string | null
  categoryName: string | null
  lat: number | null
  lon: number | null
  distanceKm: number | null
}

const numberFormat = new Intl.NumberFormat("fa-IR")
const HISTORY_STORAGE_KEY = "torob-check:shopping-assistant:v1"
const MAX_HISTORY_MESSAGES = 80
const MAX_HISTORY_STORAGE_CHARS = 500_000

type LocalAssistantHistory = {
  messages: UIMessage[]
  draft: string
}

function isStoredMessage(value: unknown): value is UIMessage {
  if (!value || typeof value !== "object") return false
  const message = value as {
    id?: unknown
    role?: unknown
    parts?: unknown
  }
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

function readLocalHistory(): LocalAssistantHistory {
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

function saveLocalHistory(messages: UIMessage[], draft: string) {
  try {
    let savedMessages = messages.slice(-MAX_HISTORY_MESSAGES)
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

function priceLabel(offer: Offer) {
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

function OfferCards({ offers }: { offers: Offer[] }) {
  if (!offers.length)
    return (
      <p className="text-xs text-muted-foreground">
        در این محدوده نتیجه‌ای پیدا نشد.
      </p>
    )
  return (
    <div className="grid gap-2">
      {offers.map((offer) => (
        <article
          key={offer.offerId}
          className="rounded-xl border border-border/70 bg-background p-3"
        >
          <h3 className="font-semibold">
            {offer.productTitle ?? offer.sellerTitle ?? "کالا"}
          </h3>
          <p className="mt-1 text-sm">{priceLabel(offer)}</p>
          {offer.budgetFit === "unknown" && (
            <p className="mt-1 text-xs text-muted-foreground">
              قیمت تازه نداریم و نمی‌توانیم قرارگرفتن در بودجه را تأیید کنیم.
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
        </article>
      ))}
    </div>
  )
}

function ToolResult({ part }: { part: ToolPart }) {
  if (
    part.state !== "output-available" ||
    !part.output ||
    typeof part.output !== "object"
  )
    return null
  const output = part.output as Record<string, unknown>
  if (part.type === "tool-searchProducts") {
    const offers = Array.isArray(output.offers)
      ? (output.offers as Offer[])
      : []
    return (
      <div className="mt-2 grid gap-2">
        <OfferCards offers={offers} />
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
    const hours = shop.weeklyHours
    return (
      <article className="mt-2 rounded-xl border border-border/70 bg-background p-3 text-sm">
        <h3 className="font-semibold">{shop.name ?? "فروشگاه"}</h3>
        {shop.address && (
          <p className="mt-1 text-xs text-muted-foreground">{shop.address}</p>
        )}
        <p className="mt-2 text-xs">
          ساعت کاری:{" "}
          {shop.hoursFreshness === "fresh" && hours
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
      <article className="mt-2 rounded-xl border border-border/70 bg-background p-3">
        <p className="text-xs font-semibold">پرسش آماده برای فروشگاه</p>
        <p className="mt-2 text-sm leading-6">{draft}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          پیام فقط با انتخاب شما ارسال می‌شود.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.href}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"
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

export function ShoppingAssistantPanel({
  isOpen,
  mapContext,
  onClose,
  onSelectOffer,
}: Props) {
  const [input, setInput] = useState("")
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const shouldStickToBottomRef = useRef(true)
  const historyRef = useRef<UIMessage[]>([])
  const pendingDraftRef = useRef("")
  const discardStreamOnFinishRef = useRef(false)
  const setMessagesRef = useRef<(messages: UIMessage[]) => void>(() => {})
  const handledSearchToolsRef = useRef(new Set<string>())
  const { setSpeech } = useTorobCheck()
  const transport = useMemo(
    () =>
      new DefaultChatTransport({ api: "/api/assistant", body: { mapContext } }),
    [mapContext]
  )
  const handleFinish = useCallback(
    ({
      messages: finishedMessages,
      isAbort,
      isDisconnect,
      isError,
    }: {
      messages: UIMessage[]
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
        setMessagesRef.current(historyRef.current)
        if (pendingDraftRef.current) setInput(pendingDraftRef.current)
        return
      }
      historyRef.current = finishedMessages
      pendingDraftRef.current = ""
      saveLocalHistory(finishedMessages, "")
    },
    []
  )
  const handleError = useCallback(() => {
    if (discardStreamOnFinishRef.current) return
    setMessagesRef.current(historyRef.current)
    if (pendingDraftRef.current) setInput(pendingDraftRef.current)
    saveLocalHistory(historyRef.current, pendingDraftRef.current)
  }, [])
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    clearError,
  } = useChat({ transport, onFinish: handleFinish, onError: handleError })
  setMessagesRef.current = setMessages
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    const history = readLocalHistory()
    historyRef.current = history.messages
    pendingDraftRef.current = history.draft
    for (const message of history.messages) {
      message.parts.forEach((part, index) => {
        const toolPart = part as ToolPart
        if (
          toolPart.type === "tool-searchProducts" &&
          toolPart.state === "output-available"
        ) {
          handledSearchToolsRef.current.add(
            toolPart.toolCallId ?? `${message.id}:${index}`
          )
        }
      })
    }
    setMessages(history.messages)
    setInput(history.draft)
    setHistoryLoaded(true)
  }, [setMessages])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "0px"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`
  }, [input])

  useEffect(() => {
    setSpeech(busy ? "talking" : "silent")
    return () => setSpeech("silent")
  }, [busy, setSpeech])

  useEffect(() => {
    if (!historyLoaded || !shouldStickToBottomRef.current) return
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [historyLoaded, isOpen, messages, status])

  useEffect(() => {
    if (!busy && discardStreamOnFinishRef.current) {
      discardStreamOnFinishRef.current = false
    }
  }, [busy])

  useEffect(() => {
    for (const message of [...messages].reverse()) {
      for (let index = message.parts.length - 1; index >= 0; index--) {
        const part = message.parts[index] as ToolPart | undefined
        if (
          part?.type !== "tool-searchProducts" ||
          part.state !== "output-available" ||
          !part.output ||
          typeof part.output !== "object"
        ) {
          continue
        }

        const eventId = part.toolCallId ?? `${message.id}:${index}`
        if (handledSearchToolsRef.current.has(eventId)) return
        handledSearchToolsRef.current.add(eventId)
        if (handledSearchToolsRef.current.size > 100) {
          const oldest = handledSearchToolsRef.current.values().next().value
          if (oldest) handledSearchToolsRef.current.delete(oldest)
        }

        const output = part.output as { offers?: unknown }
        if (!Array.isArray(output.offers)) return
        const bestOffer = (output.offers as Offer[]).find(
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!historyLoaded || !text || busy) return
    discardStreamOnFinishRef.current = false
    clearError()
    shouldStickToBottomRef.current = true
    pendingDraftRef.current = text
    saveLocalHistory(historyRef.current, text)
    sendMessage({ text })
    setInput("")
  }

  function clearConversation() {
    if (busy) {
      discardStreamOnFinishRef.current = true
      stop()
    }
    historyRef.current = []
    pendingDraftRef.current = ""
    shouldStickToBottomRef.current = true
    setMessages([])
    setInput("")
    clearError()
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY)
    } catch {
      // The in-memory conversation still clears if browser storage is blocked.
    }
  }

  function trackScrollPosition() {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    if (!viewport) return
    shouldStickToBottomRef.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 72
  }

  return (
    <section
      aria-label="دستیار خرید ترب‌چک"
      aria-hidden={!isOpen}
      dir="rtl"
      hidden={!isOpen}
      className={`${isOpen ? "flex" : "hidden"} ${messages.length > 0 || busy ? "h-[min(70dvh,620px)]" : ""} absolute top-16 right-3 z-30 max-h-[min(70dvh,620px)] min-h-[min(70dvh,320px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/20 md:top-20 md:right-5`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-bold">همراه خرید</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3" />
            جست‌وجو در محدوده فعلی نقشه
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
            پیام‌ها فقط در همین مرورگر ذخیره می‌شوند.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(messages.length > 0 || input.length > 0) && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="پاک‌کردن گفت‌وگو و شروع دوباره"
              title="پاک‌کردن گفت‌وگو"
              onClick={clearConversation}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="بستن دستیار خرید"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>
      {historyLoaded && messages.length === 0 && !busy && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-muted/20 px-4 py-2.5">
          <TorobCheckCharacter
            className="shrink-0"
            size={52}
            label="تربچِک، همراه خرید شما"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">دنبال چه چیزی هستید؟</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              محصول، بودجه به تومان، ویژگی‌ها یا محله را بنویسید. قیمت و موجودی
              فقط با تأیید تازه فروشگاه نمایش داده می‌شوند.
            </p>
          </div>
        </div>
      )}
      {busy && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-muted/20 px-4 py-1.5">
          <TorobCheckCharacter
            className="shrink-0"
            size={38}
            label="تربچِک در حال بررسی است"
          />
          <p role="status" className="text-xs text-muted-foreground">
            در حال بررسی داده‌های فروشگاه
          </p>
        </div>
      )}
      {!historyLoaded && (
        <p
          role="status"
          className="flex shrink-0 items-center gap-2 px-4 py-3 text-xs text-muted-foreground"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          در حال بازیابی گفت‌وگوی ذخیره‌شده
        </p>
      )}
      <div
        ref={scrollAreaRef}
        className="min-h-0 flex-1"
        onScrollCapture={trackScrollPosition}
      >
        <ScrollArea className="h-full min-h-0">
          <div className="grid gap-3 px-4 py-3">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`grid min-w-0 gap-2 text-sm leading-6 ${message.role === "user" ? "justify-items-start" : "justify-items-stretch"}`}
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[88%] rounded-2xl rounded-tl-sm bg-primary px-3 py-2 text-primary-foreground"
                      : "max-w-full min-w-0"
                  }
                >
                  {message.parts.map((part, index) =>
                    part.type === "text" && part.text.trim() ? (
                      <p
                        key={`${message.id}-text-${index}`}
                        className="break-words whitespace-pre-wrap"
                      >
                        {part.text.trimStart()}
                      </p>
                    ) : null
                  )}
                </div>
                {message.parts.map((part, index) => (
                  <ToolResult
                    key={`${message.id}-tool-${index}`}
                    part={part as ToolPart}
                  />
                ))}
              </article>
            ))}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                پاسخ کامل نشد. متن پیام برای تلاش دوباره در ورودی بازیابی شده
                است.
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
      <form
        className="shrink-0 border-t border-border/70 p-3"
        onSubmit={submit}
      >
        <label className="sr-only" htmlFor="assistant-message">
          پیام به دستیار خرید
        </label>
        <div className="relative">
          <textarea
            ref={textareaRef}
            id="assistant-message"
            className="max-h-28 min-h-14 w-full resize-none rounded-xl border border-input bg-background py-3 pr-3 pl-12 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            value={input}
            disabled={!historyLoaded || busy}
            onChange={(event) => {
              const value = event.target.value
              pendingDraftRef.current = value
              setInput(value)
              saveLocalHistory(historyRef.current, value)
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="مثلاً کفش پیاده‌روی تا ۳ میلیون تومان"
            maxLength={1000}
            rows={1}
          />
          {busy ? (
            <div className="absolute z-10" style={{ left: 8, bottom: 12 }}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                aria-label="توقف پاسخ"
                onClick={stop}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="absolute z-10" style={{ left: 8, bottom: 12 }}>
              <Button
                type="submit"
                size="icon"
                className="size-9"
                aria-label="ارسال پیام"
                disabled={!historyLoaded || !input.trim()}
              >
                <Send aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      </form>
    </section>
  )
}
