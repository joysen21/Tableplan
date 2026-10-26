/**
 * Fachlogik (rein funktional, ohne UI und Datenbank):
 * Verweildauer, Konfliktprüfung, Tischvorschläge, Live-Status, Hotel-Planung.
 */
import { boardTables } from './boards';
import { MAX_ROOMS_PER_TABLE, OPEN_STATES, SEATED_STATES } from './constants';
import type { DiningTable, Reservation, Service, Stay, TableState, VenueData } from './types';
import { addDays, fromMin, fmtShort, overlaps, toMin } from '../lib/time';

export const persons = (r: Pick<Reservation, 'adults' | 'children'>) => (+r.adults || 0) + (+r.children || 0);
export const resStart = (r: Pick<Reservation, 'time'>) => toMin(r.time);
export const resEnd = (r: Pick<Reservation, 'time' | 'duration'>) => toMin(r.time) + (+r.duration || 0);
/** Reservierung belegt einen Tisch (für Konflikte) */
export const occupies = (r: Pick<Reservation, 'status'>) => r.status !== 'storniert' && r.status !== 'noshow' && r.status !== 'abgeschlossen';
export const isCancelled = (r: Pick<Reservation, 'status'>) => r.status === 'storniert' || r.status === 'noshow';

export const byId = <T extends { id: string }>(list: T[], id: string | null | undefined) => (id ? list.find(x => x.id === id) : undefined);
/** Tische natürlich nach Namen sortiert: T2 vor T10, Zahlen vor Buchstaben, Groß-/Kleinschreibung egal */
export const compareTableNames = (a: string, b: string) => a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });
export const sortTables = <T extends { name: string }>(list: T[]): T[] => [...list].sort((a, b) => compareTableNames(a.name, b.name));

export const tableNames = (d: VenueData, ids: string[] | undefined) => (ids || []).map(id => byId(d.tables, id)?.name ?? '?').sort(compareTableNames).join('+');

/** Feste Uhrzeit einer Reservierung: Beginn des Service (Hotelgäste: Hotel-Standardzeit) – die Uhrzeit wird nicht mehr einzeln eingegeben */
export function serviceTime(d: VenueData, serviceId: string, hotel = false): string {
  const s = byId(d.services, serviceId);
  return (hotel && s?.hotelTime) || s?.start || '18:00';
}

/** Dauer bis zum festen Ende des Service (für die Zeitleiste), mindestens 30 Min.; ohne Service 120 Min. */
export function untilEnd(d: VenueData, serviceId: string, time: string): number {
  const s = byId(d.services, serviceId);
  if (!s) return 120;
  return Math.min(720, Math.max(30, toMin(s.end) - toMin(time)));
}

export function serviceForTime(services: Service[], min: number): string | null {
  if (!services.length) return null;
  const list = services.filter(s => min >= toMin(s.start) - 60 && min <= toMin(s.end));
  if (list.length) return list[list.length - 1].id;
  return (services.find(s => toMin(s.start) > min) ?? services[services.length - 1]).id;
}

export function isBlocked(d: VenueData, tableId: string, date: string, serviceId: string | null) {
  return d.blocks.some(b => b.tableId === tableId && b.date === date && (!b.serviceId || b.serviceId === serviceId));
}

export function tableBusy(d: VenueData, tableId: string, date: string, start: number, end: number, exceptId?: string) {
  return d.reservations.filter(o => o.id !== exceptId && o.date === date && occupies(o) &&
    o.tableIds.includes(tableId) && overlaps(start, end, resStart(o), resEnd(o)));
}

/**
 * Belegungen, die einer (geplanten) Reservierung auf diesem Tisch im Weg stehen.
 * Hotelgäste verschiedener Zimmer dürfen sich einen Tisch teilen (max. MAX_ROOMS_PER_TABLE Zimmer gleichzeitig),
 * externe Reservierungen teilen nie. Dieselbe Regel prüft die Datenbank (Trigger reservation_tables_shared).
 */
export function tableConflicts(d: VenueData, tableId: string, date: string, start: number, end: number, r: { id?: string; stayId: string | null }) {
  const busy = tableBusy(d, tableId, date, start, end, r.id);
  if (!r.stayId) return busy;
  const foreign = busy.filter(o => !o.stayId);
  if (foreign.length) return foreign;
  const others = busy.filter(o => o.stayId !== r.stayId);
  return new Set(others.map(o => o.stayId)).size + 1 > MAX_ROOMS_PER_TABLE ? others : [];
}

