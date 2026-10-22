import { expect, test, goView, loginDemo } from './helpers';

test('Berichte → Küche → Abendessen-Export: Tabelle und CSV', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await goView(page, 'Berichte');
  await page.getByRole('tab', { name: 'Küche' }).click();
  await page.getByRole('button', { name: 'Abendessen-Export' }).click();
  const table = page.locator('table.dinner-export');
  await expect(table).toBeVisible();
  await expect(table.locator('thead')).toContainText('Hauptgang');
  await expect(table.locator('tbody tr').first()).toContainText('×');
  await page.screenshot({ path: 'test-results/abendexport.png', fullPage: true });
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV herunterladen' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^abendessen-\d{4}-\d{2}-\d{2}\.csv$/);
});
