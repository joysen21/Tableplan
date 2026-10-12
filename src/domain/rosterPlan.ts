/** Dienstplan – Planung (reine Fachlogik): Wochen, Dienste, Prüfregeln, Abwesenheiten, Feiertage, Besetzung, Export */
import type { Absence, AbsenceKind, Department, Publication, RosterSettings, Shift, ShiftTemplate, Staff, Venue, VenueData } from './types';
import { contractActive, isSplit, presenceMin, spanMin, workMin } from './roster';
import { addDays, pad, toMin } from '../lib/time';

/* ---------- Einstellungen ---------- */

/** Standard nach D.Lgs. 66/2003 (11 h Ruhezeit, Pause ab 6 h, Ø 48 h) und CCNL Turismo (ein freier Tag pro Woche) */
export const DEFAULT_ROSTER_SETTINGS: RosterSettings = { restHours: 11, maxWeekHours: 48, breakAfterHours: 6, minBreakMin: 10, freeDaysPerWeek: 1 };
export const rosterSettings = (v: Pick<Venue, 'rosterSettings'>): RosterSettings => ({ ...DEFAULT_ROSTER_SETTINGS, ...(v.rosterSettings ?? {}) });

/* ---------- Kalender ---------- */

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
/** fortlaufende Tagesnummer (UTC, ohne Sommerzeit-Effekte) */
export const dayNo = (date: string) => { const [y, m, d] = parts(date); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
/** Wochentag 0 = Montag … 6 = Sonntag */
export const weekdayIdx = (date: string) => (dayNo(date) + 3) % 7;
export const weekStart = (date: string) => addDays(date, -weekdayIdx(date));
export const weekDays = (date: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
export const monthDays = (date: string) => {
  const [y, m] = parts(date); const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
};
/** Kalenderwoche nach ISO 8601 */
export function isoWeek(date: string) {
  const thu = addDays(weekStart(date), 3); const [y] = parts(thu);
  return Math.floor((dayNo(thu) - dayNo(`${y}-01-01`)) / 7) + 1;
}

/** Ostersonntag (gregorianisch, Gauß/Meeus) */
export function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}
/** Gesetzliche Feiertage Italien + Pfingstmontag (Südtirol) */
export function holidays(year: number): Record<string, string> {
  const e = easter(year), f = (md: string) => `${year}-${md}`;
  return {
    [f('01-01')]: 'Neujahr', [f('01-06')]: 'Heilige Drei Könige', [addDays(e, 1)]: 'Ostermontag', [f('04-25')]: 'Tag der Befreiung',
    [f('05-01')]: 'Tag der Arbeit', [addDays(e, 50)]: 'Pfingstmontag', [f('06-02')]: 'Tag der Republik', [f('08-15')]: 'Mariä Himmelfahrt',
    [f('11-01')]: 'Allerheiligen', [f('12-08')]: 'Mariä Empfängnis', [f('12-25')]: 'Weihnachten', [f('12-26')]: 'Stephanstag'
  };
}
export const holidayName = (date: string): string | undefined => holidays(parts(date)[0])[date];

/* ---------- Dienste ---------- */

/** Blöcke eines Dienstes in absoluten Minuten (über Mitternacht korrekt) */
export function shiftBlocks(s: Pick<Shift, 'date' | 'start' | 'end' | 'start2' | 'end2'>): [number, number][] {
  const base = dayNo(s.date) * 1440;
  const block = (a: string, b: string): [number, number] => [base + toMin(a), base + toMin(a) + spanMin(a, b)];
  return isSplit(s) ? [block(s.start, s.end), block(s.start2!, s.end2!)] : [block(s.start, s.end)];
}
export const shiftsOverlap = (a: Shift, b: Shift) => shiftBlocks(a).some(([a1, a2]) => shiftBlocks(b).some(([b1, b2]) => a1 < b2 && b1 < a2));
export const shiftWorkMin = (s: Shift) => workMin(s);
export const shiftFromTemplate = (t: ShiftTemplate, staffId: string | null, date: string, id: string): Shift => ({
  id, departmentId: t.departmentId, staffId, positionId: t.positionId, templateId: t.id, date,
  start: t.start, end: t.end, start2: t.start2, end2: t.end2, breakMin: t.breakMin, note: ''
});
export const sortShifts = (list: Shift[]) => [...list].sort((a, b) => shiftBlocks(a)[0][0] - shiftBlocks(b)[0][0]);
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

/** Arbeitsminuten einer Person in einem Zeitraum (nach Dienstdatum) */
export const staffMinutes = (d: VenueData, staffId: string, from: string, to: string) =>
  d.shifts.filter(s => s.staffId === staffId && inRange(s.date, from, to)).reduce((a, s) => a + shiftWorkMin(s), 0);

/* ---------- Abwesenheiten ---------- */

export const ABSENCE_KINDS: AbsenceKind[] = ['urlaub', 'krank', 'frei', 'sonstiges'];
export const ABSENCE_SHORT: Record<AbsenceKind, string> = { urlaub: 'U', krank: 'K', frei: 'F', sonstiges: 'A' };
export const absenceOn = (d: Pick<VenueData, 'absences'>, staffId: string, date: string): Absence | undefined =>
  d.absences.find(a => a.staffId === staffId && inRange(date, a.from, a.to));

/** Urlaubstage eines Jahres: Tage der Urlaubseinträge ohne Sonntage und Feiertage */
export function vacationUsed(d: Pick<VenueData, 'absences'>, staffId: string, year: number) {
  let n = 0;
  for (const a of d.absences.filter(x => x.staffId === staffId && x.kind === 'urlaub')) {
    for (let day = a.from; day <= a.to; day = addDays(day, 1))
      if (parts(day)[0] === year && weekdayIdx(day) !== 6 && !holidayName(day)) n++;
  }
  return n;
}
export const absenceErrors = (x: Absence, d: Pick<VenueData, 'absences'>): string[] => {
  const err: string[] = [];
  if (!x.staffId) err.push('Bitte eine Person wählen.');
  if (!x.from || !x.to) err.push('Bitte Zeitraum angeben.');
  else if (x.to < x.from) err.push('Das Ende liegt vor dem Beginn.');
  else if (d.absences.some(o => o.id !== x.id && o.staffId === x.staffId && o.from <= x.to && x.from <= o.to)) err.push('Überschneidet sich mit einer anderen Abwesenheit.');
  return err;
};

/* ---------- Prüfregeln ---------- */

export type WarnKind = 'overlap' | 'absence' | 'contract' | 'inactive' | 'qualification' | 'rest' | 'break' | 'weekHours' | 'freeDay';
export interface RosterWarning { kind: WarnKind; staffId: string; date: string; shiftId: string | null; text: string; severe: boolean }

const hours = (min: number) => (Math.round(min / 6) / 10).toLocaleString('de-DE');

/** Warnungen der Woche, in der `date` liegt. Ruhezeiten berücksichtigen auch Dienste am Vortag/Folgetag der Woche. */
export function rosterWarnings(d: VenueData, date: string, settings: RosterSettings, onlyStaff?: string): RosterWarning[] {
  const days = weekDays(date), from = days[0], to = days[6];
  const out: RosterWarning[] = [];
  const posName = (id: string) => d.positions.find(p => p.id === id)?.name ?? 'Position';
  const depName = (id: string | null) => d.departments.find(x => x.id === id)?.name ?? 'Bereich';
  const staffIds = new Set(d.shifts.filter(s => s.staffId && inRange(s.date, from, to)).map(s => s.staffId!));
  for (const sid of staffIds) {
    if (onlyStaff && sid !== onlyStaff) continue;
    const st = d.staff.find(x => x.id === sid);
    const all = sortShifts(d.shifts.filter(s => s.staffId === sid && inRange(s.date, addDays(from, -1), addDays(to, 1))));
    const week = all.filter(s => inRange(s.date, from, to));
    const w = (kind: WarnKind, s: Shift | null, text: string, severe = false, day = s?.date ?? from) => out.push({ kind, staffId: sid, date: day, shiftId: s?.id ?? null, text, severe });
    for (const s of week) {
      if (!st) continue;
      if (!st.active) w('inactive', s, `${st.name} ist als ausgeschieden markiert.`);
      else if (!contractActive(st, s.date)) w('contract', s, `${st.name}: Dienst außerhalb der Vertragszeit.`);
      const ab = absenceOn(d, sid, s.date);
      if (ab) w('absence', s, `${st.name} ist an diesem Tag abwesend (${ABSENCE_LABEL[ab.kind]}).`, true);
      if (s.positionId && !st.positionIds.includes(s.positionId)) w('qualification', s, `${st.name} hat die Position „${posName(s.positionId)}“ nicht.`);
      else if (!s.positionId && s.departmentId !== st.departmentId && !st.positionIds.some(p => d.positions.find(x => x.id === p)?.departmentId === s.departmentId))
        w('qualification', s, `${st.name} ist für den Bereich ${depName(s.departmentId)} nicht eingetragen.`);
      if (!isSplit(s) && presenceMin(s) > settings.breakAfterHours * 60 && s.breakMin < settings.minBreakMin)
        w('break', s, `${st.name}: über ${settings.breakAfterHours} h ohne Pause (mind. ${settings.minBreakMin} Min.).`);
    }
    // Überschneidungen und Ruhezeit zwischen aufeinanderfolgenden Diensten
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (!inRange(b.date, from, to) && !inRange(a.date, from, to)) continue;
        if (shiftsOverlap(a, b)) { w('overlap', inRange(b.date, from, to) ? b : a, `${st?.name ?? 'Person'} hat zwei Dienste zur gleichen Zeit.`, true); continue; }
        if (j !== i + 1) continue;
        const gap = shiftBlocks(b)[0][0] - shiftBlocks(a).at(-1)![1];
        if (gap >= 0 && gap < settings.restHours * 60 && inRange(b.date, from, to))
          w('rest', b, `${st?.name ?? 'Person'}: nur ${hours(gap)} h Ruhezeit (mind. ${settings.restHours} h).`);
      }
    }
    const min = week.reduce((a, s) => a + shiftWorkMin(s), 0);
    if (min > settings.maxWeekHours * 60) w('weekHours', null, `${st?.name ?? 'Person'}: ${hours(min)} h in der Woche (max. ${settings.maxWeekHours} h).`);
    const free = days.filter(day => !week.some(s => s.date === day)).length;
    if (free < settings.freeDaysPerWeek) w('freeDay', null, `${st?.name ?? 'Person'}: kein freier Tag in dieser Woche.`);
  }
  return out;
}

