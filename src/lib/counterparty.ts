// Counterparty names as Raiffeisen exports them. Pure; used by the parser and by
// the recurring-payment detection.

// Raiffeisen exports some payments with only the payment type as counterparty
// ("Dauerauftrag") and the payee on the second line of the booking text:
//   Dauerauftrag\nMuster AG\nMusterstrasse 1\n9000 St. Gallen\nCH\n…
// The same standing order shows up in other months as "Dauerauftrag Muster
// AG", so these labels get the payee appended to match that form.
const PAYMENT_TYPES = [
  "dauerauftrag",
  "sammelzahlung",
  "zahlung",
  "instant-zahlung",
  "gutschrift",
]
const GENERIC_COUNTERPARTIES = new Set(PAYMENT_TYPES)

export function resolveCounterparty(counterparty: string, bookingText: string): string {
  if (!GENERIC_COUNTERPARTIES.has(counterparty.toLowerCase())) return counterparty
  const [first, payee] = bookingText.split(/\r?\n/).map(line => line.trim())
  if (first !== counterparty || !payee) return counterparty
  return `${counterparty} ${payee}`
}

// The payee alone, without the payment type in front: "Dauerauftrag Muster AG",
// "Instant-Zahlung Muster AG" and "Muster AG" are all "Muster AG". Payments of
// one kind change type over time (a standing order paid by hand one month).
export function payeeName(counterparty: string): string {
  const lower = counterparty.toLowerCase()
  const type = PAYMENT_TYPES.find(t => lower.startsWith(t + " "))
  return type ? counterparty.slice(type.length + 1).trim() : counterparty.trim()
}
