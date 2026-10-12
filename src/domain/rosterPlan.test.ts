import { describe, expect, it } from 'vitest';
import { demoVenueData, emptyVenueData, newId } from './demo';
import {
  absenceErrors, changedSince, copyWeek, DEFAULT_ROSTER_SETTINGS, easter, expectedGuests, holidayName, hoursCsv, hoursRows, isoWeek, monthDays,
  plannedCount, rosterSettings, rosterWarnings, shiftBlocks, shiftsOverlap, shiftWarnings, staffForDepartment, staffNeeded, vacationUsed, weekDays, weekStart
} from './rosterPlan';
import type { Shift, Staff, VenueData } from './types';

const S = DEFAULT_ROSTER_SETTINGS;
function setup() {
  const d = emptyVenueData('v', 'Test');
  const dep = { id: 'k', name: 'Küche', color: '#000', sort: 0, leadIds: [], guestsPerStaff: 40, minStaff: 2 };
  const dep2 = { id: 's', name: 'Service', color: '#111', sort: 1, leadIds: [], guestsPerStaff: 25, minStaff: 0 };
  d.departments = [dep, dep2];
  d.positions = [{ id: 'koch', departmentId: 'k', name: 'Koch', sort: 0 }, { id: 'kellner', departmentId: 's', name: 'Kellner', sort: 0 }];
  const st = (id: string, p: Partial<Staff> = {}): Staff => ({
    id, name: id, short: id.slice(0, 2).toUpperCase(), departmentId: 'k', positionIds: ['koch'], contract: 'unbefristet', weeklyHours: 40,
    contractFrom: null, contractTo: null, phone: '', email: '', color: '#000', notes: '', active: true, vacationDays: 26, shareToken: newId(), ...p
  });
  d.staff = [st('anna'), st('bert'), st('carla', { departmentId: 's', positionIds: ['kellner'] })];
  const sh = (staffId: string | null, date: string, start: string, end: string, p: Partial<Shift> = {}): Shift => ({
    id: newId(), departmentId: 'k', staffId, positionId: null, templateId: null, date, start, end, start2: null, end2: null, breakMin: 30, note: '', ...p
  });
  return { d, sh };
}
const add = (d: VenueData, ...s: Shift[]) => { d.shifts.push(...s); return s; };
const kinds = (d: VenueData, date: string) => rosterWarnings(d, date, S).map(w => w.kind).sort();

describe('Kalender', () => {
  it('Woche beginnt am Montag, KW nach ISO', () => {
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // Montag
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Sonntag
    expect(weekDays('2026-10-14')).toHaveLength(7);
    expect(isoWeek('2026-10-12')).toBe(42);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(monthDays('2028-02-10')).toHaveLength(29);
  });
  it('Feiertage Italien + Pfingstmontag Südtirol', () => {
    expect(easter(2026)).toBe('2026-04-05');
    expect(easter(2027)).toBe('2027-03-28');
    expect(holidayName('2026-04-06')).toBe('Ostermontag');
    expect(holidayName('2026-05-25')).toBe('Pfingstmontag');
    expect(holidayName('2026-12-08')).toBe('Mariä Empfängnis');
    expect(holidayName('2026-10-13')).toBeUndefined();
  });
});

describe('Dienste', () => {
  it('Nachtschicht und Teildienst als Zeitblöcke, Überschneidung über Mitternacht', () => {
    const { sh } = setup();
    const night = sh('anna', '2026-10-12', '22:00', '06:00');
    expect(shiftBlocks(night)[0][1] - shiftBlocks(night)[0][0]).toBe(480);
    expect(shiftsOverlap(night, sh('anna', '2026-10-13', '05:00', '13:00'))).toBe(true);
    expect(shiftsOverlap(night, sh('anna', '2026-10-13', '06:00', '13:00'))).toBe(false);
    const split = sh('anna', '2026-10-12', '10:00', '14:00', { start2: '18:00', end2: '22:00' });
    expect(shiftsOverlap(split, sh('anna', '2026-10-12', '15:00', '17:00'))).toBe(false);
    expect(shiftsOverlap(split, sh('anna', '2026-10-12', '21:00', '23:00'))).toBe(true);
  });
});