/** Warnungen, die einen einzelnen (auch noch nicht gespeicherten) Dienst betreffen */
export function shiftWarnings(d: VenueData, shift: Shift, settings: RosterSettings): RosterWarning[] {
  if (!shift.staffId) return [];
  const tmp = { ...d, shifts: [...d.shifts.filter(s => s.id !== shift.id), shift] };
  return rosterWarnings(tmp, shift.date, settings, shift.staffId).filter(x => x.shiftId === shift.id || (x.shiftId === null));
}

export const ABSENCE_LABEL: Record<AbsenceKind, string> = { urlaub: 'Urlaub', krank: 'Krank', frei: 'Frei', sonstiges: 'Abwesend' };

/* ---------- Besetzung (Bezug zu den Reservierungen) ---------- */

/** Erwartete Gäste je Service an einem Tag: Reservierungen (ohne Storno/No-Show), bei freier Platzwahl die Hotelgäste im Haus */
export function expectedGuests(d: VenueData, date: string) {
  const services = d.services.map(svc => {
    let guests = d.reservations.filter(r => r.date === date && r.serviceId === svc.id && r.status !== 'storniert' && r.status !== 'noshow')
      .reduce((a, r) => a + (+r.adults || 0) + (+r.children || 0), 0);
    // Frühstück o. ä. ohne Reservierungen: Hotelgäste, die die Nacht davor im Haus waren
    if (svc.freeSeating && !guests) guests = d.stays.filter(s => s.arrival < date && s.departure >= date).reduce((a, s) => a + s.adults + s.children, 0);
    return { id: svc.id, name: svc.name, guests };
  });
  const peak = services.reduce((m, s) => (s.guests > m.guests ? s : m), { id: '', name: '', guests: 0 });
  return { services, peak };
}
/** Benötigte Kräfte eines Bereichs (null = kein Schlüssel hinterlegt) */
export function staffNeeded(dep: Pick<Department, 'guestsPerStaff' | 'minStaff'>, peakGuests: number): number | null {
  if (!dep.guestsPerStaff && !dep.minStaff) return null;
  return Math.max(dep.minStaff || 0, dep.guestsPerStaff ? Math.ceil(peakGuests / dep.guestsPerStaff) : 0);
}
/** Eingeplante Personen eines Bereichs an einem Tag */
export const plannedCount = (d: VenueData, departmentId: string, date: string) =>
  new Set(d.shifts.filter(s => s.departmentId === departmentId && s.date === date && s.staffId).map(s => s.staffId)).size;

