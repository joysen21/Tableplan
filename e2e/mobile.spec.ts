import { expect, test, type Page } from '@playwright/test';
import { goView, loginDemo, VIEWS } from './helpers';

/** Handy-Tests (Projekt „mobile“). Tests mit test.fail() dokumentieren bekannte Probleme aus dem
 *  Ist-Zustand – sie werden im Design-Umbau behoben und dann zu normalen Tests. */

/** Abendservice wählen (damit es Reservierungen gibt) und im Live-Plan die Liste zeigen */
async function evening(page: Page, tab: 'Plan' | 'Liste' = 'Liste') {
  await page.getByLabel('Service').selectOption({ label: 'Abendessen' });
  await page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name: new RegExp('^' + tab) }).click();
  if (tab === 'Liste') await expect(page.locator('.ritem').first()).toBeVisible();
}

/** Ein Tisch, der heute beim Abendessen weder reserviert noch gesperrt ist */
async function freeDinnerTable(page: Page) {
  return page.evaluate(() => {
    const venue = Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any;
    const dinner = venue.services.find((s: any) => s.name === 'Abendessen');
    const day = new Date().toLocaleDateString('sv-SE');
    const busy = new Set([...venue.reservations.filter((r: any) => r.date === day && r.serviceId === dinner.id).flatMap((r: any) => r.tableIds),
      ...venue.blocks.filter((b: any) => b.date === day).map((b: any) => b.tableId)]);
    return venue.tables.find((t: any) => !busy.has(t.id) && t.roomId === venue.rooms[0].id).id as string;
  });
}

/** Echte Touch-Wischgeste (nach oben) ab der Mitte des Elements; liefert, wie weit die Seite gescrollt hat.
 *  Das Element wird vorher in die Bildschirmmitte geholt (nicht unter die fixierte Kopfzeile). */
async function swipeUp(page: Page, sel: string) {
  const el = page.locator(sel).first();
  await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
  const b = (await el.boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  expect(await page.evaluate(([x, y, sel]) => !!document.elementFromPoint(x, y)?.closest(sel), [x, y, sel] as const), `Finger liegt auf ${sel}`).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const before = await page.evaluate(() => window.scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 25 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  return (await page.evaluate(() => window.scrollY)) - before;
}

test('Alle Ansichten laden ohne seitliches Scrollen der Seite', async ({ page }) => {
  await loginDemo(page);
  for (const name of VIEWS) {
    await goView(page, name);
    await expect(page.locator('main .panel').first()).toBeVisible();
    // Ist der Inhalt zu breit, zoomt der Handy-Browser heraus – dann wächst innerWidth über die Gerätebreite
    const { inner, scroll } = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(inner, `${name}: Seite breiter als Bildschirm (herausgezoomt)`).toBe(page.viewportSize()!.width);
    expect(scroll - inner, `${name}: Seite breiter als Bildschirm`).toBeLessThanOrEqual(1);
  }
});

test('Seite scrollt beim Wischen über die Kennzahlen (Kontrolle)', async ({ page }) => {
  await loginDemo(page);
  await evening(page);
  expect(await swipeUp(page, '.kpis')).toBeGreaterThan(50);
});

test('Liste scrollt beim Wischen über eine Reservierung', async ({ page }) => {
  await loginDemo(page);
  await evening(page);
  expect(await swipeUp(page, '.ritem')).toBeGreaterThan(50);
});

test('Kopfzeile belegt höchstens 15 % der Bildschirmhöhe', async ({ page }) => {
  await loginDemo(page);
  const h = (await page.locator('header').boundingBox())!.height;
  expect(h).toBeLessThanOrEqual(page.viewportSize()!.height * 0.15);
});

test('Buttons sind mindestens 44 px hoch (Touch)', async ({ page }) => {
  await loginDemo(page);
  const small = await page.locator('button:visible').evaluateAll(els =>
    els.map(e => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim(), h: e.getBoundingClientRect().height })).filter(x => x.h < 44));
  expect(small).toEqual([]);
});

test('Eingabefelder haben mindestens 16 px Schrift (kein iOS-Zoom)', async ({ page }) => {
  await loginDemo(page);
  const sizes = await page.locator('input:visible, select:visible').evaluateAll(els => els.map(e => parseFloat(getComputedStyle(e).fontSize)));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
});

