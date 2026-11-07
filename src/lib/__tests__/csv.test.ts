import { describe, expect, it } from "vitest"
import { localDay, toCsv } from "../csv"

const BOM = "﻿"
const body = (rows: Parameters<typeof toCsv>[0]) => toCsv(rows).slice(BOM.length)

describe("toCsv", () => {
  it("starts with a BOM and separates with semicolons", () => {
    expect(toCsv([["Date", "Amount"], ["2026-10-01", -56.23]])).toBe(`${BOM}Date;Amount\r\n2026-10-01;-56.23\r\n`)
  })

  it("quotes text holding a separator, a quote or a line break", () => {
    expect(body([["a;b", 'say "hi"', "line 1\nline 2"]])).toBe('"a;b";"say ""hi""";"line 1\nline 2"\r\n')
  })

  it("leaves an empty cell for null", () => {
    expect(body([["a", null, "b"]])).toBe("a;;b\r\n")
  })

  it("keeps a umlaut as it is", () => {
    expect(body([["Säule 3a"]])).toBe("Säule 3a\r\n")
  })

  it.each(["=SUM(A1)", "+41 79", "-1+1", "@cmd", "\tx"])("defuses the formula start in %j", text => {
    expect(body([[text]])).toBe(`'${text}\r\n`)
  })

  it("quotes a defused value when it needs it", () => {
    expect(body([['=HYPERLINK("x";"y")']])).toBe(`"'=HYPERLINK(""x"";""y"")"\r\n`)
  })

  it("keeps negative numbers as numbers", () => {
    expect(body([[-1550]])).toBe("-1550\r\n")
  })
})

describe("localDay", () => {
  it("gives the local day, not the UTC one", () => {
    expect(localDay(new Date(2026, 9, 1))).toBe("2026-10-01")
    expect(localDay(new Date(2026, 9, 1, 23, 59))).toBe("2026-10-01")
  })

  it("reads a stored date string", () => {
    const stored = new Date(2026, 0, 5).toISOString()
    expect(localDay(stored)).toBe("2026-01-05")
  })
})
