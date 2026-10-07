import { expect, type Page } from '@playwright/test';

export const VIEWS = ['Live-Plan', 'Zeitleiste', 'Reservierungen', 'Hotelgäste', 'Berichte', 'Raumplan-Editor', 'Einstellungen'];

/** Demo-Modus mit frischen Daten starten und als Demo-Benutzer anmelden */
export async function loginDemo(page: Page, who = 'Anna (Admin)', theme?: 'light' | 'dark') {
  await page.goto('/?demo');
  await page.evaluate(th => { localStorage.removeItem('tischplan.demo.v2'); if (th) localStorage.setItem('tischplan.theme', th); }, theme);
  await page.goto('/?demo');
  await page.getByRole('button', { name: new RegExp(who.replace(/[()]/g, '.')) }).click();
  await expect(page.locator('header')).toBeVisible();
}

/** Ansicht öffnen – über die Navigation oder (am Handy) über das „Mehr“-Menü */
export async function goView(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true });
  if (await link.isVisible()) return link.click();
  await page.getByRole('button', { name: 'Mehr' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
