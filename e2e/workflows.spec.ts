import { test, expect } from '@playwright/test'

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
