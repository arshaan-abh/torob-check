import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

const sections = [
  {
    href: "/admin/review",
    title: "بررسی درخواست‌ها",
    description: "تأیید ادعای فروشگاه، منبع عمومی و کالای جدید",
  },
  {
    href: "/admin/settings",
    title: "تنظیمات یکپارچه‌سازی",
    description: "تنظیم امن مدل هوش مصنوعی، Tavily، اینستاگرام و ایمیل",
  },
]

export default function AdminPage() {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-8"
      dir="rtl"
    >
      <header>
        <h1 className="text-2xl font-bold">مدیریت ترب‌چک</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          صف بررسی داده‌ها و تنظیمات سرویس‌ها
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">
                  باز کردن ←
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  )
}
