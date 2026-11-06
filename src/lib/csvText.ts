// CSV writing that is safe to open in Excel or Google Sheets (roadmap 2.2).
//
// A text cell that starts with = + - @ (or a tab / carriage return) is run as a
// formula by spreadsheet apps, so a role called "=HYPERLINK(...)" in an export could
// act on whoever opens the file ("CSV injection"). We prefix such cells with an
// apostrophe, which spreadsheets treat as "this is text". Import removes it again,
// so export → import round-trips the original text.

const FORMULA_START = /^[=+\-@\t\r]/
const GUARDED = /^'[=+\-@\t\r]/

/** Makes a text value safe to put in a spreadsheet cell. */
export function guardCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value
}

/** Undoes guardCell: "'=1+1" → "=1+1". Other text is untouched. */
export function unguardCell(value: string): string {
  return GUARDED.test(value) ? value.slice(1) : value
}

function quote(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export type CsvCell = string | number

/**
 * Rows → CSV text. The first row is the header and is written as-is; text in later
 * rows is guarded against formulas (numbers are left alone, so a negative X stays a
 * number). CRLF line endings, and a byte-order mark so Excel reads UTF-8 correctly.
 */
export function toCsv(rows: CsvCell[][], options: { bom?: boolean } = { bom: true }): string {
  const lines = rows.map((row, i) =>
    row.map(c => (typeof c === 'number' ? String(c) : quote(i === 0 ? c : guardCell(c)))).join(','))
  return (options.bom === false ? '' : '﻿') + lines.join('\r\n') + '\r\n'
}

/** A safe file name from a chart or workspace name. */
export function fileSlug(name: string, fallback = 'export'): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return slug || fallback
}
