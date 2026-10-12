/** Dienstplan – reine Fachlogik: Planungsrechte, Schichtdauer, Prüfungen der Stammdaten */
import type { Department, Role, ShiftTemplate, Staff, VenueData } from './types';
import { toMin } from '../lib/time';

/* ---------- Rechte (gleiche Regeln wie can_plan()/is_planner() in der DB) ---------- */

/** Darf planen: Admin oder Leitung mindestens eines Bereichs */
export const isPlanner = (role: Role | null | undefined, departments: Department[], userId: string | null | undefined) =>
  role === 'admin' || (!!userId && departments.some(x => x.leadIds.includes(userId)));

/** Darf Daten dieses Bereichs ändern. Ohne Bereich (null) nur Admin. */
export const canPlanDept = (role: Role | null | undefined, departments: Department[], userId: string | null | undefined, departmentId: string | null) =>
  role === 'admin' || (!!userId && !!departmentId && !!departments.find(x => x.id === departmentId)?.leadIds.includes(userId));

/** Bereiche, die der Benutzer planen darf */
export const plannableDepartments = (role: Role | null | undefined, departments: Department[], userId: string | null | undefined) =>
  sortDepartments(departments).filter(x => canPlanDept(role, departments, userId, x.id));

export const sortDepartments = (list: Department[]) => [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));

/* ---------- Schichtvorlagen ---------- */

/** Minuten zwischen zwei Uhrzeiten, über Mitternacht gerechnet (22:00–06:00 = 480) */
export const spanMin = (start: string, end: string) => (toMin(end) - toMin(start) + 1440) % 1440;

export const isSplit = (x: Pick<ShiftTemplate, 'start2' | 'end2'>) => !!(x.start2 && x.end2);

/** Anwesenheit in Minuten (beide Blöcke) */
export const presenceMin = (x: Pick<ShiftTemplate, 'start' | 'end' | 'start2' | 'end2'>) =>
  spanMin(x.start, x.end) + (isSplit(x) ? spanMin(x.start2!, x.end2!) : 0);

/** Arbeitszeit in Minuten (Anwesenheit minus Pause) */
export const workMin = (x: Pick<ShiftTemplate, 'start' | 'end' | 'start2' | 'end2' | 'breakMin'>) => Math.max(0, presenceMin(x) - (x.breakMin || 0));

/** Zeitspanne als Text, z. B. „06:00–14:00“ oder „10:00–14:00 + 18:00–22:00“ */
export const templateTimes = (x: Pick<ShiftTemplate, 'start' | 'end' | 'start2' | 'end2'>) =>
  `${x.start}–${x.end}` + (isSplit(x) ? ` + ${x.start2}–${x.end2}` : '');

/** Stunden als Text mit Komma, z. B. 450 → „7,5 h“ */
export const fmtHours = (min: number) => `${(Math.round(min / 6) / 10).toLocaleString('de-DE')} h`;

const TIME = /^\d{2}:\d{2}$/;

/** Fehler einer Schichtvorlage (leer = in Ordnung) */
export function templateErrors(x: ShiftTemplate, all: ShiftTemplate[] = []): string[] {
  const err: string[] = [];
  if (!x.name.trim()) err.push('Bitte einen Namen eingeben.');
  else if (all.some(o => o.id !== x.id && o.departmentId === x.departmentId && o.name.trim().toLowerCase() === x.name.trim().toLowerCase()))
    err.push('In diesem Bereich gibt es schon eine Vorlage mit diesem Namen.');
  if (!TIME.test(x.start) || !TIME.test(x.end)) err.push('Bitte Beginn und Ende angeben.');
  else if (x.start === x.end) err.push('Beginn und Ende dürfen nicht gleich sein.');
  if (!!x.start2 !== !!x.end2) err.push('Beim Teildienst bitte Beginn und Ende des zweiten Blocks angeben.');
  if (isSplit(x) && TIME.test(x.start) && TIME.test(x.end)) {
    if (x.start2 === x.end2) err.push('Beginn und Ende des zweiten Blocks dürfen nicht gleich sein.');
    // zweiter Block muss nach dem ersten liegen (am selben Tag, ohne Überschneidung)
    else if (toMin(x.end) < toMin(x.start) || toMin(x.start2!) < toMin(x.end) || toMin(x.end2!) < toMin(x.start2!))
      err.push('Der zweite Block muss nach dem ersten liegen (Teildienst nicht über Mitternacht).');
  }
  if (x.breakMin < 0) err.push('Die Pause darf nicht negativ sein.');
  else if (x.start !== x.end && x.breakMin >= presenceMin(x)) err.push('Die Pause ist länger als die Schicht.');
  return err;
}

/* ---------- Mitarbeitende ---------- */

/** Kürzel-Vorschlag aus dem Namen: „Maria Gruber“ → „MG“ */
export const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).map(w => w[0]!.toUpperCase()).join('').slice(0, 3);

/** Fehler eines Mitarbeiter-Datensatzes (leer = in Ordnung) */
export function staffErrors(x: Staff, all: Staff[] = []): string[] {
  const err: string[] = [];
  if (!x.name.trim()) err.push('Bitte einen Namen eingeben.');
  const short = x.short.trim().toLowerCase();
  if (short && all.some(o => o.id !== x.id && o.active && o.short.trim().toLowerCase() === short)) err.push(`Das Kürzel „${x.short.trim()}“ ist schon vergeben.`);
  if (!(x.weeklyHours >= 0 && x.weeklyHours <= 60)) err.push('Wochenstunden bitte zwischen 0 und 60 angeben.');
  if (x.contractFrom && x.contractTo && x.contractTo < x.contractFrom) err.push('Das Vertragsende liegt vor dem Vertragsbeginn.');
  if (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email.trim())) err.push('Die E-Mail-Adresse ist ungültig.');
  return err;
}

/** Vertrag an diesem Tag gültig (ohne Datum = unbegrenzt) */
export const contractActive = (x: Pick<Staff, 'contractFrom' | 'contractTo'>, date: string) =>
  (!x.contractFrom || x.contractFrom <= date) && (!x.contractTo || x.contractTo >= date);

export const sortStaff = (list: Staff[]) => [...list].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de'));

/* ---------- Löschen: was hängt daran? ---------- */

export function departmentUsage(d: VenueData, id: string) {
  return {
    staff: d.staff.filter(x => x.departmentId === id).length,
    positions: d.positions.filter(x => x.departmentId === id).length,
    templates: d.shiftTemplates.filter(x => x.departmentId === id).length
  };
}

export function positionUsage(d: VenueData, id: string) {
  return {
    staff: d.staff.filter(x => x.positionIds.includes(id)).length,
    templates: d.shiftTemplates.filter(x => x.positionId === id).length
  };
}