/** Andere Hotelzimmer, die gleichzeitig an denselben Tischen sitzen */
/** Zusammengelegte Tische: alle Tische und Reservierungen (gleicher Tag, gleiche Zeit), die über gemeinsame Tische verbunden sind –
 *  transitiv (Zi. 101 an T1+T2, Zi. 102 an T2+T3 → T1, T2, T3). r darf ein noch nicht gespeicherter Entwurf sein. */
export function linkedTables(d: VenueData, r: Reservation): { tableIds: string[]; reservations: Reservation[] } {
  const tables = new Set(r.tableIds);
  const others = d.reservations.filter(o => o.id !== r.id && o.date === r.date && occupies(o) && overlaps(resStart(o), resEnd(o), resStart(r), resEnd(r)));
  const group: Reservation[] = [r];
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of others) if (!group.includes(o) && o.tableIds.some(id => tables.has(id))) { group.push(o); o.tableIds.forEach(id => tables.add(id)); grew = true; }
  }
  return { tableIds: [...tables], reservations: group };
}
const roomOf = (r: Reservation) => r.name.split(' · ').pop() ?? r.name;

export function capacity(d: VenueData, ids: string[]) {
  const tb = ids.map(id => byId(d.tables, id)).filter(Boolean) as DiningTable[];
  return { max: tb.reduce((a, x) => a + x.maxPersons, 0), min: tb.reduce((a, x) => a + x.minPersons, 0) };
}

export interface Issue { level: 'error' | 'warn'; text: string }

/**
 * Prüft eine (geplante) Reservierung.
 * level "error": wird von der Datenbank abgelehnt (Tisch doppelt belegt).
 * level "warn" : Hinweis, Speichern nach Bestätigung möglich.
 */
export function checkReservation(d: VenueData, r: Reservation): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue['level'], text: string) => { if (!out.some(i => i.text === text)) out.push({ level, text }); };
  if (!occupies(r)) return out;
  const st = resStart(r), en = resEnd(r), p = persons(r), s = byId(d.services, r.serviceId);
  for (const tid of r.tableIds) {
    const tb = byId(d.tables, tid);
    if (!tb) { add('error', 'Tisch existiert nicht mehr'); continue; }
    if (isBlocked(d, tid, r.date, r.serviceId)) add('warn', `Tisch ${tb.name} ist gesperrt`);
    const busy = tableConflicts(d, tid, r.date, st, en, r);
    if (r.stayId && busy.length && busy.every(o => o.stayId)) add('error', `Tisch ${tb.name}: schon ${MAX_ROOMS_PER_TABLE} Zimmer am Tisch`);
    else for (const o of busy) add('error', `Tisch ${tb.name} ist belegt: ${o.name} (${o.time}–${fromMin(resEnd(o))})`);
  }
  if (r.tableIds.length) {
    // zusammengelegte Tische: Plätze aller verbundenen Tische zählen zusammen, ebenso die Personen aller Gäste daran
    const g = linkedTables(d, r), shared = g.reservations.filter(o => o.id !== r.id);
    const c = capacity(d, g.tableIds), all = g.reservations.reduce((a, o) => a + persons(o), 0), own = capacity(d, r.tableIds);
    if (shared.length && all > c.max) add('warn', `Tisch zu klein: ${all} Pers. zusammen mit ${shared.map(roomOf).join(', ')}, max. ${c.max} – weiteren Tisch dazunehmen`);
    else if (!shared.length && p > c.max) add('warn', `Tisch zu klein: ${p} Pers., max. ${c.max} – weiteren Tisch dazunehmen`);
    else if (!shared.length && p < own.min) add('warn', `Tisch größer als nötig: ${p} Pers., min. ${own.min}`);
  }
  if (s && (st < toMin(s.start) || st > toMin(s.end))) add('warn', `Uhrzeit außerhalb ${s.name} (${s.start}–${s.end})`);
  const digits = (x: string) => x.replace(/\D/g, '');
  const dup = d.reservations.find(o => o.id !== r.id && o.date === r.date && occupies(o) && overlaps(st, en, resStart(o), resEnd(o)) &&
    ((r.stayId && o.stayId === r.stayId) || (r.phone && o.phone && digits(o.phone).length > 5 && digits(o.phone) === digits(r.phone))));
  if (dup) add('warn', `Mögliche Doppelbuchung: ${dup.name} ist bereits um ${dup.time} reserviert`);
  return out;
}
export const hasErrors = (issues: Issue[]) => issues.some(i => i.level === 'error');

export interface Suggestion { ids: string[]; score: number }

