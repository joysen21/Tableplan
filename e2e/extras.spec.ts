import { expect, test, goView, loginDemo } from './helpers';
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
  await expect(bd.getByLabel('Zeitraum')).toHaveValue('vm');
  await pickGuest(page);
  await bd.getByRole('button', { name: 'Speichern' }).click();
  await expect(bd).toBeHidden();
  await page.screenshot({ path: 'test-results/fahrrad.png' });
});

test('Einstellungen: Stellplatz, Therapie und Fahrrad anlegen', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Einstellungen');
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
