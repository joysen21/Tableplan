import { expect, test, goView, loginDemo } from './helpers';
import type { Page } from '@playwright/test';

/** Modul Pass + Chef: Service ruft ab → Küche meldet fertig → Service serviert */

async function switchUser(page: Page, who: string) {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/?demo');
  await page.getByRole('button', { name: new RegExp(who.replace(/[()]/g, '.')) }).click();
  await expect(page.locator('header')).toBeVisible();
}
const dinner = (page: Page) => page.getByLabel('Service').first().selectOption({ label: 'Abendessen' });

test('Gang abrufen, Küche meldet fertig, Service serviert', async ({ page }) => {
  await loginDemo(page, 'Toni (Service)');
  await goView(page, 'Pass');
  await dinner(page);
  await expect(page.locator('.legend')).toContainText('Gang kann abgerufen werden');
  await page.screenshot({ path: 'test-results/pass-plan.png' });

  const table = page.locator('g.tb[aria-label*="Gang kann abgerufen werden"]').first();
  const name = (await table.getAttribute('aria-label'))!.match(/^Tisch (\S+),/)![1];
  await table.click();
  const dlg = page.getByRole('dialog', { name: `Pass · Tisch ${name}` });
  // ohne Rückfrage; Stand direkt beim Gang
  await dlg.getByRole('button', { name: /abrufen$/ }).first().click();
  await expect(dlg.locator('.pass-courses > li.current .pass-badge')).toContainText('in der Küche');
  await expect(dlg.getByRole('button', { name: /^S+ abrufen$/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/pass-tisch.png' });
  await dlg.getByRole('button', { name: 'Schließen' }).last().click();

  // Küche: Abruf erscheint bei Toni, „Fertig“ melden
  await switchUser(page, 'Karl (Küche)');
  await goView(page, 'Chef');
  await dinner(page);
  const cook = page.getByRole('region', { name: 'Zubereiten' });
  await expect(cook.getByRole('heading', { name: 'Toni (Service)' })).toBeVisible();
  const card = cook.locator('.chef-card', { hasText: name }).first();
  await expect(card).toBeVisible();
  await expect(page.getByRole('region', { name: 'Demnächst' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/chef.png', fullPage: true });
  await card.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('region', { name: 'Fertig' }).locator('.chef-card', { hasText: name })).toBeVisible();

  // Service: Abholen-Leiste → Tisch → Serviert
  await switchUser(page, 'Toni (Service)');
  await goView(page, 'Pass');
  await dinner(page);
  await page.getByRole('list', { name: 'Fertig zum Abholen' }).getByRole('listitem').filter({ hasText: name }).first().click();
  const dlg2 = page.getByRole('dialog', { name: `Pass · Tisch ${name}` });
  await expect(dlg2.locator('.pass-courses > li.current .pass-badge')).toContainText('fertig – abholen');
  await dlg2.locator('.pass-courses > li.current').getByRole('button', { name: 'Serviert' }).click();
  await expect(dlg2.locator('.pass-courses .current').first()).toBeVisible();
});

test('Service trägt Menüauswahl ein und storniert eine Portion', async ({ page }) => {
  await loginDemo(page, 'Toni (Service)');
  await goView(page, 'Pass');
  await dinner(page);
  await page.locator('g.tb[aria-label*="Keine Menüauswahl"]').first().click();
  const dlg = page.getByRole('dialog');
  const label = await dlg.locator('.pass-party').filter({ hasText: 'Noch keine Menüauswahl' }).first().getAttribute('aria-label');
  const party = dlg.getByRole('region', { name: label! });
  for (const b of await party.getByRole('button', { name: /^mehr / }).all()) await b.click();
  await party.getByRole('button', { name: 'Auswahl speichern' }).click();
  await expect(party.locator('.pass-courses')).toBeVisible();
  const before = await party.locator('.pass-courses > li').first().textContent();
  await party.getByRole('button', { name: /^Storno / }).first().click();
  await page.getByRole('button', { name: 'Stornieren', exact: true }).click();
  await expect(party.locator('.pass-courses > li').first()).not.toHaveText(before!);
});
