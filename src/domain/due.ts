/** Modul Fälligkeiten: Stand je Eintrag (überfällig, heute fällig, demnächst fällig), Dashboard, Erledigen mit Intervall */
import type { DueItem } from './types';
import { addDays } from '../lib/time';

/** Datum + n Monate (Monatsende beachten: 31.01. + 1 Monat → 28./29.02.) */
export function addMonths(date: string, n: number): string {
  const y = +date.slice(0, 4), m = +date.slice(5, 7) - 1 + n, day = +date.slice(8, 10);
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export type DueState = 'erledigt' | 'ueberfaellig' | 'faellig' | 'bald' | 'offen';
export const DUE_LABEL: Record<DueState, string> = { erledigt: 'Erledigt', ueberfaellig: 'Überfällig', faellig: 'Heute fällig', bald: 'Demnächst fällig', offen: 'Geplant' };

/** Erinnerungsdatum: ab hier erscheint die Fälligkeit als „demnächst fällig“ */
export const reminderDate = (x: Pick<DueItem, 'dueDate' | 'reminderDays'>) => addDays(x.dueDate, -x.reminderDays);

export function dueState(x: Pick<DueItem, 'done' | 'dueDate' | 'reminderDays'>, today: string): DueState {
  if (x.done) return 'erledigt';
  if (x.dueDate < today) return 'ueberfaellig';
  if (x.dueDate === today) return 'faellig';
  return reminderDate(x) <= today ? 'bald' : 'offen';
}

/** Dashboard: überfällig, heute fällig, demnächst fällig – jeweils nach Datum */
export function dueDashboard(items: DueItem[], today: string) {
  const by = (s: DueState) => items.filter(x => dueState(x, today) === s).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, 'de'));
  return { ueberfaellig: by('ueberfaellig'), faellig: by('faellig'), bald: by('bald') };
}
/** Anzahl für Hinweis-Zahl und Meldung */
export const dueAlertCount = (items: DueItem[], today: string) => items.filter(x => ['ueberfaellig', 'faellig', 'bald'].includes(dueState(x, today))).length;

/** Erledigen: mit Intervall → nächster Termin (ab dem bisherigen Fälligkeitsdatum, bis er in der Zukunft liegt); einmalig → erledigt */
export function completeDue(x: DueItem, today: string): DueItem {
  if (x.intervalMonths > 0) {
    let next = addMonths(x.dueDate, x.intervalMonths);
    for (let i = 2; next <= today && i < 1000; i++) next = addMonths(x.dueDate, x.intervalMonths * i);
    return { ...x, dueDate: next, lastDone: today, done: false, doneAt: null };
  }
  return { ...x, done: true, doneAt: today, lastDone: today };
}
/** Erledigt zurücknehmen (nur einmalige) */
export const reopenDue = (x: DueItem): DueItem => ({ ...x, done: false, doneAt: null });

/** „in 5 Tagen“, „heute“, „seit 3 Tagen“ */
export function dueRelative(dueDate: string, today: string): string {
  const days = Math.round((Date.parse(dueDate + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days === -1) return 'seit gestern';
  return days > 0 ? `in ${days} Tagen` : `seit ${-days} Tagen`;
}

export const intervalText = (n: number) => (!n ? 'einmalig' : n === 1 ? 'monatlich' : n === 12 ? 'jährlich' : n % 12 === 0 ? `alle ${n / 12} Jahre` : `alle ${n} Monate`);
