// The Federal Tax Administration's tax calculator (swisstaxcalculator.estv.admin.ch).
// Its API is public but undocumented and unofficial, like Yahoo's in market.ts:
// keep every ESTV specific in this file. Called only when the user asks — a
// municipality search sends the typed place name; an estimate sends exactly a
// TaxRequest (no names or accounts). One request at a time, spaced out.

import type { Church, Relationship, TaxLocation, TaxRequest, TaxResult } from "./tax-estimate"

const BASE = "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV"
const HEADERS = { "Content-Type": "application/json", "User-Agent": "Rappespalter (personal finance desktop app)" }
const MIN_GAP_MS = 1_000
// Answers take well under a second. A connection that hangs is often ESTV holding
// off an address that sent many requests, so give up early and retry only once —
// more retries would add to the load it's refusing.
const TIMEOUT_MS = 8_000
const RETRY_DELAYS_MS = [2_000]

/** unreachable: no answer (offline, or ESTV holding off requests) · refused: ESTV answered with an error ·
 *  changed: the answer isn't what this code knows. */
export type EstvFailure = "unreachable" | "refused" | "changed"
export class EstvError extends Error {
  constructor(readonly reason: EstvFailure, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "EstvError"
  }
}

const RELATIONSHIP_ID: Record<Relationship, number> = { single: 1, married: 2, partnership: 4 }
const CONFESSION_ID: Record<Church, number> = { protestant: 1, roman: 2, christ: 3, none: 5 }
// The calculator wants each child's age (it affects some deductions); the app only asks how many.
const CHILD_AGE = 10
// RevenueType: 0 = none, 2 = net income (after social contributions).
const revenueType = (income: number) => income > 0 ? 2 : 0

let queue: Promise<unknown> = Promise.resolve()
let lastSent = 0
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function post(operation: string, body: unknown): Promise<Response> {
  const wait = lastSent + MIN_GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastSent = Date.now()
  return fetch(`${BASE}/${operation}`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

async function send(operation: string, body: unknown): Promise<Record<string, unknown>> {
  let res: Response | null = null
  // Retried only when no answer came; an answer from ESTV, even an error, is final.
  for (let i = 0; !res; i++) {
    try {
      res = await post(operation, body)
    } catch (e) {
      if (i >= RETRY_DELAYS_MS.length) throw new EstvError("unreachable", "Couldn't reach the ESTV tax calculator", { cause: e })
      await sleep(RETRY_DELAYS_MS[i])
    }
  }
  // Calculation errors (e.g. a year without rules) come back as HTTP 500.
  if (!res.ok) throw new EstvError("refused", `ESTV ${operation} responded ${res.status}`)
  const json = await res.json().catch(() => null)
  const response = json?.response
  if (response == null || typeof response !== "object") throw new EstvError("changed", `ESTV ${operation}: no response`)
  return response
}

function call(operation: string, body: unknown) {
  const run = queue.then(() => send(operation, body))
  queue = run.catch(() => {})
  return run
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null

/** Places (one per postcode) matching a name or postcode. */
export async function searchLocations(query: string): Promise<TaxLocation[]> {
  const response = await call("API_searchLocation", { Search: query })
  if (!Array.isArray(response)) throw new EstvError("changed", "ESTV API_searchLocation: not a list")
  return response.flatMap((r: Record<string, unknown>) => {
    const id = num(r.TaxLocationID)
    if (id == null || typeof r.City !== "string" || typeof r.Canton !== "string") return []
    return [{ id, zip: String(r.ZipCode ?? ""), city: r.City, canton: r.Canton }]
  })
}

/** Income and wealth tax for one year, as the ESTV calculator works it out. */
export async function calculateTax(req: TaxRequest): Promise<TaxResult> {
  const partner = req.partnerChurch != null
  const partnerIncome = req.partnerIncome ?? 0
  const r = await call("API_calculateDetailedTaxes", {
    SimKey:        null,
    TaxYear:       req.year,
    TaxLocationID: req.locationId,
    Relationship:  RELATIONSHIP_ID[req.relationship],
    Children:      Array.from({ length: req.children }, () => ({ Age: CHILD_AGE })),
    Confession1:   CONFESSION_ID[req.church],
    Age1:          req.age,
    RevenueType1:  revenueType(req.income),
    Revenue1:      req.income,
    Confession2:   partner ? CONFESSION_ID[req.partnerChurch!] : 0,
    Age2:          partner ? req.age : 0,
    RevenueType2:  partner ? revenueType(partnerIncome) : 0,
    Revenue2:      partner ? partnerIncome : 0,
    Fortune:       req.wealth,
  })
  const field = (name: string) => {
    const v = num(r[name])
    if (v == null) throw new EstvError("changed", `ESTV API_calculateDetailedTaxes: ${name} missing`)
    return v
  }
  const result = {
    income: {
      federal: field("IncomeTaxFed"), canton: field("IncomeTaxCanton"),
      city:    field("IncomeTaxCity"), church: field("IncomeTaxChurch"),
    },
    wealth:  { canton: field("FortuneTaxCanton"), city: field("FortuneTaxCity"), church: field("FortuneTaxChurch") },
    headTax: field("PersonalTax"),
  }
  // The parts add up to ESTV's TotalTax; a tax credit (TaxCredit) comes off it.
  const parts = Object.values(result.income).reduce((a, b) => a + b, 0)
    + Object.values(result.wealth).reduce((a, b) => a + b, 0) + result.headTax
  return { ...result, total: parts - (num(r.TaxCredit) ?? 0) }
}
