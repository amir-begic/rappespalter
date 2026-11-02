// Build a demo database with made-up finances, for screenshots and trying the app
// without real data. Market prices and exchange rates are real (Yahoo / ECB), so
// the portfolio pages behave like the real thing.
//
//   node scripts/demo-db.mjs [out.db]          (default: demo.db, gitignored)
//   DATABASE_URL=file:./demo.db NEXT_PUBLIC_…= pnpm dev
//
// Everything here is fictional: employer, amounts, balances and trades.

import { readFileSync, readdirSync, rmSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { createClient } from "@libsql/client"

process.env.TZ = "Europe/Zurich" // dates are stored as Zurich midnight in UTC, like the importers do

const OUT = process.argv[2] ?? "demo.db"
const START = { y: 2024, m: 10 } // November 2024 (0-based month)
const MONTHS = 24                // through October 2026

// ── Helpers ─────────────────────────────────────────────────────────────────

let seed = 42
const rand = () => { // mulberry32: deterministic, so every run gives the same demo
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (lo, hi) => lo + rand() * (hi - lo)
const pick = xs => xs[Math.floor(rand() * xs.length)]
const r2 = n => Math.round(n * 100) / 100
const stamp = d => d.toISOString().replace("Z", "+00:00")
const local = (y, m, d) => new Date(y, m, d)
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate()
const hash = (...parts) => createHash("sha256").update(parts.join("|")).digest("hex")

// ── Schema ──────────────────────────────────────────────────────────────────

if (existsSync(OUT)) rmSync(OUT)
const db = createClient({ url: `file:${OUT}` })
const migrations = "prisma/migrations"
for (const dir of readdirSync(migrations).filter(d => /^\d/.test(d)).sort()) {
  await db.executeMultiple(readFileSync(join(migrations, dir, "migration.sql"), "utf8"))
}

// ── Categories & budgets ────────────────────────────────────────────────────

const CATEGORIES = [
  ["Groceries", "#8ab4d4", "variable", 650], ["Dining & Bars", "#f0c080", "variable", 300],
  ["Shopping", "#d4857a", "variable", 350], ["Entertainment", "#c5b8d4", "variable", 120],
  ["Transport", "#6aaa7a", "variable", 220], ["Healthcare", "#a8c5a0", "variable", 80],
  ["Personal", "#e8a060", "variable", 100], ["Rent", "#8ab4d4", "fixed", 2100],
  ["Taxes", "#8ab4d4", "fixed", 700], ["Health Insurance", "#8ab4d4", "fixed", 400],
  ["Mobile", "#8ab4d4", "fixed", 50], ["Internet", "#8ab4d4", "fixed", 60],
  ["ETF Investment", "#6aaa7a", "savings"], ["Säule 3a", "#6aaa7a", "savings"],
  ["Savings Transfer", "#6aaa7a", "savings"], ["Salary", "#4caf72", "income"],
  ["Freelance", "#9b7ec4", "income"], ["Internal Transfer", "#888888", "transfer"],
]
const catId = {}
for (const [i, [name, color, type, budget]] of CATEGORIES.entries()) {
  catId[name] = i + 1
  await db.execute({ sql: `INSERT INTO "Category" (id, name, color, type) VALUES (?, ?, ?, ?)`, args: [i + 1, name, color, type] })
  if (budget) await db.execute({ sql: `INSERT INTO "Budget" (categoryId, monthlyLimit) VALUES (?, ?)`, args: [i + 1, budget] })
}

// ── Bank transactions ───────────────────────────────────────────────────────

const CHECKING = "Mitglieder-Privatkonto"
const CARD = "VISA •••• 4242"
const VARIABLE = {
  "Groceries":     { n: [10, 15], amt: [18, 110], who: ["Migros", "Coop", "Denner", "Aldi Suisse", "Lidl"] },
  "Dining & Bars": { n: [4, 9],   amt: [14, 95],  who: ["Restaurant Sonne", "Café Central", "Bar Rossi", "Pizzeria Napoli", "Sushi Zen"] },
  "Shopping":      { n: [2, 5],   amt: [25, 240], who: ["Digitec Galaxus", "Zalando", "IKEA", "Manor", "Decathlon"] },
  "Entertainment": { n: [1, 4],   amt: [12, 60],  who: ["Kino Arena", "Spotify", "Netflix", "Hallenstadion"] },
  "Transport":     { n: [2, 5],   amt: [8, 90],   who: ["SBB", "ZVV", "Shell", "Mobility"] },
  "Healthcare":    { n: [0, 2],   amt: [20, 140], who: ["Apotheke am Platz", "Praxis Dr. Muster"] },
  "Personal":      { n: [1, 3],   amt: [20, 80],  who: ["Coiffeur Style", "Fitnesspark"] },
}
const tx = []
const addTx = (date, counterparty, amount, category, account = CHECKING) =>
  tx.push({ date, counterparty, amount: r2(amount), category, account })

for (let k = 0; k < MONTHS; k++) {
  const y = START.y + Math.floor((START.m + k) / 12), m = (START.m + k) % 12
  const days = daysIn(y, m)
  const raise = y >= 2026 ? 1.03 : 1

  addTx(local(y, m, 25), "Muster Technologies AG", 7200 * raise, "Salary")
  if (m === 11) addTx(local(y, m, 20), "Muster Technologies AG", 7200 * raise, "Salary") // 13th salary
  if (rand() < 0.45) addTx(local(y, m, Math.ceil(between(3, 27))), pick(["Studio Blau GmbH", "Kunde Weber"]), between(250, 900), "Freelance")

  addTx(local(y, m, 1), "Immobilien Verwaltung AG", -2050, "Rent")
  addTx(local(y, m, 5), "Steueramt Zürich", -640, "Taxes")
  addTx(local(y, m, 2), "Krankenkasse Helvetia", -386.4, "Health Insurance")
  addTx(local(y, m, 12), "Swisscom", -45, "Mobile")
  addTx(local(y, m, 14), "init7", -55, "Internet")

  addTx(local(y, m, 26), "Yuh Invest", -1000, "ETF Investment")
  addTx(local(y, m, 26), "Vorsorge 3a Stiftung", -500, "Säule 3a")
  if (m % 3 === 2) addTx(local(y, m, 27), "Mitglieder-Sparkonto", -500, "Savings Transfer")
  addTx(local(y, m, 28), "Viseca Card Services", -between(900, 1500), "Internal Transfer") // card bill: excluded

  for (const [category, v] of Object.entries(VARIABLE)) {
    const n = Math.round(between(v.n[0], v.n[1] + 0.99))
    for (let i = 0; i < n; i++) {
      const account = category === "Groceries" && rand() < 0.5 ? CHECKING : CARD
      addTx(local(y, m, Math.ceil(between(1, days))), pick(v.who), -between(v.amt[0], v.amt[1]), category, account)
    }
  }
  if (m === 6) addTx(local(y, m, 10), "Swiss International Air Lines", -between(450, 800), "Entertainment", CARD)
}

for (const [i, t] of tx.entries()) {
  await db.execute({
    sql: `INSERT INTO "Transaction" (date, counterparty, amount, currency, account, categoryId, sourceHash, importedAt)
          VALUES (?, ?, ?, 'CHF', ?, ?, ?, ?)`,
    args: [stamp(t.date), t.counterparty, t.amount, t.account, catId[t.category], hash("demo", i), stamp(new Date())],
  })
}

// ── Auto-categorization rules ───────────────────────────────────────────────

for (const [pattern, category, direction = "any"] of [
  ["Migros", "Groceries"], ["Coop", "Groceries"], ["Digitec", "Shopping"], ["SBB", "Transport"],
  ["Spotify", "Entertainment"], ["Studio Blau", "Freelance", "in"],
]) {
  await db.execute({
    sql: `INSERT INTO "CategoryRule" (pattern, matchType, direction, categoryId) VALUES (?, 'contains', ?, ?)`,
    args: [pattern, direction, catId[category]],
  })
}

// ── Monthly asset snapshots ─────────────────────────────────────────────────

let etf = 18000, savings = 15000, p3a = 21500, p2 = 64000, checking = 6500
for (let k = 0; k < MONTHS; k++) {
  const y = START.y + Math.floor((START.m + k) / 12), m = (START.m + k) % 12
  etf = etf * (1 + between(-0.025, 0.035)) + 1000
  savings += (m % 3 === 2 ? 500 : 0) + savings * 0.0075 / 12
  p3a = p3a * (1 + between(-0.01, 0.015)) + 500
  p2 = p2 * (1 + 0.025 / 12) + 650
  checking = Math.max(2500, checking + between(-700, 900))
  await db.execute({
    sql: `INSERT INTO "Snapshot" (month, etf, savings, pillar3a, pillar2, checking) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [stamp(local(y, m, 1)), r2(etf), r2(savings), r2(p3a), r2(p2), r2(checking)],
  })
}

// ── Settings (projection inputs) ────────────────────────────────────────────

const SETTINGS = {
  monthlyEtf: 1000, monthly3a: 500, monthlyPillar2: 650, initEtf: Math.round(etf),
  initSavings: Math.round(savings), initPillar3a: Math.round(p3a), initPillar2: Math.round(p2), startAge: 32,
  "portfolio.lastRefreshAt": new Date().toISOString(),
}
for (const [key, value] of Object.entries(SETTINGS)) {
  await db.execute({ sql: `INSERT INTO "Setting" (key, value) VALUES (?, ?)`, args: [key, String(value)] })
}

// ── Portfolio (real market prices, made-up trades) ──────────────────────────

// target/ter: allocation targets and fund fees (illustrative, not quoted from factsheets).
const SECURITIES = [
  { symbol: "VWRL",  name: "World (Vanguard FTSE All-World Dis)",   listing: "VWRL.SW",  kind: "ETF",    monthly: 550, target: 0.6,  ter: 0.0022 },
  { symbol: "CHSPI", name: "Switzerland SPI (iShares Core SPI)",    listing: "CHSPI.SW", kind: "ETF",    monthly: 250, target: 0.25, ter: 0.001 },
  { symbol: "XMME",  name: "Emerging Markets (Xtrackers MSCI EM)",  listing: "XMME.SW",  kind: "ETF",    monthly: 200, target: 0.15, ter: 0.0018 },
  { symbol: "AAPL",  name: "Apple",                                 listing: "AAPL",     kind: "EQUITY", once: [[2025, 4, 1500], [2026, 1, 1000]] },
]
const UA = { "User-Agent": "Mozilla/5.0 (Rappespalter demo data)" }
const from = local(START.y, START.m, 1), to = new Date()
const epoch = d => Math.floor(d.getTime() / 1000)

async function getJson(url) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`)
  await new Promise(r => setTimeout(r, 400)) // be polite
  return res.json()
}

const prices = {}
for (const s of SECURITIES) {
  const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${s.listing}?period1=${epoch(from)}&period2=${epoch(to)}&interval=1d`)
  const res = data.chart.result[0]
  const closes = res.indicators.quote[0].close
  s.currency = res.meta.currency
  prices[s.symbol] = res.timestamp
    .map((ts, i) => ({ date: iso(new Date((ts + res.meta.gmtoffset) * 1000)), close: closes[i] }))
    .filter(p => p.close != null)
}
const currencies = [...new Set(SECURITIES.map(s => s.currency))].filter(c => c !== "CHF")
const fx = {}
for (const c of currencies) {
  const data = await getJson(`https://api.frankfurter.dev/v1/${iso(from)}..${iso(to)}?from=${c}&to=CHF`)
  fx[c] = Object.entries(data.rates).map(([date, r]) => ({ date, rate: r.CHF }))
}
const onOrBefore = (series, date, key) => {
  let hit = series[0]
  for (const p of series) { if (p.date > date) break; hit = p }
  return hit[key]
}

for (const s of SECURITIES) {
  await db.execute({
    sql: `INSERT INTO "Security" (symbol, name, currency, kind, priceSource, priceSymbol, priceCurrency, pinned, updatedAt, targetWeight, ter)
          VALUES (?, ?, ?, ?, 'yahoo', ?, ?, true, ?, ?, ?)`,
    args: [s.symbol, s.name, s.currency, s.kind, s.listing, s.currency, stamp(new Date()), s.target ?? null, s.ter ?? null],
  })
  for (const p of prices[s.symbol]) {
    await db.execute({ sql: `INSERT INTO "SecurityPrice" (symbol, date, close, source) VALUES (?, ?, ?, 'yahoo')`, args: [s.symbol, p.date, p.close] })
  }
}
for (const [c, rates] of Object.entries(fx)) {
  for (const r of rates) await db.execute({ sql: `INSERT INTO "FxRate" (currency, date, rate) VALUES (?, ?, ?)`, args: [c, r.date, r.rate] })
}

const acts = []
const act = (date, type, fields) => acts.push({
  date, type, symbol: null, quantity: null, price: null, fee: 0, tax: 0,
  counterAmount: null, counterCurrency: null, ...fields,
})
const buy = (date, s, chf) => {
  const day = iso(date)
  const price = onOrBefore(prices[s.symbol], day, "close")
  let budget = chf
  if (s.currency !== "CHF") { // exchange first, like Yuh does for foreign listings
    const rate = onOrBefore(fx[s.currency], day, "rate")
    budget = r2(chf / rate * 0.995)
    act(date, "fx", { amount: -chf, currency: "CHF", counterAmount: budget, counterCurrency: s.currency, description: `CHF → ${s.currency}` })
  }
  const fee = r2(Math.max(1, budget * 0.005))
  const quantity = Math.floor((budget - fee) / price * 1000) / 1000
  act(date, "buy", {
    symbol: s.symbol, quantity, price, fee, currency: s.currency,
    amount: -r2(quantity * price + fee), description: `${quantity}x ${s.name}`,
  })
}

for (let k = 0; k < MONTHS; k++) {
  const y = START.y + Math.floor((START.m + k) / 12), m = (START.m + k) % 12
  const date = local(y, m, 27)
  act(date, "deposit", { amount: 1000, currency: "CHF", description: "Deposit" })
  for (const s of SECURITIES.filter(s => s.monthly)) buy(local(y, m, 28), s, s.monthly)
  for (const s of SECURITIES) for (const [oy, om, chf] of s.once ?? []) {
    if (oy === y && om === m) {
      act(local(y, m, 9), "deposit", { amount: chf, currency: "CHF", description: "Deposit" })
      buy(local(y, m, 10), s, chf)
    }
  }
}

// Quarterly VWRL distributions (~1.8% a year), 15% withheld.
let units = 0
const vwrl = SECURITIES[0]
for (const a of [...acts].sort((x, y) => x.date - y.date)) {
  if (a.type === "buy" && a.symbol === "VWRL") units += a.quantity
  const d = a.date
  if (a.type === "deposit" && [2, 5, 8, 11].includes(d.getMonth()) && units > 0) {
    const gross = units * onOrBefore(prices.VWRL, iso(d), "close") * 0.018 / 4
    act(local(d.getFullYear(), d.getMonth(), 20), "dividend", {
      symbol: "VWRL", amount: r2(gross * 0.85), tax: r2(gross * 0.15), currency: vwrl.currency,
      description: `${vwrl.name} Dividend`,
    })
  }
}

for (const [i, a] of acts.entries()) {
  await db.execute({
    sql: `INSERT INTO "PortfolioActivity" (date, type, symbol, quantity, price, amount, currency, fee, tax,
            counterAmount, counterCurrency, description, broker, sourceHash, importedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yuh', ?, ?)`,
    args: [stamp(local(a.date.getFullYear(), a.date.getMonth(), a.date.getDate())), a.type, a.symbol, a.quantity,
      a.price, a.amount, a.currency, a.fee, a.tax, a.counterAmount, a.counterCurrency, a.description,
      hash("demo-yuh", i), stamp(new Date())],
  })
}

console.log(`${OUT}: ${tx.length} transactions, ${MONTHS} snapshots, ${acts.length} portfolio activities`)
console.log("ETF look-through: upload holdings files on /portfolio/look-through (they're public fund data).")
