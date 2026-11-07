// A category's payments by payee, for the money flow diagram. Pure.

import { payeeName, resolveCounterparty } from "@/lib/counterparty"

export interface FlowPayment {
  counterparty: string
  bookingText:  string | null
  amount:       number
}

export interface PayeeGroup {
  name:  string
  value: number // > 0, in the payments' currency
}

export interface PayeeFlow {
  groups: PayeeGroup[]                            // largest first
  rest:   { count: number; value: number } | null // the smallest, merged
}

// Counterparties can hold a whole address on further lines; the first names the payee.
function payeeOf({ counterparty, bookingText }: FlowPayment): string {
  const resolved = resolveCounterparty(counterparty, bookingText ?? "")
  const firstLine = resolved.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? resolved
  return payeeName(firstLine)
}

// At most `max` entries: past that, the smallest merge into `rest`.
export function groupByPayee(payments: FlowPayment[], max: number): PayeeFlow {
  const byPayee = new Map<string, PayeeGroup>()
  for (const payment of payments) {
    const name = payeeOf(payment)
    const key = name.toLowerCase()
    const group = byPayee.get(key) ?? { name, value: 0 }
    group.value += Math.abs(payment.amount)
    byPayee.set(key, group)
  }

  const groups = [...byPayee.values()].sort((a, b) => b.value - a.value)
  if (groups.length <= max) return { groups, rest: null }
  const merged = groups.slice(max - 1)
  return {
    groups: groups.slice(0, max - 1),
    rest: { count: merged.length, value: merged.reduce((sum, g) => sum + g.value, 0) },
  }
}
