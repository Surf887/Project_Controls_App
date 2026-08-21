import { test, expect } from '@playwright/test'
import { sampleP6Csv } from '../src/utils/p6CsvImport'
import { sampleP6Xer } from '../src/utils/p6XerImport'

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

    await page.getByTestId('p6-csv-file').setInputFiles({
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

  test('imports a native P6 XER refresh with relationships', async ({ page }) => {
    await page.goto('/schedule-control')
    await page.getByTestId('p6-xer-file').setInputFiles({
      name: 'p6-status.xer',
      mimeType: 'text/plain',
      buffer: Buffer.from(sampleP6Xer()),
    })
    await expect(page.getByTestId('p6-xer-review')).toBeVisible()
    await page.getByTestId('import-p6-xer').click()
    await expect(page.getByText(/Imported 2 XER activities and 1 relationships/i)).toBeVisible()
    await expect(page.getByTestId('schedule-activity-table')).toContainText('CON-210')
  })
})

test.describe('Privacy-first document intelligence', () => {
  test('extracts a local OCR draft without changing forecast approval state', async ({ page }) => {
    await page.goto('/submissions/documents')
    await expect(page.getByTestId('document-intelligence-view')).toBeVisible()
    const nonce = Date.now()
    await page.locator('input[type="file"]').setInputFiles({
      name: `contractor-forecast-${nonce}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`Contractor forecast overrun for A.01 is USD 1.8 million with 65% probability. Reference ${nonce}.`),
    })
    await expect(page.getByText(/Extracted 1 draft forecast driver/i)).toBeVisible()
    await expect(page.getByTestId('forecast-driver-ledger')).toContainText(/contractor forecast overrun/i)
    await expect(page.getByRole('button', { name: 'Approve forecast impact' }).last()).toBeDisabled()
  })
})

test.describe('Dynamic company mapping', () => {
  test('defines an arbitrary header profile and reuses it for ingestion', async ({ page }) => {
    const csv = 'KPI_LABEL,TYPE_CODE,MONEY,PROJECT_NODE,ACCOUNT_CODE\nCurrent EAC,forecast,"$1,250,000",A.01,C-1000'
    await page.goto('/submissions/mapping-studio')
    await expect(page.getByTestId('mapping-studio-view')).toBeVisible()
    await page.getByLabel('Organization').fill('Example EPC')
    await page.getByLabel('Profile name').fill('Weekly custom export')
    await page.getByTestId('mapping-sample-file').setInputFiles({
      name: 'custom.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })
    const mappings = [
      ['Metric / field name', 'KPI_LABEL'],
      ['Category', 'TYPE_CODE'],
      ['Raw value', 'MONEY'],
      ['WBS', 'PROJECT_NODE'],
      ['CBS / cost code', 'ACCOUNT_CODE'],
    ] as const
    for (const [label, column] of mappings) {
      await page.locator('.mapping-rule-card').filter({ hasText: label }).getByLabel('Source column').selectOption(column)
    }
    await expect(page.getByTestId('mapping-preview-table')).toContainText('Current EAC')
    await page.getByTestId('save-mapping-profile').click()
    await expect(page.getByText(/Saved Weekly custom export v1/i)).toBeVisible()

    await page.goto('/submissions/ingestion')
    await page.getByLabel('Mapping profile').selectOption({ label: /Example EPC · Weekly custom export v1/ })
    await page.locator('input[type="file"]').setInputFiles({
      name: 'custom.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })
    await expect(page.getByText(/using Weekly custom export v1/i)).toBeVisible()
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
