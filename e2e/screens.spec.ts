import { expect, test } from '@playwright/test';
import { goView, VIEWS } from './helpers';

/** Screenshots aller Ansichten für Vorher/Nachher-Vergleiche (Desktop + Handy).
 *  Läuft nur mit SHOT_DIR, z. B.: SHOT_DIR=docs/screens/vorher npx playwright test screens
 *  SHOT_THEME=dark für den Dunkel-Modus. */
const dir = process.env.SHOT_DIR;
const theme = process.env.SHOT_THEME === 'dark' ? 'dark' : 'light';
test.skip(!dir, 'nur mit SHOT_DIR');

test('Screenshots aller Ansichten', async ({ page }, info) => {
  const p = info.project.name + (theme === 'dark' ? '-dunkel' : '');
  await page.goto('/?demo');
  await page.evaluate(th => { localStorage.removeItem('tischplan.demo.v2'); localStorage.setItem('tischplan.theme', th); }, theme);
  await page.goto('/?demo');
  await page.screenshot({ path: `${dir}/${p}-00-login.png`, fullPage: true });
  await page.getByRole('button', { name: /Anna .Admin./ }).click();
  await expect(page.locator('header')).toBeVisible();
  for (const [i, name] of VIEWS.entries()) {
    await goView(page, name);
    await expect(page.locator('main .panel').first()).toBeVisible();
    await page.waitForTimeout(300);
    const slug = name.toLowerCase().replace(/[^a-zäöü]+/g, '-');
    await page.screenshot({ path: `${dir}/${p}-${String(i + 1).padStart(2, '0')}-${slug}.png`, fullPage: true });
  }
  await goView(page, 'Live-Plan');
  await page.getByRole('button', { name: /Reservierung/ }).first().click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.screenshot({ path: `${dir}/${p}-20-dialog-reservierung.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^(Mehr|Anna)/ }).first().click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.screenshot({ path: `${dir}/${p}-21-menue.png` });
});
