import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { testUser, signedInContext, onboard } from './helpers'

// Roadmap 2.2: export a chart as CSV, and get the same chart back by importing it.
// Free workspace (1 chart), so the re-import is added to the same chart and we compare
// the second copy's shape with the first.
let ctx: BrowserContext
let page: Page
// Downloads are shared between tests in this file (test.info().outputPath is per test).
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'stratmap-export-e2e-'))

const SOURCE = [
  'Name,Title,Department,Reports to,X,Y',
  'Alex Example,CEO,Leadership,,400,50',
  'Sam Example,CTO,Engineering,Alex Example,100,230',
  'Jo Example,Head of Sales,Go-to-Market,Alex Example,700,230',
  ',Software Engineer,Engineering,Sam Example,-40,410',
].join('\n') + '\n'

const dialog = () => page.getByRole('dialog', { name: 'Import people' })

/** Clicks Export → Export as CSV and returns the parsed rows (header first). */
async function exportCsv(testName: string): Promise<string[][]> {
  await page.getByTitle('Export', { exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export as CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('shape.csv')
  const target = path.join(downloads, `${testName}.csv`)
  await file.saveAs(target)
  const text = fs.readFileSync(target, 'utf8')
  expect(text.charCodeAt(0)).toBe(0xfeff) // BOM, so Excel reads accents correctly
  return text.slice(1).trim().split('\r\n').map(l => l.split(','))
}

test.describe.serial('export chart as CSV', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    ctx = await signedInContext(browser, testUser(`export${testInfo.retry}`).slug)
    page = await ctx.newPage()
    await onboard(page, 'Export Co')
  })
  test.afterAll(async () => { await ctx?.close(); fs.rmSync(downloads, { recursive: true, force: true }) })

  let first: string[][] = []

  test('a chart imported with positions keeps them, and exports as CSV', async () => {
    await page.goto('/charts')
    await page.getByTestId('import-btn').click()
    await dialog().getByTestId('import-file').setInputFiles({ name: 'shape.csv', mimeType: 'text/csv', buffer: Buffer.from(SOURCE) })
    await dialog().getByRole('button', { name: 'Review' }).click()
    await expect(dialog().getByText(/keep the positions in your file/)).toBeVisible()
    await dialog().getByLabel('New chart name').fill('Shape')
    await dialog().getByRole('button', { name: 'Import 4 roles' }).click()
    await expect(page).toHaveURL(/\/charts\/[^/]+$/)
    await expect(page.getByText('Sam Example').first()).toBeVisible()

    first = await exportCsv('first')
    expect(first[0]).toEqual(['ID', 'Name', 'Title', 'Department', 'Reports to', 'Location', 'Start date', 'Role type', 'Status', 'Employment type', 'X', 'Y', 'Department colour'])
    const rows = first.slice(1)
    expect(rows).toHaveLength(4)
    // Tree order with IDs, reports-to by ID, and the exact positions from the source file.
    expect(rows.map(r => [r[0], r[1], r[2], r[4], r[10], r[11]])).toEqual([
      ['1', 'Alex Example', 'CEO', '', '400', '50'],
      ['2', 'Sam Example', 'CTO', '1', '100', '230'],
      ['3', '', 'Software Engineer', '2', '-40', '410'],      // open role: blank name
      ['4', 'Jo Example', 'Head of Sales', '1', '700', '230'],
    ])
    expect(rows[2].slice(7, 10)).toEqual(['New headcount', 'Open', 'Full-time'])
    expect(rows[1][3]).toBe('Engineering')
    expect(rows[1][12]).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  test('importing the export gives the same chart: same shape, same lines', async () => {
    await page.getByTitle('Import people (CSV or Excel)').click()
    await dialog().getByTestId('import-file').setInputFiles(path.join(downloads, 'first.csv'))
    // The layout and formatting columns were recognised.
    await expect(dialog().getByLabel('X position')).toHaveValue('10')
    await dialog().getByRole('button', { name: 'Review' }).click()
    await expect(dialog().getByText(/No problems found/)).toBeVisible()
    await expect(dialog().getByText(/keep their shape/)).toBeVisible()
    await dialog().getByRole('button', { name: 'Import 4 roles' }).click()
    await expect(dialog()).toHaveCount(0)
    await expect(page.getByText('8 / 30')).toBeVisible() // the canvas has reloaded with all 8 roles

    const second = (await exportCsv('second')).slice(1)
    expect(second).toHaveLength(8)
    // Both copies: same titles and the same reporting structure within each copy.
    const copies = [second.filter(r => Number(r[10]) < 1000), second.filter(r => Number(r[10]) >= 1000)]
    const original = copies.find(c => c.some(r => r[10] === '400'))!
    const added = copies.find(c => c !== original)!
    expect(added).toHaveLength(4)
    const keyOf = (r: string[]) => `${r[2]}|${r[8]}|${r[3]}`
    expect(added.map(keyOf).sort()).toEqual(original.map(keyOf).sort())
    // Shape: every role moved by the same amount, so relative positions are unchanged.
    const pos = (rows: string[][]) => Object.fromEntries(rows.map(r => [r[2], [Number(r[10]), Number(r[11])]]))
    const a = pos(original), b = pos(added)
    const dx = b['CEO'][0] - a['CEO'][0], dy = b['CEO'][1] - a['CEO'][1]
    for (const title of Object.keys(a)) {
      expect(b[title][0] - a[title][0]).toBeCloseTo(dx, 2)
      expect(b[title][1] - a[title][1]).toBeCloseTo(dy, 2)
    }
    // Reporting lines point inside each copy (a manager's ID is one of that copy's rows).
    const idsOf = (rows: string[][]) => new Set(rows.map(r => r[0]))
    for (const copy of [original, added]) {
      for (const r of copy) if (r[4]) expect(idsOf(copy).has(r[4])).toBe(true)
    }
  })
})
