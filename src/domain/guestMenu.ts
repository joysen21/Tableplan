/**
 * Gäste-Speisekarte per QR-Code (reine Fachlogik):
 * Hotelgäste wählen am Tisch je Zimmer und Gang, wie oft welches Gericht – daraus kennt die Küche die Portionen.
 * Dieselben Regeln prüft die Datenbank in guest_menu / guest_menu_save (Migration 20261013000000_gaeste_menue_qr.sql).
 */
import { COURSES } from './constants';
import { byId, isCancelled, persons } from './logic';
import type { Allergen, Branding, Course, Diet, Menu, MenuChoice, MenuItem, MenuOrdering, Reservation, Stay, VenueData } from './types';
import { addDays } from '../lib/time';

export const DEFAULT_BRANDING: Branding = { title: '', welcome: '', color: '#0F2347', logoUrl: null, coverUrl: null };
export const brandingOf = (v: { name: string; branding?: Partial<Branding> | null }): Branding =>
  ({ ...DEFAULT_BRANDING, ...(v.branding ?? {}), title: v.branding?.title || v.name });
export const orderingOf = (m: Pick<Menu, 'ordering'>): MenuOrdering => m.ordering ?? 'aus';

/** Geheimer Tisch-Schlüssel für den QR-Code (24 Hex-Zeichen, nicht erratbar) */
export function newQrToken(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
/** Adresse, die im QR-Code steht */
export const guestUrl = (origin: string, token: string, demo = false) => `${origin}/m/${token}${demo ? '?demo' : ''}`;

/* ---------- Was der Gast sieht ---------- */
export interface GuestDish { course: Course; dishId: string; name: string; nameIt: string; nameEn: string; diet: Diet[]; allergens: Allergen[] }
export interface GuestRoom { stayId: string; roomNo: string; persons: number; counts: Record<string, number> }
export interface GuestMenu { id: string; date: string; service: string; kind: string; state: MenuOrdering; items: GuestDish[]; rooms: GuestRoom[] }
export interface GuestMenuData { venue: { name: string; branding: Branding }; table: { name: string }; menus: GuestMenu[] }

/** Hotelzimmer, die zu einem Menü (Datum + Service) eine Reservierung haben – optional nur an einem Tisch */
export function menuRooms(d: VenueData, m: Pick<Menu, 'id' | 'date' | 'serviceId'>, tableId?: string): { stay: Stay; res: Reservation; persons: number; choice?: MenuChoice }[] {
  return d.reservations
    .filter(r => r.date === m.date && r.serviceId === m.serviceId && r.stayId && !isCancelled(r) && (!tableId || r.tableIds.includes(tableId)))
    .flatMap(r => { const stay = byId(d.stays, r.stayId); return stay ? [{ stay, res: r, persons: persons(r), choice: (d.menuChoices ?? []).find(c => c.menuId === m.id && c.stayId === stay.id) }] : []; })
    .sort((a, b) => a.stay.roomNo.localeCompare(b.stay.roomNo, 'de', { numeric: true }));
}

/** Gäste-Ansicht für einen Tisch-Schlüssel (heute und morgen, nur freigegebene Menüs) – im Demo-Modus statt der DB-Funktion */
export function buildGuestMenu(d: VenueData, token: string, day0: string): GuestMenuData | null {
  const tb = token.length >= 16 ? d.tables.find(x => x.qrToken === token) : undefined;
  if (!tb) return null;
  const svcIdx = (id: string) => d.services.findIndex(s => s.id === id);
  const menus = d.menus
    .filter(m => (m.date === day0 || m.date === addDays(day0, 1)) && orderingOf(m) !== 'aus')
    .sort((a, b) => a.date.localeCompare(b.date) || svcIdx(a.serviceId) - svcIdx(b.serviceId))
    .map((m): GuestMenu => {
      const svc = byId(d.services, m.serviceId);
      return {
        id: m.id, date: m.date, service: svc?.name ?? '', kind: svc?.kind ?? '', state: orderingOf(m),
        items: m.items.map(it => {
          const dish = byId(d.dishes, it.dishId);
          return { course: it.course, dishId: it.dishId, name: dish?.name ?? it.name, nameIt: dish?.nameIt ?? '', nameEn: dish?.nameEn ?? '', diet: dish?.diet ?? [], allergens: it.allergens };
        }),
        rooms: menuRooms(d, m, tb.id).map(x => ({ stayId: x.stay.id, roomNo: x.stay.roomNo, persons: x.persons, counts: x.choice?.counts ?? {} }))
      };
    });
  return { venue: { name: d.venue.name, branding: brandingOf(d.venue) }, table: { name: tb.name }, menus };
}

/**
 * Auswahl prüfen und bereinigen (nur Gerichte des Menüs, ganze Zahlen ≥ 0, je Gang höchstens so viele wie Personen).
 * Liefert die bereinigte Auswahl (ohne Nullen) oder einen Fehlertext.
 */
export function cleanCounts(items: Pick<MenuItem, 'course' | 'dishId'>[], personsN: number, counts: Record<string, unknown>): { counts: Record<string, number> } | { error: string } {
  const out: Record<string, number> = {}, sums = new Map<Course, number>();
  for (const [dishId, raw] of Object.entries(counts ?? {})) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 50) return { error: 'Ungültige Anzahl' };
    const it = items.find(i => i.dishId === dishId);
    if (!it) return { error: 'Gericht nicht im Menü' };
    if (!n) continue;
    out[dishId] = n;
    sums.set(it.course, (sums.get(it.course) ?? 0) + n);
  }
  for (const [c, n] of sums) if (n > personsN) return { error: `Mehr Gerichte als Personen (${n} > ${personsN}) im Gang ${c}` };
  return { counts: out };
}

/** Gänge eines Menüs in Reihenfolge */
export const menuCourses = (items: Pick<MenuItem, 'course'>[]) => COURSES.filter(c => items.some(i => i.course === c));

/* ---------- Für die Küche ---------- */
export interface ChoiceSummary {
  rooms: number; chosenRooms: number; persons: number; chosenPersons: number;
  /** gewählte Anzahl je Gericht (dishId) */
  counts: Record<string, number>;
  /** Zimmer ohne Auswahl */
  open: { roomNo: string; persons: number; tables: string[] }[];
}
export function choiceSummary(d: VenueData, m: Menu): ChoiceSummary {
  const rooms = menuRooms(d, m);
  const chosen = rooms.filter(x => x.choice && Object.keys(x.choice.counts).length);
  const counts: Record<string, number> = {};
  for (const x of chosen) for (const [k, n] of Object.entries(x.choice!.counts)) if (m.items.some(i => i.dishId === k)) counts[k] = (counts[k] ?? 0) + n;
  return {
    rooms: rooms.length, chosenRooms: chosen.length,
    persons: rooms.reduce((a, x) => a + x.persons, 0), chosenPersons: chosen.reduce((a, x) => a + x.persons, 0), counts,
    open: rooms.filter(x => !chosen.includes(x)).map(x => ({ roomNo: x.stay.roomNo, persons: x.persons, tables: x.res.tableIds.map(id => byId(d.tables, id)?.name ?? '?') }))
  };
}