/** Tischvorschläge (Einzeltische und Kombinationen), beste Passung zuerst */
export function suggestTables(d: VenueData, r: Reservation, preferredRoomId?: string | null, limit = 6): Suggestion[] {
  const st = resStart(r), en = resEnd(r), p = persons(r);
  const free = (tid: string) => !!byId(d.tables, tid) && !isBlocked(d, tid, r.date, r.serviceId) && !tableConflicts(d, tid, r.date, st, en, r).length;
  const out: Suggestion[] = [];
  for (const tb of d.tables) {
    if (p > tb.maxPersons || !free(tb.id)) continue;
    let score = (tb.maxPersons - p) * 10 + (preferredRoomId && tb.roomId !== preferredRoomId ? 4 : 0);
    if (p < tb.minPersons) score += 40 + (tb.minPersons - p) * 20; // nur als Ausweichvorschlag
    score -= r.wishes.filter(w => tb.features.includes(w)).length * 8;
    out.push({ ids: [tb.id], score });
  }
  for (const c of d.combos) {
    if (!c.tableIds.every(free)) continue;
    const cap = capacity(d, c.tableIds);
    const biggest = Math.max(...c.tableIds.map(id => byId(d.tables, id)?.maxPersons ?? 0));
    if (p > cap.max || p <= biggest) continue;
    out.push({ ids: [...c.tableIds], score: (cap.max - p) * 10 + 15 });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit);
}

/** Längste mögliche Dauer ab Startzeit, bevor der Tisch wieder reserviert ist (für Walk-ins) */
export function freeMinutes(d: VenueData, tableIds: string[], date: string, start: number, exceptId?: string): number {
  let limit = Infinity;
  for (const tid of tableIds) for (const o of d.reservations) {
    if (o.id === exceptId || o.date !== date || !occupies(o) || !o.tableIds.includes(tid)) continue;
    if (resEnd(o) <= start) continue;
    if (resStart(o) <= start) return 0;
    limit = Math.min(limit, resStart(o) - start);
  }
  return limit;
}

/** more = weitere Hotelzimmer, die gleichzeitig am selben Tisch sitzen */
export interface TableStatus { st: TableState; r?: Reservation; next?: Reservation; more?: number }

/** Status eines Tisches zu einem Zeitpunkt (Live-Plan) */
export function tableStatusAt(d: VenueData, tb: DiningTable, date: string, serviceId: string | null, tm: number): TableStatus {
  if (isBlocked(d, tb.id, date, serviceId)) return { st: 'gesperrt' };
  const rs = d.reservations.filter(r => r.date === date && r.tableIds.includes(tb.id) && occupies(r)).sort((a, b) => resStart(a) - resStart(b));
  const more = (r: Reservation) => rs.filter(o => o.id !== r.id && overlaps(resStart(o), resEnd(o), resStart(r), resEnd(r))).length || undefined;
  const seated = rs.find(r => SEATED_STATES.includes(r.status));
  if (seated) return { st: seated.status === 'rechnung' ? 'rechnung' : tm > resEnd(seated) ? 'ueberzogen' : 'platziert', r: seated, more: more(seated) };
  const cur = rs.find(r => resStart(r) <= tm && tm < resEnd(r));
  if (cur) return { st: tm > resStart(cur) + 15 ? 'ueberfaellig' : 'reserviert', r: cur, more: more(cur) };
  const next = rs.find(r => resStart(r) > tm);
  if (next && resStart(next) - tm <= 60) return { st: 'bald', r: next, more: more(next) };
  return { st: 'frei', next };
}

/* ---------------------------------------------------------------------
   Hotel: Aufenthalte → Reservierungen je Nacht und Service
   --------------------------------------------------------------------- */
export const stayNights = (s: Pick<Stay, 'arrival' | 'departure'>) => {
  const out: string[] = []; for (let x = s.arrival; x < s.departure; x = addDays(x, 1)) out.push(x); return out;
};
export const stayServices = (d: VenueData, s: Pick<Stay, 'board'>) =>
  d.services.filter(x => boardTables(d.venue, s.board).includes(x.kind) && !x.freeSeating);
export const isInHouse = (s: Stay, date: string) => s.arrival <= date && date < s.departure;
export const needsTable = (d: VenueData, s: Stay) => stayServices(d, s).length > 0;

export interface StayPlan { upserts: Reservation[]; deleteIds: string[]; skipped: string[] }

/**
 * Berechnet, welche Reservierungen ein Aufenthalt braucht:
 * fehlende werden angelegt, bestehende aktualisiert, überflüssige (noch offene) gelöscht.
 * Ein manuell geänderter Tisch (manualTable) bleibt erhalten.
 */
