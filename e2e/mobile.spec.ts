import { expect, test, type Page } from '@playwright/test';
import { goView, loginDemo, VIEWS } from './helpers';

/** Handy-Tests (Projekt „mobile“). Tests mit test.fail() dokumentieren bekannte Probleme aus dem
 *  Ist-Zustand – sie werden im Design-Umbau behoben und dann zu normalen Tests. */

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
  test.fail(true, 'Bekannt: .ritem hat touch-action:none (Drag & Drop) – Behebung in Phase 3');
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

test('Küche: keine Leiste unten, Abmelden über das Benutzermenü', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(0);
  await page.getByRole('button', { name: /Karl/ }).click();
  await page.getByRole('menuitem', { name: 'Abmelden' }).click();
  await expect(page.getByRole('button', { name: /Toni/ })).toBeVisible();
});
