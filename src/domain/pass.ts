/** Modul Pass + Chef: Gang-Stand je Reservierung, Einfärbung des Pass-Plans, Übersicht für die Küche.
 *  Ablauf je Gang: wartet → abgerufen (Service) → fertig (Küche) → serviert (Service) → nächster Gang frei. */
import { menuChoiceFor, menuCourses } from './guestMenu';
import { byId, isCancelled, tableNames } from './logic';
import type { Course, Menu, MenuChoice, PassCall, PassState, Reservation, VenueData } from './types';

/** Stand eines Gangs; „leer“ = in diesem Gang nichts gewählt (wird übersprungen) */
export type CourseState = 'leer' | 'wartet' | PassState;
export interface DishProgress { dishId: string; name: string; chosen: number; called: number; cancelled: number; open: number }
export interface CourseProgress { course: Course; state: CourseState; dishes: DishProgress[]; calls: PassCall[] }
export interface PassProgress {
  menu?: Menu; choice?: MenuChoice; hasChoice: boolean; courses: CourseProgress[];
  /** erster Gang, der noch nicht serviert ist – nur er kann abgerufen werden */
  current: CourseProgress | null;
  /** alle gewählten Gänge serviert */
  done: boolean;
}

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
/** Portionen eines Abrufs ohne Stornos */
export const netCount = (c: Pick<PassCall, 'counts' | 'cancelled'>, dishId: string) => Math.max(0, (c.counts[dishId] ?? 0) - (c.cancelled[dishId] ?? 0));
export const callNet = (c: Pick<PassCall, 'counts' | 'cancelled'>) => sum(Object.keys(c.counts).map(k => netCount(c, k)));
const dishName = (d: VenueData, m: Menu, dishId: string) => byId(d.dishes, dishId)?.name ?? m.items.find(i => i.dishId === dishId)?.name ?? '?';

export function passProgress(d: VenueData, r: Reservation): PassProgress {
  const { menu, choice } = menuChoiceFor(d, r);
  if (!menu) return { hasChoice: false, courses: [], current: null, done: false };
  const counts = choice?.counts ?? {};
  const calls = (d.passCalls ?? []).filter(c => c.reservationId === r.id && c.menuId === menu.id);
  const courses = menuCourses(menu.items).map((course): CourseProgress => {
    const cc = calls.filter(c => c.course === course);
    const dishes = menu.items.filter(i => i.course === course).map((it): DishProgress => {
      const chosen = counts[it.dishId] ?? 0;
      const called = sum(cc.map(c => c.counts[it.dishId] ?? 0)), cancelled = sum(cc.map(c => c.cancelled[it.dishId] ?? 0));
      return { dishId: it.dishId, name: dishName(d, menu, it.dishId), chosen, called, cancelled, open: Math.max(0, chosen - called) };
    }).filter(x => x.chosen || x.called);
    const active = (s: PassState) => cc.some(c => c.state === s && callNet(c) > 0);
    const state: CourseState = !dishes.length ? 'leer' : active('abgerufen') ? 'abgerufen' : active('fertig') ? 'fertig'
      : dishes.some(x => x.open) ? 'wartet' : 'serviert';
    return { course, state, dishes, calls: cc };
  });
  const hasChoice = Object.values(counts).some(n => n > 0);
  const current = courses.find(c => c.state !== 'leer' && c.state !== 'serviert') ?? null;
  return { menu, choice, hasChoice, courses, current, done: hasChoice && !current };
}

/** Reservierungen, die am Pass zählen: gleicher Tag + Service, nicht storniert/No-Show, noch nicht abgeschlossen */
export const passReservations = (d: VenueData, date: string, serviceId: string) =>
  d.reservations.filter(r => r.date === date && r.serviceId === serviceId && !isCancelled(r) && r.status !== 'abgeschlossen' && r.tableIds.length);

/** Farbe eines Tisches im Pass-Plan */
export type PassLook = 'frei' | 'ohne' | 'wartet' | 'abgerufen' | 'fertig' | 'serviert';
export const PASS_LOOK: Record<PassLook, { label: string; color: string }> = {
  frei: { label: 'Frei', color: 'var(--st-frei)' },
  ohne: { label: 'Keine Menüauswahl', color: '#8A97B0' },
  wartet: { label: 'Gang kann abgerufen werden', color: '#4F7BD1' },
  abgerufen: { label: 'In der Küche', color: '#f0883e' },
  fertig: { label: 'Fertig – abholen', color: '#2da44e' },
  serviert: { label: 'Alle Gänge serviert', color: '#4A5B7D' }
};
/** Wichtigstes zuerst: abholen → abrufen → Auswahl eintragen → wartet auf Küche → fertig */
const RANK: PassLook[] = ['fertig', 'wartet', 'ohne', 'abgerufen', 'serviert'];

export function lookOf(p: PassProgress): PassLook {
  if (!p.hasChoice) return 'ohne';
  return p.current ? (p.current.state as PassLook) : 'serviert';
}

/** Stand eines Tisches: dringendster Stand aller Reservierungen daran */
export function tablePass(d: VenueData, tableId: string, date: string, serviceId: string): { look: PassLook; reservations: Reservation[] } {
  const reservations = passReservations(d, date, serviceId).filter(r => r.tableIds.includes(tableId));
  if (!reservations.length) return { look: 'frei', reservations };
  const looks = reservations.map(r => lookOf(passProgress(d, r)));
  return { look: RANK.find(l => looks.includes(l)) ?? 'serviert', reservations };
}

