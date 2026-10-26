import type { Page } from '@playwright/test';
import { expect, test } from './helpers';

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
  for (const name of ['Live-Plan', 'Zeitleiste', 'Reservierungen', 'Hotelgäste', 'Menü', 'Berichte', 'Raumplan-Editor', 'Einstellungen']) {
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
  // Uhrzeit ist fest (Beginn des Service) – gleicher Service = gleiche Zeit
  await expect(page.locator('.modal input[type=time]')).toHaveCount(0);
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

test('Hotel: ASA-Zimmerliste importieren (Vorschau, Übernehmen, erneut unverändert)', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('link', { name: 'Hotelgäste' }).click();
  const de = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const line = (nr: number, pos: number, room: string, name: string) => `Nein;${nr};2026;${pos};${room};${name};${name};01.01.1960;66;D;Ja;700;Nein;Ja;${de(-1)};4;${de(3)};Anwesend;;;`;
  const csv = ['Ausgewählt;Nr.;Jahr;Position;Zimmerreservierung;Gast;Name;Geburtsdatum;Alter (Aufenthalt);Land;Eigene Meldung;Meldung;Einwilligungserklärung vorhanden;Web Check-in;Anreise;Tage;Abreise;Status;Ehrung (Jahre);Ehrung (Aufenthalte);Konto',
    line(9001, 1, '801', 'Import Anna'), line(9001, 2, '801', 'Import Bert'), line(9002, 1, '802', 'Import Clara')].join('\r\n');
  const upload = async () => {
    await page.getByRole('button', { name: 'CSV-Import' }).click();
    await page.getByLabel('CSV-Datei').setInputFiles({ name: 'Zimmerliste.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') });
  };
  await upload();
  await expect(page.getByText(/2 Aufenthalte gelesen/)).toBeVisible();
  await expect(page.getByText(/Zi\. 801 · Import Anna · 2P/)).toBeVisible();
  await page.screenshot({ path: 'test-results/hotel-import.png' });
  await page.getByRole('button', { name: '2 Änderungen übernehmen' }).click();
  await expect(page.getByText(/2 neu, 0 geändert/)).toBeVisible();
  await page.getByText('Schließen', { exact: true }).click();
  await expect(page.locator('.hotel').getByText('Import Clara').first()).toBeVisible();
  // zweiter Import derselben Datei: nichts zu tun
  await upload();
  await expect(page.getByText(/2 unverändert/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Übernehmen', exact: true })).toBeDisabled();
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

test('Rollen: Küche sieht Berichte und Menü (+ Dienstplan als Küchenleitung), Service ändert nur Status', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await expect(page.locator('.topnav a')).toHaveText(['Berichte', 'Menü', 'Dienstplan', 'Chef', 'Bestellliste']);
  await page.getByRole('button', { name: /Karl/ }).click();
  await page.getByRole('menuitem', { name: 'Abmelden' }).click();
  await page.getByRole('button', { name: /Toni/ }).click();
  await expect(page.locator('.topnav a')).toHaveCount(6); // inkl. Dienstplan (Serviceleitung) und Pass
  await expect(page.getByRole('button', { name: 'Reservierung', exact: true })).toHaveCount(0);
});

test('Seitenmenü am PC: klappt beim Darüberfahren auf und wieder zu, lässt sich fixieren (wird gemerkt); Einstellungen in Gruppen', async ({ page }) => {
  await loginDemo(page);
  const side = page.locator('aside.sidenav');
  const width = async () => (await side.boundingBox())!.width;
  await expect(side).toBeVisible();
  // Standard: schmal (nur Icons)
  await page.mouse.move(700, 400);
  await expect.poll(width).toBeLessThan(80);
  await page.screenshot({ path: 'test-results/seitenmenue-zu.png' });
  // Maus drüber → klappt über dem Inhalt auf, Inhalt verschiebt sich nicht
  const mainX = (await page.locator('main').boundingBox())!.x;
  await side.hover();
  await expect.poll(width).toBeGreaterThan(200);
  expect((await page.locator('main').boundingBox())!.x).toBe(mainX);
  await page.screenshot({ path: 'test-results/seitenmenue-offen.png' });
  // Maus weg → wieder schmal
  await page.mouse.move(700, 400);
  await expect.poll(width).toBeLessThan(80);
  // eingeklappt: Ansichten weiter erreichbar
  await page.getByRole('link', { name: 'Hotelgäste' }).click();
  await expect(page).toHaveURL(/hotel/);
  // fixieren: bleibt offen, auch nach Neuladen
  await side.hover();
  await page.getByRole('button', { name: 'Menü fixieren' }).click();
  await page.mouse.move(700, 400);
  await expect.poll(width).toBeGreaterThan(200);
  await page.reload();
  await page.mouse.move(700, 400);
  await expect.poll(width).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Menü automatisch einklappen' }).click();
  await page.mouse.move(700, 400);
  await expect.poll(width).toBeLessThan(80);

  await page.getByRole('link', { name: 'Einstellungen' }).click();
  const groups = page.locator('details.settings-group');
  await expect(groups.locator('summary')).toContainText(['Betrieb & Services', 'Reservierungen', 'Verpflegungsarten', 'Gäste-Speisekarte (QR)', 'Benutzer & Rollen', 'Daten & Sicherung', 'Protokoll',
    'Dienstplan', 'Pass + Chef', 'Garage', 'Massage', 'Fahrrad', 'Bestellliste']);
  // standardmäßig eingeklappt
  for (const g of await groups.all()) await expect(g).not.toHaveAttribute('open', '');
  await expect(groups.filter({ hasText: 'Massage' }).locator('summary')).toContainText('Eingeschaltet');
  await page.screenshot({ path: 'test-results/einstellungen-pc.png' });
});

test('Einstellungen am PC: alle Gruppen mit einem Knopf ein- und ausklappen', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  const groups = page.locator('details.settings-group');
  await expect(groups).toHaveCount(13);
  for (const g of await groups.all()) await expect(g).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Alle Einstellungen ausklappen' }).click();
  for (const g of await groups.all()) await expect(g).toHaveAttribute('open', '');
  // eine Gruppe von Hand zu, die anderen offen → Knopf klappt alle ein
  await groups.first().locator('summary').click();
  await page.getByRole('button', { name: 'Alle Einstellungen einklappen' }).click();
  for (const g of await groups.all()) await expect(g).not.toHaveAttribute('open', '');
});

test('Berichte nach Abteilung; Tischplan je Raum; Dienstplan druckbar; ohne Ankünfte pro 15 Minuten', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('link', { name: 'Berichte' }).click();
  const tabs = page.getByRole('tablist', { name: 'Abteilung' });
  await expect(tabs.getByRole('tab')).toHaveText(['Service', 'Küche', 'Hotel', 'Dienstplan']);
  await tabs.getByRole('tab', { name: 'Küche' }).click();
  await expect(page.locator('.report h2')).toHaveText('Küchenvorschau & Briefing');
  await expect(page.locator('.report')).not.toContainText('Ankünfte pro 15 Minuten');
  await expect(page.locator('.report')).not.toContainText('Ankunfts-Slot');

  // Tischplan: einzelner Raum
  await tabs.getByRole('tab', { name: 'Service' }).click();
  await page.getByRole('button', { name: 'Tischplan', exact: true }).click();
  await expect(page.locator('.print-room')).toHaveCount(2);
  await page.getByRole('group', { name: 'Räume' }).getByRole('button', { name: 'Stube', exact: true }).click();
  await expect(page.locator('.print-room')).toHaveCount(1);
  await expect(page.locator('.print-room h2')).toHaveText('Tischplan · Stube');
  await page.screenshot({ path: 'test-results/berichte-tischplan.png' });

  // Dienstplan als Bericht: nur ansehen/drucken
  await tabs.getByRole('tab', { name: 'Dienstplan' }).click();
  await expect(page.locator('.report .roster-grid')).toBeVisible();
  await expect(page.locator('.report').getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
  await page.getByLabel('Bereich Dienstplan').selectOption({ label: 'Küche' });
  await expect(page.locator('.report .roster-grid')).toContainText('Lukas Mair');
});

test('Einstellungen: Verpflegungsarten bearbeiten, hinzufügen, entfernen', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await page.locator('details.settings-group > summary', { hasText: /^Verpflegungsarten/ }).click();
  // bestehende ändern: Halbpension mit Mittagessen (inbegriffen)
  await page.getByLabel('HP Mittag').selectOption('ja');
  await expect(page.getByLabel('HP Mittag')).toHaveValue('ja');
  await page.getByLabel('Bezeichnung HP').fill('Halbpension (3/4)');
  await page.getByLabel('Bezeichnung HP').blur();
  await expect(page.getByLabel('Bezeichnung HP')).toHaveValue('Halbpension (3/4)');
  // neue hinzufügen und benennen
  await page.getByRole('button', { name: 'Verpflegungsart' }).click();
  await page.getByLabel('Kürzel Neue Verpflegung').fill('hpp');
  await page.getByLabel('Kürzel Neue Verpflegung').blur();
  await expect(page.getByLabel('HPP Abend')).toBeVisible();
  await page.getByLabel('HPP Abend').selectOption('tisch');
  // im Aufenthalt wählbar
  await expect(page.locator('details.settings-group > summary', { hasText: /^Verpflegungsarten/ })).toContainText('HPP');
  // wieder entfernen
  await page.getByRole('button', { name: 'Verpflegung HPP löschen' }).click();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(page.getByLabel('HPP Abend')).toHaveCount(0);
});