describe('Prüfregeln', () => {
  it('Ruhezeit 11 h, auch über die Wochengrenze', () => {
    const { d, sh } = setup();
    add(d, sh('anna', '2026-10-11', '14:00', '23:00'), sh('anna', '2026-10-12', '07:00', '15:00'));
    expect(kinds(d, '2026-10-12')).toContain('rest');
    d.shifts[1].start = '10:00';
    expect(kinds(d, '2026-10-12')).not.toContain('rest');
  });
  it('Überschneidung, Abwesenheit, Vertragszeit, Ausgeschieden, Qualifikation, Pause', () => {
    const { d, sh } = setup();
    add(d, sh('anna', '2026-10-12', '08:00', '16:00'), sh('anna', '2026-10-12', '15:00', '20:00'));
    d.absences.push({ id: 'a', staffId: 'bert', from: '2026-10-13', to: '2026-10-14', kind: 'krank', note: '' });
    add(d, sh('bert', '2026-10-13', '08:00', '12:00', { breakMin: 0 }));
    d.staff.find(s => s.id === 'carla')!.contractTo = '2026-10-01';
    add(d, sh('carla', '2026-10-15', '08:00', '16:00', { breakMin: 0 })); // Küche, aber Service-Kraft, ohne Pause
    const w = rosterWarnings(d, '2026-10-12', S);
    expect(w.filter(x => x.kind === 'overlap' && x.severe)).toHaveLength(1);
    expect(w.find(x => x.kind === 'absence')?.text).toMatch(/Krank/);
    expect(w.map(x => x.kind)).toEqual(expect.arrayContaining(['contract', 'qualification', 'break']));
    d.staff.find(s => s.id === 'carla')!.active = false;
    expect(kinds(d, '2026-10-12')).toContain('inactive');
  });
  it('Teildienst braucht keine Pause, Position wird geprüft', () => {
    const { d, sh } = setup();
    add(d, sh('anna', '2026-10-12', '09:00', '14:00', { start2: '17:00', end2: '22:00', breakMin: 0, positionId: 'kellner' }));
    const k = kinds(d, '2026-10-12');
    expect(k).not.toContain('break');
    expect(k).toContain('qualification');
  });
  it('Wochenstunden und freier Tag (einstellbar)', () => {
    const { d, sh } = setup();
    for (const day of weekDays('2026-10-12')) add(d, sh('anna', day, '08:00', '16:30'));
    expect(kinds(d, '2026-10-12')).toEqual(expect.arrayContaining(['weekHours', 'freeDay']));
    expect(rosterWarnings(d, '2026-10-12', { ...S, maxWeekHours: 60, freeDaysPerWeek: 0 })).toHaveLength(0);
    expect(rosterSettings({ rosterSettings: { restHours: 12 } }).restHours).toBe(12);
    expect(rosterSettings({}).maxWeekHours).toBe(48);
  });
  it('Warnungen für einen noch nicht gespeicherten Dienst', () => {
    const { d, sh } = setup();
    add(d, sh('anna', '2026-10-12', '14:00', '23:00'));
    const neu = sh('anna', '2026-10-13', '06:00', '14:00');
    expect(shiftWarnings(d, neu, S).map(w => w.kind)).toContain('rest');
    expect(shiftWarnings(d, { ...neu, staffId: null }, S)).toEqual([]);
  });
});

describe('Abwesenheiten & Urlaub', () => {
  it('Urlaubstage ohne Sonntage und Feiertage, Überschneidung wird abgelehnt', () => {
    const { d } = setup();
    d.absences.push({ id: 'u', staffId: 'anna', from: '2026-12-21', to: '2027-01-03', kind: 'urlaub', note: '' });
    // 21.–31.12.2026: 11 Tage − 1 Sonntag (27.) − 25./26.12. = 8
    expect(vacationUsed(d, 'anna', 2026)).toBe(8);
    // 1.–3.1.2027: Neujahr (Fr) Feiertag, Sa zählt, So nicht = 1
    expect(vacationUsed(d, 'anna', 2027)).toBe(1);
    expect(absenceErrors({ id: 'x', staffId: 'anna', from: '2027-01-02', to: '2027-01-05', kind: 'frei', note: '' }, d)[0]).toMatch(/Überschneidet/);
    expect(absenceErrors({ id: 'x', staffId: 'anna', from: '2027-02-02', to: '2027-02-01', kind: 'frei', note: '' }, d)[0]).toMatch(/Ende/);
  });
});

