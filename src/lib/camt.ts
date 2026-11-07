import { createHash } from "node:crypto"
import { XMLParser } from "fast-xml-parser"
import * as XLSX from "xlsx"
import { cleanCamtPayee } from "./counterparty"
import type { ParsedTransaction } from "./parser"

// ISO 20022 cash-management statements, the format every Swiss bank offers in
// e-banking: camt.053 (account statement), camt.054 (booking notification) and
// camt.052 (intraday report) share the entry structure read here. Versions .04
// to .08+ differ only in a few nestings (Sts/Cd, RltdPties/Cdtr/Pty), handled
// below. A .zip of several statements (how many banks deliver them) works too.
//
// camt has no spending categories, so entries come in uncategorized (rules, payee
// history and the review inbox sort them), except salary (purpose or bank code SALA)
// and payments to another account in the same upload (a transfer).

export class CamtFormatError extends Error {
  constructor() {
    super("Not a camt.052 / .053 / .054 file")
    this.name = "CamtFormatError"
  }
}

// Containers per message type: statement, notification, report.
const MESSAGES = [
  ["BkToCstmrStmt", "Stmt"],
  ["BkToCstmrDbtCdtNtfctn", "Ntfctn"],
  ["BkToCstmrAcctRpt", "Rpt"],
] as const

const ARRAYS = new Set(["Stmt", "Ntfctn", "Rpt", "Ntry", "NtryDtls", "TxDtls", "Ustrd", "Strd", "AddtlNtryInf"])

const xml = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: "@",
  removeNSPrefix:      true,
  parseTagValue:       false, // amounts and references stay strings
  isArray:             name => ARRAYS.has(name),
})

// The parsed XML is loosely typed; read it through these.
type Node = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
function text(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "object") return text((v as Node)["#text"])
  return String(v).trim()
}
function amountOf(amt: unknown): { value: number; currency: string } | null {
  const value = parseFloat(text(amt))
  if (isNaN(value)) return null
  return { value, currency: typeof amt === "object" && amt ? text((amt as Node)["@Ccy"]) : "" }
}
const cents = (n: number) => Math.round(n * 100)

// "CH9300762011623852957" → "CH93 0076 2011 6238 5295 7"
function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ")
}
function accountId(acct: Node | undefined): string {
  return text(acct?.Id?.IBAN) || text(acct?.Id?.Othr?.Id)
}

// Party name: <Nm> directly (up to .07) or under <Pty> (.08+).
function partyName(p: Node | undefined): string {
  return text(p?.Nm) || text(p?.Pty?.Nm)
}

function remittance(tx: Node | undefined): string[] {
  const rmt = tx?.RmtInf
  return [
    ...(rmt?.Ustrd ?? []).map(text),
    ...(rmt?.Strd ?? []).map((s: Node) => text(s?.CdtrRefInf?.Ref)),
  ].filter(Boolean)
}

function isSalary(entry: Node, tx: Node | undefined): boolean {
  const code = entry.BkTxCd?.Domn?.Fmly?.SubFmlyCd
  return text(tx?.Purp?.Cd) === "SALA" || text(code) === "SALA"
}

function hash(key: string): string {
  return "camt:" + createHash("sha256").update(key).digest("hex").slice(0, 24)
}

// The XML documents in an upload: the file itself, or each .xml in a .zip.
function documents(buffer: Buffer, fileName: string): string[] {
  const decode = (b: Buffer) => b.toString("utf8").replace(/^\uFEFF/, "")
  if (!fileName.toLowerCase().endsWith(".zip")) return [decode(buffer)]
  const zip = XLSX.CFB.read(buffer, { type: "buffer" })
  const files: { name: string; content?: Uint8Array }[] = zip.FileIndex
  return files
    .filter(f => f.name.toLowerCase().endsWith(".xml") && f.content?.length)
    .map(f => decode(Buffer.from(f.content!)))
}

interface Report {
  account: string // IBAN
  entries: Node[]
}

function reports(doc: string): Report[] {
  let root: Node
  try {
    root = xml.parse(doc)?.Document
  } catch {
    return []
  }
  if (!root) return []
  return MESSAGES.flatMap(([message, container]) =>
    ((root[message]?.[container] ?? []) as Node[]).map(r => ({
      account: accountId(r.Acct),
      entries: (r.Ntry ?? []) as Node[],
    })),
  )
}

