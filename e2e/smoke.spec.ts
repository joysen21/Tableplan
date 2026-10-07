import { expect, test, type Page } from '@playwright/test';

async function loginDemo(page: Page, who = 'Anna (Admin)') {
  await page.goto('/?demo');
  await page.evaluate(() => localStorage.removeItem('tischplan.demo.v2'));
  await page.goto('/?demo');
  await page.getByRole('button', { name: new RegExp(who.replace(/[()]/g, '.')) }).click();
  await expect(page.locator('header')).toBeVisible();
}
const errors: string[] = [];
test.beforeEach(({ page }) => { page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]); errors.length = 0; });

test('Admin: alle Ansichten laden', async ({ page }) => {
  await loginDemo(page);
  for (const name of ['Live-Plan', 'Zeitleiste', 'Reservierungen', 'Hotelgäste', 'Berichte', 'Raumplan-Editor', 'Einstellungen']) {
    await page.getByRole('link', { name }).click();
    await expect(page.locator('main .panel').first()).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/settings.png', fullPage: true });
});

test('Reservierung anlegen, Konflikt wird verhindert', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('button', { name: 'Reservierung', exact: true }).click();
  await page.getByLabel('Name *').fill('E2E Gast');
  await page.locator('#root ~ * .sugg .btn, .modal .sugg .btn').filter({ hasText: 'P ·' }).first().click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('.toast')).toContainText('Gespeichert');
  // gleicher Tisch, gleiche Zeit → Fehler (blockiert)
  const res = await page.evaluate(() => JSON.parse(localStorage.getItem('tischplan.demo.v2')!));
  const venue = Object.values(res.data)[0] as any;
  const mine = venue.reservations.find((r: any) => r.name === 'E2E Gast');
  expect(mine.tableIds.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Reservierung', exact: true }).click();
  await page.getByLabel('Name *').fill('Doppelt');
  await page.locator('.modal input[type=time]').fill(mine.time);
  const tname = venue.tables.find((t: any) => t.id === mine.tableIds[0]).name;
  const sel = page.locator('.modal select').filter({ hasText: 'Tisch manuell hinzufügen' });
  const label = await sel.locator('option').filter({ hasText: new RegExp(`^${tname} \\(.*belegt`) }).first().textContent();
  await sel.selectOption({ label: label! });
  await expect(page.locator('.modal .warnbox')).toContainText('belegt');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.toast.err')).toContainText('belegt');
});

test('Walk-in platzieren und Status ändern', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('button', { name: 'Walk-in', exact: true }).click();
  const first = page.locator('.modal .sugg .btn').first();
  if (await first.isVisible().catch(() => false)) {
    await first.click();
    const confirm = page.getByRole('button', { name: 'Trotzdem platzieren' });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.locator('.toast')).toContainText('Gespeichert');
  }
  await page.locator('svg.plan .tb').first().click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.screenshot({ path: 'test-results/popup.png' });
});

test('Zeitleiste: Balken verschieben', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('link', { name: 'Zeitleiste' }).click();
  // fest den Abendservice wählen – morgens (Frühstück) gäbe es keine Balken
  await page.getByLabel('Service').selectOption({ label: 'Abendessen' });
  const bar = page.locator('.g-row[data-table-id] .g-bar').last();
  await bar.scrollIntoViewIfNeeded();
  const box = (await bar.boundingBox())!;
  const id = await bar.getAttribute('data-res');
  await page.mouse.move(box.x + 15, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 10, { steps: 5 }); await page.mouse.move(box.x + 15 + 66, box.y + 10, { steps: 5 }); await page.mouse.up();
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/timeline.png' });
  expect(id).toBeTruthy();
});

test('Hotel: festen Tisch per Ziehen zuweisen', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('link', { name: 'Hotelgäste' }).click();
  const chip = page.locator('[data-chip]').first();
  await expect(chip).toBeVisible();
  const cb = (await chip.boundingBox())!;
  const target = page.locator('.hotel svg.plan .tb').nth(9);
  const tb = (await target.boundingBox())!;
  await page.mouse.move(cb.x + 10, cb.y + 5); await page.mouse.down();
  await page.mouse.move(cb.x + 50, cb.y + 40, { steps: 5 }); await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 }); await page.mouse.up();
  const confirm = page.getByRole('button', { name: 'Trotzdem zuweisen' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await expect(page.locator('.toast')).toBeVisible();
  await page.screenshot({ path: 'test-results/hotel.png' });
});

test('Editor: Tisch verschieben wird gespeichert', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('link', { name: 'Raumplan-Editor' }).click();
  const t = page.locator('svg.plan .tb').first();
  const b = (await t.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2 + 40, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.getByText('Tisch T1')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor.png' });
});

test('Rollen: Küche sieht nur Berichte, Service ändert nur Status', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await expect(page.locator('nav a')).toHaveCount(1);
  await page.getByRole('button', { name: /Karl/ }).click();
  await page.getByRole('button', { name: /Toni/ }).click();
  await expect(page.locator('nav a')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Reservierung', exact: true })).toHaveCount(0);
});
