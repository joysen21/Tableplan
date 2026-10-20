import { expect, test, goView, loginDemo } from './helpers';
import type { Page } from '@playwright/test';

/** Eigene Status, Menü-Notiz per QR, Menüauswahl im Reservierungsformular, Mehrfachauswahl Gerichte, Bereichs-Icons */

const demo = (page: Page) => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any);

/** heutige Abend-Reservierung eines Hotelzimmers mit Tisch, das noch kein Menü gewählt hat */
async function hotelDinner(page: Page) {
  return page.evaluate(() => {
    const v = Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any;
    const day = new Date().toLocaleDateString('sv-SE');
    const svc = v.services.find((s: any) => s.kind === 'abend');
    const menu = v.menus.find((m: any) => m.date === day && m.serviceId === svc.id);
    const r = v.reservations.find((x: any) => x.date === day && x.serviceId === svc.id && x.stayId && x.tableIds.length
      && !['storniert', 'noshow'].includes(x.status) && !v.menuChoices.some((c: any) => c.menuId === menu.id && c.stayId === x.stayId));
    const table = v.tables.find((t: any) => t.id === r.tableIds[0]);
    return { id: r.id, name: r.name, stayId: r.stayId, menuId: menu.id, token: table.qrToken, roomNo: v.stays.find((s: any) => s.id === r.stayId).roomNo };
  });
}

test('Eigenen Status anlegen und einer Reservierung geben', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Einstellungen');
  await page.getByRole('button', { name: 'Eigener Status' }).click();
  await page.getByLabel('Bezeichnung eigener Status').fill('Aperitif');
  // bestehende Status: Bezeichnung steht im Feld und ist direkt bearbeitbar, Symbol wählbar
  await expect(page.getByLabel('Bezeichnung Platziert')).toHaveValue('Platziert');
  await page.getByLabel('Bezeichnung Rechnung').fill('Zahlt');
  await page.getByRole('button', { name: 'Symbol Zahlt' }).click();
  await page.getByRole('radiogroup', { name: 'Symbol für Zahlt' }).getByRole('radio', { name: 'Zahlt (Karte)' }).click();
  await page.getByRole('button', { name: 'Status speichern' }).click();
  await expect(page.locator('.toast')).toContainText('Status gespeichert');

  // im Tisch-Popup des Live-Plans: eigener Status als Schaltfläche (verhält sich wie „Platziert“)
  const r = await hotelDinner(page);
  await goView(page, 'Live-Plan');
  await page.getByLabel('Service').first().selectOption({ label: 'Abendessen' });
  const item = page.locator('.ritem', { hasText: r.name });
  await item.click();
  await page.locator('.modal').getByLabel('Status').selectOption({ label: '– Aperitif' });
  await page.locator('.modal').getByRole('button', { name: 'Speichern' }).click();
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await expect(item.locator('.badge.st')).toHaveText('Aperitif');
  await expect(item.locator('.badge.st svg.st-icon')).toHaveCount(1);
  const v = await demo(page);
  const saved = v.reservations.find((x: any) => x.id === r.id);
  expect([saved.status, typeof saved.subStatus]).toEqual(['platziert', 'string']);
  expect(v.venue.statusConfig.builtIn.rechnung).toMatchObject({ label: 'Zahlt', icon: 'zahlen' });
});

test('Tische erscheinen in Auswahllisten immer natürlich sortiert', async ({ page }) => {
  await loginDemo(page);
  // Tische in umgekehrter Reihenfolge gespeichert
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('tischplan.demo.v2')!);
    const v = Object.values(db.data)[0] as any;
    v.tables.reverse();
    localStorage.setItem('tischplan.demo.v2', JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Reservierung', exact: true }).click();
  const opts = await page.locator('.modal select').filter({ hasText: 'Tisch manuell hinzufügen' }).locator('optgroup').first().locator('option').allTextContents();
  const names = opts.map(o => o.split(' ')[0]);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })));
  expect(names.indexOf('T2')).toBeLessThan(names.indexOf('T10'));
});

