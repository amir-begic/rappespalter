// Pure lease-vs-buy comparison for one vehicle over the same number of years.
//
// Each option is a series of monthly payments. Cash and loan end with a car you
// can sell (worth the price after declining-balance depreciation); a lease ends
// with the car handed back. Money tied up in the car could have been invested
// instead, so payments are carried forward to the end at the investment return:
// the "missed returns". Total cost = payments + missed returns − resale value.
// Running costs (insurance, fuel, tyres) are the same either way and left out.

export interface CarDeal {
  price:        number // CHF
  years:        number
  depreciation: number // a year, declining balance: 0.15 = 15%
  invest:       number // what the money would earn a year otherwise
  loanDown:     number // CHF
  loanRate:     number // a year
  leaseDown:    number // CHF (Sonderzahlung)
  leaseMonthly: number // CHF
  leaseResidual: number // buyout price at the end (only for the lease's effective rate)
}

export const DEAL_DEFAULTS: CarDeal = {
  price: 40000, years: 4, depreciation: 0.15, invest: 0.04,
  loanDown: 10000, loanRate: 0.049,
  leaseDown: 5000, leaseMonthly: 450, leaseResidual: 18000,
}

export type OptionKey = "cash" | "loan" | "lease"

export interface OptionCost {
  key:      OptionKey
  label:    string
  paid:     number // everything paid, down payment included
  interest: number // loan interest (in `paid`)
  missed:   number // returns the money would have earned
  resale:   number // what the car is worth at the end (0 for a lease)
  total:    number // paid + missed − resale
  perMonth: number
}

/** Monthly annuity that repays `amount` over `n` months at monthly rate `r`. */
export function annuity(amount: number, r: number, n: number): number {
  if (n <= 0) return amount
  return r === 0 ? amount / n : amount * r / (1 - Math.pow(1 + r, -n))
}

// Payments at month 0 (down) and months 1…n, carried forward to month n.
function carried(down: number, monthly: number, n: number, r: number): number {
  let fv = down * Math.pow(1 + r, n)
  for (let t = 1; t <= n; t++) fv += monthly * Math.pow(1 + r, n - t)
  return fv
}

export function compareDeal(d: CarDeal): OptionCost[] {
  const n = Math.max(1, Math.round(d.years * 12))
  const ri = d.invest / 12
  const resale = d.price * Math.pow(1 - Math.min(d.depreciation, 0.99), n / 12)

  const option = (key: OptionKey, label: string, down: number, monthly: number, end: number, interest = 0): OptionCost => {
    const paid = down + monthly * n
    const missed = carried(down, monthly, n, ri) - paid
    const total = paid + missed - end
    return { key, label, paid, interest, missed, resale: end, total, perMonth: total / n }
  }

  const loanDown = Math.min(d.loanDown, d.price)
  const loanMonthly = annuity(d.price - loanDown, d.loanRate / 12, n)
  return [
    option("cash", "Pay cash", d.price, 0, resale),
    option("loan", "Loan", loanDown, loanMonthly, resale, loanMonthly * n - (d.price - loanDown)),
    option("lease", "Lease", d.leaseDown, d.leaseMonthly, 0),
  ]
}

/** The interest rate a year a lease effectively charges: the rate at which the
 *  down payment, the monthly payments and the buyout price add up to the car's
 *  price today. Null when no rate between −20% and 60% fits. */
export function leaseRate(d: CarDeal): number | null {
  const n = Math.max(1, Math.round(d.years * 12))
  const financed = d.price - d.leaseDown
  const pv = (r: number) => {
    let s = d.leaseResidual / Math.pow(1 + r, n)
    for (let t = 1; t <= n; t++) s += d.leaseMonthly / Math.pow(1 + r, t)
    return s
  }
  // pv falls as r rises; bisect for pv(r) = financed.
  let lo = -0.2 / 12, hi = 0.6 / 12
  if (pv(lo) < financed || pv(hi) > financed) return null
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (pv(mid) > financed) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * 12
}
