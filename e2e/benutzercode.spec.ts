import { expect, goView, loginDemo, openAllSettings, test } from './helpers';

/** Admin legt Benutzer mit Benutzercode + Passwort an; Anmeldung mit Firma + Code, Passwortwechsel, Zurücksetzen */
test('Benutzercode: anlegen, anmelden, eigenes Passwort, Admin setzt neu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await loginDemo(page);
  await goView(page, 'Einstellungen');
  await openAllSettings(page);

  // ohne Firmenkürzel kein Anlegen
  await expect(page.getByText('Bitte zuerst oben ein Firmenkürzel festlegen.')).toBeVisible();
  const firm = page.getByLabel('Firmenkürzel für die Anmeldung mit Benutzercode');
  await expect(firm).toHaveValue('hotel-sonnenhof-restaurant'); // Vorschlag aus dem Namen
  await firm.fill('sonnenhof');
  await page.getByRole('button', { name: 'Festlegen' }).click();
  await expect(page.locator('.toast')).toContainText('Firmenkürzel gespeichert');
  await expect(page.getByRole('link', { name: /\/login\/sonnenhof$/ })).toBeVisible();

  // anlegen: Code-Vorschlag aus dem Namen, Passwort generiert
  const form = page.getByRole('group', { name: 'Benutzer mit Benutzercode anlegen' });
  await form.getByLabel('Name').fill('Max Kofler');
  await expect(form.getByLabel('Benutzercode')).toHaveValue('max.k');
  await expect(form.getByRole('textbox', { name: /^Passwort/ })).toHaveValue(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/);
  await form.getByRole('textbox', { name: /^Passwort/ }).fill('kurz');
  await form.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.locator('.toast').last()).toContainText('mindestens 8 Zeichen');
  await form.getByRole('button', { name: 'Generieren' }).click();
  const pw = await form.getByRole('textbox', { name: /^Passwort/ }).inputValue();
  expect(pw).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/);
  await form.getByLabel('Rolle').selectOption('service');
  await form.getByRole('button', { name: 'Anlegen' }).click();
  const slip = page.getByRole('region', { name: 'Zugangsdaten' });
  await expect(slip).toContainText('max.k');
  await expect(slip).toContainText(pw);
  await expect(slip).toContainText('sonnenhof');
  await page.screenshot({ path: 'test-results/benutzercode-angelegt.png' });
  await slip.getByRole('button', { name: 'Fertig' }).click();
  await expect(slip).toHaveCount(0);
  await expect(page.locator('.member-row', { hasText: 'Code: max.k' })).toContainText('Code: max.k');
  // gleicher Name → nächster Vorschlag
  await form.getByLabel('Name').fill('Max Kofler');
  await expect(form.getByLabel('Benutzercode')).toHaveValue('max.ko');

  // abmelden, mit Anmeldelink + Code anmelden
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/login/sonnenhof?demo');
  const login = page.getByRole('form', { name: 'Anmeldung mit Benutzercode' });
  await expect(login).toContainText('Firma: Hotel Sonnenhof');
  await login.getByLabel('Benutzercode').fill('max.k');
  await login.getByLabel('Passwort').fill('falsch123');
  await login.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.locator('.toast').last()).toContainText('Benutzercode oder Passwort falsch');
  await login.getByLabel('Passwort').fill(pw);
  await login.getByRole('button', { name: 'Anmelden' }).click();

  // erstes Anmelden: eigenes Passwort wählen
  await expect(page.getByRole('heading', { name: 'Passwort festlegen' })).toBeVisible();
  await expect(page.getByText('Bitte wählen Sie jetzt ein eigenes Passwort')).toBeVisible();
  await page.getByLabel(/Neues Passwort/).fill('MeinGeheim1');
  await page.getByLabel('Wiederholen').fill('MeinGeheim1');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Einstellungen' })).toHaveCount(0); // Service

  // nächstes Mal: Firma gemerkt, neues Passwort gilt, altes nicht mehr
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/?demo');
  await expect(login).toBeVisible(); // Firma gemerkt → Code-Anmeldung gleich offen
  await expect(login).toContainText('Firma: Hotel Sonnenhof');
  await login.getByLabel('Benutzercode').fill('max.k');
  await login.getByLabel('Passwort').fill(pw);
  await login.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.locator('.toast').last()).toContainText('falsch');
  await login.getByLabel('Passwort').fill('MeinGeheim1');
  await login.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.locator('header')).toBeVisible();

  // Admin setzt Passwort neu → Zettel, beim nächsten Anmelden wieder wechseln
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/?demo');
  await page.getByRole('button', { name: /Anna .Admin./ }).click();
  await goView(page, 'Einstellungen');
  await openAllSettings(page);
  await page.getByRole('button', { name: 'Passwort neu setzen Max Kofler' }).click();
  const dlg = page.getByRole('dialog', { name: /Passwort neu setzen/ });
  await dlg.getByLabel(/Neues Passwort/).fill('Zurueck-2026');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('region', { name: 'Zugangsdaten' })).toContainText('Zurueck-2026');
  // Code-Benutzer löschen
  await page.locator('.member-row', { hasText: 'Code: max.k' }).getByRole('button', { name: 'Benutzer entfernen' }).click();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(page.locator('.member-row', { hasText: 'Code: max.k' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
