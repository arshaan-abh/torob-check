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
  MessageCircleText,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@workspace/ui/components/carousel"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
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

import {
  TorobCheckCharacter,
  type TorobCheckGaze,
} from "@/app/components/torob-check-character"
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
  gaze: TorobCheckGaze
  open: boolean
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
  { label: "یک فشارسنج مناسب پیدا کن", icon: Search },
  { label: "فروشگاه‌های نزدیکم را مقایسه کن", icon: MapPin },
  { label: "ارزان‌ترین گوشی شیائومی را پیدا کن", icon: Search },
  { label: "یک لپ‌تاپ برای کار دانشجویی پیدا کن", icon: Search },
  { label: "جاروبرقی‌های نزدیکم را مقایسه کن", icon: MapPin },
  { label: "هدفون بلوتوثی تا ۲ میلیون پیدا کن", icon: Search },
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
          <Empty className="gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-4">
            <EmptyHeader className="gap-1.5">
              <EmptyMedia variant="icon" className="mb-0 size-7">
                <Search aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle className="text-xs">
                در این محدوده نتیجه‌ای پیدا نشد
              </EmptyTitle>
              <EmptyDescription className="text-xs">
                نام کالا یا محدودهٔ جستجو را تغییر بده.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          offers.map((offer) => {
            const isConfirmedInStock =
              offer.stockFreshness === "fresh" &&
              offer.stockConfirmation === "merchant_confirmed" &&
              offer.stockStatus === "in_stock"
            const isConfirmedOutOfStock =
              offer.stockFreshness === "fresh" &&
              offer.stockConfirmation === "merchant_confirmed" &&
              offer.stockStatus === "out_of_stock"
            const stockLabel = isConfirmedInStock
              ? "موجودی تازه تأیید شده"
              : isConfirmedOutOfStock
                ? "ناموجودی تازه تأیید شده"
                : offer.stockFreshness === "stale"
                  ? "آخرین وضعیت موجودی قدیمی است"
                  : "موجودی تازه تأیید نشده"

            return (
              <Card
                key={offer.offerId}
                size="sm"
                className="gap-0 border-border/60 bg-background/80 py-0 shadow-none ring-1 ring-foreground/5"
              >
                <CardHeader className="gap-1 p-3 pb-2">
                  <CardTitle className="line-clamp-2 text-sm leading-5 font-semibold">
                    {offer.productTitle ?? offer.sellerTitle ?? "کالا"}
                  </CardTitle>
                  <CardDescription className="truncate text-xs">
                    {offer.shopName ?? "فروشگاه"}
                    {offer.address ? ` · ${offer.address}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 px-3 pb-3">
                  <p className="text-[13px] leading-5 font-semibold text-foreground">
                    {offerPriceLabel(offer)}
                  </p>
                  {offer.budgetFit === "unknown" && (
                    <p className="text-xs leading-5 text-muted-foreground">
                      قیمت تازه نداریم و نمی‌توانیم قرارگرفتن در بودجه را تأیید
                      کنیم.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={
                        isConfirmedOutOfStock
                          ? "destructive"
                          : isConfirmedInStock
                            ? "secondary"
                            : "outline"
                      }
                      className="h-5 px-2 text-[10px] font-normal"
                    >
                      {stockLabel}
                    </Badge>
                    {offer.distanceKm !== null && (
                      <Badge
                        variant="outline"
                        className="h-5 px-2 text-[10px] font-normal"
                      >
                        {numberFormat.format(
                          Math.round(offer.distanceKm * 10) / 10
                        )}{" "}
                        کیلومتر
                      </Badge>
                    )}
                  </div>
                </CardContent>
                {(offer.evidenceUrl ||
                  (offer.lat !== null && offer.lon !== null)) && (
                  <CardFooter className="flex flex-wrap justify-between gap-2 border-border/60 bg-muted/20 px-3 py-2">
                    {offer.evidenceUrl && (
                      <a
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                        href={offer.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        منبع قیمت
                        <ExternalLink
                          aria-hidden="true"
                          className="size-3 shrink-0"
                        />
                      </a>
                    )}
                    {offer.lat !== null && offer.lon !== null && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                        className="h-7 rounded-lg"
                      >
                        <MapPin data-icon="inline-start" aria-hidden="true" />
                        نمایش روی نقشه
                      </Button>
                    )}
                  </CardFooter>
                )}
              </Card>
            )
          })
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
      <Card
        size="sm"
        className="mt-2 gap-0 border-border/60 bg-background/80 py-0 shadow-none ring-1 ring-foreground/5"
      >
        <CardHeader className="gap-1 p-3 pb-2">
          <CardTitle className="text-sm font-semibold">
            {shop.name ?? "فروشگاه"}
          </CardTitle>
          {shop.address && (
            <CardDescription className="text-xs">
              {shop.address}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-2 px-3 pb-3">
          <Badge
            variant={
              shop.hoursFreshness === "fresh" && shop.weeklyHours
                ? "secondary"
                : "outline"
            }
            className="h-auto w-fit px-2 py-1 text-[10px] font-normal whitespace-normal"
          >
            ساعت کاری:{" "}
            {shop.hoursFreshness === "fresh" && shop.weeklyHours
              ? "تأیید فروشگاه در هفت روز اخیر"
              : "اطلاعات تازه در دسترس نیست"}
          </Badge>
          {shop.hoursObservedAt && (
            <time
              className="text-xs text-muted-foreground"
              dateTime={shop.hoursObservedAt}
            >
              آخرین تأیید:{" "}
              {new Intl.DateTimeFormat("fa-IR", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(shop.hoursObservedAt))}
            </time>
          )}
        </CardContent>
        {!!shop.sources?.length && (
          <CardFooter className="flex flex-wrap gap-2 border-border/60 bg-muted/20 px-3 py-2">
            {shop.sources.map((source) => (
              <a
                key={source.url}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                منبع{" "}
                {source.sourceType === "instagram" ? "اینستاگرام" : "فروشگاه"}
                <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
              </a>
            ))}
          </CardFooter>
        )}
      </Card>
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
          <Alert role="status" className="rounded-xl bg-muted/20">
            <AlertDescription className="text-xs leading-5">
              پژوهش منبع فروشگاه در پس‌زمینه آغاز شد؛ پاسخ فعلی منتظر آن
              نمی‌ماند.
            </AlertDescription>
          </Alert>
        )}
        {findings.map((finding) => (
          <Card
            key={finding.url}
            size="sm"
            className="gap-0 border-border/60 bg-background/80 py-0 shadow-none ring-1 ring-foreground/5"
          >
            <CardHeader className="gap-2 p-3 pb-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="font-normal">
                  یافته عمومی · تأییدنشده
                </Badge>
                <a
                  href={finding.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`بازکردن منبع: ${finding.title}`}
                  className="rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ExternalLink aria-hidden="true" className="size-4" />
                </a>
              </div>
              <CardTitle className="text-sm leading-5">
                <a
                  href={finding.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:text-primary hover:underline"
                >
                  {finding.title}
                </a>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 px-3 pb-3">
              <p className="text-xs leading-5 text-muted-foreground">
                {finding.excerpt.slice(0, 220)}
              </p>
              <time
                className="text-[11px] text-muted-foreground/80"
                dateTime={finding.observedAt}
              >
                مشاهده‌شده:{" "}
                {new Intl.DateTimeFormat("fa-IR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(finding.observedAt))}
              </time>
            </CardContent>
          </Card>
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
      <Card
        size="sm"
        className="mt-2 gap-0 border-border/60 bg-background/80 py-0 shadow-none ring-1 ring-foreground/5"
      >
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold">
            متن پیشنهادی برای تماس
          </CardTitle>
        </CardHeader>
        {draft && (
          <CardContent className="px-3 pb-3">
            <p className="text-xs leading-5 whitespace-pre-wrap">{draft}</p>
          </CardContent>
        )}
        <CardFooter className="flex-col items-start gap-2 border-border/60 bg-muted/20 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            پیام ارسال نمی‌شود؛ خودت لینک تماس را انتخاب کن.
          </p>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map((link) => (
                <Button
                  key={link.href}
                  type="button"
                  variant="outline"
                  size="sm"
                  render={
                    <a
                      href={link.href}
                      target={
                        link.href.startsWith("https:") ? "_blank" : undefined
                      }
                      rel={
                        link.href.startsWith("https:")
                          ? "noreferrer"
                          : undefined
                      }
                    />
                  }
                  className="h-7 rounded-lg"
                >
                  {link.label}
                  <ExternalLink data-icon="inline-end" aria-hidden="true" />
                </Button>
              ))}
            </div>
          )}
        </CardFooter>
      </Card>
    )
  }

  return null
}

export function TorobCheckAssistant({
  location,
  mapContext,
  gaze,
  open,
  onOpenChange,
  onSelectOffer,
}: TorobCheckAssistantProps) {
  const { setMovement, setSpeech } = useTorobCheck()
  const [input, setInput] = useState("")
  const [characterReady, setCharacterReady] = useState(false)
  const [characterError, setCharacterError] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [introTalking, setIntroTalking] = useState(false)
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
    setSpeech(open && (isBusy || introTalking) ? "talking" : "silent")
  }, [introTalking, isBusy, open, setSpeech])

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
      onOpenChange(true)
      setIntroTalking(true)
    }, 900)
    const settle = window.setTimeout(() => {
      setIntroTalking(false)
      setMovement("idle")
    }, 3300)

    introTimersRef.current = [openAndTalk, settle]

    return cancelIntro
  }, [cancelIntro, characterReady, onOpenChange, setMovement])

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (nextOpen) return

    cancelIntro()
    setIntroTalking(false)
    if (!isBusy) {
      setMovement("idle")
    }
  }

  useEffect(() => {
    if (previousStatusRef.current === status) return
    previousStatusRef.current = status

    if (status === "ready" || status === "error") {
      setMovement("idle")
      return
    }

    setMovement("walking")
  }, [setMovement, status])

  const submitMessage = useCallback(
    (text: string) => {
      const trimmedText = text.trim()
      if (!trimmedText || isBusy) return

      cancelIntro()
      setIntroTalking(false)
      clearError()
      onOpenChange(true)
      setMovement("walking")
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
            gaze={open ? "up" : gaze}
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
        showArrow
        collisionAvoidance={{ side: "none", fallbackAxisSide: "none" }}
        sideOffset={10}
        collisionPadding={12}
        className="flex h-[min(24rem,calc(100dvh-7rem))] w-[min(23rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-visible rounded-[2.3125rem] border-border/70 bg-card/95 p-0 shadow-2xl ring-1 shadow-black/20 ring-border/50 backdrop-blur-xl sm:h-[min(29rem,calc(100dvh-5rem))]"
      >
        <PopoverHeader className="flex-row items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
          <Avatar
            size="default"
            className="size-9 rounded-xl bg-primary/10 ring-1 ring-primary/10"
          >
            <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
              <MessageCircleText aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <PopoverTitle className="text-sm font-semibold tracking-tight">
              ترب‌چک
            </PopoverTitle>
            <PopoverDescription className="mt-0.5 text-xs">
              دستیار خرید حضوری تهران
            </PopoverDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {(messages.length > 1 || input.length > 0) && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="پاک‌کردن گفت‌وگو و شروع دوباره"
                title="پاک‌کردن گفت‌وگو"
                onClick={clearConversation}
                className="rounded-xl text-muted-foreground"
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
              className="rounded-xl text-muted-foreground"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </PopoverHeader>

        <MessageScrollerProvider autoScroll scrollPreviousItemPeek={28}>
          <MessageScroller className="min-h-0 flex-1 bg-background/20">
            <MessageScrollerViewport
              aria-label="گفت‌وگو با ترب‌چک"
              aria-live="polite"
              className="flex-1"
            >
              <MessageScrollerContent className="gap-4 px-4 py-4">
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
                          <MessageAvatar className="mb-0.5 size-7 min-w-7">
                            <Avatar size="default" className="size-7">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                <Bot aria-hidden="true" />
                              </AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                        )}
                        <MessageContent className="gap-1">
                          <MessageHeader className="px-1 text-[10px] font-medium text-muted-foreground/80">
                            {isAssistant ? "ترب‌چک" : "شما"}
                          </MessageHeader>
                          {messageText && (
                            <Bubble
                              align={isAssistant ? "start" : "end"}
                              variant={isAssistant ? "secondary" : "default"}
                              className="max-w-[88%]"
                            >
                              <BubbleContent className="border-transparent px-3.5 py-2.5 text-[13px] leading-6 whitespace-pre-wrap">
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
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-4">
              <MessageScrollerButton
                aria-label="رفتن به تازه‌ترین پیام"
                className="pointer-events-auto relative inset-auto size-8 translate-x-0 border-border/60 bg-card shadow-sm data-[direction=end]:bottom-auto data-[direction=start]:top-auto rtl:translate-x-0"
              />
            </div>
          </MessageScroller>
        </MessageScrollerProvider>

        {historyLoaded && messages.length === 1 && status === "ready" && (
          <div className="grid shrink-0 gap-2 border-t border-border/60 bg-muted/15 py-2.5">
            <p className="mx-3 flex items-center gap-1.5 px-1 text-[10px] font-medium text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-3" />
              برای شروع یکی را انتخاب کن
            </p>
            <Carousel
              aria-label="پیشنهادهای شروع گفت‌وگو"
              dir="rtl"
              opts={{ align: "start", direction: "rtl", dragFree: true }}
              className="min-w-0"
            >
              <CarouselContent className="ms-0 gap-2 *:first:mr-3 *:last:ml-3">
                {quickPrompts.map(({ label, icon: Icon }) => (
                  <CarouselItem key={label} className="basis-auto ps-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => submitMessage(label)}
                      className="h-9 w-max shrink-0 justify-start rounded-xl border-border/60 bg-background/80 px-3 text-right text-[11px] leading-4 font-normal whitespace-nowrap shadow-none"
                    >
                      <Icon data-icon="inline-start" aria-hidden="true" />
                      {label}
                    </Button>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>
        )}

        {(!historyLoaded || status === "submitted") && (
          <div
            role="status"
            className="flex shrink-0 items-center gap-2 border-t border-border/50 bg-muted/15 px-4 py-2.5 text-xs text-muted-foreground"
          >
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 animate-spin"
            />
            <span>
              {historyLoaded
                ? "دارم درخواستت را بررسی می‌کنم…"
                : "در حال بازیابی گفت‌وگوی ذخیره‌شده"}
            </span>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="m-3 w-auto rounded-xl">
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

        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-border/60 bg-muted/15 px-3 py-3"
        >
          <FieldGroup className="gap-0">
            <Field>
              <FieldLabel
                htmlFor="torobcheck-assistant-input"
                className="sr-only"
              >
                پیام شما
              </FieldLabel>
              <InputGroup className="min-h-12 rounded-2xl bg-background shadow-sm">
                <InputGroupTextarea
                  id="torobcheck-assistant-input"
                  dir="rtl"
                  value={input}
                  maxLength={500}
                  disabled={!historyLoaded || isBusy}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="مثلاً: یک کفش قرمز نزدیکم پیدا کن"
                  className="max-h-28 min-h-12 px-3 py-3 text-sm leading-5"
                />
                <InputGroupAddon align="block-end" className="justify-end p-2">
                  <InputGroupButton
                    type={isBusy ? "button" : "submit"}
                    variant={isBusy ? "secondary" : "default"}
                    size="icon-sm"
                    disabled={!isBusy && (!historyLoaded || !input.trim())}
                    aria-label={isBusy ? "توقف پاسخ" : "ارسال پیام"}
                    onClick={isBusy ? stop : undefined}
                    className="size-8 rounded-xl"
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
