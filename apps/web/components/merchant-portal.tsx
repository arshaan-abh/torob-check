"use client"

import { useEffect, useState, type FormEvent } from "react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

type Shop = {
  shopId: string
  name: string | null
  address: string | null
  locationLabel: string | null
  websiteUrl: string | null
  weeklyHours: unknown
  contacts: unknown
  timeZone: string
}
type Offer = {
  offerId: string
  title: string | null
  brandName: string | null
  priceToman: string | null
  stockStatus: string | null
  stockQuantity: number | null
}
type Claim = {
  id: string
  status: string
  shopId: string
  shopName: string | null
  address: string | null
  reviewNote: string | null
}

export function MerchantPortal() {
  const { data: session, isPending } = authClient.useSession()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up")
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const [shops, setShops] = useState<Shop[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [query, setQuery] = useState("")
  const [claimEvidenceUrl, setClaimEvidenceUrl] = useState("")
  const [claimMessage, setClaimMessage] = useState("")
  const [claimable, setClaimable] = useState<
    Array<{
      shopId: string
      name: string | null
      address: string | null
      locationLabel: string | null
    }>
  >([])
  const [offersByShop, setOffersByShop] = useState<Record<string, Offer[]>>({})
  const [selectedShop, setSelectedShop] = useState<string | null>(null)

  async function loadProfile() {
    const response = await fetch("/api/merchant/profile", { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) {
      setStatus(body.error ?? "پروفایل فروشنده بارگذاری نشد.")
      return
    }
    setShops(body.shops ?? [])
    setClaims(body.claims ?? [])
    if (!selectedShop && body.shops?.[0]) setSelectedShop(body.shops[0].shopId)
  }

  useEffect(() => {
    if (session?.user?.emailVerified) void loadProfile()
  }, [session?.user?.emailVerified])

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setStatus("")
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
          })
        : await authClient.signIn.email({ email: email.trim(), password })
    setBusy(false)
    if (result.error) setStatus(result.error.message ?? "ورود انجام نشد.")
    else if (mode === "sign-up")
      setStatus(
        "لینک تأیید به ایمیل شما فرستاده شد. پس از تأیید، دوباره وارد شوید."
      )
    else setStatus("ورود انجام شد.")
  }

  async function searchShops(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const response = await fetch(
      `/api/merchant/shops?q=${encodeURIComponent(query)}`
    )
    const body = await response.json()
    if (response.ok) setClaimable(body.shops ?? [])
    else setStatus(body.error ?? "جست‌وجوی فروشگاه انجام نشد.")
  }

  async function submitClaim(shopId: string) {
    setBusy(true)
    const response = await fetch("/api/merchant/shops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shopId,
        ...(claimEvidenceUrl.trim()
          ? { evidenceUrl: claimEvidenceUrl.trim() }
          : {}),
        ...(claimMessage.trim() ? { message: claimMessage.trim() } : {}),
      }),
    })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) setStatus(body.error ?? "درخواست مالکیت ثبت نشد.")
    else {
      setStatus("درخواست برای بررسی مدیر ثبت شد.")
      setClaimable([])
      setClaimEvidenceUrl("")
      setClaimMessage("")
      await loadProfile()
    }
  }

  async function loadOffers(shopId: string) {
    const response = await fetch(
      `/api/merchant/shops/${encodeURIComponent(shopId)}`,
      { cache: "no-store" }
    )
    const body = await response.json()
    if (response.ok)
      setOffersByShop((current) => ({
        ...current,
        [shopId]: body.offers ?? [],
      }))
    else setStatus(body.error ?? "فهرست کالاها بارگذاری نشد.")
  }

  useEffect(() => {
    if (selectedShop) void loadOffers(selectedShop)
  }, [selectedShop])

  async function updateOffer(
    offer: Offer,
    shopId: string,
    price: string,
    stockStatus: string
  ) {
    const priceNumber = price.trim() ? Number(price) : undefined
    if (
      priceNumber !== undefined &&
      (!Number.isInteger(priceNumber) || priceNumber <= 0)
    ) {
      setStatus("قیمت را به‌صورت عدد صحیح تومان وارد کنید.")
      return
    }
    const response = await fetch(
      `/api/merchant/offers/${encodeURIComponent(offer.offerId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shopId,
          ...(priceNumber === undefined ? {} : { priceToman: priceNumber }),
          stockStatus,
        }),
      }
    )
    const body = await response.json()
    if (!response.ok) setStatus(body.error ?? "به‌روزرسانی کالا انجام نشد.")
    else {
      setStatus("قیمت و وضعیت موجودی با زمان تأیید ثبت شد.")
      await loadOffers(shopId)
    }
  }

  async function submitShopDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedShop) return
    const form = new FormData(event.currentTarget)
    try {
      const weeklyHoursText = String(form.get("weeklyHours") ?? "").trim()
      const contactsText = String(form.get("contacts") ?? "").trim()
      const response = await fetch(
        `/api/merchant/shops/${encodeURIComponent(selectedShop)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            weeklyHours: weeklyHoursText
              ? JSON.parse(weeklyHoursText)
              : undefined,
            contacts: contactsText ? JSON.parse(contactsText) : undefined,
            websiteUrl: String(form.get("websiteUrl") ?? "").trim() || null,
            timeZone: String(form.get("timeZone") ?? "Asia/Tehran").trim(),
          }),
        }
      )
      const body = await response.json()
      if (!response.ok) setStatus(body.error ?? "اطلاعات فروشگاه ذخیره نشد.")
      else {
        setStatus("اطلاعات فروشگاه با زمان تأیید ثبت شد.")
        await loadProfile()
      }
    } catch {
      setStatus("ساعت کاری و راه‌های تماس باید JSON معتبر باشند.")
    }
  }

  if (isPending)
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center" dir="rtl">
        در حال بررسی حساب...
      </main>
    )

  if (!session?.user?.emailVerified)
    return (
      <main
        className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-5 px-4 py-8"
        dir="rtl"
      >
        <header>
          <h1 className="text-2xl font-bold">حساب فروشگاه</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            این مسیر برای فروشگاه‌هایی است که می‌خواهند اطلاعاتشان را مستقیم
            تأیید کنند. اطلاعات به‌روزشده با زمان انقضای جداگانه ثبت می‌شود.
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "sign-up"
                ? "ساخت حساب فروشنده"
                : "ورود به حساب فروشنده"}
            </CardTitle>
            <CardDescription>
              ایمیل باید تأیید شده باشد. ادعای مالکیت فروشگاه پیش از دسترسی
              بررسی می‌شود.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={submitAuth}>
              {mode === "sign-up" && (
                <label className="grid gap-2 text-sm font-medium">
                  نام
                  <input
                    required
                    maxLength={100}
                    autoComplete="name"
                    className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              )}
              <label className="grid gap-2 text-sm font-medium">
                ایمیل
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                گذرواژه
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={
                    mode === "sign-up" ? "new-password" : "current-password"
                  }
                  className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={busy} type="submit">
                  {mode === "sign-up" ? "ثبت‌نام" : "ورود"}
                </Button>
                <button
                  type="button"
                  className="text-sm text-primary underline underline-offset-4"
                  onClick={() =>
                    setMode((current) =>
                      current === "sign-up" ? "sign-in" : "sign-up"
                    )
                  }
                >
                  {mode === "sign-up" ? "حساب دارم" : "حساب ندارم"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
        {status && (
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
        )}
      </main>
    )

  const activeShop = shops.find((shop) => shop.shopId === selectedShop)
  const offers = offersByShop[selectedShop ?? ""] ?? []
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-8"
      dir="rtl"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">پروفایل فروشگاه‌ها</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            مدیریت فروشگاه اختیاری است؛ ادعا و منابع جدید را مدیر تأیید می‌کند.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await authClient.signOut()
            setStatus("از حساب خارج شدید.")
          }}
        >
          خروج
        </Button>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>درخواست دسترسی به فروشگاه</CardTitle>
          <CardDescription>
            این مسیر اختیاری است. مدیر پس از بررسی مدرک مالکیت، دسترسی را فعال
            می‌کند.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="flex gap-2" onSubmit={searchShops}>
            <input
              className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="نام فروشگاه، نشانی یا محله"
            />
            <Button type="submit">جست‌وجو</Button>
          </form>
          {claimable.length > 0 && (
            <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs">
                لینک مدرک عمومی اختیاری
                <input
                  type="url"
                  value={claimEvidenceUrl}
                  onChange={(event) => setClaimEvidenceUrl(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                  placeholder="https://..."
                />
              </label>
              <label className="grid gap-1 text-xs">
                توضیح برای مدیر
                <textarea
                  value={claimMessage}
                  onChange={(event) => setClaimMessage(event.target.value)}
                  maxLength={1000}
                  className="min-h-9 rounded-lg border border-input bg-background px-2 py-1 text-sm"
                />
              </label>
            </div>
          )}
          {claimable.map((shop) => (
            <div
              key={shop.shopId}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3"
            >
              <div>
                <p className="font-semibold">{shop.name ?? "فروشگاه"}</p>
                <p className="text-xs text-muted-foreground">
                  {shop.address ?? shop.locationLabel ?? shop.shopId}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void submitClaim(shop.shopId)}
              >
                درخواست مدیریت
              </Button>
            </div>
          ))}
          {claims.length > 0 && (
            <div className="grid gap-2 border-t border-border/70 pt-3">
              <h3 className="text-sm font-semibold">درخواست‌های من</h3>
              {claims.map((claim) => (
                <p key={claim.id} className="text-xs text-muted-foreground">
                  {claim.shopName}:{" "}
                  {claim.status === "pending"
                    ? "در انتظار بررسی"
                    : claim.status === "approved"
                      ? "تأیید شد"
                      : `رد شد${claim.reviewNote ? ` · ${claim.reviewNote}` : ""}`}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {shops.length > 0 && (
        <>
          <label className="grid max-w-sm gap-2 text-sm font-medium">
            فروشگاه فعال
            <select
              className="h-10 rounded-lg border border-input bg-background px-3"
              value={selectedShop ?? ""}
              onChange={(event) => setSelectedShop(event.target.value)}
            >
              {shops.map((shop) => (
                <option key={shop.shopId} value={shop.shopId}>
                  {shop.name ?? shop.shopId}
                </option>
              ))}
            </select>
          </label>
          {activeShop && <ShopSourceSetup shopId={activeShop.shopId} />}
          {activeShop && (
            <Card>
              <CardHeader>
                <CardTitle>اطلاعات فروشگاه</CardTitle>
                <CardDescription>
                  ساعت کاری پس از ۷ روز نیازمند تأیید دوباره است.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={submitShopDetails}>
                  <label className="grid gap-2 text-sm font-medium">
                    نشانی وب‌سایت
                    <input
                      name="websiteUrl"
                      type="url"
                      defaultValue={activeShop.websiteUrl ?? ""}
                      className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
                      placeholder="https://example.com"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    منطقه زمانی IANA
                    <input
                      name="timeZone"
                      defaultValue={activeShop.timeZone || "Asia/Tehran"}
                      className="h-10 rounded-lg border border-input bg-background px-3 font-normal"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    ساعت کاری JSON
                    <textarea
                      name="weeklyHours"
                      defaultValue={JSON.stringify(
                        activeShop.weeklyHours ?? {},
                        null,
                        2
                      )}
                      className="min-h-32 rounded-lg border border-input bg-background p-3 font-mono text-xs"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    راه‌های تماس JSON
                    <textarea
                      name="contacts"
                      defaultValue={JSON.stringify(
                        activeShop.contacts ?? [],
                        null,
                        2
                      )}
                      className="min-h-24 rounded-lg border border-input bg-background p-3 font-mono text-xs"
                    />
                  </label>
                  <div>
                    <Button type="submit">ذخیره اطلاعات فروشگاه</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          {activeShop && (
            <Card>
              <CardHeader>
                <CardTitle>قیمت و موجودی</CardTitle>
                <CardDescription>
                  هر تغییر با زمان و نام حساب فروشنده در تاریخچه ثبت می‌شود.
                  قیمت تا ۲۴ ساعت و موجودی تا ۳۰ دقیقه معتبر است.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {offers.map((offer) => (
                  <OfferEditor
                    key={offer.offerId}
                    offer={offer}
                    shopId={activeShop.shopId}
                    onSave={updateOffer}
                  />
                ))}
                {offers.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    برای این فروشگاه کالایی در فهرست نیست.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {activeShop && <ShopProductSubmission shopId={activeShop.shopId} />}
        </>
      )}
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
    </main>
  )
}

function ShopSourceSetup({ shopId }: { shopId: string }) {
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function requestWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const response = await fetch("/api/merchant/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shopId, url: url.trim() }),
    })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) setStatus(body.error ?? "درخواست منبع ثبت نشد.")
    else {
      setUrl("")
      setStatus("درخواست منبع برای بررسی مدیر ارسال شد.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>منابع عمومی اختیاری</CardTitle>
        <CardDescription>
          این اتصال برای به‌روزرسانی عمومی و کمکی است؛ قیمت و موجودی را تأیید
          نمی‌کند. مدیر درخواست وب‌سایت را بررسی می‌کند.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form className="flex flex-wrap gap-2" onSubmit={requestWebsite}>
          <label className="sr-only" htmlFor="merchant-source-url">
            نشانی وب‌سایت رسمی
          </label>
          <input
            id="merchant-source-url"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
            placeholder="https://example.com"
          />
          <Button type="submit" disabled={busy}>
            درخواست بررسی وب‌سایت
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            window.location.assign(
              `/api/merchant/instagram/connect?shopId=${encodeURIComponent(shopId)}`
            )
          }
        >
          اتصال حرفه‌ای Instagram برای خواندن پست‌های عمومی
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          اتصال اینستاگرام فقط برای حساب حرفه‌ای انجام می‌شود و دریافت یا ارسال
          خودکار پیام را فعال نمی‌کند.
        </p>
        {status && (
          <p role="status" className="text-xs text-muted-foreground">
            {status}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ShopProductSubmission({ shopId }: { shopId: string }) {
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const price = String(form.get("priceToman") ?? "").trim()
    setBusy(true)
    const response = await fetch("/api/merchant/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shopId,
        title: String(form.get("title") ?? "").trim(),
        ...(String(form.get("brandName") ?? "").trim()
          ? { brandName: String(form.get("brandName")).trim() }
          : {}),
        ...(String(form.get("model") ?? "").trim()
          ? { model: String(form.get("model")).trim() }
          : {}),
        ...(String(form.get("categoryName") ?? "").trim()
          ? { categoryName: String(form.get("categoryName")).trim() }
          : {}),
        ...(price ? { priceToman: Number(price) } : {}),
        stockStatus: String(form.get("stockStatus") ?? "unknown"),
      }),
    })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) setStatus(body.error ?? "پیشنهاد کالا ثبت نشد.")
    else {
      formElement.reset()
      setStatus("کالا برای بررسی مدیر ارسال شد.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>پیشنهاد کالای جدید</CardTitle>
        <CardDescription>
          کالایی که در فهرست نیست برای بررسی و تطبیق مدیر فرستاده می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <label className="grid gap-1 text-sm">
            نام کالا
            <input
              name="title"
              required
              minLength={2}
              maxLength={200}
              className="h-10 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            برند
            <input
              name="brandName"
              maxLength={100}
              className="h-10 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            مدل
            <input
              name="model"
              maxLength={100}
              className="h-10 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            دسته‌بندی
            <input
              name="categoryName"
              maxLength={120}
              className="h-10 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            قیمت تومان
            <input
              name="priceToman"
              type="number"
              min={1}
              step={1}
              className="h-10 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            موجودی
            <select
              name="stockStatus"
              className="h-10 rounded-lg border border-input bg-background px-3"
            >
              <option value="unknown">نامشخص</option>
              <option value="in_stock">موجود</option>
              <option value="out_of_stock">ناموجود</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={busy}>
              ارسال برای بررسی
            </Button>
            {status && (
              <p role="status" className="text-xs text-muted-foreground">
                {status}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function OfferEditor({
  offer,
  shopId,
  onSave,
}: {
  offer: Offer
  shopId: string
  onSave: (
    offer: Offer,
    shopId: string,
    price: string,
    stockStatus: string
  ) => void
}) {
  const [price, setPrice] = useState(offer.priceToman ?? "")
  const [stock, setStock] = useState(offer.stockStatus ?? "unknown")
  return (
    <form
      className="grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-[1fr_150px_170px_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(offer, shopId, price, stock)
      }}
    >
      <div>
        <p className="font-semibold">{offer.title ?? "کالا"}</p>
        <p className="text-xs text-muted-foreground">{offer.brandName ?? ""}</p>
      </div>
      <label className="grid gap-1 text-xs font-medium">
        قیمت تومان
        <input
          type="number"
          min={1}
          step={1}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        موجودی
        <select
          value={stock}
          onChange={(event) => setStock(event.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2"
        >
          <option value="unknown">نامشخص</option>
          <option value="in_stock">موجود</option>
          <option value="out_of_stock">ناموجود</option>
        </select>
      </label>
      <Button size="sm" type="submit">
        ثبت تأیید
      </Button>
    </form>
  )
}
