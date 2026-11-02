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
    portfolio/look-through/  — ETFs broken down into companies / countries / sectors
    api/
      import/route.ts        — parses and imports Raiffeisen XLSX
      transactions/route.ts  — CRUD + filtering
      snapshots/route.ts     — monthly asset balance history
      summary/route.ts       — aggregated monthly dashboard data
      months/route.ts        — distinct months in the database
      income/streams/route.ts — per-source income trends over the full history
      budgets/drift/route.ts — budget vs. actual over the last N complete months
      budgets/pace/route.ts  — projection for the month in progress
      rules/route.ts         — auto-categorization rules (+ rules/apply)
      settings/route.ts      — user-editable settings (projection inputs)
      portfolio/             — summary + delete, import, refresh, securities (overrides/manual prices),
                               lookthrough (ETF constituent upload + aggregated exposure),
                               targets (target weights + TERs), month-ends (value per month end)
    settings/page.tsx        — edit projection inputs (overrides env defaults)
  lib/
    prisma.ts                — shared PrismaClient singleton
    parser.ts                — Raiffeisen XLSX parser
    settings.ts              — setting keys + defaults from NEXT_PUBLIC_* env vars
    income.ts                — pure per-stream income analysis (monthly/yearly, YoY, 12-mo avg)
    budget-drift.ts          — pure budget-vs-actual analysis (window of complete months)
    pace.ts                  — pure spending projection for the month in progress
    projection.ts            — pure wealth forecast (rates, monthly steps, forecast vs. actual)
    rules.ts                 — pure rule matching (rules-store.ts: table + DB planning)
    portfolio/               — yuh.ts (CSV parser), market.ts (Yahoo/ECB/Xtrackers), engine.ts (pure maths),
                               store.ts (DB + refresh), schema.ts (create tables if missing),
                               constituents.ts (ETF holdings file parsers), lookthrough.ts (pure matching),
                               allocation.ts (pure targets / buy-only split / fees)
generated/
  prisma/
    client.ts                — generated Prisma client (do not edit)
prisma/
  schema.prisma              — database schema
  seed.ts                    — seeds default categories
  dev.db                     — SQLite database file (gitignored)
prisma.config.ts             — Prisma 7 config (url, migrations, seed)
electron/
  main.js                    — Electron main process (spawns standalone server, installs updates)
  updater.js                 — update feed check + verified installer download
  preload.js                 — exposes window.rappespalter.updates (the only bridge)
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

**Updates** (Windows, modelled on Aperture): a pushed `vX.Y.Z` tag (must match
package.json) is built by `release.yml` as a pre-release with `latest.json`
(version, notes, installer URL/size/SHA-256); `promote.yml` makes one the latest
release, the only one installed copies read. `electron/updater.js` checks the feed
(1 min after start, every 6 h) and downloads + verifies the installer; `installUpdate`
in `main.js` copies the DB to `backups/before-update/`, runs the NSIS installer with
`/S --updated --force-run` and quits. The renderer reaches it only through
`window.rappespalter.updates` (preload.js, typed in `src/lib/updates.ts`); UI is
Settings → Updates (`src/components/updates-card.tsx`). The repo must be public.

## Database schema
Tables:
- **Transaction** — imported bank transactions with sourceHash for deduplication
- **Category** — spending categories with color and type (fixed/variable/savings)
- **Budget** — monthly limits per category
- **Snapshot** — monthly asset balances (ETF, savings, 3a, 2. Säule, checking)
- **Setting** — key/value user settings edited on /settings; missing keys fall back
  to the `NEXT_PUBLIC_*` env defaults. `/api/settings` creates the table if absent
  because the desktop app doesn't migrate existing userData databases.
- **CategoryRule** — auto-categorization rules (counterparty pattern → category);
  created on demand by `ensureRuleTable()` (src/lib/rules-store.ts).
- **PortfolioActivity / Security / SecurityPrice / FxRate / FundSource / FundConstituent** —
  portfolio tracker and ETF look-through (see below); `Security.ter` / `targetWeight`
  hold fund fees and allocation targets;
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
- Some rows carry only the payment type as counterparty ("Dauerauftrag",
  "Sammelzahlung", …) with the payee on line 2 of the booking text; the parser
  appends the payee ("Dauerauftrag Muster AG") so rules can tell them apart
