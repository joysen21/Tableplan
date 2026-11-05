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
  // rechts im Warenkorb, dort auch änderbar
  const cart = page.getByRole('complementary', { name: 'Warenkorb' });
  await expect(cart.getByLabel('Menge Warenkorb Orangensaft')).toHaveValue('2');
  await cart.getByLabel('mehr Warenkorb Orangensaft').click();
  await cart.getByLabel('weniger Warenkorb Orangensaft').click();
  await expect(page.getByLabel('Menge Orangensaft', { exact: true })).toHaveValue('2');
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

test('Historie: einzelne und mehrere Bestellungen löschen', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  // drei Bestellungen an Agostini anlegen
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('tischplan.demo.v2')!);
    const v = Object.values(db.data)[0] as any;
    const sup = v.suppliers.find((s: any) => s.name === 'Agostini');
    const p = v.supplierProducts.find((x: any) => x.supplierId === sup.id);
    [1, 2, 3].forEach(n => v.supplierOrders.push({ id: crypto.randomUUID(), supplierId: sup.id, createdAt: new Date(Date.now() - n * 86400000).toISOString(),
      createdBy: 'Karl', items: [{ productId: p.id, name: p.name, unit: p.unit ?? '', qty: n }], note: '' }));
    localStorage.setItem('tischplan.demo.v2', JSON.stringify(db));
  });
  await page.reload();
  await goView(page, 'Bestellliste');
  await page.getByRole('tab', { name: 'Historie' }).click();
  await expect(page.locator('.order-hist')).toHaveCount(3);

  // einzeln: in der aufgeklappten Bestellung, mit Rückfrage
  await page.locator('.order-hist-body').getByRole('button', { name: 'Löschen' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Bestellung löschen?');
  await expect(dlg).toContainText('1 Artikel');
  await dlg.getByRole('button', { name: 'Löschen' }).click();
  await expect(page.locator('.toast')).toContainText('Bestellung gelöscht');
  await expect(page.locator('.order-hist')).toHaveCount(2);

  // mehrere: Auswahlmodus
  await page.getByRole('button', { name: 'Mehrere löschen…' }).click();
  await expect(page.getByRole('button', { name: /Ausgewählte löschen/ })).toBeDisabled();
  await page.getByLabel('Alle auswählen').check();
  await page.screenshot({ path: 'test-results/bestell-auswahl.png' });
  await page.getByRole('button', { name: 'Ausgewählte löschen (2)' }).click();
  await expect(page.getByRole('dialog')).toContainText('2 Bestellungen löschen?');
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Noch keine Bestellungen an diesen Lieferanten.')).toBeVisible();
  await page.screenshot({ path: 'test-results/bestell-historie-leer.png' });
});
