import type { Metadata } from "next"
import { Noto_Kufi_Arabic } from "next/font/google"
import "./globals.css"

const kufi = Noto_Kufi_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-kufi",
})

export const metadata: Metadata = {
  title: "ANDRO — Free Arabic Subtitles for Stremio",
  description:
    "ANDRO finds the best working Arabic subtitles for anything you watch in Stremio — instantly, with perfect encoding and zero delay. Free and open source.",
  icons: { icon: "/logo.png" },
}

export const viewport = {
  themeColor: "#1a1a1e",
  colorScheme: "dark",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${kufi.variable}`}>
      <body>{children}</body>
    </html>
  )
}
