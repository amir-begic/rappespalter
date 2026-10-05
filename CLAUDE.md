# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

# Rappespalter — Personal Finance Dashboard

## Project overview
A local-first personal finance dashboard for tracking monthly spending, savings, and long-term wealth projections.

## Tech stack
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui (Radix)
- **Database**: SQLite via Prisma 7
- **DB adapter**: @prisma/adapter-libsql + @libsql/client
- **Charts**: Recharts
- **Package manager**: pnpm
- **Runtime**: Node.js 22.22.2 on WSL2

## Project structure

```
src/
  app/
    dashboard/page.tsx       — monthly spending overview
    import/page.tsx          — xlsx upload page
    projections/page.tsx     — 15-year wealth forecast
    portfolio/page.tsx       — standalone investment tracker (Yuh CSV + market prices)
    api/
      import/route.ts        — parses and imports Raiffeisen XLSX
      transactions/route.ts  — CRUD + filtering
      snapshots/route.ts     — monthly asset balance history
      summary/route.ts       — aggregated monthly dashboard data
      months/route.ts        — distinct months in the database
      settings/route.ts      — user-editable settings (projection inputs)
      portfolio/             — summary + delete, import, refresh, securities (overrides/manual prices)
    settings/page.tsx        — edit projection inputs (overrides env defaults)
  lib/
    prisma.ts                — shared PrismaClient singleton
    parser.ts                — Raiffeisen XLSX parser
    settings.ts              — setting keys + defaults from NEXT_PUBLIC_* env vars
    portfolio/               — yuh.ts (CSV parser), market.ts (Yahoo/ECB), engine.ts (pure maths),
                               store.ts (DB + refresh), schema.ts (create tables if missing)
generated/
  prisma/
    client.ts                — generated Prisma client (do not edit)
prisma/
  schema.prisma              — database schema
  seed.ts                    — seeds default categories
  dev.db                     — SQLite database file (gitignored)
prisma.config.ts             — Prisma 7 config (url, migrations, seed)
electron/
  main.js                    — Electron main process (spawns standalone server)
  preload.js                 — minimal preload (no privileged bridge)
scripts/
  assemble-standalone.mjs    — post-build: copy static/public + snapshot db template
```

## Desktop app (Electron)
Rappespalter can run as a local desktop app. It is **not** a static export — the
Electron main process spawns the Next.js standalone server (`.next/standalone/server.js`)
using Electron's own bundled Node and points a window at it, so all API routes and
Prisma/SQLite code run unchanged. The SQLite DB lives in the OS userData dir (seeded
from a bundled `template.db` on first launch). Build requires `output: "standalone"`
plus `outputFileTracingIncludes` for `generated/prisma` and the libsql adapter.
Commands: `pnpm electron:dev` (with `pnpm dev` running), `pnpm build:desktop`,
`pnpm dist`. Full details in [docs/ELECTRON.md](docs/ELECTRON.md).

## Database schema
Tables:
- **Transaction** — imported bank transactions with sourceHash for deduplication
- **Category** — spending categories with color and type (fixed/variable/savings)
- **Budget** — monthly limits per category
- **Snapshot** — monthly asset balances (ETF, savings, 3a, 2. Säule, checking)
- **Setting** — key/value user settings edited on /settings; missing keys fall back
  to the `NEXT_PUBLIC_*` env defaults. `/api/settings` creates the table if absent
  because the desktop app doesn't migrate existing userData databases.
- **PortfolioActivity / Security / SecurityPrice / FxRate** — portfolio tracker (see below);
  created on demand by `ensurePortfolioSchema()` for the same reason.

## Prisma setup (important)
Prisma 7 requires an explicit adapter — no parameterless PrismaClient constructor.
Always instantiate like this:

```typescript
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../../generated/prisma/client"

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
```

In API routes, always import from the shared singleton:

```typescript
import { prisma } from "@/lib/prisma"
```

After any schema change run:

```bash
pnpm dlx prisma migrate dev --name <description>
pnpm dlx prisma generate
```

## Category types
- **fixed** — rent, taxes, insurance, utilities (recurring, predictable)
- **variable** — groceries, dining, shopping, entertainment (discretionary)
- **savings** — ETF transfers, 3a contributions, savings transfers (retained assets)
- **income** — salary and other money in
- **transfer** — movements between own accounts; excluded from all totals

Categories are managed on Data → Categories (add, rename, recolor, change type,
delete). Type definitions live in src/lib/categories.ts; only fixed/variable can
have budgets, so switching away from those drops the budget. Deleting a category
leaves its transactions uncategorized.

Savings transactions are excluded from expense totals and shown separately
in the dashboard. They do not count as spending.

## Raiffeisen XLSX parser
The parser (src/lib/parser.ts) handles the Raiffeisen Finanzassistent export format:
- Skips the 11-row header block (data starts at row 12)
- Filters some internal transfers via `INTERNAL_TRANSFER_PATTERNS` (Übertrag,
  Vorsorgekonto, Privatkonto, Sparkonto, "Ihre Zahlung - danke") to avoid double counting
