import { expect, test, goView, loginDemo, openAllSettings } from './helpers';
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
  await openAllSettings(page);
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
  const roomIn = page.getByRole('textbox', { name: 'Zimmernummer' });
  if (await roomIn.isVisible().catch(() => false)) { await roomIn.fill(r.roomNo); await page.getByRole('button', { name: 'Weiter' }).click(); }
  await page.locator('.gm-step button[aria-label="+"]:not([disabled])').first().click();
  await page.getByLabel('Notiz an die Küche').fill('Fleisch bitte medium');
  await page.getByRole('button', { name: 'Auswahl senden' }).click();
  await expect(page.getByText('Danke! Ihre Auswahl ist bei der Küche angekommen.')).toBeVisible();
  // nach dem Neuladen steht die Notiz wieder im Feld
  await page.reload();
  await page.getByRole('tab', { name: /Heute.*Abendessen/ }).click();
  if (await roomIn.isVisible().catch(() => false)) { await roomIn.fill(r.roomNo); await page.getByRole('button', { name: 'Weiter' }).click(); }
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

test('Menü: Gänge aufklappbar, nach Häufigkeit, max. 20, Suche, Auswahlbutton', async ({ page }) => {
  await loginDemo(page);
  // viele Gerichte im Hauptgang, damit „Weitere laden“ erscheint
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('tischplan.demo.v2')!);
    const v = Object.values(db.data)[0] as any;
    for (let i = 1; i <= 25; i++) v.dishes.push({ id: crypto.randomUUID(), name: `Testgericht ${String(i).padStart(2, '0')}`, nameIt: '', nameEn: '', course: 'hauptgang', diet: [], notes: '', ingredients: [] });
    localStorage.setItem('tischplan.demo.v2', JSON.stringify(db));
  });
  await page.reload();
  await goView(page, 'Menü');
  await page.locator('.mw-row.today .mw-cell').last().click();
  const picker = page.getByRole('group', { name: 'Gerichte auswählen' });
  const head = picker.getByRole('button', { name: /^Hauptgang/ });
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await head.click();
  const items = picker.locator('.dp-course.open .dp-item');
  await expect(items).toHaveCount(20);
  // häufig verwendete (im Demo-Menü) zuerst
  await expect(items.first()).toContainText('verwendet');
  await picker.getByRole('button', { name: /^Weitere \d+ laden/ }).click();
  await expect(items).not.toHaveCount(20);
  // Suche und Auswahlbutton
  const before = await page.locator('.menu-item-row').count();
  await picker.getByLabel('Gericht suchen').fill('testgericht 07');
  await expect(picker.locator('.dp-item')).toHaveCount(1);
  await picker.getByRole('button', { name: 'Testgericht 07 ins Menü' }).click();
  await expect(page.locator('.menu-item-row')).toHaveCount(before + 1);
  await picker.getByRole('button', { name: 'Testgericht 07 aus dem Menü nehmen' }).click();
  await expect(page.locator('.menu-item-row')).toHaveCount(before);
  await picker.getByLabel('Gericht suchen').fill('');
  await page.screenshot({ path: 'test-results/menue-gerichtsauswahl.png' });
});

test('Bereich bekommt ein Icon, das im Dienstplan vor Bereich und Mitarbeitenden steht', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Dienstplan');
  // Demo-Bereiche haben schon Icons
  await expect(page.locator('.rg-name svg.dept-icon').first()).toBeVisible();
  await goView(page, 'Einstellungen');
  await openAllSettings(page);
  const card = page.locator('.dept-card', { has: page.getByLabel('Name Bereich Bar') });
  await card.getByRole('radio', { name: 'Wein' }).click();
  await expect(card.getByRole('radio', { name: 'Wein' })).toHaveAttribute('aria-checked', 'true');
  expect((await demo(page)).departments.find((x: any) => x.name === 'Bar').icon).toBe('wein');
  await page.screenshot({ path: 'test-results/bereich-icons.png' });
});

/** heutige Abend-Reservierung eines externen Gasts (ohne Zimmer) mit Tisch */
async function externalDinner(page: Page) {
  return page.evaluate(() => {
    const v = Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any;
    const day = new Date().toLocaleDateString('sv-SE');
    const svc = v.services.find((s: any) => s.kind === 'abend');
    const menu = v.menus.find((m: any) => m.date === day && m.serviceId === svc.id);
    const r = v.reservations.find((x: any) => x.date === day && x.serviceId === svc.id && !x.stayId && x.tableIds.length && !['storniert', 'noshow'].includes(x.status)
      && !v.reservations.some((o: any) => o.id !== x.id && o.date === day && o.serviceId === svc.id && o.tableIds.includes(x.tableIds[0])));
    const table = v.tables.find((t: any) => t.id === r.tableIds[0]);
    return { id: r.id, name: r.name, menuId: menu.id, token: table.qrToken, table: table.name };
  });
}

