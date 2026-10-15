import { expect, test, goView, loginDemo } from './helpers';

/** Gäste-Speisekarte per QR: Gast wählt am Tisch, die Küche sieht die Auswahl im Menü */
test('Gast wählt per QR-Code sein Abendmenü, die Küche sieht die Auswahl', async ({ page }) => {
  await loginDemo(page);
  // heutiges Abendmenü (offen) und ein Hotelzimmer mit Tisch, das noch nicht gewählt hat
  const target = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('tischplan.demo.v2')!);
    const v = Object.values(db.data)[0] as any;
    const day = new Date().toLocaleDateString('sv-SE');
    const svc = v.services.find((s: any) => s.kind === 'abend');
    const menu = v.menus.find((m: any) => m.date === day && m.serviceId === svc.id);
    const r = v.reservations.find((x: any) => x.date === day && x.serviceId === svc.id && x.stayId && x.tableIds.length
      && !['storniert', 'noshow'].includes(x.status) && !v.menuChoices.some((c: any) => c.menuId === menu.id && c.stayId === x.stayId));
    const stay = v.stays.find((s: any) => s.id === r.stayId);
    const table = v.tables.find((t: any) => t.id === r.tableIds[0]);
    return { token: table.qrToken, table: table.name, roomNo: stay.roomNo, stayId: stay.id, menuId: menu.id };
  });

  await page.goto(`/m/${target.token}?demo`);
  await expect(page.getByText(`Tisch ${target.table}`)).toBeVisible();
  await page.getByRole('tab', { name: /Heute.*Abendessen/ }).click();
  const roomBtn = page.getByRole('button', { name: new RegExp(`Zimmer ${target.roomNo}\\b`) });
  if (await roomBtn.isVisible().catch(() => false)) await roomBtn.click();
  await page.getByRole('button', { name: '+' }).first().click();
  await page.getByRole('button', { name: 'Auswahl senden' }).click();
  await expect(page.getByText('Danke! Ihre Auswahl ist bei der Küche angekommen.')).toBeVisible();

  // Sprache umschalten
  await page.getByRole('button', { name: 'IT' }).click();
  await expect(page.getByRole('button', { name: 'Invia la scelta' })).toBeVisible();

  // gespeichert …
  const saved = await page.evaluate(t => {
    const v = Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any;
    return v.menuChoices.find((c: any) => c.menuId === t.menuId && c.stayId === t.stayId)?.counts;
  }, target);
  expect(Object.values(saved ?? {}).reduce((a: number, n) => a + (n as number), 0)).toBeGreaterThan(0);

  // … und in der Küche sichtbar
  await page.goto('/?demo');
  await goView(page, 'Menü');
  await page.locator('.mw-row.today .mw-cell').last().click();
  await expect(page.locator('.guest-choice')).toContainText('Zimmern gewählt');
  await expect(page.locator('.menu-item-row').filter({ hasText: 'gewählt' }).first()).toBeVisible();
});

test('Unbekannter QR-Code zeigt einen freundlichen Hinweis', async ({ page }) => {
  await loginDemo(page);
  await page.goto('/m/0000000000000000deadbeef?demo');
  await expect(page.getByText('Dieser QR-Code ist nicht mehr gültig')).toBeVisible();
});

test('Frühstück mit freier Platzwahl: Gast wählt sein Zimmer aus der Liste, das Handy merkt es sich', async ({ page }) => {
  await loginDemo(page);
  // Frühstücksmenü für heute (offen) mit zwei Gerichten anlegen; irgendein Tisch-QR, ein Zimmer mit Frühstück heute
  const target = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('tischplan.demo.v2')!);
    const v = Object.values(db.data)[0] as any;
    const day = new Date().toLocaleDateString('sv-SE');
    const svc = v.services.find((s: any) => s.kind === 'fruehstueck');
    const [a, b] = v.dishes.filter((x: any) => x.course === 'hauptgang');
    const menu = { id: crypto.randomUUID(), date: day, serviceId: svc.id, portions: null, bufferPct: 0, notes: '', ordering: 'offen',
      items: [a, b].map((x: any) => ({ course: 'hauptgang', dishId: x.id, share: null, name: x.name, allergens: [] })) };
    v.menus.push(menu);
    localStorage.setItem('tischplan.demo.v2', JSON.stringify(db));
    const stay = v.stays.filter((s: any) => s.arrival < day && day <= s.departure).sort((x: any, y: any) => x.roomNo.localeCompare(y.roomNo))[0];
    return { token: v.tables[0].qrToken, roomNo: stay.roomNo, stayId: stay.id, menuId: menu.id };
  });

  await page.goto(`/m/${target.token}?demo`);
  await page.getByRole('tab', { name: /Heute.*Frühstück/ }).click();
  await expect(page.getByText('Freie Platzwahl – bitte wählen Sie Ihr Zimmer.')).toBeVisible();
  const pick = page.getByRole('combobox', { name: 'Zimmer auswählen' });
  await pick.selectOption(target.stayId);
  await expect(pick.locator("option:checked")).toHaveText(new RegExp(`^Zimmer ${target.roomNo} ·`));
  await page.getByRole('button', { name: '+' }).first().click();
  await page.getByRole('button', { name: 'Auswahl senden' }).click();
  await expect(page.getByText('Danke! Ihre Auswahl ist bei der Küche angekommen.')).toBeVisible();
  const saved = await page.evaluate(t => {
    const v = Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any;
    return v.menuChoices.find((c: any) => c.menuId === t.menuId && c.stayId === t.stayId)?.counts;
  }, target);
  expect(Object.values(saved ?? {}).reduce((a: number, n) => a + (n as number), 0)).toBe(1);
  await page.screenshot({ path: 'test-results/guest-breakfast.png' });

  // erneut öffnen (anderer Tisch): Zimmer ist vorausgewählt
  await page.reload();
  await page.getByRole('tab', { name: /Heute.*Frühstück/ }).click();
  await expect(pick).toHaveValue(target.stayId);
});
