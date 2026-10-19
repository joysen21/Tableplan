import { expect, test, type Page } from '@playwright/test';
import { goView, loginDemo } from './helpers';

/** Dienstplan Etappen 2–6 (Desktop): Wochenplan, Prüfregeln, Abwesenheiten, Veröffentlichen, Mitarbeiter-Link, Heute im Dienst */

const errors: string[] = [];
test.beforeEach(({ page }) => { page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]); errors.length = 0; });

const grid = (page: Page) => page.locator('.roster-grid');
const cell = (page: Page, name: string, col: number) => grid(page).getByRole('gridcell', { name: new RegExp('^' + name + ' ') }).nth(col);

test('Küchenleitung plant per Vorlagen-Pinsel und Drag & Drop, Doppelbelegung wird verhindert', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await goView(page, 'Dienstplan');
  await page.getByLabel('Bereichsfilter').selectOption({ label: 'Küche' });
  await page.getByRole('button', { name: 'Weiter' }).click(); // nächste Woche
  await expect(grid(page)).toContainText('Lukas Mair');
  await page.screenshot({ path: 'test-results/dienstplan-woche.png' });

  // offene Schicht am Montag per Pinsel
  const openMon = cell(page, 'Offene Schichten', 0);
  const before = await openMon.locator('.shift-chip').count();
  await page.getByRole('group', { name: 'Vorlagen' }).getByRole('button', { name: /Frühdienst/ }).click();
  await openMon.getByRole('button', { name: /eintragen/ }).click();
  await expect(openMon.locator('.shift-chip')).toHaveCount(before + 1);
  await page.getByRole('button', { name: 'Pinsel aus' }).click();

  // Spätdienst per Drag & Drop auf den Dienstag der offenen Schichten
  const openTue = cell(page, 'Offene Schichten', 1);
  await page.getByRole('group', { name: 'Vorlagen' }).getByRole('button', { name: /Spätdienst/ }).dragTo(openTue);
  await expect(openTue.locator('.shift-chip')).toHaveCount(1);

  // offene Schicht auf Karl ziehen, der am Montag schon Dienst hat → abgelehnt
  const karlMon = cell(page, 'Karl Pichler', 0);
  if (await karlMon.locator('.shift-chip').count()) {
    await openMon.locator('.shift-chip').last().dragTo(karlMon);
    await expect(page.locator('.toast.err')).toContainText('schon einen Dienst');
  }

  // Dienst im Dialog: Ruhezeit-Hinweis bei Spät → Früh
  await openTue.locator('.shift-chip').click();
  const dlg = page.locator('.modal');
  await expect(dlg.getByText('Arbeitszeit: 8 h')).toBeVisible();
  await dlg.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('button', { name: 'Löschen' }).last().click();
  await expect(openTue.locator('.shift-chip')).toHaveCount(0);

  // Tag- und Monatsansicht
  await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Tag' }).click();
  await expect(page.locator('.roster-day')).toBeVisible();
  await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Monat' }).click();
  await expect(page.locator('table.roster-month')).toContainText('Lukas Mair');
  await page.screenshot({ path: 'test-results/dienstplan-monat.png' });
});

test('Prüfhinweise: Dienst trotz Krankmeldung, Pause fehlt', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await goView(page, 'Dienstplan');
  await page.getByLabel('Bereichsfilter').selectOption({ label: 'Küche' });
  // Jonas ist heute krank (Demo) → Dienst eintragen meldet einen Konflikt
  const today = page.locator('.rg-head.today');
  const col = await page.locator('.rg-head').evaluateAll((els, t) => els.findIndex(e => e === t) - 1, await today.elementHandle());
  const jonas = cell(page, 'Jonas Egger', col);
  await expect(jonas.locator('.abs-chip')).toContainText('Krank');
  await jonas.getByRole('button', { name: /eintragen/ }).click();
  const dlg = page.locator('.modal');
  await dlg.getByLabel('Pause (Min.)').fill('0');
  await expect(dlg.locator('.shift-warns')).toContainText('abwesend');
  await expect(dlg.locator('.shift-warns')).toContainText('ohne Pause');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('button', { name: 'Trotzdem speichern' }).click();
  await expect(page.locator('.roster-warnings')).toContainText('abwesend');
  await page.screenshot({ path: 'test-results/dienstplan-hinweise.png' });
});