test('Externer Gast: Menüauswahl im Formular und per QR-Code am Tisch', async ({ page }) => {
  await loginDemo(page);
  const r = await externalDinner(page);
  // per QR: erscheint als „Tisch …“ ohne Namen
  await page.goto(`/m/${r.token}?demo`);
  await page.getByRole('tab', { name: /Heute.*Abendessen/ }).click();
  await expect(page.getByText(`Tisch ${r.table} ·`)).toBeVisible();
  await expect(page.getByText(r.name)).toHaveCount(0);
  await page.locator('.gm-step button[aria-label="+"]:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Auswahl senden' }).click();
  await expect(page.getByText('Danke! Ihre Auswahl ist bei der Küche angekommen.')).toBeVisible();
  let c = (await demo(page)).menuChoices.find((x: any) => x.menuId === r.menuId && x.reservationId === r.id);
  const sum = (x: any) => Object.values(x.counts).reduce((a: number, n) => a + (n as number), 0) as number;
  const first = sum(c);
  expect(c.stayId).toBeNull();
  expect(first).toBeGreaterThan(0);

  // im Formular: Auswahl sichtbar und änderbar
  await page.goto('/?demo');
  await page.getByLabel('Service').first().selectOption({ label: 'Abendessen' });
  await page.locator('.ritem', { hasText: r.name }).click();
  const menu = page.getByRole('group', { name: 'Menüauswahl' });
  await menu.locator('button[aria-label^="mehr "]:not([disabled])').first().click();
  await page.locator('.modal').getByRole('button', { name: 'Speichern' }).click();
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await expect(page.locator('.toast').first()).toContainText('Gespeichert');
  c = (await demo(page)).menuChoices.find((x: any) => x.menuId === r.menuId && x.reservationId === r.id);
  expect(sum(c)).toBe(first + 1);

  // Tisch-Popup: Gerichte untereinander mit Menge
  await page.locator('svg.plan .tb', { hasText: r.table }).first().click();
  const lines = page.locator('.modal .menu-lines .ml-dish');
  await expect(lines.first()).toBeVisible();
  expect(await lines.count()).toBeGreaterThanOrEqual(1);
  await expect(lines.first()).toContainText('×');
});

test('Legende im Live-Plan = Reservierungs-Status aus den Einstellungen; nur noch „Personen“', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Einstellungen');
  await openAllSettings(page);
  await page.getByLabel('Bezeichnung Platziert').fill('Am Tisch');
  await page.getByRole('button', { name: 'Eigener Status' }).click();
  await page.getByLabel('Bezeichnung eigener Status').fill('Aperitif');
  // eigener Status: kein „wie …“, nur die Bedeutung für den Tisch
  await expect(page.getByLabel('Tisch bei Aperitif')).toHaveValue('platziert');
  await page.getByRole('button', { name: 'Status speichern' }).click();
  await expect(page.locator('.toast')).toContainText('Status gespeichert');
  await goView(page, 'Live-Plan');
  const legend = page.locator('.legend');
  await expect(legend).toContainText('Am Tisch');
  await expect(legend).toContainText('Aperitif');
  await expect(legend).not.toContainText('Platziert');
  await expect(legend).not.toContainText('Bald fällig');
  await page.screenshot({ path: 'test-results/live-legende.png' });

  await page.getByRole('button', { name: 'Reservierung', exact: true }).click();
  await expect(page.locator('.modal').getByLabel('Personen')).toHaveValue('2');
  await expect(page.locator('.modal').getByLabel('Erwachsene', { exact: true })).toHaveCount(0);
  await expect(page.locator('.modal').getByLabel('Kinder', { exact: true })).toHaveCount(0);
});

