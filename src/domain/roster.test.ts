import { describe, expect, it } from 'vitest';
import { viewsFor } from './constants';
import { demoVenueData, emptyVenueData, newId, normalizeVenueData } from './demo';
import { remapIds } from './remap';
import {
  canPlanDept, contractActive, departmentUsage, fmtHours, initials, isPlanner, plannableDepartments, positionUsage, presenceMin,
  spanMin, staffErrors, templateErrors, templateTimes, workMin
} from './roster';
import type { Department, ShiftTemplate, Staff } from './types';

const dept = (name: string, leadIds: string[] = [], sort = 0): Department => ({ id: newId(), name, color: '#000', sort, leadIds });
const tpl = (p: Partial<ShiftTemplate> = {}): ShiftTemplate => ({
  id: newId(), departmentId: 'k', positionId: null, name: 'Früh', short: 'F', start: '06:00', end: '14:00', start2: null, end2: null, breakMin: 30, color: '#000', sort: 0, ...p
});
const staff = (p: Partial<Staff> = {}): Staff => ({
  id: newId(), name: 'Maria Gruber', short: 'MG', departmentId: null, positionIds: [], contract: 'unbefristet', weeklyHours: 40,
  contractFrom: null, contractTo: null, phone: '', email: '', color: '#000', notes: '', active: true, ...p
});

describe('Planungsrechte', () => {
  const kueche = dept('Küche', ['u-karl'], 1), service = dept('Service', ['u-toni', 'u-karl'], 0), bar = dept('Bar');
  const list = [kueche, service, bar];

  it('Admin plant alles, Bereichsleitung nur die eigenen Bereiche', () => {
    expect(canPlanDept('admin', list, 'u-anna', bar.id)).toBe(true);
    expect(canPlanDept('admin', list, 'u-anna', null)).toBe(true);
    expect(canPlanDept('service', list, 'u-toni', service.id)).toBe(true);
    expect(canPlanDept('service', list, 'u-toni', kueche.id)).toBe(false);
    expect(canPlanDept('kueche', list, 'u-karl', null)).toBe(false); // ohne Bereich nur Admin
    expect(canPlanDept('empfang', list, 'u-eva', service.id)).toBe(false);
  });

  it('mehrere Bereiche je Leitung, sortiert', () => {
    expect(plannableDepartments('kueche', list, 'u-karl').map(x => x.name)).toEqual(['Service', 'Küche']);
    expect(isPlanner('kueche', list, 'u-karl')).toBe(true);
    expect(isPlanner('empfang', list, 'u-eva')).toBe(false);
    expect(isPlanner('admin', [], 'u-anna')).toBe(true);
  });

  it('Dienstplan erscheint nur mit Modul und für Planer, vor den Berichten', () => {
    const off = { id: 'v', name: 'V', modules: [] as const };
    const on = { id: 'v', name: 'V', modules: ['dienstplan' as const] };
    expect(viewsFor('admin', { ...off, modules: [] }, list, 'u-anna')).not.toContain('dienst');
    const admin = viewsFor('admin', on, list, 'u-anna');
    expect(admin.indexOf('dienst')).toBe(admin.indexOf('berichte') - 1);
    expect(viewsFor('service', on, list, 'u-toni')).toContain('dienst');
    expect(viewsFor('kueche', on, list, 'u-karl')).toEqual(['berichte', 'menue', 'dienst']);
    expect(viewsFor('empfang', on, list, 'u-eva')).not.toContain('dienst');
  });
});

describe('Schichtvorlagen', () => {
  it('Dauer über Mitternacht und mit Teildienst', () => {
    expect(spanMin('22:00', '06:00')).toBe(480);
    expect(workMin(tpl())).toBe(450);
    const split = tpl({ start: '10:00', end: '14:00', start2: '18:00', end2: '22:30', breakMin: 0 });
    expect(presenceMin(split)).toBe(510);
    expect(templateTimes(split)).toBe('10:00–14:00 + 18:00–22:30');
    expect(fmtHours(workMin(tpl()))).toBe('7,5 h');
    expect(fmtHours(480)).toBe('8 h');
  });

  it('prüft Name, Zeiten, Teildienst und Pause', () => {
    expect(templateErrors(tpl())).toEqual([]);
    expect(templateErrors(tpl({ name: ' ' }))).toHaveLength(1);
    expect(templateErrors(tpl({ end: '06:00' }))[0]).toMatch(/gleich/);
    expect(templateErrors(tpl({ start: '22:00', end: '06:00' }))).toEqual([]); // Nachtschicht
    expect(templateErrors(tpl({ start2: '18:00' }))[0]).toMatch(/zweiten Blocks/);
    expect(templateErrors(tpl({ start: '10:00', end: '14:00', start2: '13:00', end2: '18:00' }))[0]).toMatch(/nach dem ersten/);
    expect(templateErrors(tpl({ breakMin: 480 }))[0]).toMatch(/Pause/);
    const a = tpl();
    expect(templateErrors(tpl({ name: 'früh' }), [a])[0]).toMatch(/schon/);
    expect(templateErrors(tpl({ name: 'früh', departmentId: 'service' }), [a])).toEqual([]); // anderer Bereich
  });
});

