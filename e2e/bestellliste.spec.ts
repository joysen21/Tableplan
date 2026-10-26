import { expect, test, goView, loginDemo, openAllSettings } from './helpers';

/** Modul Bestellliste: Mengen eingeben → WhatsApp mit fertigem Text, Historie, Auswertung, Artikel, Einstellungen */
test('Küche bestellt bei Agostini per WhatsApp; Historie und Auswertung', async ({ page, context }) => {
  await loginDemo(page, 'Karl (Küche)');
  await goView(page, 'Bestellliste');
  await expect(page.getByRole('group', { name: 'Lieferant' }).getByRole('button')).toHaveText(['Agostini', 'Vinothek Mairhofer']);
  await page.getByRole('button', { name: 'mehr Orangensaft' }).click();
  await page.getByRole('button', { name: 'mehr Orangensaft' }).click();
  await page.getByLabel('Menge Kiste Coca Cola 1l').fill('5');
  await page.getByLabel('Notiz an den Lieferanten').fill('Bitte bis Freitag');
  await expect(page.locator('.order-send')).toContainText('2 Artikel · 7 Stück');
  await page.screenshot({ path: 'test-results/bestellliste.png' });

  // WhatsApp öffnet sich mit fertigem Text an die hinterlegte Nummer
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Per WhatsApp senden' }).click();
  const wa = await popup;
  const u = new URL(wa.url());
  const url = u.href + ' ' + (u.searchParams.get('text') ?? '');
  expect(url).toContain('393661595025');
  expect(url).toContain('2 × Orangensaft');
  expect(url).toContain('5 × Kiste Coca Cola 1l');
  expect(url).toContain('Bitte bis Freitag');
  await wa.close();
  await expect(page.locator('.order-send')).toContainText('0 Artikel');

  // Historie und Übernehmen als neue Bestellung
  await page.getByRole('tab', { name: 'Historie' }).click();
  await expect(page.locator('.order-hist').first()).toContainText('2 Artikel · 7 Stück');
  await page.getByRole('button', { name: 'Als neue Bestellung übernehmen' }).click();
  await expect(page.getByLabel('Menge Kiste Coca Cola 1l')).toHaveValue('5');

  // Auswertung des Monats
  await page.getByRole('tab', { name: 'Auswertung' }).click();
  await expect(page.locator('.order-stats tr', { hasText: 'Kiste Coca Cola 1l' })).toContainText('5');

  // Artikel anlegen – erscheint in der Bestellliste
  await page.getByRole('tab', { name: 'Artikel' }).click();
  await page.getByLabel('Neuer Artikel', { exact: true }).fill('E2E Holundersaft');
  await page.getByLabel('Gruppe neuer Artikel', { exact: true }).fill('Alkoholfreies & Bier');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('tab', { name: 'Bestellen' }).click();
  await expect(page.getByLabel('Menge E2E Holundersaft')).toBeVisible();
});

test('Admin: Modul-Sichtbarkeit je Rolle und Telefonnummer je Lieferant', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Einstellungen');
  await openAllSettings(page);
  const roles = page.getByRole('group', { name: 'Sichtbar für (Bestellliste)' });
  await expect(roles.getByRole('button', { name: 'Küche' })).toHaveAttribute('aria-pressed', 'true');
  await roles.getByRole('button', { name: 'Service' }).click();
  await expect(roles.getByRole('button', { name: 'Service' })).toHaveAttribute('aria-pressed', 'true');
  const phone = page.getByLabel('Telefon Agostini');
  await phone.fill('0471 123456');
  await phone.blur();
  await expect(page.locator('.toast')).toContainText('Telefonnummer gespeichert');
  await expect(page.locator('.supplier-row', { has: phone })).toContainText('wa.me/390471123456');
  // Service sieht jetzt die Bestellliste
  await loginDemoKeep(page, 'Toni (Service)');
  await goView(page, 'Bestellliste');
  await expect(page.getByRole('group', { name: 'Lieferant' })).toBeVisible();
});

/** Benutzer wechseln, ohne die Demo-Daten zurückzusetzen */
async function loginDemoKeep(page: import('@playwright/test').Page, who: string) {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/?demo');
  await page.getByRole('button', { name: new RegExp(who.replace(/[()]/g, '.')) }).click();
  await expect(page.locator('header')).toBeVisible();
}