describe('Besetzung, Veröffentlichen, Woche übernehmen, Export', () => {
  it('Besetzungsvorschlag aus dem Spitzen-Service', () => {
    const d = demoVenueData('v', 'Demo');
    const day = d.reservations.find(r => r.status !== 'storniert')!.date;
    const g = expectedGuests(d, day);
    expect(g.peak.guests).toBe(Math.max(...g.services.map(s => s.guests)));
    expect(staffNeeded({ guestsPerStaff: 25, minStaff: 2 }, 120)).toBe(5);
    expect(staffNeeded({ guestsPerStaff: 25, minStaff: 2 }, 10)).toBe(2);
    expect(staffNeeded({ guestsPerStaff: null, minStaff: 0 }, 99)).toBeNull();
  });
  it('Änderungen nach dem Veröffentlichen werden gezählt', () => {
    const { d, sh } = setup();
    const [a] = add(d, { ...sh('anna', '2026-10-13', '08:00', '16:00'), updatedAt: '2026-10-10T10:00:00Z' });
    d.publications.push({ id: 'p', departmentId: 'k', weekStart: '2026-10-12', publishedAt: '2026-10-11T10:00:00Z', publishedBy: 'X' });
    expect(changedSince(d, 'k', '2026-10-15')).toBe(0);
    a.updatedAt = '2026-10-12T08:00:00Z';
    expect(changedSince(d, 'k', '2026-10-15')).toBe(1);
    expect(plannedCount(d, 'k', '2026-10-13')).toBe(1);
  });
  it('Woche übernehmen: nur leere Bereiche, Abwesende werden ausgelassen', () => {
    const { d, sh } = setup();
    add(d, sh('anna', '2026-10-12', '08:00', '16:00'), sh('bert', '2026-10-13', '08:00', '16:00'), sh('carla', '2026-10-12', '08:00', '16:00', { departmentId: 's' }));
    d.absences.push({ id: 'a', staffId: 'bert', from: '2026-10-20', to: '2026-10-20', kind: 'urlaub', note: '' });
    add(d, sh('carla', '2026-10-21', '08:00', '16:00', { departmentId: 's' }));
    const r = copyWeek(d, '2026-10-12', '2026-10-19', ['k', 's'], newId);
    expect(r.created.map(s => [s.staffId, s.date])).toEqual([['anna', '2026-10-19']]);
    expect(r.skipped[0]).toMatch(/bert am 20.10.2026/);
    expect(r.filled).toEqual(['s']);
  });
  it('Stundenexport', () => {
    const { d, sh } = setup();
    add(d, sh('anna', '2026-10-12', '08:00', '16:30'), sh('anna', '2026-10-13', '08:00', '16:30'));
    d.absences.push({ id: 'k', staffId: 'anna', from: '2026-10-30', to: '2026-11-02', kind: 'krank', note: '' });
    const rows = hoursRows(d, '2026-10-01', '2026-10-31');
    const anna = rows.find(r => r.name === 'anna')!;
    expect(anna.plannedMin).toBe(960);
    expect(anna.days).toBe(2);
    expect(anna.sick).toBe(2);
    const csv = hoursCsv(rows, c => c);
    expect(csv.split('\r\n')[0]).toMatch(/^﻿Name;Bereich/);
    expect(csv).toContain('anna;Küche;unbefristet;40;16;2;0;2');
  });
  it('Personen eines Bereichs: Stammbereich, qualifiziert oder dort eingeplant', () => {
    const { d, sh } = setup();
    expect(staffForDepartment(d, 's', '2026-10-12', '2026-10-18').map(s => s.id)).toEqual(['carla']);
    add(d, sh('anna', '2026-10-12', '08:00', '16:00', { departmentId: 's' }));
    expect(staffForDepartment(d, 's', '2026-10-12', '2026-10-18').map(s => s.id).sort()).toEqual(['anna', 'carla']);
  });
  it('Demo-Daten: keine Doppelbelegung, Ruhezeiten eingehalten', () => {
    const d = demoVenueData('v', 'Demo');
    expect(d.shifts.length).toBeGreaterThan(40);
    const w = rosterWarnings(d, weekStart(d.shifts[0].date), S);
    expect(w.filter(x => x.kind === 'overlap' || x.kind === 'rest' || x.kind === 'absence')).toEqual([]);
  });
});
