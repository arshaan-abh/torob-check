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
    let accountCreated = false
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
      accountCreated = true
      setCreated(true)

      // The bootstrap admin is marked verified by the user-create hook, so it
      // can sign in right away even when no email provider has been configured.
      const signIn = await authClient.signIn.email({
        email: email.trim(),
        password,
      })
      if (signIn.error) {
        setStatus(
          "حساب ساخته شد. اگر این حساب اولین مدیر نیست، برای ورود باید ایمیلش تأیید شود."
        )
        return
      }

      const access = await fetch("/api/admin/settings", { cache: "no-store" })
      if (access.ok) {
        window.location.replace("/admin/settings")
        return
      }

      setStatus(
        "حساب ساخته شد، اما دسترسی مدیر برای آن فعال نیست. با ایمیل مدیر سامانه ثبت‌نام کنید یا از مدیر فعلی کمک بگیرید."
      )
    } catch {
      setStatus(
        accountCreated
          ? "حساب ساخته شد. اکنون می‌توانید وارد شوید؛ اگر ورود انجام نشد، ایمیل این حساب باید تأیید شود."
          : "ساخت حساب انجام نشد. اتصال را بررسی و دوباره تلاش کنید."
      )
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
            اگر هنوز حساب مدیر سامانه‌ای در سیستم نباشد، اولین حسابی که می‌سازید
            مدیر می‌شود. ایمیل‌های
            <code dir="ltr">SYSTEM_ADMIN_EMAILS</code> هم دسترسی مدیر دارند.
          </p>
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{created ? "حساب آماده است" : "ساخت حساب مدیر"}</CardTitle>
          <CardDescription>
            برای ساخت و ورود نخستین مدیر، تنظیم ایمیل لازم نیست. فروشندگان برای
            مدیریت فروشگاه باید ایمیلشان را تأیید کنند؛ ایمیل را می‌توانید بعداً
            از تنظیمات فعال کنید.
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
                ایمیل‌های فهرست <code dir="ltr">SYSTEM_ADMIN_EMAILS</code> نیز
                دسترسی مدیر دارند.{" "}
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