test('Leiste unten: Hauptansichten + „Mehr“ mit restlichen Ansichten, Hell/Dunkel und Abmelden', async ({ page }) => {
  await loginDemo(page);
  const bar = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await expect(bar.getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'Live-Plan', exact: true })).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Mehr' }).click();
  for (const name of ['Berichte', 'Raumplan-Editor', 'Einstellungen', 'Dunkler Modus', 'Abmelden']) await expect(page.getByRole('menuitem', { name })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('header .pagetitle')).toHaveText('Einstellungen');
  await expect(page.getByRole('button', { name: 'Mehr' })).toHaveClass(/active/);
  // Inhalt endet nicht unter der Leiste
  const pad = await page.locator('main').evaluate(e => parseFloat(getComputedStyle(e).paddingBottom));
  expect(pad).toBeGreaterThanOrEqual(60);
});

test('Küche: Leiste unten mit Berichte und Menü, Abmelden über „Mehr“', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link')).toHaveText(['Berichte', 'Menü']);
  await page.getByRole('button', { name: 'Mehr' }).click();
  await page.getByRole('menuitem', { name: 'Abmelden' }).click();
  await expect(page.getByRole('button', { name: /Toni/ })).toBeVisible();
});

test('Live: Umschalter Plan/Liste, ＋-Button nur beim Plan', async ({ page }) => {
  await loginDemo(page);
  await evening(page, 'Plan');
  await expect(page.locator('svg.plan')).toBeVisible();
  await expect(page.locator('.ritem').first()).toBeHidden();
  await expect(page.getByRole('button', { name: 'Neue Reservierung' })).toBeVisible();
  await page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name: /^Liste/ }).click();
  await expect(page.locator('.ritem').first()).toBeVisible();
  await expect(page.locator('svg.plan')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Neue Reservierung' })).toBeHidden();
});

test('Live: Reservierung antippen öffnet sie als Blatt von unten mit sichtbaren Buttons', async ({ page }) => {
  await loginDemo(page);
  await evening(page);
  await page.locator('.ritem .main').first().tap();
  const modal = page.locator('.modal');
  await expect(modal).toBeVisible();
  const vh = page.viewportSize()!.height;
  expect(Math.round((await modal.boundingBox())!.y + (await modal.boundingBox())!.height)).toBeGreaterThanOrEqual(vh - 1);
  const save = page.getByRole('button', { name: 'Speichern' });
  await expect(save).toBeInViewport();
});

test('Live: freien Tisch antippen und Reservierung ohne Tisch dort platzieren', async ({ page }) => {
  await loginDemo(page);
  await evening(page, 'Plan');
  await page.getByLabel('Uhrzeit').fill('18:00');
  const id = await freeDinnerTable(page);
  await page.locator(`svg.plan [data-table-id="${id}"]`).tap();
  await expect(page.getByRole('heading', { name: 'Ohne Tisch – hier platzieren' })).toBeVisible();
  const before = await page.locator('.modal .sugg .btn').count();
  expect(before).toBeGreaterThan(0);
  await page.locator('.modal .sugg .btn').first().click();
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await expect(page.locator('.toast')).toContainText('Gespeichert');
});

test('Reservierungen: Karten nach Datum, Filter aufklappbar, Antippen öffnet', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Reservierungen');
  await expect(page.locator('table.list')).toHaveCount(0);
  await expect(page.locator('.day-head').first()).toBeVisible();
  await expect(page.getByLabel('Von')).toBeHidden();
  await page.getByRole('button', { name: /^Filter/ }).click();
  await expect(page.getByLabel('Von')).toBeVisible();
  await page.getByLabel('nur ohne Tisch').check();
  await expect(page.getByRole('button', { name: /^Filter/ })).toContainText('1');
  await page.locator('.ritem .main').first().tap();
  await expect(page.locator('.modal')).toBeVisible();
});

test('Zeitleiste: Wischen über Balken scrollt seitlich, Antippen öffnet', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Zeitleiste');
  await page.getByLabel('Service').selectOption({ label: 'Abendessen' });
  const bar = page.locator('.g-row[data-table-id] .g-bar').first();
  await bar.scrollIntoViewIfNeeded();
  const b = (await bar.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const before = await page.locator('.gantt').evaluate(e => e.scrollLeft);
  const x = b.x + Math.min(b.width / 2, 40), y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 20, y }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  expect(await page.locator('.gantt').evaluate(e => e.scrollLeft)).toBeGreaterThan(before + 50);
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.locator('.g-row[data-table-id] .g-bar').first().tap();
  await expect(page.locator('.modal')).toBeVisible();
});

