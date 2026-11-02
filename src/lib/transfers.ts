// Money moved between your own accounts: the same amount leaving one account and
// arriving in another a few days apart. A bank export with several accounts
// (checking, savings, card) holds both halves; counted as they are, the move is
// spending on one side and income on the other. Pure — the import route
// (src/app/api/import/route.ts) files the pairs under a transfer-type category.

export const TRANSFER_WINDOW_DAYS = 3

export interface TransferCandidate {
  date:     Date
  amount:   number
  currency: string
  account:  string
}

const DAY = 86_400_000
const cents = (n: number) => Math.round(n * 100)

// Pairs of [outgoing index, incoming index]: opposite amounts to the cent, same
// currency, different accounts, at most TRANSFER_WINDOW_DAYS apart. Each
// transaction is in at most one pair; an outflow takes the nearest unpaired
// inflow, so two equal transfers in one week still pair up one to one.
export function findTransferPairs(txs: TransferCandidate[]): [number, number][] {
  const inflows = new Map<string, number[]>()
  txs.forEach((t, i) => {
    if (t.amount <= 0 || !t.account) return
    const key = `${t.currency}|${cents(t.amount)}`
    inflows.set(key, [...(inflows.get(key) ?? []), i])
  })

  const used = new Set<number>()
  const pairs: [number, number][] = []
  const outflows = txs
    .map((t, i) => i)
    .filter(i => txs[i].amount < 0 && txs[i].account)
    .sort((a, b) => txs[a].date.getTime() - txs[b].date.getTime())

  for (const o of outflows) {
    const out = txs[o]
    let best = -1, bestGap = Infinity
    for (const i of inflows.get(`${out.currency}|${-cents(out.amount)}`) ?? []) {
      if (used.has(i) || txs[i].account === out.account) continue
      const gap = Math.abs(txs[i].date.getTime() - out.date.getTime())
      if (gap <= TRANSFER_WINDOW_DAYS * DAY && gap < bestGap) { best = i; bestGap = gap }
    }
    if (best < 0) continue
    used.add(o); used.add(best)
    pairs.push([o, best])
  }
  return pairs
}