export function planStay(d: VenueData, stay: Stay, newId: () => string, resetManual = false): StayPlan {
  const existing = d.reservations.filter(r => r.stayId === stay.id);
  const need: { date: string; svc: Service }[] = [];
  for (const date of stayNights(stay)) for (const svc of stayServices(d, stay)) need.push({ date, svc });
  const deleteIds = existing.filter(r => !need.some(n => n.date === r.date && n.svc.id === r.serviceId) && OPEN_STATES.includes(r.status)).map(r => r.id);
  const upserts: Reservation[] = [];
  const skipped: string[] = [];
  for (const n of need) {
    const ex = existing.find(r => r.date === n.date && r.serviceId === n.svc.id);
    const time = serviceTime(d, n.svc.id, true);
    const base: Reservation = ex ? { ...ex } : {
      id: newId(), date: n.date, serviceId: n.svc.id, time,
      duration: untilEnd(d, n.svc.id, time), adults: 0, children: 0, name: '', phone: '', email: '', occasion: '', allergies: '', allergens: [], notes: '',
      highchair: false, vip: false, source: 'Hotel', status: 'bestaetigt', wishes: [], stayId: stay.id, manualTable: false,
      seriesId: null, seatedAt: null, finishedAt: null, tableIds: []
    };
    const open = OPEN_STATES.includes(base.status);
    const next: Reservation = {
      ...base, name: `${stay.name} · Zi. ${stay.roomNo}`, adults: stay.adults, children: stay.children,
      allergies: stay.allergies, allergens: [...(stay.allergens ?? [])], notes: stay.notes, vip: stay.vip, phone: stay.phone
    };
    if (open) {
      if (resetManual) next.manualTable = false;
      if (!next.manualTable) next.tableIds = [...stay.tableIds];
    }
    // Tisch in dieser Nacht schon anderweitig belegt → Reservierung ohne Tisch anlegen und melden
    if (open && next.tableIds.length && occupies(next)) {
      const busy = next.tableIds.some(tid => tableConflicts(d, tid, next.date, resStart(next), resEnd(next), next).length);
      if (busy) { skipped.push(`${fmtShort(next.date)} ${n.svc.name}`); next.tableIds = []; }
    }
    if (!ex || JSON.stringify(ex) !== JSON.stringify(next)) upserts.push(next);
  }
  return { upserts, deleteIds, skipped };
}

/** An welchen Tagen kollidiert ein fester Tisch für den Aufenthalt? */
export function stayTableConflicts(d: VenueData, stay: Stay, tableIds: string[]): string[] {
  const days: string[] = [];
  for (const date of stayNights(stay)) for (const s of stayServices(d, stay)) {
    const own = d.reservations.find(r => r.stayId === stay.id && r.date === date && r.serviceId === s.id);
    const time = serviceTime(d, s.id, true);
    const st = own ? resStart(own) : toMin(time);
    const en = own ? resEnd(own) : st + untilEnd(d, s.id, time);
    for (const tid of tableIds) {
      const busy = tableConflicts(d, tid, date, st, en, { id: own?.id, stayId: stay.id });
      if (busy.length) days.push(`${fmtShort(date)} ${s.name}: ${byId(d.tables, tid)?.name} ` +
        (busy.every(o => o.stayId) ? `schon ${MAX_ROOMS_PER_TABLE} Zimmer am Tisch` : `belegt (${busy[0].name})`));
    }
  }
  return days;
}

/** Felder, die beim Zusammenführen nicht als Änderung zählen (werden vom Server gesetzt) */
const SERVER_FIELDS = new Set<keyof Reservation>(['updatedAt']);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Bearbeitungskonflikt auflösen: `base` = Stand beim Öffnen, `mine` = eigene Eingaben, `theirs` = aktueller Stand
 * (inzwischen von jemand anderem gespeichert). Eigene Änderungen werden auf den aktuellen Stand gelegt;
 * `overlap` = Felder, die beide geändert haben (dann Rückfrage).
 */
export function mergeEdits(base: Reservation, mine: Reservation, theirs: Reservation): { merged: Reservation; overlap: (keyof Reservation)[] } {
  const keys = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)] as (keyof Reservation)[]);
  const mineChanged = [...keys].filter(k => !SERVER_FIELDS.has(k) && !same(base[k], mine[k]));
  const overlap = mineChanged.filter(k => !same(base[k], theirs[k]) && !same(mine[k], theirs[k]));
  const merged = { ...theirs } as Record<string, unknown>;
  for (const k of mineChanged) merged[k] = mine[k];
  return { merged: merged as unknown as Reservation, overlap };
}