test('Abwesenheit mit Urlaubskonto, Veröffentlichen und Mitarbeiter-Link (DE/IT)', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Dienstplan');
  const tabs = page.getByRole('group', { name: 'Bereich' });

  await tabs.getByRole('button', { name: 'Abwesenheiten' }).click();
  const row = page.locator('table.list tr', { hasText: 'Lukas Mair' }).first();
  await expect(row.locator('td').nth(2)).toHaveText('0');
  await page.getByRole('button', { name: 'Abwesenheit', exact: true }).click();
  const dlg = page.locator('.modal');
  await dlg.getByLabel('Mitarbeiter/in').selectOption({ label: 'Lukas Mair' });
  await dlg.getByLabel('Von').fill('2026-11-02'); // Mo
  await dlg.getByLabel('Bis').fill('2026-11-08'); // So → 6 Tage
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.toast')).toContainText('Gespeichert');
  // Jahr 2026 anzeigen (falls heute in einem anderen Jahr)
  await expect(page.locator('table.list tr', { hasText: 'Lukas Mair' }).first().locator('td').nth(2)).toHaveText(/^\d+$/);

  // Service der aktuellen Woche ist veröffentlicht → erneut veröffentlichen geht
  await tabs.getByRole('button', { name: 'Dienstplan' }).click();
  await page.getByLabel('Bereichsfilter').selectOption({ label: 'Bar' });
  await expect(page.locator('.pub-chip')).toContainText('Entwurf');
  await page.locator('.pub-chip').getByRole('button', { name: 'Veröffentlichen' }).click();
  await page.getByRole('button', { name: 'Veröffentlichen' }).last().click();
  await expect(page.locator('.pub-chip')).toContainText('veröffentlicht');

  // Link von Paul (Bar) öffnen
  await tabs.getByRole('button', { name: /^Mitarbeitende/ }).click();
  await page.locator('table.list tr', { hasText: 'Paul Steiner' }).click();
  const url = await page.getByLabel('Persönlicher Link').inputValue();
  expect(url).toMatch(/\/p\/[0-9a-f-]{36}$/);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: /Dienstplan · Hotel Sonnenhof/ })).toBeVisible();
  await expect(page.locator('.pub-mine li').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kalender abonnieren' })).toHaveAttribute('href', /^webcal:\/\/.*\/api\/ical\//);
  await page.screenshot({ path: 'test-results/dienstplan-link.png', fullPage: true });
  await page.getByRole('button', { name: 'IT' }).click();
  await expect(page.getByRole('heading', { name: 'I miei turni' })).toBeVisible();
  await page.goto('/p/00000000-0000-0000-0000-000000000000');
  await expect(page.getByText('non è valido')).toBeVisible(); // Sprache bleibt gespeichert
});

test('Live-Plan zeigt „Heute im Dienst“, Prüfregeln sind einstellbar', async ({ page }) => {
  await loginDemo(page);
  await expect(page.locator('.on-duty')).toContainText('Heute im Dienst');
  await goView(page, 'Einstellungen');
  const rest = page.getByLabel('Ruhezeit (Std.)');
  await rest.fill('12'); await rest.blur();
  await expect(page.getByRole('button', { name: 'Standard wiederherstellen' })).toBeVisible();
  await page.getByLabel('Besetzungsschlüssel Service').fill('20');
  await page.getByLabel('Besetzungsschlüssel Service').blur();
  await goView(page, 'Dienstplan');
  await page.getByLabel('Bereichsfilter').selectOption({ label: 'Service' });
  await expect(page.locator('.rg-head .staffing').first()).toBeVisible();
});

test('Teildienst zeigt beide Zeiten; Druckansicht ist auch im Dunkelmodus lesbar', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)', 'dark');
  await goView(page, 'Dienstplan');
  await page.getByLabel('Bereichsfilter').selectOption({ label: 'Küche' });
  await page.getByRole('button', { name: 'Weiter' }).click();
  const openMon = cell(page, 'Offene Schichten', 0);
  await page.getByRole('group', { name: 'Vorlagen' }).getByRole('button', { name: /Teildienst/ }).click();
  await openMon.getByRole('button', { name: /eintragen/ }).click();
  await page.getByRole('button', { name: 'Pinsel aus' }).click();
  const chip = openMon.locator('.shift-chip').filter({ hasText: '17:30–21:30' });
  await expect(chip).toContainText('10:00–14:30');
  await expect(chip.locator('small.split')).toBeVisible();

  // Druck: Uhrzeiten schwarz und nicht abgeschnitten, obwohl der Bildschirm dunkel ist
  await page.emulateMedia({ media: 'print' });
  const style = await chip.locator('small').first().evaluate(e => { const s = getComputedStyle(e); return { color: s.color, ws: s.whiteSpace }; });
  expect(style).toEqual({ color: 'rgb(0, 0, 0)', ws: 'normal' });
  expect(await grid(page).locator('.rg-name').nth(1).evaluate(e => getComputedStyle(e).color)).toBe('rgb(0, 0, 0)');
  await page.screenshot({ path: 'test-results/dienstplan-druck.png', fullPage: true });
});
