import { test, expect } from '@playwright/test'
import { sampleP6Csv } from '../src/utils/p6CsvImport'

// These workflows intentionally mutate the same seeded project through the
// optimistic-concurrency API, so run them serially instead of manufacturing
// conflicts between otherwise independent browser contexts.
test.describe.configure({ mode: 'serial' })

test.describe('Monthly close workspace', () => {
  test('loads guided close hub with continue CTA', async ({ page }) => {
    await page.goto('/close')
    await expect(page.getByTestId('monthly-close-workspace')).toBeVisible()
    await expect(page.getByTestId('close-continue-primary')).toBeVisible()
    await expect(page.getByTestId('close-step-baseline')).toBeVisible()
  })

  test('command palette opens with Ctrl+K', async ({ page }) => {
    await page.goto('/close')
    // Wait for the app to hydrate so the global Ctrl+K keydown listener
    // (useCommandPalette effect) is attached before we dispatch the key event;
    // pressing immediately after goto races React mount and drops the keypress.
    await expect(page.getByTestId('monthly-close-workspace')).toBeVisible()
    await page.keyboard.press('Control+K')
    await expect(page.getByTestId('command-palette')).toBeVisible()
  })
})

test.describe('Cost sheet edit/save', () => {
  test('cost sheet grid loads', async ({ page }) => {
    await page.goto('/cost-sheet')
    await expect(page.getByRole('heading', { name: /cost sheet/i })).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Forecast approval', () => {
  test('forecast approval view loads', async ({ page }) => {
    await page.goto('/forecast/approval')
    await expect(page.getByRole('heading', { name: /forecast approval/i })).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('WBS import', () => {
  test('WBS manager loads', async ({ page }) => {
    await page.goto('/wbs')
    await expect(page.getByRole('heading', { name: /wbs/i })).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Manual SCCS mapping', () => {
  test('saves and restores a control-account override', async ({ page }) => {
    await page.goto('/cost-structure/sccs')
    await expect(page.getByTestId('sccs-manual-mapping')).toBeVisible()

    await page.getByTestId('sccs-mapping-accounts').getByRole('button', { name: 'Edit' }).first().click()
    await page.getByLabel('Manual PBS code').selectOption('BA')
    await page.getByTestId('save-manual-sccs').click()
    await expect(page.getByRole('button', { name: 'Restore automatic' })).toBeEnabled()

    await page.getByRole('button', { name: 'Restore automatic' }).click()
    await expect(page.getByRole('button', { name: 'Restore automatic' })).toBeDisabled()
  })
})

test.describe('Integrated schedule control', () => {
  test('imports a P6 CSV and links activities to cost accounts', async ({ page }) => {
    await page.goto('/schedule-control')
    await expect(page.getByTestId('schedule-control-view')).toBeVisible()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'p6-status.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(sampleP6Csv()),
    })
    await expect(page.getByTestId('p6-mapping-review')).toBeVisible()
    await page.getByLabel('Schedule data date').fill('2026-06-30')
    await page.getByTestId('import-p6-schedule').click()

    await expect(page.getByTestId('schedule-activity-table')).toContainText('CON-210')
    await expect(page.getByTestId('schedule-cost-performance')).toContainText('A.02')
  })
})

test.describe('Privacy-first document intelligence', () => {
  test('extracts a local OCR draft without changing forecast approval state', async ({ page }) => {
    await page.goto('/submissions/documents')
    await expect(page.getByTestId('document-intelligence-view')).toBeVisible()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'contractor-forecast.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Contractor forecast overrun for A.01 is USD 1.8 million with 65% probability.'),
    })
    await expect(page.getByText(/Extracted 1 draft forecast driver/i)).toBeVisible()
    await expect(page.getByTestId('forecast-driver-ledger')).toContainText('contractor forecast overrun')
    await expect(page.getByRole('button', { name: 'Approve forecast impact' })).toBeDisabled()
  })
})

test.describe('Supported production scope', () => {
  test('blocks direct access to simulated connector modules by default', async ({ page }) => {
    await page.goto('/admin/integrations')
    await expect(page.getByRole('heading', { name: 'Illustrative module disabled' })).toBeVisible()
    await expect(page.getByText(/not backed by a production data source/i)).toBeVisible()
  })

  test('shows the server-verified immutable audit separately from workflow history', async ({ page }) => {
    await page.goto('/audit')
    await expect(page.getByRole('heading', { name: 'HMAC-verified action history' })).toBeVisible()
    await expect(page.getByText('Chain verified')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Project-state activity for in-app drill-down' })).toBeVisible()
  })
})

test.describe('Change approval', () => {
  test('change register loads', async ({ page }) => {
    await page.goto('/changes')
    await expect(page.getByRole('heading', { name: /change/i })).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('mobile nav tabs visible', async ({ page }) => {
    await page.goto('/close')
    await expect(page.getByTestId('mobile-nav')).toBeVisible()
    await page.getByTestId('mobile-nav-changes').click()
    await expect(page).toHaveURL(/\/changes/)
  })
})
