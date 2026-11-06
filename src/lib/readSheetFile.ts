import Papa from 'papaparse'
import { MAX_IMPORT_BYTES, type ParsedSheet } from './importOrg'

// Reads a CSV or XLSX file the user picked into a plain table of text. All
// parsing happens in the browser; the file itself is never uploaded.

export class SheetFileError extends Error {}

/** One cell as text. Dates become YYYY-MM-DD; empty cells become "". */
export function cellToText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

/** Turns raw rows (first row = headers) into a ParsedSheet with padded rows and unique headers. */
export function toParsedSheet(table: unknown[][]): ParsedSheet {
  const matrix = table.map(r => r.map(cellToText))
  // The header row is the first row with any content.
  const first = matrix.findIndex(r => r.some(c => c.trim()))
  if (first < 0) throw new SheetFileError('This file is empty.')
  const width = Math.max(...matrix.slice(first).map(r => r.length))
  const headers = Array.from({ length: width }, (_, i) => (matrix[first][i] ?? '').trim() || `Column ${i + 1}`)
  const rows = matrix.slice(first + 1).map(r => Array.from({ length: width }, (_, i) => r[i] ?? ''))
  if (rows.length === 0) throw new SheetFileError('This file has a header row but no data rows.')
  return { headers, rows }
}

export function parseCsvText(text: string): ParsedSheet {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' })
  if (result.data.length === 0) throw new SheetFileError('This file is empty.')
  return toParsedSheet(result.data)
}

export async function readSheetFile(file: File): Promise<ParsedSheet> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new SheetFileError(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`)
  }
  const name = file.name.toLowerCase()

  if (name.endsWith('.xlsx')) {
    try {
      // Loaded on demand: most imports are CSV, and this keeps it out of the main bundle.
      const { readSheet } = await import('read-excel-file/browser')
      return toParsedSheet(await readSheet(file))
    } catch (err) {
      if (err instanceof SheetFileError) throw err
      throw new SheetFileError('This Excel file could not be read. Try saving it as .xlsx again, or export it as CSV.')
    }
  }
  if (name.endsWith('.xls')) {
    throw new SheetFileError('Old .xls files are not supported. Save the sheet as .xlsx or CSV and try again.')
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt') || file.type === 'text/csv') {
    return parseCsvText(await file.text())
  }
  throw new SheetFileError('Choose a .csv or .xlsx file.')
}
