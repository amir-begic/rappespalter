// CSV for spreadsheets. Semicolons and a BOM, so Excel with Swiss settings splits the
// columns and reads umlauts correctly without an import step.

export type CsvCell = string | number | null

const SEPARATOR = ";"
const BOM = "﻿"

// Text from a bank file must not run as a formula when the file is opened, so a
// leading = + - @ (or tab / line break) gets an apostrophe. Numbers stay numbers.
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: CsvCell): string {
  if (value === null) return ""
  if (typeof value === "number") return String(value)
  const text = FORMULA_START.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: CsvCell[][]): string {
  return BOM + rows.map(row => row.map(cell).join(SEPARATOR)).join("\r\n") + "\r\n"
}

// YYYY-MM-DD in local time. Dates are stored in UTC, so the 1st of a month is the
// last day of the month before there.
export function localDay(date: string | Date): string {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
