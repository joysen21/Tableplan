import { expect, test, type Page } from '@playwright/test';

/** Handy-Tests (Projekt „mobile“). Tests mit test.fail() dokumentieren bekannte Probleme aus dem
 *  Ist-Zustand – sie werden im Design-Umbau behoben und dann zu normalen Tests. */

async function loginDemo(page: Page, who = 'Anna (Admin)') {
  await page.goto('/?demo');
  await page.evaluate(() => localStorage.removeItem('tischplan.demo.v2'));
  await page.goto('/?demo');
  await page.getByRole('button', { name: new RegExp(who.replace(/[()]/g, '.')) }).click();
  await expect(page.locator('header')).toBeVisible();
}

/** Abendservice wählen, damit die Liste Einträge hat */
async function evening(page: Page) {
  await page.getByLabel('Service').selectOption({ label: 'Abendessen' });
  await expect(page.locator('.ritem').first()).toBeVisible();
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
  for (const name of ['Live-Plan', 'Zeitleiste', 'Reservierungen', 'Hotelgäste', 'Berichte', 'Raumplan-Editor', 'Einstellungen']) {
    await page.getByRole('link', { name }).click();
    await expect(page.locator('main .panel').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name}: Seite breiter als Bildschirm`).toBeLessThanOrEqual(1);
  }
});

test('Seite scrollt beim Wischen über die Kennzahlen (Kontrolle)', async ({ page }) => {
  await loginDemo(page);
  await evening(page);
  expect(await swipeUp(page, '.kpis')).toBeGreaterThan(50);
});

test('Liste scrollt beim Wischen über eine Reservierung', async ({ page }) => {
  test.fail(true, 'Bekannt: .ritem hat touch-action:none (Drag & Drop) – Behebung in Phase 3');
  await loginDemo(page);
  await evening(page);
  expect(await swipeUp(page, '.ritem')).toBeGreaterThan(50);
});

test('Kopfzeile belegt höchstens 15 % der Bildschirmhöhe', async ({ page }) => {
  test.fail(true, 'Bekannt: Kopfzeile bricht in mehrere Zeilen um – Behebung in Phase 2');
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
