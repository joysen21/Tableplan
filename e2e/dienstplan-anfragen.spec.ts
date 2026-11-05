import type { Page } from '@playwright/test';
import { expect, goView, loginDemo, openAllSettings, test } from './helpers';

/** Dienstplan-Anfragen (Desktop): Urlaub, Tausch und Krankmeldung über den Mitarbeiter-Link,
 *  Entscheidung der Bereichsleitung im Reiter „Anfragen“, Saisonzeiträume */

const errors: string[] = [];
test.beforeEach(({ page }) => { page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]); errors.length = 0; });

const iso = (d: Date) => d.toLocaleDateString('sv-SE');
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

/** Service: nächste Woche veröffentlichen; Anbieter:in (Dienst nächste Woche), Übernehmer:in (an dem Tag frei, nicht abwesend), dritte Person für die Krankmeldung */
async function setup(page: Page) {
  return page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('tischplan.demo.v2')!);
    const v = Object.values(db.data)[0] as any;
    const mon = (s: string) => { const x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toLocaleDateString('sv-SE'); };
    const next = (() => { const x = new Date(mon(new Date().toLocaleDateString('sv-SE')) + 'T12:00:00'); x.setDate(x.getDate() + 7); return x.toLocaleDateString('sv-SE'); })();
    const dep = v.departments.find((x: any) => x.name === 'Service');
    v.publications.push({ id: crypto.randomUUID(), departmentId: dep.id, weekStart: next, publishedAt: new Date(Date.now() - 3600000).toISOString(), publishedBy: 'Test' });
    const staff = v.staff.filter((s: any) => s.active && s.departmentId === dep.id);
    const absent = (id: string, day: string) => v.absences.some((a: any) => a.staffId === id && day >= a.from && day <= a.to);
    const prev = (day: string) => { const x = new Date(day + 'T12:00:00'); x.setDate(x.getDate() - 1); return x.toLocaleDateString('sv-SE'); };
    // gleicher Tag oder Vortag über Mitternacht
    const busy = (id: string, day: string) => v.shifts.some((s: any) => s.staffId === id && (s.date === day || (s.date === prev(day) && s.end < s.start)));
    const free = (id: string) => !v.absences.some((a: any) => a.staffId === id);
    for (const a of staff.filter((s: any) => free(s.id))) {
      const sh = v.shifts.find((s: any) => s.staffId === a.id && mon(s.date) === next && s.departmentId === dep.id);
      if (!sh) continue;
      const b = staff.find((s: any) => s.id !== a.id && !absent(s.id, sh.date) && !busy(s.id, sh.date));
      const c = staff.find((s: any) => s.id !== a.id && s.id !== b?.id);
      if (!b || !c) continue;
      // ein Frei-Wunsch von C (zum Ablehnen)
      const f = new Date(); f.setDate(f.getDate() + 40); const fd = f.toLocaleDateString('sv-SE');
      v.requests.push({ id: crypto.randomUUID(), staffId: c.id, departmentId: dep.id, kind: 'frei', from: fd, to: fd, shiftId: null, takerId: null,
        note: 'Arzttermin', status: 'offen', answer: '', decidedBy: '', decidedAt: null, createdAt: new Date(Date.now() - 86400000).toISOString() });
      localStorage.setItem('tischplan.demo.v2', JSON.stringify(db));
      return { a: { name: a.name, token: a.shareToken }, b: { name: b.name, token: b.shareToken, id: b.id }, c: { name: c.name, token: c.shareToken }, shiftId: sh.id, date: sh.date };
    }
    throw new Error('Keine passenden Mitarbeitenden in den Demo-Daten');
  });
}

