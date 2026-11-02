// Target allocation, where new money should go, and what the portfolio costs
// per year. Pure, like engine.ts. All amounts in CHF.
//
// Targets apply to the holdings that have one (e.g. your ETFs) and are scaled
// to add up to 100% across them; holdings without a target (a single stock you
// keep on the side) are left out of the allocation maths.

export interface AllocationHolding {
  symbol: string
  name:   string
  value:  number
  target: number | null // fraction
  ter:    number | null // fraction per year
}

export interface AllocationRow {
  symbol:      string
  name:        string
  value:       number
  weight:      number // share of the holdings with a target
  target:      number // normalised
  deviation:   number // weight − target
  rebalance:   number // buy (+) / sell (−) to hit the target exactly, no new money
  buy:         number // share of the next contribution (never a sale)
  weightAfter: number // after investing the contribution
}

export interface AllocationResult {
  managedValue: number
  targetSum:    number   // as entered, before scaling (1 = 100%)
  rows:         AllocationRow[]
  unmanaged:    string[] // holdings without a target
  maxDeviation: number   // largest |weight − target|
  fees: {
    fundCost:    number        // Σ value × TER per year
    weightedTer: number | null // over holdings with a TER
    tradingTtm:  number        // trading & FX fees, last 12 months
    totalYear:   number        // fundCost + tradingTtm
    pctOfValue:  number | null // totalYear ÷ value of all holdings
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Buy-only rebalancing: raise the most underweight holdings first ("water
// filling"). Finds the portfolio size L at which buying max(0, t·L − v) for
// every holding costs exactly the contribution.
export function allocateContribution(values: number[], targets: number[], amount: number): number[] {
  if (amount <= 0 || !values.length) return values.map(() => 0)
  const cost = (L: number) => values.reduce((s, v, i) => s + Math.max(0, targets[i] * L - v), 0)
  let lo = 0, hi = values.reduce((s, v) => s + v, 0) + amount
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (cost(mid) < amount) lo = mid
    else hi = mid
  }
  const buys = values.map((v, i) => Math.max(0, targets[i] * hi - v))
  const total = buys.reduce((s, b) => s + b, 0)
  return total > 0 ? buys.map(b => b * amount / total) : values.map(() => 0) // exact sum after bisection
}

export function analyseAllocation(
  holdings: AllocationHolding[], opts: { contribution: number; tradingFeesTtm: number },
): AllocationResult {
  const managed = holdings.filter(h => h.target != null && h.target > 0)
  const targetSum = managed.reduce((s, h) => s + h.target!, 0)
  const managedValue = managed.reduce((s, h) => s + h.value, 0)
  const targets = managed.map(h => targetSum > 0 ? h.target! / targetSum : 0)
  const buys = allocateContribution(managed.map(h => h.value), targets, opts.contribution)
  const after = managedValue + opts.contribution

  const rows: AllocationRow[] = managed.map((h, i) => {
    const weight = managedValue > 0 ? h.value / managedValue : 0
    return {
      symbol: h.symbol, name: h.name, value: round2(h.value), weight, target: targets[i],
      deviation:   weight - targets[i],
      rebalance:   round2(targets[i] * managedValue - h.value),
      buy:         round2(buys[i]),
      weightAfter: after > 0 ? (h.value + buys[i]) / after : 0,
    }
  })

  const withTer = holdings.filter(h => h.ter != null)
  const fundCost = withTer.reduce((s, h) => s + h.value * h.ter!, 0)
  const terValue = withTer.reduce((s, h) => s + h.value, 0)
  const allValue = holdings.reduce((s, h) => s + h.value, 0)
  const totalYear = fundCost + opts.tradingFeesTtm

  return {
    managedValue: round2(managedValue),
    targetSum,
    rows,
    unmanaged: holdings.filter(h => !managed.includes(h)).map(h => h.symbol),
    maxDeviation: rows.reduce((m, r) => Math.max(m, Math.abs(r.deviation)), 0),
    fees: {
      fundCost:    round2(fundCost),
      weightedTer: terValue > 0 ? fundCost / terValue : null,
      tradingTtm:  round2(opts.tradingFeesTtm),
      totalYear:   round2(totalYear),
      pctOfValue:  allValue > 0 ? totalYear / allValue : null,
    },
  }
}
