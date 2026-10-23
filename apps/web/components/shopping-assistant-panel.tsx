"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import {
  ExternalLink,
  LoaderCircle,
  MapPin,
  Send,
  ShoppingBag,
  X,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { useTorobCheck } from "@/app/components/torob-check-provider"

export type ShoppingAssistantMapContext = {
  bounds?: { west: number; south: number; east: number; north: number }
  center?: { lat: number; lon: number }
}

type Props = { mapContext: ShoppingAssistantMapContext; onClose: () => void }
type ToolPart = { type: string; state?: string; output?: unknown }
type Offer = {
  offerId: string
  productTitle: string | null
  sellerTitle?: string | null
  brandName: string | null
  model: string | null
  priceToman: string | null
  priceFreshness: string
  stockStatus: string
  stockFreshness: string
  priceConfirmation: string
  stockConfirmation: string
  evidenceUrl: string | null
  shopName: string | null
  address: string | null
  distanceKm: number | null
}

const numberFormat = new Intl.NumberFormat("fa-IR")
function priceLabel(offer: Offer) {
  if (!offer.priceToman) return "قیمت ثبت نشده"
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
          <p className="mt-1 text-xs text-muted-foreground">
            {offer.shopName ?? "فروشگاه"}
            {offer.address ? ` · ${offer.address}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {offer.stockStatus === "in_stock" &&
            offer.stockFreshness === "fresh" &&
            offer.stockConfirmation === "merchant_confirmed"
              ? "موجودی تازه تأیید شده"
              : offer.stockFreshness === "stale"
                ? "موجودی قدیمی است"
                : "موجودی تأیید نشده"}
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
    if (!findings.length) return null
    return (
      <div className="mt-2 grid gap-2">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          یافته عمومی · تأییدنشده
        </p>
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

export function ShoppingAssistantPanel({ mapContext, onClose }: Props) {
  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)
  const { setSpeech } = useTorobCheck()
  const transport = useMemo(
    () =>
      new DefaultChatTransport({ api: "/api/assistant", body: { mapContext } }),
    [mapContext]
  )
  const { messages, sendMessage, status, error, stop } = useChat({ transport })
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    setSpeech(busy ? "talking" : "silent")
    return () => setSpeech("silent")
  }, [busy, setSpeech])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [messages, status])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    sendMessage({ text })
    setInput("")
  }

  return (
    <section
      aria-label="دستیار خرید ترب‌چک"
      dir="rtl"
      className="absolute top-16 right-3 z-30 flex max-h-[min(70dvh,620px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/20 md:top-20 md:right-5"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-bold">همراه خرید</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3" />
            جست‌وجو در محدوده فعلی نقشه
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label="بستن دستیار خرید"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <ScrollArea className="min-h-32 flex-1 px-4 py-3">
        <div className="grid gap-4">
          {messages.length === 0 && (
            <div className="rounded-xl bg-muted/60 p-3 text-sm leading-6">
              <p className="flex items-center gap-2 font-semibold">
                <ShoppingBag
                  aria-hidden="true"
                  className="size-4 text-primary"
                />
                دنبال چه چیزی هستید؟
              </p>
              <p className="mt-1 text-muted-foreground">
                محصول، بودجه به تومان، ویژگی‌ها یا محله را بنویسید. قیمت و
                موجودی فقط با زمان و سطح تأییدشان نشان داده می‌شوند.
              </p>
            </div>
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`grid gap-2 text-sm leading-6 ${message.role === "user" ? "justify-items-start" : "justify-items-stretch"}`}
            >
              <div
                className={
                  message.role === "user"
                    ? "max-w-[88%] rounded-2xl rounded-tl-sm bg-primary px-3 py-2 text-primary-foreground"
                    : "max-w-full"
                }
              >
                {message.parts.map((part, index) =>
                  part.type === "text" ? (
                    <p
                      key={`${message.id}-text-${index}`}
                      className="whitespace-pre-wrap"
                    >
                      {part.text}
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
          {busy && (
            <p
              role="status"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              در حال بررسی داده‌های فروشگاه
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              پاسخ دریافت نشد. دوباره تلاش کنید.
            </p>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>
      <form
        className="flex items-end gap-2 border-t border-border/70 p-3"
        onSubmit={submit}
      >
        <label className="sr-only" htmlFor="assistant-message">
          پیام به دستیار خرید
        </label>
        <textarea
          id="assistant-message"
          className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder="مثلاً کفش پیاده‌روی تا ۳ میلیون تومان"
          maxLength={1000}
        />
        {busy ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="توقف پاسخ"
            onClick={stop}
          >
            <X aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            aria-label="ارسال پیام"
            disabled={!input.trim()}
          >
            <Send aria-hidden="true" />
          </Button>
        )}
      </form>
      <p className="px-4 pb-3 text-[11px] leading-5 text-muted-foreground">
        اگر فروشگاه در چند پیام پاسخ داد، متن‌ها را همین‌جا جداگانه بفرست تا
        باهم جمع‌بندی شوند. نقل‌قول‌ها تأیید سامانه نیستند و گفت‌وگو فقط در این
        صفحه نگه‌داری می‌شود.
      </p>
    </section>
  )
}