test('Urlaub, Tausch und Krankmeldung über den Link – Leitung entscheidet im Reiter „Anfragen“', async ({ page }) => {
  await loginDemo(page, 'Toni (Service)');
  const p = await setup(page);
  const vacFrom = plus(30), vacTo = plus(32);

  // 1) Urlaub anfragen (Person A)
  await page.goto('/p/' + p.a.token);
  await page.getByRole('button', { name: 'Anfrage stellen' }).click();
  const dlg = page.getByRole('dialog', { name: 'Anfrage stellen' });
  await dlg.getByRole('button', { name: 'Urlaub' }).click();
  await dlg.getByLabel('Von').fill(vacFrom);
  await dlg.getByLabel('Bis').fill(vacTo);
  await dlg.getByLabel('Notiz (optional)').fill('Hochzeit meiner Schwester');
  await dlg.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByRole('status')).toContainText('Anfrage gesendet');
  const mine = page.getByRole('region', { name: 'Meine Anfragen' });
  await expect(mine.locator('li').first()).toContainText('Urlaub');
  await expect(mine.locator('li').first()).toContainText('Offen');
  // Frei/Urlaub in der Vergangenheit geht nicht
  await page.getByRole('button', { name: 'Anfrage stellen' }).click();
  await dlg.getByLabel('Von').fill(plus(-3));
  await dlg.getByRole('button', { name: 'Senden' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Vergangenheit');
  await dlg.getByRole('button', { name: 'Abbrechen' }).click();

  // 2) Dienst nächste Woche zum Tausch anbieten
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: new RegExp('Dienst zum Tausch anbieten ' + p.date.slice(8, 10) + '\\.' + p.date.slice(5, 7)) }).first().click();
  await page.getByRole('dialog', { name: 'Dienst zum Tausch anbieten' }).getByRole('button', { name: 'Anbieten' }).click();
  await expect(page.getByRole('status')).toContainText('zum Tausch angeboten');
  await expect(page.locator('table.pub-team tr.me .pub-swap-state')).toContainText('angeboten');
  await page.screenshot({ path: 'test-results/anfragen-link.png', fullPage: true });

  // 3) Kollegin B übernimmt
  await page.goto('/p/' + p.b.token);
  const offers = page.getByRole('region', { name: 'Tauschangebote von Kolleg:innen' });
  await expect(offers).toContainText(p.a.name);
  await offers.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByRole('status')).toContainText('Übernommen');
  await expect(offers).toContainText('wartet auf Bestätigung');

  // 4) C meldet sich heute krank → sofort eingetragen
  await page.goto('/p/' + p.c.token);
  await page.getByRole('button', { name: 'Anfrage stellen' }).click();
  await dlg.getByRole('button', { name: 'Krankmeldung' }).click();
  await expect(dlg).toContainText('sofort eingetragen');
  await dlg.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByRole('status')).toContainText('Krankmeldung eingetragen');
  await expect(page.locator('.pub-abs.krank').first()).toBeVisible();

  // 5) Leitung (Toni, Service): rote Zahl, Reiter „Anfragen“
  await page.goto('/?demo');
  await expect(page.getByRole('link', { name: /Dienstplan/ }).locator('.nav-badge')).toBeVisible();
  await goView(page, 'Dienstplan');
  await page.getByRole('button', { name: /^Anfragen/ }).click();
  const wait = page.getByRole('region', { name: 'Warten auf Entscheidung' });
  await expect(wait.locator('article')).toHaveCount(4); // Frei-Wunsch C, Urlaub A, Tausch, Krank C
  await page.screenshot({ path: 'test-results/anfragen-leitung.png', fullPage: true });
  const vac = wait.getByRole('article', { name: `Urlaub ${p.a.name}` });
  await expect(vac).toContainText('Hochzeit meiner Schwester');
  await expect(vac).toContainText('Urlaubskonto');
  await vac.getByRole('button', { name: 'Genehmigen' }).click();
  await expect(vac).toHaveCount(0); // wandert zu „Erledigt“
  const swap = wait.getByRole('article', { name: `Dienst-Tausch ${p.a.name}` });
  await expect(swap).toContainText(`${p.b.name} übernimmt`);
  await swap.getByRole('button', { name: 'Genehmigen' }).click();
  await wait.getByRole('article', { name: `Krankmeldung ${p.c.name}` }).getByRole('button', { name: 'Zur Kenntnis genommen' }).click();
  await expect(wait.locator('article')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Erledigt' }).locator('article')).toHaveCount(3);
  // Frei-Wunsch ablehnen mit Begründung
  await wait.locator('article').getByLabel(/Begründung/).fill('Hochsaison');
  await wait.locator('article').getByRole('button', { name: 'Ablehnen' }).click();
  await expect(page.getByText('Keine offenen Anfragen.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Dienstplan/ }).locator('.nav-badge')).toHaveCount(0);

  // Ergebnis: Urlaub als Abwesenheit, Dienst bei B
  const res = await page.evaluate(({ shiftId }) => {
    const v = Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any;
    return { taker: v.shifts.find((s: any) => s.id === shiftId)?.staffId, vac: v.absences.filter((a: any) => a.kind === 'urlaub').map((a: any) => a.from) };
  }, p);
  expect(res.taker).toBe(p.b.id);
  expect(res.vac).toContain(vacFrom);

  // 6) A sieht die Entscheidung als „Neu“
  await page.goto('/p/' + p.a.token);
  const first = page.getByRole('region', { name: 'Meine Anfragen' }).locator('li', { hasText: 'Urlaub' });
  await expect(first).toContainText('Genehmigt');
  await expect(first).toContainText('Neu');
});

test('Saison: außerhalb grau, Hinweis im Planer, keine Anfragen auf dem Link', async ({ page }) => {
  await loginDemo(page);
  await goView(page, 'Einstellungen');
  await openAllSettings(page);
  const y = new Date().getFullYear();
  await page.getByRole('button', { name: `Saison ${y}`, exact: true }).click();
  const row = page.getByRole('region', { name: `Saison ${y}` }).locator('.season-row').first();
  await expect(row).toBeVisible();
  // Saison erst in 60–90 Tagen → heute ist geschlossen
  await row.getByLabel('Saisonende').fill(plus(90)); await row.getByLabel('Saisonende').blur();
  await page.locator('.season-row').first().getByLabel('Saisonbeginn').fill(plus(60));
  await page.locator('.season-row').first().getByLabel('Saisonbeginn').blur();
  await expect(page.locator('.season-row').first().getByLabel('Saisonbeginn')).toHaveValue(plus(60));

  await goView(page, 'Dienstplan');
  await expect(page.locator('.rg-head.off-season').first()).toContainText('geschlossen');
  await expect(page.locator('.rg-cell.off-season').first()).toBeVisible();

  const token = await page.evaluate(() => (Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any).staff[0].shareToken);
  await page.goto('/p/' + token);
  await expect(page.locator('table.pub-team th.closed').first()).toBeVisible();
  await page.getByRole('button', { name: 'Anfrage stellen' }).click();
  const dlg = page.getByRole('dialog', { name: 'Anfrage stellen' });
  await dlg.getByRole('button', { name: 'Senden' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Außerhalb der Saison');
});