test('Live-Plan: Zimmernummern am Tisch und in der Liste, Tisch dazunehmen nur im Raum, Gesamtübersicht zusammengelegter Tische', async ({ page }) => {
  await loginDemo(page);
  await page.getByLabel('Service').first().selectOption({ label: 'Abendessen' });
  const info = await page.evaluate(() => {
    const v = Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any;
    const day = new Date().toLocaleDateString('sv-SE');
    const svc = v.services.find((s: any) => s.kind === 'abend');
    const hotel = v.reservations.find((r: any) => r.date === day && r.serviceId === svc.id && r.stayId && r.tableIds.length === 1);
    const tb = v.tables.find((t: any) => t.id === hotel.tableIds[0]);
    return { tableId: tb.id, roomId: tb.roomId, roomNo: v.stays.find((s: any) => s.id === hotel.stayId).roomNo,
      otherRoomTables: v.tables.filter((t: any) => t.roomId !== tb.roomId).map((t: any) => t.name),
      // Tische mit einer Reservierung in diesem Service – dürfen nicht zum Dazunehmen angeboten werden
      reserved: v.tables.filter((t: any) => t.id !== tb.id && v.reservations.some((r: any) => r.date === day && r.serviceId === svc.id && !['storniert', 'noshow', 'abgeschlossen'].includes(r.status) && r.tableIds.includes(t.id))).map((t: any) => t.name) };
  });
  // Zimmernummer im Plan am Tisch
  await page.mouse.move(700, 400);
  await expect(page.locator(`svg.plan .tb[data-table-id="${info.tableId}"] text`)).toContainText(`Zi. ${info.roomNo}`);
  // rechte Leiste: Zimmernummer hervorgehoben
  await expect(page.locator('.ritem .room-no', { hasText: `Zi. ${info.roomNo}` }).first()).toBeVisible();
  // Tisch dazunehmen: nur Tische aus demselben Raum
  await page.locator(`svg.plan .tb[data-table-id="${info.tableId}"]`).click();
  const opts = await page.getByLabel('Tisch dazunehmen').locator('option').allTextContents();
  for (const n of info.otherRoomTables) expect(opts.some(o => o.startsWith(n + ' '))).toBe(false);
  for (const n of info.reserved) expect(opts.some(o => o.startsWith(n + ' '))).toBe(false);
  expect(opts.length).toBeGreaterThan(1);
  await page.getByLabel('Tisch dazunehmen').selectOption({ index: 1 });
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  // Gesamtübersicht der zusammengelegten Tische – immer, mit Personen, Reservierungen und Menü
  await page.mouse.move(700, 400);
  await page.locator(`svg.plan .tb[data-table-id="${info.tableId}"]`).click();
  const g = page.getByLabel('Zusammengelegte Tische');
  await expect(g).toContainText('Zusammengelegt:');
  await expect(g).toContainText('Personen');
  await expect(g).toContainText('Reservierung');
  await expect(g.getByLabel('Menü summiert').or(g.getByText('Noch kein Menü gewählt'))).toBeVisible();
  await page.screenshot({ path: 'test-results/zusammengelegt.png' });
  await page.keyboard.press('Escape');

  // Pass: zusammengelegte Tische mit Summe der Menüauswahl
  await goView(page, 'Pass');
  await page.getByLabel('Service').first().selectOption({ label: 'Abendessen' });
  await page.locator(`svg.plan .tb[data-table-id="${info.tableId}"]`).click();
  const pg = page.getByRole('dialog').getByLabel('Zusammengelegte Tische');
  await expect(pg).toContainText('Zusammengelegt:');
  await expect(pg.getByLabel('Menü summiert').or(pg.getByText('Noch kein Menü gewählt'))).toBeVisible();
  await page.screenshot({ path: 'test-results/pass-zusammengelegt.png' });
});

test('QR-Menüwahl: Abendmenü automatisch, Zeitfenster in den Einstellungen', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Einstellungen');
  await openAllSettings(page);
  const open = page.getByLabel('Öffnet am Vorabend um');
  await expect(open).toHaveValue('21:00');
  await expect(page.getByLabel('Schließt am Tag um')).toHaveValue('10:00');
  await open.fill('20:00');
  await open.blur();
  await expect(page.locator('.toast')).toContainText('Zeitfenster gespeichert');
  expect((await demo(page)).venue.qrWindow).toEqual({ open: '20:00', close: '10:00' });
  // Abendmenü auf „Automatisch“: zeigt den aktuellen Zustand (heute nach 10 Uhr: geschlossen)
  await goView(page, 'Menü');
  await page.locator('.mw-row.today .mw-cell').last().click();
  await page.getByLabel('Gäste-Auswahl').selectOption('auto');
  await expect(page.locator('.guest-choice')).toContainText('jetzt: geschlossen');
});
