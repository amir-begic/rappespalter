import { NextResponse, type NextRequest } from "next/server"

// The server listens on 127.0.0.1, but any web page open in the user's browser can
// still send requests there: a cross-site form post (e.g. to /api/backup/restore),
// or a DNS-rebinding page that reads /api/backup. So every request must
//   1. name a loopback host (DNS rebinding sends the attacker's host name),
//   2. not come from another site (Sec-Fetch-Site / Origin), and
//   3. in the desktop app, carry the token main.js made at startup. Its window adds
//      the header to its own requests; nothing else knows the token.
// `pnpm dev` has no token and relies on 1 and 2.

const TOKEN_HEADER = "x-rappespalter-token"

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"]

function allowedHosts(): Set<string> {
  const extra = (process.env.RAPPESPALTER_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...LOOPBACK, ...extra])
}

function hostname(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "")
}

export function rejectReason(headers: Headers, token = process.env.RAPPESPALTER_TOKEN): string | null {
  const host = headers.get("host") ?? ""
  if (!allowedHosts().has(hostname(host))) return "host"

  // "same-site" too: other ports on localhost count as the same site.
  const site = headers.get("sec-fetch-site")
  if (site === "cross-site" || site === "same-site") return "site"

  const origin = headers.get("origin")
  if (origin) {
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {
      /* "null" and other opaque origins */
    }
    if (originHost?.toLowerCase() !== host.toLowerCase()) return "origin"
  }

  if (token && headers.get(TOKEN_HEADER) !== token) return "token"
  return null
}

export function proxy(request: NextRequest) {
  if (rejectReason(request.headers)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static).*)"],
}