test('Zeitleiste: Tischspalte bleibt beim Scrollen stehen, Zeile antippen markiert sie', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Zeitleiste');
  await page.getByLabel('Service').selectOption({ label: 'Abendessen' });
  const gantt = page.locator('.gantt');
  await gantt.evaluate(e => { e.scrollLeft = e.scrollWidth; });
  const g = (await gantt.boundingBox())!;
  const label = page.locator('.g-row[data-table-id] .g-label').first();
  expect(Math.abs((await label.boundingBox())!.x - g.x)).toBeLessThan(2);
  await label.tap();
  await expect(page.locator('.g-row.marked')).toHaveCount(1);
  await label.tap();
  await expect(page.locator('.g-row.marked')).toHaveCount(0);
});

test('Zeitleiste: lange drücken und ziehen verschiebt einen Eintrag auf einen anderen Tisch', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Zeitleiste');
  await page.getByLabel('Service').selectOption({ label: 'Abendessen' });
  const free = await freeDinnerTable(page);
  // Balken aus der nächsten belegten Zeile oberhalb des freien Tisches, beide sichtbar machen
  const res = await page.evaluate(id => {
    const rows = [...document.querySelectorAll<HTMLElement>('.g-row[data-table-id]')];
    const f = rows.findIndex(r => r.dataset.tableId === id);
    const src = rows.slice(0, f).reverse().find(r => r.querySelector('.g-bar'))!;
    const bar = src.querySelector<HTMLElement>('.g-bar')!;
    bar.scrollIntoView({ block: 'center', inline: 'center' });
    return bar.dataset.res!;
  }, free);
  const bar = page.locator(`.g-bar[data-res="${res}"]`).first();
  await page.locator(`.g-row[data-table-id="${free}"]`).evaluate(e => e.scrollIntoView({ block: 'nearest' }));
  const b = (await bar.boundingBox())!, t = (await page.locator(`.g-row[data-table-id="${free}"] .g-track`).boundingBox())!;
  const x = b.x + Math.min(b.width / 2, 30), y = b.y + b.height / 2, ty = t.y + t.height / 2;
  const top0 = await page.locator('.gantt').evaluate(e => e.scrollTop);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(600);
  await expect(bar).toHaveClass(/lifted/);
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (ty - y) * i / 10 }] }); await page.waitForTimeout(16); }
  await expect(page.locator(`.g-row.drop-target[data-table-id="${free}"]`)).toHaveCount(1);
  expect(await page.locator('.gantt').evaluate(e => e.scrollTop)).toBe(top0); // Ziehen scrollt nicht mit
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await expect(page.locator('.toast')).toContainText(/Gespeichert|verschoben/);
  await expect(page.locator(`.g-row[data-table-id="${free}"] .g-bar[data-res="${res}"]`)).toHaveCount(1);
});

test('Hotel: freien Tisch antippen und Gast ohne Tisch zuweisen', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Hotelgäste');
  const chips = page.locator('[data-chip]');
  const n = await chips.count();
  expect(n).toBeGreaterThan(0);
  const id = await page.evaluate(() => {
    const venue = Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any;
    const used = new Set(venue.stays.flatMap((s: any) => s.tableIds));
    const day = new Date().toLocaleDateString('sv-SE');
    const busy = new Set([...used, ...venue.reservations.filter((r: any) => r.date === day).flatMap((r: any) => r.tableIds), ...venue.blocks.map((b: any) => b.tableId)]);
    return venue.tables.find((t: any) => !busy.has(t.id) && t.roomId === venue.rooms[0].id && t.maxPersons >= 4).id as string;
  });
  await page.locator(`.hotel svg.plan [data-table-id="${id}"]`).tap();
  await expect(page.getByRole('heading', { name: 'Hotelgast ohne festen Tisch hier platzieren' })).toBeVisible();
  await page.locator('.modal .sugg .btn').first().click();
  const confirm = page.getByRole('button', { name: 'Trotzdem zuweisen' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await expect(page.locator('.toast')).toBeVisible();
  await expect(chips).toHaveCount(n - 1);
});
