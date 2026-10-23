import { Vazirmatn, Inter } from "next/font/google"

import "@workspace/ui/globals.css"
import "maplibre-gl/dist/maplibre-gl.css"
import "../components/map-experience.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TorobCheckProvider } from "@/app/components/torob-check-provider"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

const fontInter = Inter({ subsets: ["latin"], variable: "--font-inter" })

const fontVazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
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
        fontVazirmatn.variable,
        "font-sans",
        fontInter.variable
      )}
    >
      <body>
        <TorobCheckProvider>
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </TorobCheckProvider>
      </body>
    </html>
  )
}