/** „Zi. 101 · Huber“ bzw. Name; mit Revier: „Zi. 101 · Revier A · Huber“ (ohne Revier am Tisch nichts) */
export function partyLabel(d: VenueData, r: Reservation, withStation = false): string {
  const stay = r.stayId ? byId(d.stays, r.stayId) : undefined;
  const station = withStation ? stationNames(d, r) : '';
  // Hotel-Reservierungen heißen oft schon „Name · Zi. 101“ – Zimmer nur einmal vorne
  return stay ? [`Zi. ${stay.roomNo}`, station, r.name.split(' · ')[0]].filter(Boolean).join(' · ') : [r.name, station].filter(Boolean).join(' · ');
}
/** Reviere der Tische einer Reservierung (leer, wenn keinem Revier zugeordnet) */
export const stationNames = (d: VenueData, r: Reservation) =>
  [...new Set(r.tableIds.map(id => byId(d.stations, byId(d.tables, id)?.stationId)?.name).filter((x): x is string => !!x))].join('/');

/* ---------- Küche (Chef) ---------- */
export interface ChefDish { dishId: string; name: string; course: Course; total: number; open: number; inKitchen: number; ready: number; served: number }
export interface CallView { call: PassCall; res: Reservation; label: string; tables: string; lines: { dishId: string; name: string; n: number; cancelled: number }[] }
export interface ChefOverview { menu?: Menu; dishes: ChefDish[]; active: CallView[]; ready: CallView[] }

export function chefOverview(d: VenueData, date: string, serviceId: string): ChefOverview {
  const menu = d.menus.find(m => m.date === date && m.serviceId === serviceId);
  if (!menu) return { dishes: [], active: [], ready: [] };
  const list = passReservations(d, date, serviceId).map(r => ({ r, p: passProgress(d, r) }));
  const dishes = new Map<string, ChefDish>();
  for (const it of menu.items) dishes.set(it.dishId, { dishId: it.dishId, name: dishName(d, menu, it.dishId), course: it.course, total: 0, open: 0, inKitchen: 0, ready: 0, served: 0 });
  const view = (call: PassCall, r: Reservation): CallView => ({
    call, res: r, label: partyLabel(d, r, true), tables: tableNames(d, r.tableIds),
    lines: Object.keys(call.counts).filter(k => call.counts[k] > 0).map(k => ({ dishId: k, name: dishName(d, menu, k), n: call.counts[k], cancelled: call.cancelled[k] ?? 0 }))
  });
  const active: CallView[] = [], ready: CallView[] = [];
  for (const { r, p } of list) {
    for (const c of p.courses) {
      for (const x of c.dishes) {
        const e = dishes.get(x.dishId); if (!e) continue;
        e.total += x.chosen - x.cancelled; e.open += x.open;
      }
      for (const call of c.calls) {
        for (const k of Object.keys(call.counts)) {
          const e = dishes.get(k), n = netCount(call, k); if (!e) continue;
          if (call.state === 'abgerufen') e.inKitchen += n; else if (call.state === 'fertig') e.ready += n; else e.served += n;
        }
        // abgerufene Gänge zeigen auch stornierte Portionen (durchgestrichen), solange etwas offen ist oder storniert wurde
        if (call.state === 'abgerufen') active.push(view(call, r));
        else if (call.state === 'fertig' && callNet(call) > 0) ready.push(view(call, r));
      }
    }
  }
  const byTime = (a: CallView, b: CallView) => a.call.calledAt.localeCompare(b.call.calledAt);
  return { menu, dishes: [...dishes.values()].filter(x => x.total || x.served || x.inKitchen || x.ready), active: active.sort(byTime), ready: ready.sort(byTime) };
}

/** Abrufe je Kellner gruppiert (Name → Abrufe), in Reihenfolge des ältesten Abrufs */
export function byWaiter(calls: CallView[]): [string, CallView[]][] {
  const m = new Map<string, CallView[]>();
  for (const c of calls) { const k = c.call.calledByName || 'Service'; m.set(k, [...(m.get(k) ?? []), c]); }
  return [...m.entries()];
}

/** Neuer Abruf: alle offenen Portionen des aktuellen Gangs oder nur eines Gerichts */
export function newCall(p: PassProgress, r: Reservation, user: { id: string; name: string }, newId: () => string, dishId?: string, now = new Date()): PassCall | null {
  const c = p.current;
  if (!p.menu || !c) return null;
  const counts: Record<string, number> = {};
  for (const x of c.dishes) if (x.open && (!dishId || x.dishId === dishId)) counts[x.dishId] = x.open;
  if (!Object.keys(counts).length) return null;
  return { id: newId(), reservationId: r.id, menuId: p.menu.id, course: c.course, counts, cancelled: {}, state: 'abgerufen',
    calledBy: user.id, calledByName: user.name, calledAt: now.toISOString(), readyAt: null, servedAt: null };
}

/** Eine Portion eines Abrufs stornieren (Küche sieht sie durchgestrichen) */
export function cancelPortion(call: PassCall, dishId: string): PassCall | null {
  if (!netCount(call, dishId)) return null;
  return { ...call, cancelled: { ...call.cancelled, [dishId]: (call.cancelled[dishId] ?? 0) + 1 } };
}

/** Minuten seit dem Abruf */
export const minutesSince = (iso: string, now = new Date()) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000));
