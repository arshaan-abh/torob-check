"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

type Claim = {
  id: string
  name: string
  email: string
  shopId: string
  shopName: string | null
  address: string | null
  evidenceUrl: string | null
  message: string | null
  createdAt: string
}
type Source = {
  id: string
  shopId: string
  shopName: string | null
  type: string
  url: string
  createdAt: string
}
type Submission = {
  id: string
  shopId: string
  shopName: string | null
  title: string
  brandName: string | null
  model: string | null
  categoryName: string | null
  priceToman: string | null
  stockStatus: string
}

export function AdminReview() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [shopId, setShopId] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [status, setStatus] = useState("در حال بارگذاری صف بررسی…")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [claimResponse, sourceResponse, submissionResponse] =
      await Promise.all([
        fetch("/api/admin/merchant-claims?status=pending", {
          cache: "no-store",
        }),
        fetch("/api/admin/shop-sources", { cache: "no-store" }),
        fetch("/api/admin/product-submissions", { cache: "no-store" }),
      ])
    const [claimBody, sourceBody, submissionBody] = await Promise.all([
      claimResponse.json(),
      sourceResponse.json(),
      submissionResponse.json(),
    ])
    if (!claimResponse.ok || !sourceResponse.ok || !submissionResponse.ok) {
      setStatus(
        claimBody.error ??
          sourceBody.error ??
          submissionBody.error ??
          "صف بررسی در دسترس نیست."
      )
      return
    }
    setClaims(claimBody.claims ?? [])
    setSources(sourceBody.sources ?? [])
    setSubmissions(submissionBody.submissions ?? [])
    setStatus("")
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(url: string, payload: Record<string, string>) {
    setBusy(true)
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) setStatus(body.error ?? "تصمیم ذخیره نشد.")
    else {
      setStatus("تصمیم ذخیره شد.")
      await load()
    }
  }

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const response = await fetch("/api/admin/shop-sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shopId: shopId.trim(), url: sourceUrl.trim() }),
    })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) setStatus(body.error ?? "منبع ذخیره نشد.")
    else {
      setSourceUrl("")
      setStatus(
        "منبع عمومی با وضعیت تأییدنشده برای داده‌های استخراج‌شده ثبت شد."
      )
      await load()
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-8"
      dir="rtl"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">بررسی داده‌ها</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            داده عمومی حتی پس از تأیید منبع، تأیید موجودی یا قیمت محسوب نمی‌شود.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          بازخوانی
        </Button>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>ادعای فروشگاه</CardTitle>
          <CardDescription>
            دسترسی فروشنده تنها پس از تأیید مدیر فعال می‌شود.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {claims.map((claim) => (
            <article
              key={claim.id}
              className="grid gap-2 border-t border-border/70 pt-3"
            >
              <div>
                <h2 className="font-semibold">
                  {claim.shopName ?? claim.shopId}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {claim.name} · {claim.email} · {claim.address ?? claim.shopId}
                </p>
                {claim.message && (
                  <p className="mt-1 text-sm">{claim.message}</p>
                )}
                {claim.evidenceUrl && (
                  <a
                    className="text-xs text-primary underline"
                    href={claim.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    مدرک ارائه‌شده
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void decide("/api/admin/merchant-claims", {
                      id: claim.id,
                      decision: "approved",
                    })
                  }
                >
                  تأیید ادعا
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void decide("/api/admin/merchant-claims", {
                      id: claim.id,
                      decision: "rejected",
                    })
                  }
                >
                  رد
                </Button>
              </div>
            </article>
          ))}
          {claims.length === 0 && (
            <p className="text-sm text-muted-foreground">
              درخواستی در صف نیست.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>منابع عمومی فروشگاه</CardTitle>
          <CardDescription>
            وب‌سایت‌های تأییدشده را برای پژوهش عمومی ثبت کنید؛ یافته‌ها با منبع
            و برچسب تأییدنشده ذخیره می‌شوند. نمایه اینستاگرام فقط پس از اتصال
            حساب حرفه‌ای توسط خود فروشگاه به‌روزرسانی می‌شود.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]"
            onSubmit={createSource}
          >
            <label className="grid gap-1 text-xs">
              شناسه فروشگاه
              <input
                required
                value={shopId}
                onChange={(event) => setShopId(event.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs">
              نشانی وب‌سایت
              <input
                required
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                placeholder="https://example.com"
              />
            </label>
            <Button type="submit" disabled={busy} className="self-end">
              ثبت منبع
            </Button>
          </form>
          {sources.map((source) => (
            <article
              key={source.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3"
            >
              <div>
                <p className="font-semibold">
                  {source.shopName ?? source.shopId}
                </p>
                <a
                  className="text-xs text-primary underline"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.url}
                </a>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void decide("/api/admin/shop-sources", {
                      id: source.id,
                      decision: "active",
                    })
                  }
                >
                  تأیید
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void decide("/api/admin/shop-sources", {
                      id: source.id,
                      decision: "rejected",
                    })
                  }
                >
                  رد
                </Button>
              </div>
            </article>
          ))}
          {sources.length === 0 && (
            <p className="text-sm text-muted-foreground">منبعی در صف نیست.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>کالاهای پیشنهادی</CardTitle>
          <CardDescription>
            تأیید، کالا و پیشنهاد فروشگاهی را به کاتالوگ حضوری اضافه می‌کند.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {submissions.map((submission) => (
            <article
              key={submission.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3"
            >
              <div>
                <h2 className="font-semibold">{submission.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {submission.shopName ?? submission.shopId}
                  {submission.brandName ? ` · ${submission.brandName}` : ""}
                  {submission.priceToman
                    ? ` · ${new Intl.NumberFormat("fa-IR").format(Number(submission.priceToman))} تومان`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void decide("/api/admin/product-submissions", {
                      id: submission.id,
                      decision: "approved",
                    })
                  }
                >
                  تأیید کالا
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void decide("/api/admin/product-submissions", {
                      id: submission.id,
                      decision: "rejected",
                    })
                  }
                >
                  رد
                </Button>
              </div>
            </article>
          ))}
          {submissions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              کالای پیشنهادی در صف نیست.
            </p>
          )}
        </CardContent>
      </Card>
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
    </main>
  )
}
