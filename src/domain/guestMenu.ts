/**
 * Gäste-Speisekarte per QR-Code (reine Fachlogik):
 * Hotelgäste wählen am Tisch je Zimmer und Gang, wie oft welches Gericht – daraus kennt die Küche die Portionen.
 * Dieselben Regeln prüft die Datenbank in guest_menu / guest_menu_save (Migration 20261013000000_gaeste_menue_qr.sql).
 */
import { BOARD_MEALS, COURSES } from './constants';
import { byId, isCancelled, linkedTables, persons, tableNames } from './logic';
import type { Allergen, Branding, Course, Diet, Menu, MenuChoice, MenuItem, MenuOrdering, MenuState, QrWindow, Reservation, ServiceKind, Stay, VenueData } from './types';
import { addDays } from '../lib/time';

export const DEFAULT_BRANDING: Branding = { title: '', welcome: '', color: '#0F2347', logoUrl: null, coverUrl: null };
export const brandingOf = (v: { name: string; branding?: Partial<Branding> | null }): Branding =>
  ({ ...DEFAULT_BRANDING, ...(v.branding ?? {}), title: v.branding?.title || v.name });
export const orderingOf = (m: Pick<Menu, 'ordering'>): MenuOrdering => m.ordering ?? 'aus';

export const DEFAULT_QR_WINDOW: QrWindow = { open: '21:00', close: '10:00' };
/** Neues Menü: Abendessen öffnet automatisch per Zeitfenster, alles andere schaltet die Küche von Hand frei */
export const defaultOrdering = (kind: ServiceKind | undefined): MenuOrdering => (kind === 'abend' ? 'auto' : 'aus');

/** Wirksamer Zustand für Gäste: 'auto' = vor dem Vorabend (open) unsichtbar, bis close am Tag offen, danach geschlossen.
 *  Gleiche Regel in der DB-Funktion menu_state (Migration 20261023000000_qr_zeitfenster.sql). */
export function menuState(m: Pick<Menu, 'ordering' | 'date'>, venue: { qrWindow?: QrWindow }, now = new Date()): MenuState {
  const o = orderingOf(m);
  if (o !== 'auto') return o;
  const w = { ...DEFAULT_QR_WINDOW, ...venue.qrWindow };
  const at = (day: string, hm: string) => new Date(`${day}T${hm}:00`);
  if (now < at(addDays(m.date, -1), w.open)) return 'aus';
  if (now < at(m.date, w.close)) return 'offen';
  return 'geschlossen';
}

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
/** Wer per QR wählt: ein Hotelzimmer (stayId) oder eine externe Reservierung am Tisch (resId, roomNo leer) */
export interface GuestRoom { stayId: string | null; resId?: string | null; roomNo: string; persons: number; counts: Record<string, number>; note?: string;
  /** externe Reservierung: Tisch(e), an dem der Gast sitzt (statt Namen) */ tableName?: string }
/** Schlüssel einer Auswahl-Partei (Zimmer oder Reservierung) */
export const partyKey = (x: { stayId?: string | null; resId?: string | null }) => x.stayId || 'r:' + (x.resId ?? '');
/** pick = freie Platzwahl: rooms enthält alle Zimmer mit dieser Mahlzeit, der Gast wählt sein Zimmer aus */
export interface GuestMenu { id: string; date: string; service: string; kind: string; state: MenuState; pick: boolean; items: GuestDish[]; rooms: GuestRoom[] }
/** table = null: QR-Code des Betriebs (ein Code für alle Tische) – der Gast wählt Zimmer bzw. Tisch selbst */
export interface GuestMenuData { venue: { name: string; branding: Branding }; table: { name: string } | null; menus: GuestMenu[] }

/** Isst der Aufenthalt bei dieser Mahlzeit mit? Frühstück am Morgen nach jeder Nacht (bis zum Abreisetag), sonst an jedem Tag bis vor der Abreise.
 *  Gleiche Regel in der DB-Funktion stay_eats (Migration 20261017000000_fruehstueck_freie_platzwahl.sql). */
export function stayEats(s: Pick<Stay, 'board' | 'arrival' | 'departure'>, kind: ServiceKind, date: string): boolean {
  if (!BOARD_MEALS[s.board]?.includes(kind)) return false;
  return kind === 'fruehstueck' ? s.arrival < date && date <= s.departure : s.arrival <= date && date < s.departure;
}


/** Wer zu einem Menü wählt: Hotelzimmer (stay) oder externe Reservierung (res ohne Zimmer) */
export interface MenuParty { stay?: Stay; res?: Reservation; persons: number; choice?: MenuChoice; label: string }

