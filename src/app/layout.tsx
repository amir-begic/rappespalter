import type { Metadata } from "next"
import { connection } from "next/server"
import { Bricolage_Grotesque, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { TopNav } from "@/components/app-nav"
import { Blobs } from "@/components/blobs"
import { loadAppearance } from "@/lib/appearance-store"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-space-grotesk",
})

// Page titles and key figures (globals.css: h1, .font-display). Variable, with the
// optical-size axis so big titles get the chunkier display cut.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  variable: "--font-bricolage",
})

export const metadata: Metadata = {
  title: "Rappespalter",
  description: "Personal finance dashboard",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The saved theme and motion preference (Settings → Appearance) go on <html> as
  // it's rendered, so the first paint is already right. Read per request, never at
  // build time: they live in the user's database.
  await connection()
  const { theme, motion } = await loadAppearance()
  return (
    <html
      lang="en"
      data-theme={theme}
      data-motion={motion}
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${bricolage.variable}`}
    >
      <body className="font-sans antialiased min-h-screen">
        <Blobs />
        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  )
}
