"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, RotateCcw, Save, Trash2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

type AiProvider = "gateway" | "google" | "openrouter" | "openai-compatible"
type EmailProvider = "smtp" | "resend"
type AccessState = "checking" | "authorized" | "forbidden" | "error"

type SettingValues = {
  aiProvider: AiProvider
  emailProvider: EmailProvider
  aiModel: string
  openrouterBaseUrl: string
  compatibleBaseUrl: string
  instagramAppId: string
  instagramApiVersion: string
  smtpFrom: string
}
type SecretStatus = Record<string, { configured: boolean }>

const AI_PROVIDER_OPTIONS: Array<{ value: AiProvider; label: string }> = [
  { value: "gateway", label: "Vercel AI Gateway" },
  { value: "google", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai-compatible", label: "OpenAI compatible" },
]
const AI_PROVIDER_LABELS = Object.fromEntries(
  AI_PROVIDER_OPTIONS.map(({ value, label }) => [value, label])
) as Record<AiProvider, string>
const EMAIL_PROVIDER_OPTIONS: Array<{ value: EmailProvider; label: string }> = [
  { value: "smtp", label: "SMTP" },
  { value: "resend", label: "Resend" },
]
const EMAIL_PROVIDER_LABELS = Object.fromEntries(
  EMAIL_PROVIDER_OPTIONS.map(({ value, label }) => [value, label])
) as Record<EmailProvider, string>

const LABELS: Record<string, string> = {
  aiGatewayApiKey: "AI Gateway key",
  googleApiKey: "Google AI key",
  openrouterApiKey: "OpenRouter key",
  compatibleApiKey: "OpenAI compatible API key",
  tavilyApiKey: "Tavily API key",
  instagramAppSecret: "Instagram app secret",
  smtpUrl: "SMTP connection URL",
  resendApiKey: "Resend API key",
}

function isAiProvider(value: unknown): value is AiProvider {
  return AI_PROVIDER_OPTIONS.some((provider) => provider.value === value)
}

export function AdminSettingsForm() {
  const router = useRouter()
  const [values, setValues] = useState<SettingValues>({
    aiProvider: "gateway",
    emailProvider: "smtp",
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
  const [status, setStatus] = useState("در حال بررسی دسترسی مدیر")
  const [accessState, setAccessState] = useState<AccessState>("checking")
  const [busy, setBusy] = useState(false)

  const redirectForAccess = useCallback(
    (response: Response, body: Record<string, unknown>) => {
      if (response.status === 503 && body.setupRequired === true) {
        router.replace("/admin/setup")
        return true
      }
      if (response.status === 401) {
        router.replace("/admin/login?returnTo=%2Fadmin%2Fsettings")
        return true
      }
      if (
        response.status === 403 &&
        body.error === "System administrator access required."
      ) {
        setAccessState("forbidden")
        setStatus("این حساب دسترسی مدیر سامانه ندارد.")
        return true
      }
      return false
    },
    [router]
  )

  const load = useCallback(async () => {
    setAccessState("checking")
    setStatus("در حال بارگذاری تنظیمات")
    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      if (!response.ok) {
        if (!redirectForAccess(response, body)) {
          setAccessState("error")
          setStatus(
            typeof body.error === "string"
              ? body.error
              : "دسترسی به تنظیمات ممکن نیست. دوباره تلاش کنید."
          )
        }
        return
      }

      const data = body.settings as Record<string, unknown>
      setValues({
        aiProvider: isAiProvider(data.aiProvider) ? data.aiProvider : "gateway",
        emailProvider: data.emailProvider === "resend" ? "resend" : "smtp",
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
      setAccessState("authorized")
      setStatus(
        body.encryptionReady
          ? "کلیدها در پایگاه داده به‌صورت رمزگذاری‌شده ذخیره می‌شوند."
          : "برای ذخیره کلیدها، SETTINGS_ENCRYPTION_KEY را روی سرور تنظیم کنید."
      )
    } catch {
      setAccessState("error")
      setStatus("تنظیمات بارگذاری نشد. اتصال را بررسی و دوباره تلاش کنید.")
    }
  }, [redirectForAccess])

  useEffect(() => {
    void load()
  }, [load])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setStatus("در حال ذخیره تنظیمات")
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: { ...values, ...secrets },
          clearSecrets,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      if (!response.ok) {
        if (!redirectForAccess(response, body))
          setStatus(
            typeof body.error === "string"
              ? body.error
              : "ذخیره تنظیمات انجام نشد."
          )
        return
      }
      setSecrets({})
      setClearSecrets([])
      await load()
      setStatus("تنظیمات ذخیره شد.")
    } catch {
      setStatus("ذخیره تنظیمات انجام نشد. اتصال را بررسی کنید.")
    } finally {
      setBusy(false)
    }
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
    const configured = secretStatus[key]?.configured ?? false
    const pendingClear = clearSecrets.includes(key)

    return (
      <div className="grid gap-2 text-sm font-medium" key={key}>
        <label htmlFor={`setting-${key}`}>{LABELS[key]}</label>
        <InputGroup className="h-10 bg-background">
          <InputGroupInput
            id={`setting-${key}`}
            type="password"
            autoComplete="new-password"
            className="h-full px-3 text-sm"
            value={secrets[key] ?? ""}
            placeholder={
              configured
                ? "برای حفظ کلید ذخیره‌شده خالی بگذارید"
                : "کلید را وارد کنید"
            }
            onChange={(event) => {
              setSecrets((current) => ({
                ...current,
                [key]: event.target.value,
              }))
              setClearSecrets((current) =>
                current.filter((item) => item !== key)
              )
            }}
          />
          <InputGroupAddon align="inline-end" className="py-0">
            <InputGroupButton
              aria-label={pendingClear ? "لغو حذف کلید" : "حذف کلید ذخیره‌شده"}
              title={pendingClear ? "لغو حذف" : "حذف کلید ذخیره‌شده"}
              disabled={!pendingClear && !configured && !secrets[key]}
              variant={pendingClear ? "destructive" : "ghost"}
              size="icon-xs"
              onClick={() => {
                if (pendingClear) {
                  setClearSecrets((current) =>
                    current.filter((item) => item !== key)
                  )
                  return
                }
                if (configured) {
                  setClearSecrets((current) => [...current, key])
                }
                setSecrets((current) => ({ ...current, [key]: "" }))
              }}
            >
              {pendingClear ? (
                <RotateCcw aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${configured && !pendingClear ? "bg-emerald-600" : "bg-muted-foreground/40"}`}
          />
          {pendingClear
            ? "پس از ذخیره حذف می‌شود"
            : configured
              ? "تنظیم شده"
              : "تنظیم نشده"}
        </span>
      </div>
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
            کلیدهای مدل، پژوهش وب، اینستاگرام و ایمیل فقط برای مدیران سامانه
            نمایش داده می‌شود و کلیدهای محرمانه رمزگذاری می‌شوند.
          </p>
        </div>
      </header>

      {accessState === "checking" ? (
        <Card>
          <CardContent
            className="py-6 text-sm text-muted-foreground"
            role="status"
          >
            {status}
          </CardContent>
        </Card>
      ) : accessState === "forbidden" ? (
        <Card>
          <CardHeader>
            <CardTitle>دسترسی مدیر سامانه لازم است</CardTitle>
            <CardDescription>
              با حسابی وارد شوید که ایمیل آن در تنظیمات سرور به‌عنوان مدیر
              سامانه ثبت شده است.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              onClick={() =>
                router.push("/admin/login?returnTo=%2Fadmin%2Fsettings")
              }
            >
              ورود مدیر سامانه
            </Button>
          </CardContent>
        </Card>
      ) : accessState === "error" ? (
        <Card>
          <CardHeader>
            <CardTitle>تنظیمات در دسترس نیست</CardTitle>
            <CardDescription role="status">{status}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={() => void load()}>
              تلاش دوباره
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form className="grid gap-5" onSubmit={save}>
          <Card>
            <CardHeader>
              <CardTitle>دستیار هوش مصنوعی</CardTitle>
              <CardDescription>
                مدل انتخابی باید از ابزارها و پاسخ جریانی پشتیبانی کند.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 text-sm font-medium">
                <span id="ai-provider-label">ارائه‌دهنده</span>
                <Select
                  items={AI_PROVIDER_OPTIONS}
                  value={values.aiProvider}
                  onValueChange={(value) => {
                    if (isAiProvider(value))
                      setValues((current) => ({
                        ...current,
                        aiProvider: value,
                      }))
                  }}
                >
                  <SelectTrigger
                    aria-labelledby="ai-provider-label"
                    className="h-10 w-full bg-background"
                  >
                    <SelectValue>
                      {(value: string | null) =>
                        value && isAiProvider(value)
                          ? AI_PROVIDER_LABELS[value]
                          : "انتخاب ارائه‌دهنده"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {AI_PROVIDER_OPTIONS.map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {field("aiModel", "شناسه مدل", "provider/model")}
              {values.aiProvider === "gateway" &&
                secretField("aiGatewayApiKey")}
              {values.aiProvider === "google" && secretField("googleApiKey")}
              {values.aiProvider === "openrouter" && (
                <>
                  {secretField("openrouterApiKey")}
                  {field(
                    "openrouterBaseUrl",
                    "نشانی OpenRouter",
                    "https://openrouter.ai/api/v1"
                  )}
                </>
              )}
              {values.aiProvider === "openai-compatible" && (
                <>
                  {secretField("compatibleApiKey")}
                  {field(
                    "compatibleBaseUrl",
                    "نشانی سرویس سازگار",
                    "https://api.example.com/v1"
                  )}
                </>
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
                برای تأیید ایمیل و بازیابی گذرواژه استفاده می‌شود. بین SMTP و
                Resend جابه‌جا شوید؛ کلیدهای هر دو روش جداگانه و رمزگذاری‌شده
                ذخیره می‌شوند.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 text-sm font-medium">
                <span id="email-provider-label">روش ارسال ایمیل</span>
                <Select
                  items={EMAIL_PROVIDER_OPTIONS}
                  value={values.emailProvider}
                  onValueChange={(value) => {
                    if (value === "smtp" || value === "resend")
                      setValues((current) => ({
                        ...current,
                        emailProvider: value,
                      }))
                  }}
                >
                  <SelectTrigger
                    aria-labelledby="email-provider-label"
                    className="h-10 w-full bg-background"
                  >
                    <SelectValue>
                      {(value: string | null) =>
                        value === "smtp" || value === "resend"
                          ? EMAIL_PROVIDER_LABELS[value]
                          : "انتخاب روش ارسال"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {EMAIL_PROVIDER_OPTIONS.map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {values.emailProvider === "smtp" ? (
                secretField("smtpUrl")
              ) : (
                <div className="grid gap-2">
                  {secretField("resendApiKey")}
                  <p className="text-xs leading-5 text-muted-foreground">
                    آدرس فرستنده باید از دامنه‌ای باشد که در Resend تأیید
                    کرده‌اید.
                  </p>
                </div>
              )}
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
      )}
    </main>
  )
}