/** Gäste zu einem Menü (Datum + Service): alle Reservierungen – Hotelzimmer und externe Gäste – optional nur an einem Tisch;
 *  bei freier Platzwahl alle Zimmer, deren Verpflegung die Mahlzeit enthält (ohne Reservierung). Zimmer zuerst, nach Nummer. */
export function menuRooms(d: VenueData, m: Pick<Menu, 'id' | 'date' | 'serviceId'>, tableId?: string): MenuParty[] {
  const choices = (d.menuChoices ?? []).filter(c => c.menuId === m.id);
  const svc = byId(d.services, m.serviceId);
  const room = (stay: Stay, res?: Reservation): MenuParty =>
    ({ stay, res, persons: res ? persons(res) : persons(stay), choice: choices.find(c => c.stayId === stay.id), label: `Zi. ${stay.roomNo}` });
  const list: MenuParty[] = svc?.freeSeating
    ? d.stays.filter(s => stayEats(s, svc.kind, m.date)).map(stay => room(stay))
    : d.reservations
      .filter(r => r.date === m.date && r.serviceId === m.serviceId && !isCancelled(r) && (!tableId || r.tableIds.includes(tableId)))
      .flatMap(r => {
        if (!r.stayId) return [{ res: r, persons: persons(r), choice: choices.find(c => c.reservationId === r.id), label: r.name }];
        const stay = byId(d.stays, r.stayId); return stay ? [room(stay, r)] : [];
      });
  // Zimmer zuerst (nach Nummer), dann externe Reservierungen (nach Name)
  return list.sort((a, b) => Number(!a.stay) - Number(!b.stay) ||
    (a.stay?.roomNo ?? a.label).localeCompare(b.stay?.roomNo ?? b.label, 'de', { numeric: true }));
}

/** Gäste-Ansicht für einen QR-Schlüssel (heute und morgen, nur freigegebene Menüs) – im Demo-Modus statt der DB-Funktion.
 *  Schlüssel des Betriebs → alle Gäste zur Auswahl; älterer Tisch-Schlüssel → nur die Gäste an diesem Tisch */
