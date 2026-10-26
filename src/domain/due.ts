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

/* ---------- Liste: filtern, sortieren, gruppieren ---------- */
/** aktiv = alle nicht erledigten; sonst ein bestimmter Stand */
export type DueStateFilter = 'aktiv' | 'alle' | DueState;
export interface DueFilter { q: string; groupId: string; staff: string; state: DueStateFilter }
export type DueSort = 'datum' | 'datum-ab' | 'titel' | 'gruppe' | 'verantwortlich';
export type DueGrouping = 'keine' | 'gruppe' | 'verantwortlich' | 'stand' | 'monat';

export const DUE_SORT: Record<DueSort, string> = { datum: 'Fälligkeit ↑', 'datum-ab': 'Fälligkeit ↓', titel: 'Beschreibung A–Z', gruppe: 'Gruppe', verantwortlich: 'Verantwortlich' };
export const DUE_GROUPING: Record<DueGrouping, string> = { keine: 'Nicht gruppieren', gruppe: 'nach Gruppe', verantwortlich: 'nach Verantwortlichem', stand: 'nach Stand', monat: 'nach Monat' };
const STATE_ORDER: DueState[] = ['ueberfaellig', 'faellig', 'bald', 'offen', 'erledigt'];

export function filterDue(items: DueItem[], f: DueFilter, today: string): DueItem[] {
  const q = f.q.trim().toLowerCase();
  return items.filter(x => {
    const st = dueState(x, today);
    if (f.state === 'aktiv' ? st === 'erledigt' : f.state !== 'alle' && st !== f.state) return false;
    if (f.groupId && (f.groupId === '-' ? x.groupId : x.groupId !== f.groupId)) return false;
    if (f.staff && (f.staff === '-' ? x.staffName : x.staffName !== f.staff)) return false;
    return !q || `${x.title} ${x.staffName} ${x.note}`.toLowerCase().includes(q);
  });
}

export function sortDue(items: DueItem[], sort: DueSort, groupName: (id: string | null) => string): DueItem[] {
  const byDate = (a: DueItem, b: DueItem) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, 'de');
  const cmp: Record<DueSort, (a: DueItem, b: DueItem) => number> = {
    datum: byDate,
    'datum-ab': (a, b) => -byDate(a, b),
    titel: (a, b) => a.title.localeCompare(b.title, 'de', { numeric: true }),
    // leere Gruppe/Verantwortliche ans Ende
    gruppe: (a, b) => Number(!a.groupId) - Number(!b.groupId) || groupName(a.groupId).localeCompare(groupName(b.groupId), 'de') || byDate(a, b),
    verantwortlich: (a, b) => Number(!a.staffName) - Number(!b.staffName) || a.staffName.localeCompare(b.staffName, 'de') || byDate(a, b)
  };
  return [...items].sort(cmp[sort]);
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** Gruppen in sinnvoller Reihenfolge (Stand: dringend zuerst, Monat: chronologisch, sonst alphabetisch, „ohne“ am Ende); Einträge behalten die Sortierung */
export function groupDue(items: DueItem[], by: DueGrouping, groupName: (id: string | null) => string, today: string): { key: string; label: string; items: DueItem[] }[] {
  if (by === 'keine') return [{ key: 'alle', label: '', items }];
  const keyOf = (x: DueItem) => by === 'gruppe' ? (x.groupId ?? '') : by === 'verantwortlich' ? x.staffName : by === 'stand' ? dueState(x, today) : x.dueDate.slice(0, 7);
  const labelOf = (k: string) => by === 'gruppe' ? (k ? groupName(k) : 'Ohne Gruppe') : by === 'verantwortlich' ? (k || 'Ohne Verantwortlichen')
    : by === 'stand' ? DUE_LABEL[k as DueState] : `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
  const map = new Map<string, DueItem[]>();
  for (const x of items) { const k = keyOf(x); map.set(k, [...(map.get(k) ?? []), x]); }
  const keys = [...map.keys()].sort((a, b) => by === 'stand' ? STATE_ORDER.indexOf(a as DueState) - STATE_ORDER.indexOf(b as DueState)
    : by === 'monat' ? a.localeCompare(b) : Number(!a) - Number(!b) || labelOf(a).localeCompare(labelOf(b), 'de'));
  return keys.map(k => ({ key: k || '-', label: labelOf(k), items: map.get(k)! }));
}