test('Gast schreibt per QR eine Notiz, das Personal sieht sie im Live-Plan', async ({ page }) => {
  await loginDemo(page);
  const r = await hotelDinner(page);
  await page.goto(`/m/${r.token}?demo`);
  await page.getByRole('tab', { name: /Heute.*Abendessen/ }).click();
  const roomBtn = page.getByRole('button', { name: new RegExp(`Zimmer ${r.roomNo}\\b`) });
  if (await roomBtn.isVisible().catch(() => false)) await roomBtn.click();
  await page.locator('.gm-step button[aria-label="+"]:not([disabled])').first().click();
  await page.getByLabel('Notiz an die Küche').fill('Fleisch bitte medium');
  await page.getByRole('button', { name: 'Auswahl senden' }).click();
  await expect(page.getByText('Danke! Ihre Auswahl ist bei der Küche angekommen.')).toBeVisible();
  // nach dem Neuladen steht die Notiz wieder im Feld
  await page.reload();
  await page.getByRole('tab', { name: /Heute.*Abendessen/ }).click();
  if (await roomBtn.isVisible().catch(() => false)) await roomBtn.click();
  await expect(page.getByLabel('Notiz an die Küche')).toHaveValue('Fleisch bitte medium');

  await page.goto('/?demo');
  await page.getByLabel('Service').first().selectOption({ label: 'Abendessen' });
  await expect(page.locator('.ritem', { hasText: r.name }).locator('.menu-choice')).toContainText('📝 Fleisch bitte medium');
});

test('Menüauswahl eines Hotelgasts im Reservierungsformular eingeben', async ({ page }) => {
  await loginDemo(page);
  const r = await hotelDinner(page);
  await page.getByLabel('Service').first().selectOption({ label: 'Abendessen' });
  await page.locator('.ritem', { hasText: r.name }).click();
  const menu = page.getByRole('group', { name: 'Menüauswahl' });
  await expect(menu).toContainText('Noch keine Auswahl');
  await menu.getByRole('button', { name: /^mehr / }).first().click();
  await menu.getByLabel('Notiz zum Menü').fill('Dessert später');
  await page.locator('.modal').getByRole('button', { name: 'Speichern' }).click();
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await expect(page.locator('.toast').first()).toContainText('Gespeichert');
  const c = (await demo(page)).menuChoices.find((x: any) => x.menuId === r.menuId && x.stayId === r.stayId);
  expect(Object.values(c.counts).reduce((a: number, n) => a + (n as number), 0)).toBe(1);
  expect(c.note).toBe('Dessert später');
});

test('Küche fügt mehrere Gerichte auf einmal ins Menü ein', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Menü');
  await page.locator('.mw-row.today .mw-cell').last().click();
  const before = await page.locator('.menu-item-row').count();
  await page.getByRole('button', { name: 'Mehrere auswählen…' }).click();
  const pick = page.getByRole('group', { name: 'Mehrere Gerichte auswählen' });
  await pick.getByRole('checkbox').nth(0).check();
  await pick.getByRole('checkbox').nth(1).check();
  await pick.getByRole('button', { name: '2 Gerichte hinzufügen' }).click();
  await expect(page.locator('.menu-item-row')).toHaveCount(before + 2);
});

test('Bereich bekommt ein Icon, das im Dienstplan vor Bereich und Mitarbeitenden steht', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Dienstplan');
  // Demo-Bereiche haben schon Icons
  await expect(page.locator('.rg-name svg.dept-icon').first()).toBeVisible();
  await goView(page, 'Einstellungen');
  const card = page.locator('.dept-card', { has: page.getByLabel('Name Bereich Bar') });
  await card.getByRole('radio', { name: 'Wein' }).click();
  await expect(card.getByRole('radio', { name: 'Wein' })).toHaveAttribute('aria-checked', 'true');
  expect((await demo(page)).departments.find((x: any) => x.name === 'Bar').icon).toBe('wein');
  await page.screenshot({ path: 'test-results/bereich-icons.png' });
});