- Generates a sourceHash per transaction for deduplication on re-import (from the
  counterparty as exported, so the payee expansion doesn't change hashes)

### Credit-card settlements: double-count avoidance
A Finanzassistent export can include a credit-card account (`VISA •••• XXXX`,
individual card purchases) alongside checking (`Mitglieder-Privatkonto`). The
monthly card bill is paid from checking as one lump sum booked under counterparty
**"Viseca Card Services"**.

That settlement is an internal transfer (checking → card), not new spending — the
individual purchases are already imported from the card account. Counting the lump
sum too would double-count card spending, and misalign it in time (the bill is paid
~1 month late, so some months carry two billing cycles and others none).

**Handling:**
- **Parser** — `/viseca card services/i` is in `INTERNAL_TRANSFER_PATTERNS`, so the
  settlement row is skipped on import (same handling as `Übertrag`).
- **Older databases** — settlement rows imported before this pattern existed should
  be recategorized to a transfer-type category (e.g. `Internal Transfer`), which
  `summary`/`income` exclude from totals.

The annual card fee ("Gebühr / Jahresgebühr Kreditkarte") does **not** match the
filter and correctly stays as a real expense.

## Portfolio tracker
Standalone: it never touches Transaction/Snapshot. Money moved into a broker account
already shows up in the bank export (typically categorized as *ETF Investment*), so
importing broker deposits as transactions would double-count savings.

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

- **Look-through** (`constituents.ts`, `lookthrough.ts`, full design in
  [docs/PORTFOLIO-LOOKTHROUGH.md](docs/PORTFOLIO-LOOKTHROUGH.md)): ETF constituent files
  (iShares CSV, Vanguard XLSX, Xtrackers XLSX) are uploaded per ETF and replace its
  previous rows; exposure = today's position value × file weight. Only Xtrackers has
  ISINs, so companies are matched by ISIN, ticker+country and normalised name
  (cross-country only when legal forms agree, so "Siemens AG" ≠ "Siemens Ltd").
  Xtrackers files re-fetch during refresh once a week old; the others are manual.
  In this code a *holding* is the user's position, a *constituent* is a company inside an ETF.
  Currency exposure uses each constituent's trading currency (iShares/Xtrackers files)
  or, where the file has none (Vanguard), the country's currency — shown as estimated.
- **Allocation & costs** (`allocation.ts`, pure): targets apply to holdings that have one
  and are scaled to 100% across them. "Buy next" water-fills new money into the most
  underweight holdings (never sells); "full rebalance" is the exact buy/sell. Running
  costs = Σ value × TER (user-entered) + trading/FX fees of the last 12 months.
- **Net worth link**: `/api/portfolio/month-ends` gives the account value at each month
  end (full daily series, not the chart's thinned one). Net Worth can use it for the
  ETF line; the Projections snapshot form offers it for the ETF field.

## Auto-categorization rules
Data → Rules (`src/lib/rules.ts`, pure). A rule matches the counterparty (contains /
starts with / equals, case- and whitespace-insensitive), optionally only money in or
out. When several match, the **longest pattern wins** (no manual ordering). Import
applies rules before the parser's `CATEGORY_MAP`; existing transactions change only
via an explicit apply (`POST /api/rules`, `apply: true`, or `/api/rules/apply`), which
overwrites hand-set categories. Re-mapping a transaction on Data → Transactions offers
a rule for its counterparty. Deleting a category deletes its rules.

## Spending pace
Dashboard *Month pace* (`src/lib/pace.ts`, pure) projects the month in progress per
budgeted category: fixed = max(spent, usual), variable = spent + usual × share of the
month left, where usual = mean of the last 3 complete months (linear without history).
"Today" is the latest import date if earlier — data after the last import isn't in.
Renders nothing for a complete month.

## Budget drift
The Budgets page's *Plan vs. actual* card (`src/lib/budget-drift.ts`, pure) compares
spending with today's budgets over the last 3/6/12 months. Spending uses the
`/api/summary` rule (outgoing, excluding savings/transfer types), so budgeted +
unbudgeted equals the dashboard's expenses for every month. The window holds only
**complete** months: it ends before the month of the latest `importedAt` (a month
imported while in progress isn't counted) and never extends past the data. Budgets
aren't versioned, so all months are compared with the current limit.

## Income streams
The Income page's trend view (`src/lib/income.ts`, pure) analyses each income
category over the full history. Income = positive amounts excluding
transfer-type categories (same rule as `/api/income`). Monthly series are
zero-filled with a trailing 12-month average; "this year" and "last 12 months"
compare **to the day** against the same days a year earlier, so a month in
progress isn't compared with a complete one. A stream's partial first year is
not used as a comparison base.

## Modelled finances
The app models a typical Swiss personal-finance setup. All values are entered by the
user (imports, snapshots, Settings) — nothing is hard-coded:
- Monthly net salary and other income
- Recurring ETF contributions
- Säule 3a (pillar 3a) monthly contribution
- A savings-account balance
- 2. Säule (pillar 2) balance
- An optional savings goal, e.g. a property down payment (Goal page)

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
