"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { KeyRound, LogIn, UserPlus } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { authClient } from "@/lib/auth-client"

export default function AdminSetupPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState("")
  const [created, setCreated] = useState(false)
  const [busy, setBusy] = useState(false)

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setStatus("")
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      })
      if (result.error) {
        setStatus(result.error.message ?? "ساخت حساب انجام نشد.")
        return
      }
      setCreated(true)
      setStatus(
        "حساب ساخته شد. اگر مدیر سامانه‌ای وجود نداشته باشد، این نخستین حساب مدیر می‌شود. ایمیل‌های SYSTEM_ADMIN_EMAILS نیز دسترسی مدیر دارند."
      )
    } catch {
      setStatus("ساخت حساب انجام نشد. اتصال را بررسی و دوباره تلاش کنید.")
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
          <h1 className="text-2xl font-bold">راه‌اندازی مدیر سامانه</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            اولین حساب ثبت‌شده، در نبود مدیر سامانه، مدیر می‌شود. ایمیل‌های
            <code dir="ltr">SYSTEM_ADMIN_EMAILS</code> نیز دسترسی مدیر دارند.
          </p>
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{created ? "حساب آماده است" : "ساخت حساب مدیر"}</CardTitle>
          <CardDescription>
            تنظیم SMTP، Resend و کلیدهای ایمیل برای ورود نخستین مدیر لازم نیست.
            حساب‌های فروشنده برای مدیریت فروشگاه همچنان به ایمیل تأییدشده نیاز
            دارند.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {created ? (
            <div className="grid gap-4">
              <p
                role="status"
                className="text-sm leading-6 text-muted-foreground"
              >
                {status}
              </p>
              <Button
                nativeButton={false}
                render={<Link href="/admin/login" />}
              >
                <LogIn aria-hidden="true" data-icon="inline-start" />
                ورود مدیر سامانه
              </Button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={createAccount}>
              <label className="grid gap-2 text-sm font-medium">
                نام
                <input
                  required
                  maxLength={100}
                  autoComplete="name"
                  className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                ایمیل
                <input
                  required
                  type="email"
                  autoComplete="email"
                  className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                گذرواژه
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  className="h-10 rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {status && (
                <p role="alert" className="text-sm text-destructive">
                  {status}
                </p>
              )}
              <Button type="submit" disabled={busy}>
                <UserPlus aria-hidden="true" data-icon="inline-start" />
                {busy ? "در حال ساخت حساب" : "ساخت حساب مدیر"}
              </Button>
              <p className="text-sm text-muted-foreground">
                اگر <code dir="ltr">SYSTEM_ADMIN_EMAILS</code> تنظیم شده، با یکی
                از ایمیل‌های همان فهرست ثبت‌نام کنید.{" "}
                <Link
                  className="text-primary underline underline-offset-4"
                  href="/admin/login"
                >
                  ورود به حساب موجود
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