- Maps German category names (Gastronomie, Lebensmittel etc.) to app categories
- Generates a sourceHash per transaction for deduplication on re-import

### Credit-card settlements: double-count avoidance (FIXED)
The export contains **two accounts**: a `VISA •••• XXXX` card (individual credit-card
purchases) and `Mitglieder-Privatkonto` (checking). The monthly credit-card bill
is paid from checking as a single lump sum booked under counterparty
**"Viseca Card Services"**.

That settlement is an internal transfer (checking → card), not new spending — the
individual purchases are already imported from the VISA account. Counting the lump
sum too double-counted card spending (the lump-sum settlement rows roughly matched
the total of the individual VISA purchases already imported), and was temporally
misaligned (the bill is paid ~1 month late; some months carried two billing cycles,
others none).

**Fix applied (two parts):**
- **Parser** — `/viseca card services/i` added to `INTERNAL_TRANSFER_PATTERNS`, so
  future imports skip the settlement row entirely (same handling as `Übertrag`).
- **Existing data** — the 60 already-imported settlement rows were recategorized
  to the `Internal Transfer` (transfer-type) category, which `summary`/`income`
  exclude from totals. They remain in the DB for audit but no longer count as
  spending.

The annual card fee ("Gebühr / Jahresgebühr Kreditkarte") does **not** match the
filter and correctly stays as a real expense.

## Portfolio tracker
Standalone: it never touches Transaction/Snapshot. Deposits into Yuh are already
recorded on the Raiffeisen side (as *ETF Investment*), so importing them as
transactions would double-count savings.

- **Import** (`yuh.ts`): Yuh "Activities" CSV — `;`-separated, UTF-8 BOM, DD/MM/YYYY,
  text wrapped in extra quotes. Order amounts include fees; dividend credits are net
  of withholding tax (FEES column). Rejected orders are skipped (their amounts are
  garbage). Identical rows are legitimate, so `sourceHash` includes an occurrence index.
- **Pricing** (`market.ts`): no hard-coded tickers. A broker symbol is matched to a
  Yahoo listing whose currency equals the trade currency and whose close on the
  first trade date is nearest the traded price (≤15% off). Users can pin another
  listing or switch to manual prices. FX from ECB (Frankfurter). Yahoo's API is
  unofficial — keep provider code confined to `market.ts`.
- **Being polite to providers** (`market.ts` `getJson`): requests are serialised
  and spaced per host, 429/5xx/network errors retry with backoff (honouring
  Retry-After), and a host still answering 429 is put on a 60 s cool-down
  (`RateLimitedError`) instead of being hit once per holding. The Portfolio page's
  automatic refresh (`?auto=1`) runs at most every `AUTO_REFRESH_HOURS` (4 h),
  tracked in Setting `portfolio.lastRefreshAt`; manual refreshes and imports always run.
- **Maths** (`engine.ts`, pure): account = securities + cash; deposits/withdrawals are
  the only external flows. Cost basis in CHF at the trade-date ECB rate; average-cost
  realised gains; daily TWR and XIRR.

## Financial context
The dashboard models a Swiss personal-finance setup with these inputs (all values
are user-specific and configurable — the numbers below are illustrative placeholders):
- Monthly net salary
- Recurring ETF contributions (a portfolio split across a few funds)
- Säule 3a (pillar 3a) monthly contribution
- A static savings-account balance
- 2. Säule (pillar 2) balance
- Goal: Swiss real estate purchase in 5–10 years

## Projection assumptions (defaults)
- ETF: 6% annual return, monthly compounding
- Säule 3a: 5% annual return
- Savings account: 0.75% (static, no new contributions)
- 2. Säule: 2.5% annual return + monthly contributions

## Commands

```bash
pnpm dev                                       # start dev server
pnpm build                                     # production build
pnpm dlx prisma studio                         # open database browser at localhost:5555
pnpm dlx prisma migrate dev --name <name>      # create and apply migration
pnpm dlx prisma generate                       # regenerate client after schema change
pnpm dlx prisma migrate reset                  # wipe db, reapply migrations, run seed
pnpm dlx prisma db seed                        # run seed script manually
```

## Environment

```
DATABASE_URL="file:./prisma/dev.db"
```

## Conventions
- All monetary values in CHF, formatted with toLocaleString("de-CH")
- Dates stored as UTC DateTime in Prisma
- Month parameters use YYYY-MM format throughout the API
- API routes always return NextResponse.json({}) — never empty responses
- shadcn components imported from @/components/ui/
- Colors come from theme tokens in globals.css (light/dark follows the OS). For
  amounts use `text-positive` / `text-negative` / `text-info` / `text-highlight`,
  not raw Tailwind hues; in Recharts use `var(--border)` etc. (tokens are oklch,
  so never wrap them in `hsl()`)
- Navigation lives in src/components/app-nav.tsx — add new pages to `SECTIONS`
- Prisma client imported from @/lib/prisma in all API routes