describe('Mitarbeitende', () => {
  it('Kürzel-Vorschlag', () => {
    expect(initials('Maria Gruber')).toBe('MG');
    expect(initials('  anna  maria  di rossi ')).toBe('AMD');
  });

  it('prüft Name, Kürzel, Stunden, Vertragszeit und E-Mail', () => {
    const a = staff();
    expect(staffErrors(staff({ short: 'XY' }), [a])).toEqual([]);
    expect(staffErrors(staff({ short: 'mg' }), [a])[0]).toMatch(/Kürzel/);
    expect(staffErrors(staff({ short: 'MG' }), [{ ...a, active: false }])).toEqual([]); // ausgeschiedene zählen nicht
    expect(staffErrors(staff({ name: '' }))).toHaveLength(1);
    expect(staffErrors(staff({ weeklyHours: 70 }))).toHaveLength(1);
    expect(staffErrors(staff({ contractFrom: '2026-12-01', contractTo: '2026-04-30' }))[0]).toMatch(/Vertragsende/);
    expect(staffErrors(staff({ email: 'kein-at' }))[0]).toMatch(/E-Mail/);
  });

  it('Vertragszeit (Saison)', () => {
    const s = staff({ contract: 'saison', contractFrom: '2026-12-01', contractTo: '2027-04-15' });
    expect(contractActive(s, '2026-11-30')).toBe(false);
    expect(contractActive(s, '2027-01-10')).toBe(true);
    expect(contractActive(s, '2027-04-16')).toBe(false);
    expect(contractActive(staff(), '2030-01-01')).toBe(true);
  });
});

describe('Demo-Daten und Sicherung', () => {
  it('Demo enthält Bereiche, Positionen, Mitarbeitende und gültige Vorlagen', () => {
    const d = demoVenueData('v1', 'Demo');
    expect(d.venue.modules).toContain('dienstplan');
    expect(d.departments.length).toBeGreaterThanOrEqual(3);
    for (const x of d.shiftTemplates) expect(templateErrors(x, d.shiftTemplates)).toEqual([]);
    for (const x of d.staff) expect(staffErrors(x, d.staff)).toEqual([]);
    for (const x of d.staff) for (const p of x.positionIds) expect(d.positions.some(y => y.id === p)).toBe(true);
    const k = d.departments.find(x => x.name === 'Küche')!;
    expect(departmentUsage(d, k.id).staff).toBeGreaterThan(0);
    const pos = d.positions.find(x => x.departmentId === k.id)!;
    expect(positionUsage(d, pos.id).staff).toBeGreaterThan(0);
  });

  it('ältere Datenstände bekommen leere Dienstplan-Listen', () => {
    const old = emptyVenueData('v1', 'Alt') as any;
    delete old.staff; delete old.departments; delete old.venue.modules;
    const n = normalizeVenueData(old);
    expect(n.staff).toEqual([]); expect(n.departments).toEqual([]); expect(n.venue.modules).toEqual([]);
  });

  it('Sicherung einspielen: Bezüge zwischen Bereichen, Positionen, Mitarbeitenden bleiben erhalten', () => {
    const d = demoVenueData('v1', 'Demo');
    const r = remapIds(d, newId);
    const s = r.staff.find(x => x.positionIds.length)!;
    expect(d.staff.some(x => x.id === s.id)).toBe(false);
    expect(r.departments.some(x => x.id === s.departmentId)).toBe(true);
    for (const p of s.positionIds) expect(r.positions.some(y => y.id === p)).toBe(true);
    for (const x of r.shiftTemplates) expect(r.departments.some(y => y.id === x.departmentId)).toBe(true);
    expect(r.departments.every(x => x.leadIds.length === 0)).toBe(true); // Benutzer gehören zum alten Betrieb
  });
});
