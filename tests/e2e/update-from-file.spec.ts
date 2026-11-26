import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard } from './helpers'

// R-77: keep a chart current by uploading a newer export of the same people. Import a file into a new chart, then update it
// from a changed file: a joiner, a leaver, a move and a retitle are listed, applied and survive a reload, and the retitled
// role keeps its place. (Comments and job descriptions surviving an update are covered by api/__tests__/sync.test.ts.)
let ctx: BrowserContext
let page: Page

const csv = (...lines: string[]) => ({ name: 'hr-export.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n') + '\n') })
const dialog = () => page.getByRole('dialog', { name: 'Import people' })
const card = (name: string) => page.getByTestId('node-card').filter({ hasText: name })

test.describe.serial('update a chart from a file', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    ctx = await signedInContext(browser, testUser(`sync${testInfo.retry}`).slug)
    page = await ctx.newPage()
    await onboard(page, 'Sync Co')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('import the first export into a new chart', async () => {
    await page.goto('/charts')
    await page.getByTestId('import-btn').click()
    await dialog().getByTestId('import-file').setInputFiles(csv(
      'Employee ID,Name,Job title,Manager ID,Work email',
      'E1,Ada Lovelace,CEO,,ada@sync.test',
      'E2,Bo Builder,CTO,E1,bo@sync.test',
      'E3,Cy Coder,Engineer,E2,cy@sync.test',
      'E4,Di Draw,Designer,E1,di@sync.test',
    ))
    await dialog().getByRole('button', { name: 'Review' }).click()
    await dialog().getByLabel('New chart name').fill('People')
    await dialog().getByRole('button', { name: 'Import 4 roles' }).click()
    await expect(page).toHaveURL(/\/charts\/[^/]+$/)
    await expect(card('Cy Coder')).toBeVisible()
  })

  test('the next export is reviewed, applied and kept', async () => {
    // Where Bo sits relative to Ada, in card widths (the view re-fits after the update, so raw pixels move).
    const offset = async () => {
      const [ada, bo] = [await card('Ada Lovelace').boundingBox(), await card('Bo Builder').boundingBox()]
      return [(bo!.x - ada!.x) / ada!.width, (bo!.y - ada!.y) / ada!.width].map(v => Math.round(v * 100) / 100)
    }
    const before = await offset()
    await page.getByTitle('Import or update from a file (CSV or Excel)').click()
    await dialog().getByTestId('import-file').setInputFiles(csv(
      'Employee ID,Name,Job title,Manager ID,Work email',
      'E1,Ada Lovelace,CEO,,ada@sync.test',
      'E2,Bo Builder,Chief Technology Officer,E1,bo@sync.test',
      'E3,Cy Coder,Engineer,E1,cy@sync.test',
      'E5,Eve Engineer,Engineer,E2,eve@sync.test',
    ))
    await expect(dialog().getByRole('radio', { name: /Update this chart from the file/ })).toBeChecked()
    await dialog().getByRole('button', { name: 'Review' }).click()

    await expect(dialog().getByTestId('stat-joiners')).toHaveText('1')
    await expect(dialog().getByTestId('stat-leavers')).toHaveText('1')
    await expect(dialog().getByTestId('stat-moves')).toHaveText('1')
    await expect(dialog().getByTestId('stat-changed')).toHaveText('1')
    await expect(dialog().getByRole('region', { name: 'Leavers (removed)' })).toContainText('Di Draw')
    await expect(dialog().getByRole('region', { name: 'Moves' })).toContainText('Cy Coder · Bo Builder → Ada Lovelace')
    await dialog().getByRole('button', { name: 'Apply 4 changes' }).click()
    await expect(dialog()).toHaveCount(0)

    await expect(card('Eve Engineer')).toBeVisible()
    await expect(card('Di Draw')).toHaveCount(0)
    await page.reload()
    await expect(card('Eve Engineer')).toBeVisible()
    await expect(card('Bo Builder')).toContainText('Chief Technology Officer')
    await expect(card('Di Draw')).toHaveCount(0)
    // Bo was only retitled and Ada unchanged: both kept their places on the canvas.
    expect(await offset()).toEqual(before)
  })

  test('the same file again has nothing to change', async () => {
    await page.getByTitle('Import or update from a file (CSV or Excel)').click()
    await dialog().getByTestId('import-file').setInputFiles(csv(
      'Employee ID,Name,Job title,Manager ID,Work email',
      'E1,Ada Lovelace,CEO,,ada@sync.test',
      'E2,Bo Builder,Chief Technology Officer,E1,bo@sync.test',
      'E3,Cy Coder,Engineer,E1,cy@sync.test',
      'E5,Eve Engineer,Engineer,E2,eve@sync.test',
    ))
    await dialog().getByRole('button', { name: 'Review' }).click()
    await expect(dialog().getByText('The chart already matches this file')).toBeVisible()
    await expect(dialog().getByRole('button', { name: 'Apply 0 changes' })).toBeDisabled()
  })
})