/* ---------- Veröffentlichen ---------- */

export const publicationFor = (d: Pick<VenueData, 'publications'>, departmentId: string, date: string): Publication | undefined =>
  d.publications.find(p => p.departmentId === departmentId && p.weekStart === weekStart(date));
/** Dienste, die nach dem Veröffentlichen geändert oder neu angelegt wurden */
export function changedSince(d: VenueData, departmentId: string, date: string) {
  const pub = publicationFor(d, departmentId, date); if (!pub) return 0;
  const days = weekDays(date);
  return d.shifts.filter(s => s.departmentId === departmentId && inRange(s.date, days[0], days[6]) && s.updatedAt && s.updatedAt > pub.publishedAt).length;
}

/* ---------- Woche übernehmen ---------- */

/** Dienste einer Woche in eine andere kopieren – nur für Bereiche, die in der Zielwoche noch leer sind;
 *  Dienste für Abwesende, Ausgeschiedene oder mit Überschneidung werden ausgelassen */
export function copyWeek(d: VenueData, fromDate: string, toDate: string, departmentIds: string[], newId: () => string) {
  const src = weekDays(fromDate), dst = weekDays(toDate), offset = dayNo(dst[0]) - dayNo(src[0]);
  const created: Shift[] = []; const skipped: string[] = []; const filled: string[] = [];
  for (const dep of departmentIds) {
    if (d.shifts.some(s => s.departmentId === dep && inRange(s.date, dst[0], dst[6]))) { filled.push(dep); continue; }
    for (const s of d.shifts.filter(x => x.departmentId === dep && inRange(x.date, src[0], src[6]))) {
      const n: Shift = { ...s, id: newId(), date: addDays(s.date, offset), updatedAt: undefined };
      const st = n.staffId ? d.staff.find(x => x.id === n.staffId) : null;
      const clash = n.staffId && (!st?.active || absenceOn(d, n.staffId, n.date) || [...d.shifts, ...created].some(o => o.staffId === n.staffId && shiftsOverlap(o, n)));
      if (clash) { skipped.push(`${st?.name ?? 'Person'} am ${n.date.split('-').reverse().join('.')}`); continue; }
      created.push(n);
    }
  }
  return { created, skipped, filled };
}

