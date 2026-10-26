import { expect, test, goView, loginDemo, openAllSettings } from './helpers';
import type { Page } from '@playwright/test';

/** Module Garage, Massage, Fahrrad: Buchung nur für Hotelgäste, Doppelbuchung gesperrt */

/** ersten Hotelgast im Auswahlfeld wählen */
async function pickGuest(page: Page, nth = 0) {
  const sel = page.getByRole('dialog').getByLabel('Hotelgast');
  const opts = await sel.locator('option').evaluateAll(o => (o as HTMLOptionElement[]).map(x => x.value).filter(Boolean));
  await sel.selectOption(opts[nth]);
}

test('Garage: buchen mit Kennzeichen und E-Auto, Doppelbuchung wird abgelehnt', async ({ page }) => {
  await loginDemo(page, 'Eva (Empfang)');
  await goView(page, 'Garage');
  await expect(page.getByRole('grid', { name: 'Belegung Garage' })).toBeVisible();
  await page.screenshot({ path: 'test-results/garage.png' });

  // Platz 6 ist frei: heute → morgen buchen
  await page.getByRole('button', { name: /^Platz 6 .* buchen$/ }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Garage – neue Buchung' });
  await pickGuest(page);
  await dlg.getByLabel('Kennzeichen').fill('bz 555 xy');
  await dlg.getByLabel('E-Auto').check();
  // E-Auto → freier Ladeplatz wird vorgeschlagen, sonst Hinweis
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  if (await page.getByRole('button', { name: 'Trotzdem speichern' }).isVisible().catch(() => false)) await page.getByRole('button', { name: 'Trotzdem speichern' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('button', { name: /BZ 555 XY/ }).first()).toBeVisible();

  // gleicher Platz, gleiche Nacht → abgelehnt
  await page.getByRole('button', { name: /BZ 555 XY/ }).first().click();
  const edit = page.getByRole('dialog', { name: 'Garage – Buchung' });
  const place = await edit.getByLabel('Stellplatz').inputValue();
  await edit.getByRole('button', { name: 'Abbrechen' }).click();
  await page.getByRole('button', { name: 'Buchung' }).click();
  const dlg2 = page.getByRole('dialog', { name: 'Garage – neue Buchung' });
  await pickGuest(page, 1);
  await dlg2.getByLabel('Stellplatz').selectOption(place);
  await expect(dlg2.locator('.warnbox')).toContainText('Belegt durch');
  await dlg2.getByRole('button', { name: 'Speichern' }).click();
  await expect(dlg2.getByRole('alert')).toContainText('Bereits gebucht');
});

test('Massage: Anwesenheit eintragen, Behandlung buchen; Fahrrad halber Tag', async ({ page }) => {
  await loginDemo(page, 'Eva (Empfang)');
  await goView(page, 'Massage');
  await expect(page.getByRole('grid', { name: 'Belegung Massage' })).toBeVisible();
  await page.screenshot({ path: 'test-results/massage.png' });
  await page.getByRole('button', { name: 'Lena 16:00 buchen' }).click();
  const dlg = page.getByRole('dialog', { name: 'Massage – neue Buchung' });
  await pickGuest(page, 2);
  const th = dlg.getByLabel('Therapie');
  await th.selectOption(await th.locator('option', { hasText: 'Rückenmassage' }).getAttribute('value'));
  await expect(dlg).toContainText('16:00–16:25 Uhr');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.xlist')).toContainText('16:00–16:25');

  await page.getByRole('tab', { name: 'Anwesenheit' }).click();
  const von = page.getByLabel(/^Sofia .* von$/).first();
  await von.fill('10:00'); await von.blur();
  await expect(page.getByLabel(/^Sofia .* von$/).first()).toHaveValue('10:00');
  await expect(page.locator('table.presence tbody tr', { hasText: 'Sofia' }).locator('td').first()).toHaveClass(/on/);

  await goView(page, 'Fahrrad');
  await expect(page.getByRole('grid', { name: 'Belegung Fahrrad' })).toBeVisible();
  await page.getByRole('button', { name: /^E-Bike 2 .* buchen$/ }).first().click();
  const bd = page.getByRole('dialog', { name: 'Fahrrad – neue Buchung' });
  await expect(bd.getByLabel('Von Halbtag')).toHaveValue('vm');
  await expect(bd.getByLabel('Bis Halbtag')).toHaveValue('vm');
  await pickGuest(page);
  await bd.getByRole('button', { name: 'Speichern' }).click();
  await expect(bd).toBeHidden();
  await page.screenshot({ path: 'test-results/fahrrad.png' });
});

test('Einstellungen: Stellplatz, Therapie und Fahrrad anlegen', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Einstellungen');
  await openAllSettings(page);
  await page.getByRole('button', { name: 'Stellplatz', exact: true }).click();
  await expect(page.getByLabel('Name Stellplatz Stellplatz 7')).toBeVisible();
  await page.getByRole('button', { name: 'Therapie', exact: true }).click();
  await expect(page.getByLabel('Name Therapie Neue Therapie')).toBeVisible();
  await page.getByLabel('Dauer Neue Therapie').fill('30');
  await page.getByLabel('Dauer Neue Therapie').blur();
  await expect(page.getByLabel('Dauer Neue Therapie')).toHaveValue('30');
  await page.getByRole('button', { name: 'Fahrrad', exact: true }).click();
  await expect(page.getByLabel('Art Fahrrad 5')).toBeVisible();
});

test('Massage: Eintrag per Drag & Drop auf andere Uhrzeit verschieben', async ({ page }) => {
  await loginDemo(page, 'Eva (Empfang)');
  await goView(page, 'Massage');
  const bar = page.locator('.xg-bar.m-massage', { hasText: '10:00' });
  await expect(bar).toBeVisible();
  const from = (await bar.boundingBox())!, to = (await page.getByRole('button', { name: 'Lena 12:00 buchen' }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); // Mitte = verschieben (Ränder = verlängern)
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.xg-bar.m-massage', { hasText: '12:00' })).toBeVisible();
  await expect(page.locator('.xlist')).toContainText('12:00–12:50');
  // Antippen ohne Ziehen öffnet weiterhin die Buchung
  await page.locator('.xg-bar.m-massage', { hasText: '12:00' }).click();
  await expect(page.getByRole('dialog', { name: 'Massage – Buchung' })).toBeVisible();
});

/** Balken (oder seinen Rand) per Maus auf ein Feld ziehen */
async function dragTo(page: Page, from: { x: number; y: number }, cellName: string | RegExp) {
  const to = (await page.getByRole('button', { name: cellName }).first().boundingBox())!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

test('Fahrrad: verschieben und am Rand verlängern; Massage am Rand verlängern', async ({ page }) => {
  await loginDemo(page, 'Eva (Empfang)');
  await goView(page, 'Fahrrad');
  // Buchung des E-Bike 1 (heute ganzer Tag) auf Kinderrad übermorgen Vormittag ziehen
  const bar = page.locator('.xg-bar.m-fahrrad').first();
  const b = (await bar.boundingBox())!;
  const room = (await bar.textContent())!.trim();
  await dragTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, /^Kinderrad .* Vormittag buchen$/);
  const kinder = page.locator('.xg-bar.m-fahrrad', { hasText: room });
  await expect(kinder).toBeVisible();
  // rechten Rand zwei Tage weiter ziehen
  const k = (await kinder.first().boundingBox())!;
  const cells = page.getByRole('button', { name: /^Kinderrad .* Nachmittag buchen$/ });
  const target = (await cells.nth(4).boundingBox())!;
  await page.mouse.move(k.x + k.width - 3, k.y + k.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await kinder.first().boundingBox())!.width).toBeGreaterThan(k.width * 3);
  await page.screenshot({ path: 'test-results/fahrrad-ziehen.png' });
  await kinder.first().click({ position: { x: 20, y: 10 } });
  await expect(page.getByRole('dialog', { name: 'Fahrrad – Buchung' }).getByLabel('Bis Halbtag')).toHaveValue('nm');
  await page.getByRole('button', { name: 'Abbrechen' }).click();

  await goView(page, 'Massage');
  const m = page.locator('.xg-bar.m-massage', { hasText: '10:00' });
  const mb = (await m.boundingBox())!;
  await dragTo(page, { x: mb.x + mb.width - 3, y: mb.y + mb.height / 2 }, 'Lena 11:15 buchen');
  await expect(page.locator('.xlist')).toContainText('10:00–11:30');
});
