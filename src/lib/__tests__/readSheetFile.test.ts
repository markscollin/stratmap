import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readSheetFile, SheetFileError } from '../readSheetFile'
import { guessMapping, buildImportPlan } from '../importOrg'

const fixture = (name: string, type = 'application/octet-stream') =>
  new File([fs.readFileSync(path.join(__dirname, 'fixtures', name))], name, { type })

describe('readSheetFile', () => {
  it('reads an .xlsx workbook: numbers, dates and blanks become text', async () => {
    const sheet = await readSheetFile(fixture('people.xlsx'))
    expect(sheet.headers).toEqual(['ID', 'Name', 'Job Title', 'Department', 'Reports to', 'Start date'])
    expect(sheet.rows[1]).toEqual(['2', 'Sam Example', 'CTO', 'Engineering', '1', '2022-01-10'])
    expect(sheet.rows[2][1]).toBe('')
  })

  it('an .xlsx file goes through the whole plan', async () => {
    const sheet = await readSheetFile(fixture('people.xlsx'))
    const plan = buildImportPlan(sheet, guessMapping(sheet.headers))
    expect(plan.issues).toEqual([])
    expect(plan.nodes.map(n => n.title)).toEqual(['CEO', 'CTO', 'Software Engineer'])
    expect(plan.nodes[1].startDate).toBe('2022-01-10')
    expect(plan.edges).toHaveLength(2)
    expect(plan.stats.vacant).toBe(1)
  })

  it('reads CSV by extension', async () => {
    const f = new File(['Name,Title\nAda,CTO\n'], 'x.csv', { type: 'text/csv' })
    expect((await readSheetFile(f)).rows).toEqual([['Ada', 'CTO']])
  })

  it('rejects old .xls, unknown types, corrupt .xlsx and huge files with a clear message', async () => {
    await expect(readSheetFile(new File(['x'], 'a.xls'))).rejects.toThrow(/\.xls files are not supported/)
    await expect(readSheetFile(new File(['x'], 'a.pdf'))).rejects.toThrow(/\.csv or \.xlsx/)
    await expect(readSheetFile(new File(['not a zip'], 'a.xlsx'))).rejects.toThrow(SheetFileError)
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.csv')
    await expect(readSheetFile(big)).rejects.toThrow(/limit is 5 MB/)
  })
})
