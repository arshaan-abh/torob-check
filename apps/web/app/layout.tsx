import { Geist, Geist_Mono, Inter } from "next/font/google"

import "@workspace/ui/globals.css"
import "@neshan-maps-platform/maplibre-sdk/style.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TorobCheckProvider } from "@/app/components/torob-check-provider"
import { cn } from "@workspace/ui/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <TorobCheckProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </TorobCheckProvider>
      </body>
    </html>
  )
}
