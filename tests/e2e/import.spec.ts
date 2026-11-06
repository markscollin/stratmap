import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import { testUser, signedInContext, onboard } from './helpers'

// Roadmap 2.1: import people from a file. One user on a Free workspace (1 chart, 30 roles).
// Covers: the downloadable template re-imports cleanly into a new chart, adding to an
// existing chart from the canvas, errors blocking the import, and the plan limit.
let ctx: BrowserContext
let page: Page
let templatePath = ''

const csv = (...lines: string[]) => Buffer.from(lines.join('\n') + '\n')
const dialog = () => page.getByRole('dialog', { name: 'Import people' })

async function chooseFile(file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await dialog().getByTestId('import-file').setInputFiles(file)
}

test.describe.serial('import people', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    ctx = await signedInContext(browser, testUser(`import${testInfo.retry}`).slug)
    page = await ctx.newPage()
    await onboard(page, 'Import Co')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('the downloadable template imports into a new chart', async () => {
    await page.goto('/charts')
    await page.getByTestId('import-btn').click()
    await expect(dialog()).toBeVisible()

    const download = page.waitForEvent('download')
    await dialog().getByRole('button', { name: 'Download a template' }).click()
    templatePath = test.info().outputPath('template.csv')
    await (await download).saveAs(templatePath)
    expect(fs.readFileSync(templatePath, 'utf8')).toContain('Reports to')

    await chooseFile(templatePath)
    // Columns were guessed from the template's headers.
    await expect(dialog().getByLabel('Reports to')).toHaveValue('4')
    await dialog().getByRole('button', { name: 'Review' }).click()

    await expect(dialog().getByTestId('stat-imported')).toHaveText('4')
    await expect(dialog().getByText('No problems found')).toBeVisible()
    await dialog().getByLabel('New chart name').fill('Imported org')
    await dialog().getByRole('button', { name: 'Import 4 roles' }).click()

    await expect(page).toHaveURL(/\/charts\/[^/]+$/)
    await expect(page.getByText('Sam Example').first()).toBeVisible()
    await expect(page.getByText('Jo Example').first()).toBeVisible()
  })

  test('adds people to the open chart without disturbing what is there', async () => {
    await page.getByTitle('Import people (CSV or Excel)').click()
    await chooseFile({
      name: 'ops.csv', mimeType: 'text/csv',
      buffer: csv('Name,Title,Reports to', 'Pat Example,Head of Ops,', 'Riley Example,Ops Analyst,Pat Example'),
    })
    // From a chart you choose where the roles go; adding is the default.
    await expect(dialog().getByRole('radio', { name: /Add to this chart/ })).toBeChecked()
    await dialog().getByRole('button', { name: 'Review' }).click()
    await expect(dialog().getByTestId('stat-imported')).toHaveText('2')
    await dialog().getByRole('button', { name: 'Import 2 roles' }).click()

    await expect(dialog()).toHaveCount(0)
    await expect(page.getByText('Riley Example').first()).toBeVisible()
    await expect(page.getByText('Sam Example').first()).toBeVisible() // still there

    // It persisted: a reload shows all six.
    await page.reload()
    await expect(page.getByText('Pat Example').first()).toBeVisible()
    await expect(page.getByText('Alex Example').first()).toBeVisible()
  })

  test('errors in the file block the import and name the row', async () => {
    await page.getByTitle('Import people (CSV or Excel)').click()
    await chooseFile({
      name: 'bad.csv', mimeType: 'text/csv',
      buffer: csv('Name,Title,Reports to', 'Zed Example,CFO,', 'Una Example,Controller,Nobody'),
    })
    await dialog().getByRole('button', { name: 'Review' }).click()
    const problems = dialog().getByRole('list', { name: 'Problems found' })
    await expect(problems).toContainText('Row 3')
    await expect(problems).toContainText("doesn't match any ID, email or name")
    await expect(dialog().getByRole('button', { name: /^Import/ })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog()).toHaveCount(0)
    await expect(page.getByText('Zed Example')).toHaveCount(0) // nothing was added
  })

  test('an import that would exceed the plan is refused whole', async () => {
    // The chart has 6 roles; Free allows 30.
    const rows = Array.from({ length: 30 }, (_, i) => `Extra ${i} Example,Analyst,`)
    await page.getByTitle('Import people (CSV or Excel)').click()
    await chooseFile({ name: 'many.csv', mimeType: 'text/csv', buffer: csv('Name,Title,Reports to', ...rows) })
    await dialog().getByRole('button', { name: 'Review' }).click()
    await expect(dialog().getByText("Over your plan's limit")).toBeVisible()
    await expect(dialog().getByText(/this would make 36/)).toBeVisible()
    await expect(dialog().getByRole('button', { name: /^Import/ })).toBeDisabled()
    await page.keyboard.press('Escape')
  })

  test('at the chart limit, Import from the library offers an upgrade instead', async () => {
    await page.goto('/charts') // Free: 1 chart, already created
    await page.getByTestId('import-btn').click()
    await expect(dialog()).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Unlock/ })).toBeVisible()
  })
})
