"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { KeyRound, LogIn } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { authClient } from "@/lib/auth-client"

function getSafeReturnTo() {
  const candidate = new URLSearchParams(window.location.search).get("returnTo")
  if (!candidate?.startsWith("/") || candidate.startsWith("//"))
    return "/admin/settings"

  try {
    const destination = new URL(candidate, window.location.origin)
    if (destination.origin !== window.location.origin) return "/admin/settings"
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return "/admin/settings"
  }
}

export function AdminLoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setStatus("")
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      })
      if (result.error) {
        setStatus(result.error.message ?? "ورود انجام نشد.")
        return
      }

      const access = await fetch("/api/admin/settings", { cache: "no-store" })
      const body = (await access.json().catch(() => ({}))) as {
        setupRequired?: boolean
        error?: string
      }
      if (access.ok) {
        window.location.replace(getSafeReturnTo())
      } else if (access.status === 503 && body.setupRequired) {
        window.location.replace("/admin/setup")
      } else if (access.status === 403) {
        setStatus(
          "این حساب مدیر سامانه نیست. اگر هنوز مدیری ندارید، نخستین حساب را بسازید؛ یا با یکی از ایمیل‌های SYSTEM_ADMIN_EMAILS ثبت‌نام کنید."
        )
      } else if (access.status === 401) {
        setStatus("ابتدا ایمیل این حساب را تأیید کنید، سپس دوباره وارد شوید.")
      } else {
        setStatus(body.error ?? "دسترسی مدیر بررسی نشد. دوباره تلاش کنید.")
      }
    } catch {
      setStatus("ورود انجام نشد. اتصال را بررسی و دوباره تلاش کنید.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-5 px-4 py-8 sm:px-8"
      dir="rtl"
    >
      <header className="flex items-start gap-3">
        <KeyRound className="mt-1 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">ورود مدیر سامانه</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            برای تغییر تنظیمات سرویس‌ها با حساب مدیر وارد شوید.
          </p>
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>حساب مدیر سامانه</CardTitle>
          <CardDescription>
            نخستین حساب هنگام نبود مدیر، مدیر سامانه می‌شود. ایمیل‌های مجاز در
            SYSTEM_ADMIN_EMAILS نیز دسترسی دارند.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <label className="grid gap-2 text-sm font-medium">
              ایمیل
              <input
                required
                type="email"
                autoComplete="username"
                className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              گذرواژه
              <input
                required
                type="password"
                autoComplete="current-password"
                className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {status && (
              <p role="status" className="text-sm text-muted-foreground">
                {status}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              <LogIn aria-hidden="true" className="size-4" />
              ورود
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            هنوز حسابی نساخته‌اید؟ از مسیر ساخت حساب استفاده کنید. اگر مدیری در
            سیستم نباشد، نخستین ثبت‌نام دسترسی مدیر می‌گیرد؛ ایمیل‌دهی برای ورود
            نخستین مدیر لازم نیست.{" "}
            <Link
              className="text-primary underline underline-offset-4"
              href="/admin/setup"
            >
              ساخت حساب
            </Link>{" "}
            استفاده کنید.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
