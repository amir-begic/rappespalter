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

// camt entry text, for rows without a party name (card and TWINT payments). Banks
// put the payee in free text, with the payment type in front and, on following
// lines, the date, time, card number and exchange rate:
//   Einkauf Muster Laden-1234 Bern\n01.02.2026, 12:30, Visa Debit-Nr. 123456xxxxxx1234
//   Einkauf TWINT, MUSTER AG
//   Zahlung TWINT MUSTER, ANNA
// Only the payee is kept. Text in no known form keeps its first line.
export type PayeeKind = "merchant" | "person" | "cash" | "other"

export function cleanCamtPayee(text: string): { name: string; kind: PayeeKind } {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  // A correction of a card purchase names the purchase on its second line.
  const first = (/^Gutschrift Wechselkurs-Korrektur/i.test(lines[0] ?? "") && lines[1]) || lines[0] || ""
  // Raiffeisen XLSX: "MUSTER, ANNA TWINT Nr 123", the same payee as in camt.
  const line = first.replace(/\s+TWINT Nr\b.*$/i, "")
  if (/^Bancomat (Bezug|Einzahlung)\b/i.test(line)) return { name: line, kind: "cash" }

  const rest = (pattern: RegExp) => line.match(pattern)?.[1]?.trim()
  const paid = rest(/^(?:Zahlung|Überweisung) TWINT(?: an)?[, ]+(.+)$/i)
  if (paid) return { name: paid, kind: "person" }
  const received = rest(/^Gutschrift TWINT[, ]+(.+)$/i)
  if (received) return { name: received, kind: received.includes(",") ? "person" : "merchant" }
  const bought = rest(/^Einkauf TWINT[, ]+(.+)$/i) ?? rest(/^Einkauf (.+)$/i)
  if (bought) return { name: bought, kind: "merchant" }
  return { name: rest(/^(?:Gutschrift|Instant-Zahlung|Dauerauftrag|Sammelzahlung|Zahlung) (.+)$/i) ?? line, kind: "other" }
}

// What makes two counterparties the same payee: "Einkauf Muster-12 Bern\n…" and
// "Muster-34 Bern" match, across camt and Raiffeisen XLSX. All cash at a machine is
// one payee per direction, whichever machine it was.
export function payeeKey(counterparty: string): string {
  const { name, kind } = cleanCamtPayee(counterparty)
  if (kind === "cash") return name.toLowerCase().split(/\s+/).slice(0, 2).join(" ")
  return name.toLowerCase()
    .replace(/-\d+\b/g, " ")          // branch number
    .replace(/\b\d+\b/g, " ")
    .replace(/[^\p{L}\p{N}&]+/gu, " ")
    .trim()
}

// The first word of a shop's name, so one branch can vouch for another. Not for
// people ("MUSTER, ANNA": a surname says nothing about the category) or cash.
export function payeeBrand(counterparty: string): string | null {
  const { name, kind } = cleanCamtPayee(counterparty)
  if (kind === "cash" || kind === "person" || name.includes(",")) return null
  const first = payeeKey(counterparty).split(" ")[0]
  return first.length >= 3 ? first : null
}