export function buildGuestMenu(d: VenueData, token: string, day0: string, now = new Date()): GuestMenuData | null {
  if (token.length < 16) return null;
  const whole = d.venue.qrToken === token;
  const tb = whole ? undefined : d.tables.find(x => x.qrToken === token);
  if (!whole && !tb) return null;
  const svcIdx = (id: string) => d.services.findIndex(s => s.id === id);
  const menus = d.menus
    .filter(m => (m.date === day0 || m.date === addDays(day0, 1)) && menuState(m, d.venue, now) !== 'aus')
    .sort((a, b) => a.date.localeCompare(b.date) || svcIdx(a.serviceId) - svcIdx(b.serviceId))
    .map((m): GuestMenu => {
      const svc = byId(d.services, m.serviceId);
      return {
        id: m.id, date: m.date, service: svc?.name ?? '', kind: svc?.kind ?? '', state: menuState(m, d.venue, now), pick: !!svc?.freeSeating || whole,
        items: m.items.map(it => {
          const dish = byId(d.dishes, it.dishId);
          return { course: it.course, dishId: it.dishId, name: dish?.name ?? it.name, nameIt: dish?.nameIt ?? '', nameEn: dish?.nameEn ?? '', diet: dish?.diet ?? [], allergens: it.allergens };
        }),
        // externe Gäste ohne Namen (Datenschutz) – sie erscheinen als „Tisch …“; ohne Tisch nicht auffindbar
        rooms: menuRooms(d, m, tb?.id).filter(x => x.stay || x.res?.tableIds.length).map(x => ({ stayId: x.stay?.id ?? null, resId: x.stay ? null : x.res!.id,
          roomNo: x.stay?.roomNo ?? '', persons: x.persons, counts: x.choice?.counts ?? {}, note: x.choice?.note ?? '',
          ...(x.stay ? {} : { tableName: tableNames(d, x.res!.tableIds) }) }))
      };
    });
  return { venue: { name: d.venue.name, branding: brandingOf(d.venue) }, table: tb ? { name: tb.name } : null, menus };
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

/** Menü und Auswahl zu einer Reservierung (gleiches Datum + Service): beim Hotelgast die des Zimmers, sonst die der Reservierung */
export function menuChoiceFor(d: VenueData, r: Pick<Reservation, 'id' | 'date' | 'serviceId' | 'stayId'>): { menu?: Menu; choice?: MenuChoice } {
  const menu = d.menus.find(x => x.date === r.date && x.serviceId === r.serviceId);
  return { menu, choice: menu && (d.menuChoices ?? []).find(x => x.menuId === menu.id && (r.stayId ? x.stayId === r.stayId : x.reservationId === r.id)) };
}

/** Gewähltes Menü zu einer Reservierung, in Gang-Reihenfolge – für Live-Plan und Service */
export function chosenDishes(d: VenueData, r: Pick<Reservation, 'id' | 'date' | 'serviceId' | 'stayId'>): { course: Course; name: string; n: number }[] {
  const { menu: m, choice: c } = menuChoiceFor(d, r);
  if (!m || !c) return [];
  return COURSES.flatMap(course => m.items.filter(it => it.course === course && (c.counts[it.dishId] ?? 0) > 0)
    .map(it => ({ course, name: byId(d.dishes, it.dishId)?.name ?? it.name, n: c.counts[it.dishId] })));
}
/** „2× Schnitzel, 1× Strudel“ */
export const chosenText = (list: { name: string; n: number }[]) => list.map(x => `${x.n}× ${x.name}`).join(', ');

/* ---------- Für die Küche ---------- */
export interface ChoiceSummary {
  rooms: number; chosenRooms: number; persons: number; chosenPersons: number;
  /** gewählte Anzahl je Gericht (dishId) */
  counts: Record<string, number>;
  /** Zimmer/Reservierungen ohne Auswahl, z. B. „Zi. 101 · T1“ oder „Rossi · T5“ */
  open: { label: string; persons: number }[];
  /** Notizen der Gäste zur Auswahl */
  notes: { label: string; note: string }[];
}
export function choiceSummary(d: VenueData, m: Menu): ChoiceSummary {
  const rooms = menuRooms(d, m);
  const chosen = rooms.filter(x => x.choice && Object.keys(x.choice.counts).length);
  const counts: Record<string, number> = {};
  for (const x of chosen) for (const [k, n] of Object.entries(x.choice!.counts)) if (m.items.some(i => i.dishId === k)) counts[k] = (counts[k] ?? 0) + n;
  return {
    rooms: rooms.length, chosenRooms: chosen.length,
    persons: rooms.reduce((a, x) => a + x.persons, 0), chosenPersons: chosen.reduce((a, x) => a + x.persons, 0), counts,
    notes: rooms.filter(x => x.choice?.note).map(x => ({ label: x.label, note: x.choice!.note! })),
    open: rooms.filter(x => !chosen.includes(x)).map(x => ({ persons: x.persons,
      label: [x.label, x.res?.tableIds.length ? tableNames(d, x.res.tableIds) : byId(d.services, m.serviceId)?.freeSeating ? '' : 'ohne Tisch'].filter(Boolean).join(' · ') }))
  };
}

/** Zimmernummern der Hotelgäste an einem Tisch (gleicher Tag + Service), sortiert – für den Raumplan */
export function roomNosAt(d: VenueData, tableId: string, r: Pick<Reservation, 'date' | 'serviceId'>): string[] {
  const nos = d.reservations
    .filter(x => x.date === r.date && x.serviceId === r.serviceId && !isCancelled(x) && x.tableIds.includes(tableId) && x.stayId)
    .map(x => byId(d.stays, x.stayId)?.roomNo).filter((x): x is string => !!x);
  return [...new Set(nos)].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
}

/** Zusammengelegte Tische: alle Reservierungen (gleicher Tag + Service), die einen der Tische nutzen – mit Personen und Menü-Summe */
export interface TableGroup { tableIds: string[]; reservations: Reservation[]; persons: number; rooms: number; dishes: { course: Course; name: string; n: number }[] }
export function tableGroup(d: VenueData, r: Reservation): TableGroup {
  // Tische transitiv einsammeln (A+B für Gast 1, B+C für Gast 2 → A, B, C) – wie die Kapazitätsprüfung
  const { tableIds, reservations } = linkedTables(d, r);
  const tables = new Set(tableIds);
  const sum = new Map<string, { course: Course; name: string; n: number }>();
  for (const x of reservations) for (const dish of chosenDishes(d, x)) {
    const e = sum.get(dish.name) ?? { ...dish, n: 0 };
    e.n += dish.n; sum.set(dish.name, e);
  }
  return {
    tableIds: [...tables], reservations, persons: reservations.reduce((a, x) => a + persons(x), 0),
    rooms: new Set(reservations.map(x => x.stayId ?? x.id)).size,
    dishes: COURSES.flatMap(c => [...sum.values()].filter(x => x.course === c))
  };
}
