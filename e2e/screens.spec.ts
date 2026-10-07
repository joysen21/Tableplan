import { expect, test } from '@playwright/test';

/** Screenshots aller Ansichten für Vorher/Nachher-Vergleiche (Desktop + Handy).
 *  Läuft nur mit SHOT_DIR, z. B.: SHOT_DIR=docs/screens/vorher npx playwright test screens */
const dir = process.env.SHOT_DIR;
test.skip(!dir, 'nur mit SHOT_DIR');

const VIEWS = ['Live-Plan', 'Zeitleiste', 'Reservierungen', 'Hotelgäste', 'Berichte', 'Raumplan-Editor', 'Einstellungen'];

test('Screenshots aller Ansichten', async ({ page }, info) => {
  const p = info.project.name;
  await page.goto('/?demo');
  await page.evaluate(() => localStorage.removeItem('tischplan.demo.v2'));
  await page.goto('/?demo');
  await page.screenshot({ path: `${dir}/${p}-00-login.png`, fullPage: true });
  await page.getByRole('button', { name: /Anna .Admin./ }).click();
  await expect(page.locator('header')).toBeVisible();
  for (const [i, name] of VIEWS.entries()) {
    await page.getByRole('link', { name }).click();
    await expect(page.locator('main .panel').first()).toBeVisible();
    await page.waitForTimeout(300);
    const slug = name.toLowerCase().replace(/[^a-zäöü]+/g, '-');
    await page.screenshot({ path: `${dir}/${p}-${String(i + 1).padStart(2, '0')}-${slug}.png`, fullPage: true });
  }
  await page.getByRole('link', { name: 'Live-Plan' }).click();
  await page.getByRole('button', { name: /Reservierung/ }).first().click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.screenshot({ path: `${dir}/${p}-20-dialog-reservierung.png` });
});
