import Link from "next/link"
import { KeyRound } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export default function AdminSetupPage() {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-5 px-4 py-8 sm:px-8"
      dir="rtl"
    >
      <header className="flex items-start gap-3">
        <KeyRound className="mt-1 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">راه‌اندازی مدیر سامانه</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هنوز حساب مدیری برای این نصب تعریف نشده است.
          </p>
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>ساخت امن حساب مدیر</CardTitle>
          <CardDescription>
            دسترسی مدیر از تنظیمات سرور تعیین می‌شود تا هیچ بازدیدکننده‌ای
            نتواند خودش را مدیر کند.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm leading-7">
          <ol className="list-decimal space-y-2 pe-5">
            <li>
              در محیط سرور مقدار <code dir="ltr">SYSTEM_ADMIN_EMAILS</code> را
              با ایمیل مدیر سامانه تنظیم کنید. در توسعه محلی، این مقدار در فایل{" "}
              <code dir="ltr">apps/web/.env.local</code> قرار می‌گیرد.
            </li>
            <li>
              مطمئن شوید <code dir="ltr">BETTER_AUTH_SECRET</code>،{" "}
              <code dir="ltr">SMTP_FROM</code>، روش ارسال ایمیل در{" "}
              <code dir="ltr">EMAIL_PROVIDER</code> و اعتبار همان روش تنظیم شده
              است (<code dir="ltr">SMTP_URL</code> برای SMTP یا{" "}
              <code dir="ltr">RESEND_API_KEY</code> برای Resend)، همچنین کلید{" "}
              <code dir="ltr">SETTINGS_ENCRYPTION_KEY</code> را تنظیم کنید؛ سپس
              برنامه را راه‌اندازی مجدد کنید.
            </li>
            <li>
              با همان ایمیل مجازشده در مسیر ساخت حساب ثبت‌نام و ایمیل را تأیید
              کنید، سپس از صفحه ورود مدیر سامانه وارد شوید.
            </li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link href="/merchant" />}>
              ساخت حساب مدیر سامانه
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/admin/login" />}
              variant="outline"
            >
              ورود مدیر سامانه
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