export function parseCamt(buffer: Buffer, fileName: string): ParsedTransaction[] {
  const all = documents(buffer, fileName).flatMap(reports)
  if (all.length === 0) throw new CamtFormatError()

  // Payments to another of the uploaded accounts are transfers between own accounts.
  const ownAccounts = new Set(all.map(r => r.account).filter(Boolean))

  const seen = new Set<string>()
  const transactions: ParsedTransaction[] = []

  for (const report of all) {
    // Identical entries without a bank reference are numbered per report, so the
    // same statement imported twice (or overlapping ones) still deduplicates.
    const occurrences = new Map<string, number>()

    for (const entry of report.entries) {
      const status = text(entry.Sts?.Cd ?? entry.Sts)
      if (status && status !== "BOOK") continue // pending or information only

      const day = text(entry.BookgDt?.Dt) || text(entry.BookgDt?.DtTm).slice(0, 10)
        || text(entry.ValDt?.Dt) || text(entry.ValDt?.DtTm).slice(0, 10)
      const total = amountOf(entry.Amt)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !total) continue
      const date = new Date(`${day}T00:00:00Z`)
      const entrySign = text(entry.CdtDbtInd) === "DBIT" ? -1 : 1
      const entryRef = text(entry.AcctSvcrRef) || text(entry.NtryRef)
      const entryInfo = ((entry.AddtlNtryInf ?? []) as unknown[]).map(text).filter(Boolean)

      // A batch booking (several payments in one entry) is split into its
      // payments when every one has an amount and they add up to the entry.
      const details = ((entry.NtryDtls ?? []) as Node[]).flatMap(d => (d.TxDtls ?? []) as Node[])
      const parts = details.map(tx => {
        const amt = amountOf(tx.Amt ?? tx.AmtDtls?.TxAmt?.Amt)
        const sign = tx.CdtDbtInd ? (text(tx.CdtDbtInd) === "DBIT" ? -1 : 1) : entrySign
        return amt && amt.currency === total.currency ? sign * amt.value : null
      })
      const split = details.length > 1 && parts.every(p => p != null)
        && cents(parts.reduce<number>((s, p) => s + p!, 0)) === cents(entrySign * total.value)

      const rows: { tx: Node | undefined; amount: number }[] = split
        ? details.map((tx, i) => ({ tx, amount: parts[i]! }))
        : [{ tx: details.length === 1 ? details[0] : undefined, amount: entrySign * total.value }]

      rows.forEach(({ tx, amount }, i) => {
        const out = amount < 0
        const parties = tx?.RltdPties
        const name = partyName(out ? parties?.Cdtr : parties?.Dbtr)
          || partyName(out ? parties?.UltmtCdtr : parties?.UltmtDbtr)
        const otherAccount = accountId(out ? parties?.CdtrAcct : parties?.DbtrAcct)
        const txInfo = text(tx?.AddtlTxInf)
        const bankText = (name || txInfo || entryInfo[0] || formatIban(otherAccount) || "?").slice(0, 140)
        // Free text carries the payment type, date and card number around the payee.
        const counterparty = name ? bankText : cleanCamtPayee(bankText).name

        const bookingText = [...new Set([
          ...entryInfo, txInfo, name, otherAccount && formatIban(otherAccount), ...remittance(tx),
        ].filter(Boolean))].join("\n")

        // The bank's reference; the index too, as some banks repeat the entry's
        // reference on every payment of a batch.
        const ref = text(tx?.Refs?.AcctSvcrRef) || entryRef
        let key: string
        if (ref) {
          key = `${report.account}|${ref}|${i}`
        } else {
          // The bank's text, not the cleaned payee: rows imported earlier keep their hash.
          const base = `${report.account}|${day}|${cents(amount)}|${bankText}`
          const n = occurrences.get(base) ?? 0
          occurrences.set(base, n + 1)
          key = `${base}|${n}`
        }
        const sourceHash = hash(key)
        if (seen.has(sourceHash)) return // the same entry in another file of the upload
        seen.add(sourceHash)

        const transfer = otherAccount && otherAccount !== report.account && ownAccounts.has(otherAccount)
        transactions.push({
          date,
          counterparty,
          bankText,
          amount: cents(amount) / 100,
          currency: total.currency || "CHF",
          account: formatIban(report.account),
          ...(transfer
            ? { categories: [], categorySource: "transfer" as const }
            : !out && isSalary(entry, tx)
              ? { categories: ["Salary", "Income"], categorySource: "bank" as const }
              // No category from the bank: imported uncategorized (review inbox).
              : { categories: [], categorySource: "bank" as const }),
          bookingText,
          sourceHash,
        })
      })
    }
  }

  return transactions
}
