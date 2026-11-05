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
    locales/                 — messages per language (en-CH is the source; de-CH, fr-CH, it-CH checked against it)
    page.tsx                 — entry: /welcome until the first-start setup is done, else /dashboard
    welcome/page.tsx         — first-start setup: birth date, monthly saving, balances, bank import
    dashboard/page.tsx       — monthly spending overview
    import/page.tsx          — xlsx upload page
    projections/page.tsx     — forecast to retirement, calculator, forecast vs. actual
    portfolio/page.tsx       — standalone investment tracker (Yuh CSV + market prices)
    portfolio/look-through/  — ETFs broken down into companies / countries / sectors
    assets/page.tsx          — other assets (gold, crypto, collectibles, vehicles) + loans & leases
    assets/[id]/             — one asset: value history, valuations; vehicles: monthly cost + lease vs. buy
    assets/lease-or-buy/     — the lease-vs-buy calculator on its own
    goal/page.tsx            — savings goals (home, travel, …) with assets allocated to each
    recurring/page.tsx       — recurring payments: coming up, changes, yearly cost
    review/page.tsx          — review inbox (uncategorized + guessed categories)
    tax/page.tsx             — figures for one year's tax return
    api/
      import/route.ts        — parses and imports Raiffeisen XLSX or camt statements (.xml/.zip)
      transactions/route.ts  — CRUD + filtering
      snapshots/route.ts     — monthly asset balance history
      summary/route.ts       — aggregated monthly dashboard data
      months/route.ts        — distinct months in the database
      income/streams/route.ts — per-source income trends over the full history
      budgets/drift/route.ts — budget vs. actual over the last N complete months
      budgets/pace/route.ts  — projection for the month in progress
      rules/route.ts         — auto-categorization rules (+ rules/apply)
      review/route.ts        — review inbox: list / counts, mark reviewed, re-map a group
      recurring/route.ts     — recurring series + upcoming payments
      tax/route.ts           — one year's 3a, balances, securities, dividends, income, taxable wealth
                               (+ locations/ = ESTV municipality search, profile/, estimate/ = ESTV estimate)
      goals/route.ts         — goals CRUD, balances + savings pace per asset, PATCH category → asset
      assets/                — assets CRUD (+ values/, month-ends/ for Net Worth, car/ = a vehicle's monthly cost)
      liabilities/route.ts   — loans, mortgages, leases CRUD
      language/route.ts      — the UI language (GET; PUT { language })
      onboarding/route.ts    — first-start setup state (GET; PUT { state, step })
      settings/route.ts      — user-editable settings (projection inputs)
      appearance/route.ts    — theme + motion preference
      backup/                — GET: database backup download; restore/: POST a backup to replace all data
      portfolio/             — summary + delete, import, refresh, securities (overrides/manual prices),
                               lookthrough (ETF constituent upload + aggregated exposure),
                               targets (target weights + TERs), month-ends (value per month end)
    settings/page.tsx        — edit projection inputs (overrides env defaults)
  lib/
    prisma.ts                — shared PrismaClient singleton
    parser.ts                — Raiffeisen XLSX parser
    camt.ts                  — ISO 20022 camt.052/053/054 parser (any Swiss bank; .xml or .zip)
    counterparty.ts          — pure payee handling (bare "Dauerauftrag" → payee, payment-type prefix)
    marks.ts                 — TransactionMark table (one-off, category source, reviewed) + NOT_ONE_OFF
    recurring.ts             — pure recurring-payment detection
    tax.ts                   — pure tax-year figures (dividends per security, year-end snapshot)
    tax-estimate.ts          — pure tax profile, taxable wealth, ESTV request (tax-estimate-store.ts: Settings)
    estv.ts                  — ESTV tax calculator client (unofficial API; the only file that talks to it)
    goals.ts                 — pure goal maths: allocation, savings pace per asset, projection
                               (goals-store.ts: tables on demand + loading)
    assets.ts                — pure asset maths: kind registry, valuation/depreciation, loan balances,
                               lease commitments, month-end totals, car cost (assets-store.ts: tables + loading)
    car.ts                   — pure lease-vs-buy comparison + a lease's effective interest rate
    blob.ts                  — blob outlines shared by the page blobs and the goal illustrations
    i18n/                    — locales.ts (languages, Accept-Language matching), translate.ts (pure lookup,
                               plurals, <tags>), format.ts (Swiss numbers/dates), store.ts (saved language,
                               getT for server code), provider.tsx (useT, useSetLanguage)
    onboarding.ts            — first-start setup state + "is this a fresh database?" check
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
  assemble-standalone.mjs    — post-build: copy static/public + the clean resources/template.db (never dev.db)
```

## Desktop app (Electron)
Rappespalter can run as a local desktop app. It is **not** a static export — the
Electron main process spawns the Next.js standalone server (`.next/standalone/server.js`)
using Electron's own bundled Node and points a window at it, so all API routes and
Prisma/SQLite code run unchanged. The SQLite DB lives in the OS userData dir (seeded
from a bundled `template.db` on first launch). It's single-instance and shows
`electron/loading.html` while the server starts.
**Local API lockdown** (`src/proxy.ts`): every request must name a loopback host
(no DNS rebinding), must not be cross-/same-site (`Sec-Fetch-Site`, `Origin`), and in
the desktop app must carry `x-rappespalter-token`, a random token main.js makes per
launch, passes to the server as `RAPPESPALTER_TOKEN` and adds to the window's own
requests (`authorizeRequests`). `pnpm dev` has no token. Extra host names (e.g. a LAN
dev server): `RAPPESPALTER_ALLOWED_HOSTS`. The app icon is `src/app/icon.svg`,
rendered to `resources/icon.{png,ico}` by `node scripts/make-icons.mjs`. Build requires `output: "standalone"`
plus `outputFileTracingIncludes` for `generated/prisma` and the libsql adapter.
Commands: `pnpm electron:dev` (with `pnpm dev` running), `pnpm build:desktop`,
`pnpm dist`. Full details in [docs/ELECTRON.md](docs/ELECTRON.md).

**Releases**: a pushed `vX.Y.Z` tag (must match package.json) is built by
`release.yml` on one runner per system (Windows exe, macOS arm64 dmg + zip, Linux
AppImage; native libsql, so no cross-builds) and published as a pre-release.
The Mac app is Developer ID signed and notarized; the Mac job needs five secrets
(listed in docs/ELECTRON.md, "Mac signing and notarization") and fails without them.
**Updates** (all three, modelled on Aperture): the release carries `latest.json`
(version, notes, per system the update package's URL/size/SHA-256); `promote.yml`
makes one the latest release, the only one installed copies read. `electron/updater.js`
checks the feed (1 min after start, every 6 h) and downloads + verifies the package;
`installUpdate` in `main.js` copies the DB to `backups/before-update/`, puts the new
version in place (`INSTALLERS`: NSIS `/S --updated --force-run`; macOS swaps the `.app`
after exit; Linux renames the new AppImage over `$APPIMAGE`) and quits. The renderer reaches it only through
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
- **TransactionMark** — per-transaction flags keyed by transactionId: `oneOff`,
  `categorySource` (rule | bank | fallback | transfer | manual; override on older imports), `reviewedAt`. A
  separate table, not Transaction columns, so older databases keep working; created
  on demand by `ensureMarkTable()` (src/lib/marks.ts) — call it before any query that
  touches `mark`.
- **Asset / AssetValue / Liability** — other assets with their valuations, and
  loans/leases (optionally against an asset); created on demand by
  `ensureAssetTables()` (src/lib/assets-store.ts).
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

After any schema change run (`pnpm exec` uses the project's Prisma 7; `pnpm dlx`
would download the latest CLI, which no longer has `generate`):

```bash
pnpm exec prisma migrate dev --name <description>
pnpm exec prisma generate
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
- Flags known internal transfers via `INTERNAL_TRANSFER_PATTERNS` (Übertrag,
  Vorsorgekonto, Privatkonto, Sparkonto, "Ihre Zahlung - danke", Viseca Card Services);
  they're imported into the transfer category, not dropped (see "Internal transfers")
- Maps German category names (Gastronomie, Lebensmittel etc.) to the default categories
  (prisma/seed.ts); a list is tried in order (Lohn → Salary, else Income for older
  databases). No merchant-specific categories are built in — those are the user's rules
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

**Handling:** `/viseca card services/i` is in `INTERNAL_TRANSFER_PATTERNS`, so the
settlement row is imported as a transfer, left out of all totals. Rows from older
imports (when matching rows were skipped, or before the pattern existed) can be
re-mapped to `Internal Transfer` by hand. Other card issuers: a rule → Internal Transfer.

### Internal transfers
Money between own accounts must not count as spending on one side and income on
the other. Import (`src/app/api/import/route.ts`) files it under the transfer-type
category (prefers `Internal Transfer`, creates it if the database has none), in
this order:
1. **Rules** win — a rule's category is never overridden (e.g. → Säule 3a).
2. **Known names** — `INTERNAL_TRANSFER_PATTERNS` in the parser (Raiffeisen XLSX
   only); for camt, a payment to another account in the same upload.
3. **Pairs** (`src/lib/transfers.ts`, pure) — the same amount (to the cent, same
   currency) out of one account and into another within 3 days, matched against
   the new rows and what's already imported. Never touches rule/manual rows or rows
   with no recorded source (older imports, maybe hand-set); an outgoing
   savings-type payment stays savings and only its incoming half becomes a transfer.
`categorySource = "transfer"` marks these rows.

The annual card fee ("Gebühr / Jahresgebühr Kreditkarte") does **not** match the
filter and correctly stays as a real expense.

## camt statements (any bank)
`src/lib/camt.ts` reads ISO 20022 camt.053 / .054 / .052 (versions .04–.08+), a
single `.xml` or a `.zip` of several (opened with `xlsx`'s CFB reader; XML via
`fast-xml-parser`). Same `/api/import` route and `ParsedTransaction` as the XLSX.
- Only booked entries (`Sts` BOOK). Debit/credit from `CdtDbtInd`. Account = IBAN.
- Counterparty: creditor (money out) / debtor (money in) name, else the entry's
  additional info (card purchases), else the other IBAN. Booking text collects
  entry info, name, IBAN and remittance lines.
- Batch bookings are split into their payments when every one has an amount and
  they add up to the entry.
- No spending categories in camt: rows come in uncategorized (review inbox, rules),
  except salary (purpose or bank code `SALA` → Salary) and transfers to another
  account in the same upload. The Raiffeisen name patterns are **not** applied —
  e.g. Viseca there means the card bill, but a camt user has no card purchases
  imported, so it must stay spending.
- `sourceHash` = sha256 of IBAN + the bank's reference (+ index in the entry), else
  date/amount/counterparty + occurrence index per statement, so overlapping
  statements and camt.053 vs .054 deduplicate. Not across formats: one account
  shouldn't be imported both as Raiffeisen XLSX and camt (the UI says so).

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

## First-start setup
`/welcome` (`src/lib/onboarding.ts`). `/` (where the desktop window opens) redirects
there while Setting `onboarding.state` is missing or `started`; `done` / `skipped`
go to the dashboard. With no state saved, a database that already holds anything
(transactions, snapshots, portfolio activity, saved projection settings) is marked
`done` silently, so existing users, and restored backups, are never asked. Steps:
welcome (or restore a backup), birth date, monthly contributions, balances today
(saved as the `init*` settings and, by default, this month's snapshot incl.
checking), bank import (`components/import-card.tsx`, shared with Data → Import),
done. Every step can be skipped; `onboarding.step` resumes where the user left.
The nav shows only the wordmark and theme toggle there. Settings has "Run the setup
again".

## Languages
English, German, French and Italian (`en-CH`, `de-CH`, `fr-CH`, `it-CH`; full notes,
glossary and review points in [docs/I18N.md](docs/I18N.md)). The language is a Setting
(`language`), else the window's Accept-Language, else English; the root layout reads it
per request and `<I18nProvider>` gives client components `useT()` → `{ t, rich, f }`
(`f` formats numbers and dates in the language's Swiss locale — never hard-code
`"de-CH"` in new code). **Every user-visible string goes through `t()`**: add the key to
`src/locales/en-CH.ts` and to the other three files (TypeScript fails if one is
missing), then run `pnpm i18n:check` (placeholders, tags, plural forms). Plurals are
`x#one` / `x#other` keys asked for as `x` with `{ count }`. Data stays as it is (category names, counterparties, bank names).
Everything user-visible is translated; the exceptions are your data (category names…),
developer-facing API validation errors, and native widgets (see "Coverage" in the doc).
Libs keep identifiers and English fallbacks; the words come from `src/locales` (goal /
asset / liability kinds, category types, rule options, portfolio warnings via
`warningText`). Errors a person can hit in a route use `getT()` (`err.*`); lib code
throws typed errors (`BackupError`, `YuhFormatError`) instead of wording them.

## Backup & restore
Settings → Backup & restore (`src/lib/backup.ts`, `src/components/backup-card.tsx`).
Backups are manual only and always ask where to save: `GET /api/backup` returns a
consistent copy of the database (`VACUUM INTO`) as a download; the desktop app shows
its native Save dialog (main.js sets no download save path, keep it that way), a
browser uses the "Save as" picker where available. Restore uploads a file to
`POST /api/backup/restore`, which checks it (SQLite, `quick_check`, has Transaction +
Category), saves a safety copy to `backups/before-restore/` next to the database
(newest 5 kept), closes Prisma's connection, swaps the file in and resets the
on-demand table caches (`reset*` in setting-table / rules-store / portfolio/schema);
if the swapped-in file can't be opened, the safety copy is put back. The page then
reloads. Add any new on-demand table helper's reset to `swapIn` in backup.ts.

## Auto-categorization rules
Data → Rules (`src/lib/rules.ts`, pure). A rule matches the counterparty (contains /
starts with / equals, case- and whitespace-insensitive), optionally only money in or
out. When several match, the **longest pattern wins** (no manual ordering). Import
applies rules before the parser's `CATEGORY_MAP`; existing transactions change only
via an explicit apply (`POST /api/rules`, `apply: true`, or `/api/rules/apply`), which
overwrites hand-set categories, except transactions in a transfer-type category
(they stay transfers unless the rule's own category is a transfer). Re-mapping a transaction on Data → Transactions offers
a rule for its counterparty. Deleting a category deletes its rules.

## Spending pace
Dashboard *Month pace* (`src/lib/pace.ts`, pure) projects the month in progress per
budgeted category: fixed = max(spent, usual), variable = spent + usual × share of the
month left, where usual = mean of the last 3 complete months (linear without history).
"Today" is the latest import date if earlier — data after the last import isn't in.
One-offs count in the month itself but not in "usual". Renders nothing for a complete month.

## Budget drift
The Budgets page's *Plan vs. actual* card (`src/lib/budget-drift.ts`, pure) compares
spending with today's budgets over the last 3/6/12 months. Spending uses the
`/api/summary` rule (outgoing, excluding savings/transfer types) minus one-offs, so
budgeted + unbudgeted equals the dashboard's expenses less one-offs. The window holds only
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
not used as a comparison base. One-offs are left out.

## One-off transactions
`TransactionMark.oneOff`, toggled on Data → Transactions (hover a row) and in the
review inbox. One-offs (an inheritance, a car) stay in totals — dashboard summary,
Income page, tax summary — but are left out of trends and averages: `/api/trends`
(and so the old Goal page's pace), income streams, budget drift, pace's "usual", and recurring
detection. Filter with `NOT_ONE_OFF` from src/lib/marks.ts.

## Review inbox
Data → Review lists transactions whose category nobody confirmed: uncategorized ones,
and ones the parser gave `FALLBACK_CATEGORY` ("Personal") because the bank's category
wasn't in `CATEGORY_MAP` (`categorySource = "fallback"`, while still in that
category). Import records `categorySource` for new rows and, for existing rows that
lack one, when an old export is re-imported. Re-mapping (here or on Data) or "Looks
right" sets `reviewedAt`. Grouped by counterparty; the last 90 days before the latest
import are shown first and counted on the nav badge.

## Recurring payments
`src/lib/recurring.ts` (pure): transactions grouped by payee (`payeeName` strips the
payment type, so "Dauerauftrag X" = "Instant-Zahlung X") and direction; a group that
isn't regular is split by amount (±25%). A series needs ≥3 payments in a monthly,
quarterly, half-yearly or yearly rhythm (long rhythms: every gap fits, near-constant
amount). It reports the next date, "missing" when overdue past a grace period (then
dropped as stopped), and a changed fixed amount for three payments. Judged as of the
latest import. One-offs are left out.

## Tax summary
Planning → Tax (`/api/tax`, `src/lib/tax.ts`) collects one year's figures; it applies
no tax rules. Säule 3a = payments in the savings category named like "3a"
(selectable); balances from the snapshot nearest 31 Dec (Jan next year, else Dec);
securities valued with `computePortfolio` as of 31 Dec (or today); dividends per
security, gross = net + withholding, CHF at each payment day's ECB rate; income by
category excluding transfers. One-offs count.

**Income and wealth tax estimate** (`tax-estimate.ts`, `estv.ts`): taxable wealth on 31 Dec =
checking + savings (year-end snapshot) + securities (broker import, else the snapshot's ETF) +
other assets − debts; 3a / 2. Säule and lease commitments left out. Net income starts at the
money booked in the year (partner's at 0). Every amount is editable — it's an estimate, and
ESTV applies only standard deductions. On a click only, the ESTV tax calculator's undocumented
public API (swisstaxcalculator.estv.admin.ch, linked in the UI) is sent exactly a `TaxRequest`:
year, net incomes, wealth, municipality, marital status, number of children, church, age —
never names or accounts. It returns federal / cantonal / municipal / church income tax,
cantonal / municipal / church wealth tax and the head tax; they add up to ESTV's total. Profile
and the last estimate per year live in Setting (`tax.profile`, `tax.estimate.<year>`); the same
request again is answered from the saved estimate. ESTV has no published terms for this API —
keep calls user-triggered and spaced, never bulk-download rates or tariffs.

## Goals
Planning → Goals (`src/lib/goals.ts`, pure; tables `Goal` + `GoalAllocation`,
created on demand by `ensureGoalTables()`). A goal has a kind (picks its illustration
in `components/goal-art.tsx` and its colour), a target (home: price × (down payment +
costs)%), an optional target date and allocations of the latest snapshot's balances:
a fixed CHF amount or a percentage. Per asset, fixed amounts come first, percentages
apply to the rest; over-allocation is scaled down and flagged, never counted twice.
Säule 3a / 2. Säule only for home goals (early withdrawal). Timelines split the
savings pace: each asset's average monthly inflow over the last 6 complete months
(one-offs left out; checking = income − spending − saving; 2. Säule = the
monthlyPillar2 setting) goes to goals by their percentage; fixed amounts don't grow;
returns ignored. Which asset a savings category feeds defaults from its name and is
set on the page (Setting `goals.source.<categoryId>`). The old localStorage house
goal is migrated into a Home goal on first load.

## Assets & debts
Wealth → Assets (`src/lib/assets.ts`, pure; full design and a worked "add a kind"
example in [docs/ASSETS.md](docs/ASSETS.md)). Kinds live in `ASSET_KINDS` (gold,
crypto, collectible, vehicle, other; collectibles are one umbrella with a sub-type);
their illustrations in `components/asset-art.tsx`. Value = latest anchor (purchase
or `AssetValue`) on or before the day, held flat (manual) or shrunk by declining-balance
depreciation down to a residual (vehicles); nothing before it's owned or after it's
sold. All valuation is manual for now (no price feeds). Loans/mortgages count with
their annuity-schedule balance (a statement balance takes over from its date); a
lease is a *commitment* (payments still to come), and its vehicle isn't counted while
it runs. Net Worth adds other assets and subtracts debts per month end
(`/api/assets/month-ends`); lease commitments only when ticked. A vehicle's monthly
cost = depreciation (last year) + lease payments / loan interest + average spending in
its chosen expense categories (last 12 complete months, one-offs and the lender's
payments left out). Lease vs. buy (`src/lib/car.ts`) compares cash, loan and lease over
the same years, counting returns the money would have earned and the resale value.

## Modelled finances
The app models a typical Swiss personal-finance setup. All values are entered by the
user (imports, snapshots, Settings) — nothing is hard-coded:
- Monthly net salary and other income
- Recurring ETF contributions
- Säule 3a (pillar 3a) monthly contribution
- A savings-account balance
- 2. Säule (pillar 2) balance
- Savings goals, e.g. a property down payment or a trip (Goals page)

## Projection assumptions (defaults)
- ETF: 6% annual return, monthly compounding
- Säule 3a: 5% annual return
- Savings account: 0.75% (static, no new contributions)
- 2. Säule: 2.5% annual return + monthly contributions

The forecast (`forecastToRetirement` in src/lib/projection.ts) runs from the latest
snapshot until the month the user turns `RETIREMENT_AGE` (65), on an age axis from the
**birth date** setting. Settings stores it as `birthDate` (YYYY-MM-DD); it replaced a
numeric `startAge`, which is only used to estimate a birth date (1 Jan) when none is
saved (`birthDateEstimated`; saving a birth date deletes `startAge`). The Projections
calculator changes returns, contributions, retirement age and inflation for the visit
only (`Assumptions`); inflation above 0 deflates every amount to today's francs
(contributions stay fixed in nominal francs). Forecast vs. actual always uses the saved
plan (`assumptionsFrom`), nominal.
No milestone banners — amounts aren't judged.

## Regenerating the README screenshots

Never screenshot your real database. `scripts/demo-db.mjs` builds a separate one
with fictional transactions, balances and trades (market prices and exchange
rates are real, fetched once from Yahoo and the ECB):

```bash
node scripts/demo-db.mjs demo.db
DATABASE_URL="file:./demo.db" NEXT_PUBLIC_MONTHLY_ETF=1000 NEXT_PUBLIC_MONTHLY_3A=500 \
  NEXT_PUBLIC_MONTHLY_PILLAR2=650 NEXT_PUBLIC_BIRTH_DATE=1990-01-01 NEXT_PUBLIC_INIT_ETF=40000 \
  NEXT_PUBLIC_INIT_SAVINGS=15000 NEXT_PUBLIC_INIT_PILLAR3A=36000 NEXT_PUBLIC_INIT_PILLAR2=80000 \
  pnpm dev
```

Override every `NEXT_PUBLIC_*` variable as above, or your own values from `.env`
show up as defaults on Settings. For the look-through, upload the funds' public
holdings files on Portfolio → Look-through. Capture at 1440×1000 in the default
(light) theme, with the Next.js dev badge hidden (`nextjs-portal { display: none }`).

## Commands

```bash
pnpm dev                                       # start dev server
pnpm build                                     # production build
pnpm exec prisma studio                         # open database browser at localhost:5555
pnpm exec prisma migrate dev --name <name>      # create and apply migration
pnpm exec prisma generate                       # regenerate client after schema change
pnpm exec prisma migrate reset                  # wipe db, reapply migrations, run seed
pnpm exec prisma db seed                        # run seed script manually
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
- Design is Nordic and playful: oat-paper background, flat white rounded cards
  (`rounded-3xl`, no borders, shadows or gradients), saturated collection colours
  (`pop-blue/green/red/yellow/pink`), pills for buttons, tabs, badges and nav, and
  ink blobs drifting at the page edges (`components/blobs.tsx`). Page titles are a
  bare `<h1>` (Bricolage Grotesque, styled in globals.css); key figures use
  `font-display text-3xl`. Everything else is Space Grotesk, with labels in small
  tracked capitals (`uppercase` is tracked globally). Shares only Space Grotesk and
  uppercase labels with the user's other apps (e.g. Aperture) — don't copy their look.
- Tiles: a Card whose CardContent leads with a `.font-display` figure becomes a solid
  block in the figure's meaning colour (`text-positive` green, `text-negative` red,
  `text-info` blue, `text-highlight` pink, none yellow); override with an inline
  `--tile` (Income uses the category colour). See "Tiles" in globals.css.
- Nav: each section has a colour (`SECTIONS[].color` in app-nav.tsx); its current
  page is a pill in it.
- Appearance (`src/lib/appearance.ts`): theme (light default / dark) and motion
  (system default / reduce / full), set on Settings → Appearance and the nav's theme
  toggle, saved in the Setting table as `appearance.theme` / `appearance.motion` —
  not localStorage, because the desktop app's origin (random port) changes every
  launch. The root layout reads them per request (`connection()`) and renders
  `data-theme` / `data-motion` on `<html>`. `dark:` variants follow `data-theme`.
  Reduced motion stills all CSS animations/transitions (globals.css); the blobs'
  SVG `<animate>` morph is paused in blobs.tsx.
- Colors come from theme tokens in globals.css. For
  amounts use `text-positive` / `text-negative` / `text-info` / `text-highlight`,
  not raw Tailwind hues; in Recharts use `var(--border)` etc. (tokens are oklch,
  so never wrap them in `hsl()`)
- Text: use `useT()` — no hard-coded English in components (see "Languages")
- Navigation lives in src/components/app-nav.tsx — add new pages to `SECTIONS`.
  Two tiers: sections (Money, Wealth, Planning, Data) in the top bar, the current
  section's pages in a row below; a section tab returns to the page last visited in
  it. Settings is a gear next to the theme toggle, outside the sections. Page headers' small label names the section
- Pages are one root `<div>` whose children are the sections; content shown after
  loading goes in a `space-y-*` stack. globals.css fades these in top to bottom on
  every navigation (off under reduced motion). Show `<PageLoading />`
  (@/components/page-loading) while a page first fetches — it stays hidden for quick
  loads. When a filter (month, year) reloads data, keep the content mounted and dim
  it after a delay (`opacity-60 delay-300`, `aria-busy`; quick loads never dim)
  instead, so it doesn't collapse and fade in again
- Prisma client imported from @/lib/prisma in all API routes
