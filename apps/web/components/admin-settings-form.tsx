"use client"

import { useEffect, useState } from "react"
import { KeyRound, Save } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

type SettingValues = {
  aiProvider: string
  aiModel: string
  openrouterBaseUrl: string
  compatibleBaseUrl: string
  instagramAppId: string
  instagramApiVersion: string
  smtpFrom: string
}
type SecretStatus = Record<string, { configured: boolean }>

const LABELS: Record<string, string> = {
  aiGatewayApiKey: "AI Gateway key",
  googleApiKey: "Google AI key",
  openrouterApiKey: "OpenRouter key",
  compatibleApiKey: "OpenAI compatible API key",
  tavilyApiKey: "Tavily API key",
  instagramAppSecret: "Instagram app secret",
  smtpUrl: "SMTP connection URL",
}

export function AdminSettingsForm() {
  const [values, setValues] = useState<SettingValues>({
    aiProvider: "gateway",
    aiModel: "",
    openrouterBaseUrl: "https://openrouter.ai/api/v1",
    compatibleBaseUrl: "",
    instagramAppId: "",
    instagramApiVersion: "v26.0",
    smtpFrom: "",
  })
  const [secretStatus, setSecretStatus] = useState<SecretStatus>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [clearSecrets, setClearSecrets] = useState<string[]>([])
  const [status, setStatus] = useState("در حال بارگذاری تنظیمات")
  const [busy, setBusy] = useState(false)

  async function load() {
    const response = await fetch("/api/admin/settings", { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) {
      setStatus(body.error ?? "دسترسی به تنظیمات ممکن نیست.")
      return
    }
    const data = body.settings as Record<string, unknown>
    setValues({
      aiProvider: String(data.aiProvider ?? "gateway"),
      aiModel: String(data.aiModel ?? ""),
      openrouterBaseUrl: String(
        data.openrouterBaseUrl ?? "https://openrouter.ai/api/v1"
      ),
      compatibleBaseUrl: String(data.compatibleBaseUrl ?? ""),
      instagramAppId: String(data.instagramAppId ?? ""),
      instagramApiVersion: String(data.instagramApiVersion ?? "v26.0"),
      smtpFrom: String(data.smtpFrom ?? ""),
    })
    setSecretStatus(
      Object.fromEntries(
        Object.entries(data)
          .filter(([, value]) => typeof value === "object" && value !== null)
          .map(([key, value]) => [key, value as { configured: boolean }])
      )
    )
    setStatus(
      body.encryptionReady
        ? "کلیدها در پایگاه داده به‌صورت رمزگذاری‌شده ذخیره می‌شوند."
        : "برای ذخیره کلیدها، SETTINGS_ENCRYPTION_KEY را روی سرور تنظیم کنید."
    )
  }

  useEffect(() => {
    void load()
  }, [])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setStatus("در حال ذخیره تنظیمات")
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { ...values, ...secrets }, clearSecrets }),
    })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) {
      setStatus(body.error ?? "ذخیره تنظیمات انجام نشد.")
      return
    }
    setSecrets({})
    setClearSecrets([])
    await load()
    setStatus("تنظیمات ذخیره شد.")
  }

  function field(key: keyof SettingValues, label: string, placeholder = "") {
    return (
      <label className="grid gap-2 text-sm font-medium" key={key}>
        {label}
        <input
          className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={values[key]}
          placeholder={placeholder}
          onChange={(event) =>
            setValues((current) => ({ ...current, [key]: event.target.value }))
          }
        />
      </label>
    )
  }

  function secretField(key: string) {
    const configured = secretStatus[key]?.configured
    return (
      <label className="grid gap-2 text-sm font-medium" key={key}>
        {LABELS[key]}
        <input
          className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="password"
          autoComplete="new-password"
          value={secrets[key] ?? ""}
          placeholder={
            configured
              ? "برای حفظ کلید ذخیره‌شده خالی بگذارید"
              : "کلید را وارد کنید"
          }
          onChange={(event) => {
            setSecrets((current) => ({ ...current, [key]: event.target.value }))
            setClearSecrets((current) => current.filter((item) => item !== key))
          }}
        />
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${configured ? "bg-emerald-600" : "bg-muted-foreground/40"}`}
          />
          {configured ? "تنظیم شده" : "تنظیم نشده"}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() =>
              setClearSecrets((current) =>
                current.includes(key)
                  ? current.filter((item) => item !== key)
                  : [...current, key]
              )
            }
          >
            {clearSecrets.includes(key) ? "لغو پاک‌کردن" : "پاک‌کردن"}
          </button>
        </span>
      </label>
    )
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-5 px-4 py-8 sm:px-8"
      dir="rtl"
    >
      <header className="flex items-start gap-3">
        <KeyRound className="mt-1 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">تنظیمات سرویس‌ها</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            کلیدهای مدل، پژوهش وب، اینستاگرام و ایمیل فقط برای مدیران نمایش داده
            می‌شود و کلیدهای محرمانه رمزگذاری می‌شوند.
          </p>
        </div>
      </header>
      <form className="grid gap-5" onSubmit={save}>
        <Card>
          <CardHeader>
            <CardTitle>دستیار هوش مصنوعی</CardTitle>
            <CardDescription>
              مدل انتخابی باید از ابزارها و پاسخ جریانی پشتیبانی کند.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              ارائه‌دهنده
              <select
                className="h-10 rounded-lg border border-input bg-background px-3"
                value={values.aiProvider}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    aiProvider: event.target.value,
                  }))
                }
              >
                <option value="gateway">Vercel AI Gateway</option>
                <option value="google">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai-compatible">OpenAI compatible</option>
              </select>
            </label>
            {field("aiModel", "شناسه مدل", "provider/model")}
            {secretField("aiGatewayApiKey")}
            {secretField("googleApiKey")}
            {secretField("openrouterApiKey")}
            {field(
              "openrouterBaseUrl",
              "نشانی OpenRouter",
              "https://openrouter.ai/api/v1"
            )}
            {secretField("compatibleApiKey")}
            {field(
              "compatibleBaseUrl",
              "نشانی سرویس سازگار",
              "https://api.example.com/v1"
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>پژوهش منابع فروشگاه</CardTitle>
            <CardDescription>
              نتیجه وب عمومی همیشه با برچسب تأییدنشده نشان داده می‌شود.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {secretField("tavilyApiKey")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Instagram و تأیید لینک حساب</CardTitle>
            <CardDescription>
              اتصال رسمی فقط برای حساب‌های حرفه‌ای مجازشده است. این نسخه پژوهش
              پست‌های عمومی را پشتیبانی می‌کند؛ پیام‌رسانی خودکار با فروشگاه
              فعال نیست و دستیار برای تماس، متن آماده و لینک پروفایل می‌دهد.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {field("instagramAppId", "Instagram App ID")}
            {secretField("instagramAppSecret")}
            {field("instagramApiVersion", "نسخه Graph API", "v26.0")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>ایمیل حساب فروشنده</CardTitle>
            <CardDescription>
              برای تأیید ایمیل و بازیابی گذرواژه استفاده می‌شود.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {secretField("smtpUrl")}
            {field("smtpFrom", "نشانی فرستنده", "no-reply@example.com")}
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
          <Button type="submit" disabled={busy}>
            <Save aria-hidden="true" className="size-4" />
            ذخیره تنظیمات
          </Button>
        </div>
      </form>
    </main>
  )
}
