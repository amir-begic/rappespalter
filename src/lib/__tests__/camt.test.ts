import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { parseCamt } from "../camt"

// A fictional camt.053 statement: a card purchase, a salary, a transfer to another
// account in the same file, a pending entry and a batch of two payments.
const IBAN_A = "CH9300762011623852957"
const IBAN_B = "CH5604835012345678009"

const entry = (body: string, status = "BOOK") => `
  <Ntry><Sts><Cd>${status}</Cd></Sts><BookgDt><Dt>2026-03-10</Dt></BookgDt>${body}</Ntry>`

const statement = (iban: string, entries: string) => `
  <Stmt><Acct><Id><IBAN>${iban}</IBAN></Id></Acct>${entries}</Stmt>`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt>
${statement(IBAN_A, [
  entry(`<Amt Ccy="CHF">42.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><AcctSvcrRef>R1</AcctSvcrRef>
    <AddtlNtryInf>Grocery Store Example</AddtlNtryInf>`),
  entry(`<Amt Ccy="CHF">5000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><AcctSvcrRef>R2</AcctSvcrRef>
    <NtryDtls><TxDtls><Purp><Cd>SALA</Cd></Purp>
      <RltdPties><Dbtr><Nm>Example Employer AG</Nm></Dbtr></RltdPties></TxDtls></NtryDtls>`),
  entry(`<Amt Ccy="CHF">1000.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><AcctSvcrRef>R3</AcctSvcrRef>
    <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Me</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${IBAN_B}</IBAN></Id></CdtrAcct></RltdPties></TxDtls></NtryDtls>`),
  entry(`<Amt Ccy="CHF">99.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><AcctSvcrRef>R4</AcctSvcrRef>`, "PDNG"),
  entry(`<Amt Ccy="CHF">300.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><AcctSvcrRef>R5</AcctSvcrRef>
    <NtryDtls>
      <TxDtls><Amt Ccy="CHF">100.00</Amt><RltdPties><Cdtr><Nm>Landlord Example</Nm></Cdtr></RltdPties></TxDtls>
      <TxDtls><Amt Ccy="CHF">200.00</Amt><RltdPties><Cdtr><Nm>Insurance Example</Nm></Cdtr></RltdPties></TxDtls>
    </NtryDtls>`),
].join(""))}
${statement(IBAN_B, "")}
</BkToCstmrStmt></Document>`

describe("parseCamt", () => {
  const rows = parseCamt(Buffer.from(xml), "statement.xml")
  const by = (name: string) => rows.find(r => r.counterparty === name)!

  it("reads booked entries only, splitting batches", () => {
    expect(rows.map(r => r.amount).sort((a, b) => a - b)).toEqual([-1000, -200, -100, -42.5, 5000])
  })
  it("names the counterparty from the parties, else the entry info", () => {
    expect(by("Grocery Store Example").amount).toBe(-42.5)
    expect(by("Landlord Example").amount).toBe(-100)
  })
  it("files salary and transfers between uploaded accounts", () => {
    expect(by("Example Employer AG").categories).toEqual(["Salary", "Income"])
    expect(by("Me").categorySource).toBe("transfer")
    expect(by("Grocery Store Example").categories).toEqual([])
  })
  it("gives the same statement the same hashes when imported again", () => {
    const again = parseCamt(Buffer.from(xml), "statement.xml")
    expect(again.map(r => r.sourceHash)).toEqual(rows.map(r => r.sourceHash))
    expect(new Set(rows.map(r => r.sourceHash)).size).toBe(rows.length)
  })
  it("keeps only the payee from free text, and the bank's text for rules and hashes", () => {
    const card = (info: string, amount: string) => Buffer.from(`<Document><BkToCstmrStmt>${statement(IBAN_A,
      entry(`<Amt Ccy="CHF">${amount}</Amt><CdtDbtInd>DBIT</CdtDbtInd><AddtlNtryInf>${info}</AddtlNtryInf>`))}</BkToCstmrStmt></Document>`)
    const text = "Einkauf Example Shop-12\n10.03.2026, 12:30, Visa Debit-Nr. 123456xxxxxx1234"
    const [row] = parseCamt(card(text, "9.50"), "card.xml")
    expect(row.counterparty).toBe("Example Shop-12")
    expect(row.bankText).toBe(text)
    expect(row.bookingText).toContain("Visa Debit-Nr.")
    // Hashed from the bank's text, as it was before cleaning, so older imports still match.
    const key = `${IBAN_A}|2026-03-10|-950|${text}|0`
    expect(row.sourceHash).toBe("camt:" + createHash("sha256").update(key).digest("hex").slice(0, 24))
  })
  it("rejects files that aren't camt", () => {
    expect(() => parseCamt(Buffer.from("<html></html>"), "x.xml")).toThrow()
  })
})