/* ---------- Export ---------- */

export interface HoursRow { name: string; department: string; contract: string; weeklyHours: number; plannedMin: number; days: number; vacation: number; sick: number }
/** Stunden je Person in einem Zeitraum (geplante Dienste) */
export function hoursRows(d: VenueData, from: string, to: string): HoursRow[] {
  const countDays = (sid: string, kind: AbsenceKind) => {
    let n = 0;
    for (const a of d.absences.filter(x => x.staffId === sid && x.kind === kind))
      for (let day = a.from < from ? from : a.from; day <= (a.to > to ? to : a.to); day = addDays(day, 1)) n++;
    return n;
  };
  return d.staff
    .filter(s => s.active || d.shifts.some(x => x.staffId === s.id && inRange(x.date, from, to)))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map(s => ({
      name: s.name, department: d.departments.find(x => x.id === s.departmentId)?.name ?? '', contract: s.contract, weeklyHours: s.weeklyHours,
      plannedMin: staffMinutes(d, s.id, from, to), days: new Set(d.shifts.filter(x => x.staffId === s.id && inRange(x.date, from, to)).map(x => x.date)).size,
      vacation: countDays(s.id, 'urlaub'), sick: countDays(s.id, 'krank')
    }));
}
/** CSV für Excel (Semikolon, Dezimalkomma, BOM für Umlaute) */
export function hoursCsv(rows: HoursRow[], contractLabel: (c: string) => string) {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  const lines = [['Name', 'Bereich', 'Vertrag', 'Wochenstunden (Soll)', 'Geplante Stunden', 'Arbeitstage', 'Urlaubstage', 'Krankheitstage'].join(';'),
    ...rows.map(r => [esc(r.name), esc(r.department), esc(contractLabel(r.contract)), num(r.weeklyHours), num(r.plannedMin / 60), r.days, r.vacation, r.sick].join(';'))];
  return '﻿' + lines.join('\r\n');
}

/** Personen, die in der Wochenansicht eines Bereichs erscheinen: Stammbereich, dort qualifiziert oder dort eingeplant */
export function staffForDepartment(d: VenueData, departmentId: string, from: string, to: string): Staff[] {
  return d.staff.filter(s => d.shifts.some(x => x.staffId === s.id && x.departmentId === departmentId && inRange(x.date, from, to))
    || (s.active && (s.departmentId === departmentId || s.positionIds.some(p => d.positions.find(x => x.id === p)?.departmentId === departmentId))));
}
