/** Module Garage, Massage, Fahrrad: Zeiträume, Überschneidungen, freie Ressourcen, Anwesenheit.
 *  Zeiten lokal als „JJJJ-MM-TTTHH:MM“ (Ende ausschließlich) – Zeichenketten lassen sich direkt vergleichen. */
import { byId } from './logic';
import type { BikePart, Booking, ExtraModule, HotelResource, Stay, VenueData } from './types';
import { addDays, fmtShort, fromMin, toMin } from '../lib/time';

export const EXTRA_LABEL: Record<ExtraModule, string> = { garage: 'Garage', massage: 'Massage', fahrrad: 'Fahrrad' };

/** Garage: je Nacht 12:00–12:00; am selben Tag (von = bis) nur tagsüber bis Mitternacht */
export function garageRange(from: string, to: string): { starts: string; ends: string } {
  return { starts: `${from}T12:00`, ends: to > from ? `${to}T12:00` : `${from}T23:59` };
}
/** Von/Bis-Tage einer Garagenbuchung */
export const garageDays = (b: Pick<Booking, 'starts' | 'ends'>) => ({ from: b.starts.slice(0, 10), to: b.ends.slice(0, 10) });

export const BIKE_PARTS: Record<BikePart, { label: string; start: string; end: string }> = {
  tag: { label: 'Ganzer Tag', start: '08:00', end: '18:00' },
  vm: { label: 'Vormittag', start: '08:00', end: '13:00' },
  nm: { label: 'Nachmittag', start: '13:00', end: '18:00' }
};
export const bikeRange = (date: string, part: BikePart) => ({ starts: `${date}T${BIKE_PARTS[part].start}`, ends: `${date}T${BIKE_PARTS[part].end}` });

/** Massage: Beginn + Dauer (Minuten) am selben Tag */
export function massageRange(date: string, start: string, duration: number) {
  const end = Math.min(toMin(start) + duration, 24 * 60 - 1);
  return { starts: `${date}T${start}`, ends: `${date}T${fromMin(end)}` };
}

/* ---------- Fahrrad über mehrere Halbtage (Vormittag/Nachmittag), z. B. Mo Vormittag bis Mi Nachmittag ---------- */
export type Half = 'vm' | 'nm';
const HALF_START: Record<Half, string> = { vm: '08:00', nm: '13:00' }, HALF_END: Record<Half, string> = { vm: '13:00', nm: '18:00' };
const dayNo = (day: string) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86400000);
const halfIdx = (day: string, half: Half) => dayNo(day) * 2 + (half === 'nm' ? 1 : 0);
const fromIdx = (i: number): { day: string; half: Half } => {
  const dt = new Date(Math.floor(i / 2) * 86400000);
  return { day: dt.toISOString().slice(0, 10), half: i % 2 ? 'nm' : 'vm' };
};
/** Zeitraum von (Tag, Halbtag) bis (Tag, Halbtag) einschließlich; part nur bei genau einem Tag/Halbtag */
export function bikeSpan(fromDay: string, fromHalf: Half, toDay: string, toHalf: Half): { starts: string; ends: string; part: BikePart | null } {
  if (halfIdx(toDay, toHalf) < halfIdx(fromDay, fromHalf)) { toDay = fromDay; toHalf = fromHalf; }
  const part: BikePart | null = fromDay !== toDay ? null : fromHalf === toHalf ? fromHalf : 'tag';
  return { starts: `${fromDay}T${HALF_START[fromHalf]}`, ends: `${toDay}T${HALF_END[toHalf]}`, part };
}
/** Beginn und Ende (einschließlich) einer Fahrradbuchung als Halbtage */
export function bikeHalves(b: Pick<Booking, 'starts' | 'ends'>): { fromDay: string; fromHalf: Half; toDay: string; toHalf: Half } {
  return { fromDay: b.starts.slice(0, 10), fromHalf: b.starts.slice(11) < '13:00' ? 'vm' : 'nm', toDay: b.ends.slice(0, 10), toHalf: b.ends.slice(11) <= '13:00' ? 'vm' : 'nm' };
}
/** Fahrrad verschieben: Beginn auf (Tag, Halbtag), gleiche Länge */
export function movedBike(b: Booking, resourceId: string, day: string, half: Half): Booking {
  const h = bikeHalves(b), len = halfIdx(h.toDay, h.toHalf) - halfIdx(h.fromDay, h.fromHalf);
  const end = fromIdx(halfIdx(day, half) + len);
  return { ...b, resourceId, ...bikeSpan(day, half, end.day, end.half) };
}
/** Fahrrad am Rand ziehen: Beginn oder Ende auf (Tag, Halbtag); null = ungültig (Ende vor Beginn) */
export function resizedBike(b: Booking, edge: 'start' | 'end', day: string, half: Half): Booking | null {
  const h = bikeHalves(b);
  if (edge === 'start' ? halfIdx(day, half) > halfIdx(h.toDay, h.toHalf) : halfIdx(day, half) < halfIdx(h.fromDay, h.fromHalf)) return null;
  return { ...b, ...(edge === 'start' ? bikeSpan(day, half, h.toDay, h.toHalf) : bikeSpan(h.fromDay, h.fromHalf, day, half)) };
}
/** Massage am Rand ziehen: Beginn oder Ende auf die Viertelstunde (Feld); null = ungültig */
export function resizedMassage(b: Booking, edge: 'start' | 'end', col: Pick<Booking, 'starts' | 'ends'>): Booking | null {
  if (edge === 'start') return col.starts < b.ends ? { ...b, starts: col.starts } : null;
  return col.ends > b.starts ? { ...b, ends: col.ends } : null;
}

/** Massage verschieben: neue Masseurin/Beginn, gleiche Dauer */
export function movedMassage(b: Booking, resourceId: string, date: string, start: string): Booking {
  const duration = toMin(b.ends.slice(11)) - toMin(b.starts.slice(11));
  return { ...b, resourceId, ...massageRange(date, start, duration) };
}

export const overlaps = (a: Pick<Booking, 'starts' | 'ends'>, b: Pick<Booking, 'starts' | 'ends'>) => a.starts < b.ends && b.starts < a.ends;

/** Andere Buchungen derselben Ressource im selben Zeitraum (Doppelbuchung – sperrt auch die DB) */
export const bookingConflicts = (d: VenueData, b: Pick<Booking, 'id' | 'resourceId' | 'starts' | 'ends'>) =>
  d.bookings.filter(x => x.id !== b.id && x.resourceId === b.resourceId && overlaps(x, b));

export const resourcesOf = (d: VenueData, mod: ExtraModule, all = false) =>
  d.hotelResources.filter(r => r.module === mod && (all || r.active)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de', { numeric: true }));

/** Freie Ressourcen im Zeitraum; Garage mit E-Auto: Ladeplätze zuerst */
export function freeResources(d: VenueData, mod: ExtraModule, range: Pick<Booking, 'starts' | 'ends'>, opts: { ignoreId?: string; ev?: boolean } = {}): HotelResource[] {
  const free = resourcesOf(d, mod).filter(r => !bookingConflicts(d, { id: opts.ignoreId ?? '', resourceId: r.id, ...range }).length);
  return opts.ev ? [...free.filter(r => r.ev), ...free.filter(r => !r.ev)] : free;
}

/** Ist die Masseurin während der ganzen Behandlung anwesend? */
export function presentFor(d: VenueData, resourceId: string, b: Pick<Booking, 'starts' | 'ends'>): boolean {
  const date = b.starts.slice(0, 10);
  const p = d.presence.find(x => x.resourceId === resourceId && x.date === date);
  return !!p && p.start <= b.starts.slice(11) && b.ends.slice(11) <= p.end;
}

/** Hotelgäste, die im Zeitraum im Haus sind (Anreise bis Abreise), nach Zimmernummer */
export function staysBetween(d: VenueData, from: string, to = from): Stay[] {
  return d.stays.filter(s => s.arrival <= to && s.departure >= from)
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo, 'de', { numeric: true }));
}
export const stayLabel = (s: Pick<Stay, 'roomNo' | 'name'> | undefined) => (s ? `Zi. ${s.roomNo} · ${s.name}` : '—');

/** Hinweise vor dem Speichern (kein Abbruch): Gast nicht im Haus, kein Ladeplatz, Masseurin nicht anwesend */
export function bookingWarnings(d: VenueData, b: Booking): string[] {
  const out: string[] = [];
  const stay = byId(d.stays, b.stayId);
  const from = b.starts.slice(0, 10), to = b.module === 'garage' ? garageDays(b).to : from;
  if (stay && (stay.arrival > from || stay.departure < to)) out.push(`Der Gast ist nur vom ${fmtDay(stay.arrival)} bis ${fmtDay(stay.departure)} im Haus.`);
  const res = byId(d.hotelResources, b.resourceId);
  if (b.module === 'garage' && b.ev && res && !res.ev) out.push(`${res.name} ist kein Ladeplatz.`);
  if (b.module === 'massage' && !presentFor(d, b.resourceId, b)) out.push(`${res?.name ?? 'Die Masseurin'} ist zu dieser Zeit nicht eingetragen.`);
  return out;
}

export const fmtDay = fmtShort;

/* ---------- Raster für die Belegungspläne ---------- */
export interface GridCol { key: string; starts: string; ends: string; label: string; /** Beschriftung in der Kopfzeile (sonst leer) */ head: boolean; day: string; /** Bezeichnung für Screenreader */ aria: string }

/** Garage: n Nächte ab Datum */
export const garageCols = (from: string, n = 14): GridCol[] => Array.from({ length: n }, (_, i) => {
  const day = addDays(from, i);
  return { key: day, starts: `${day}T12:00`, ends: `${addDays(day, 1)}T12:00`, label: fmtDay(day), head: true, day, aria: fmtDay(day) };
});
/** Fahrrad: 7 Tage je Vormittag + Nachmittag */
export const bikeCols = (from: string, n = 7): GridCol[] => Array.from({ length: n }, (_, i) => addDays(from, i)).flatMap(day => (['vm', 'nm'] as const).map(p => ({
  key: `${day}-${p}`, ...bikeRange(day, p), label: p === 'vm' ? fmtDay(day) : '', head: p === 'vm', day, aria: `${fmtDay(day)} ${BIKE_PARTS[p].label}`
})));
/** Massage: Viertelstunden von–bis (HH:MM) eines Tages */
export const massageCols = (day: string, from = '08:00', to = '21:00'): GridCol[] => {
  const out: GridCol[] = [];
  for (let m = toMin(from); m < toMin(to); m += 15)
    out.push({ key: fromMin(m), starts: `${day}T${fromMin(m)}`, ends: `${day}T${fromMin(m + 15)}`, label: m % 60 ? '' : fromMin(m).slice(0, 2), head: m % 60 === 0, day, aria: fromMin(m) });
  return out;
};
/** Spalten (erste, Anzahl), die eine Buchung im Raster belegt; null = außerhalb */
export function spanOf(cols: GridCol[], b: Pick<Booking, 'starts' | 'ends'>): { first: number; n: number } | null {
  const idx = cols.map((c, i) => (overlaps(c, b) ? i : -1)).filter(i => i >= 0);
  return idx.length ? { first: idx[0], n: idx[idx.length - 1] - idx[0] + 1 } : null;
}

/** Montag der Woche */
export function weekMonday(date: string): string {
  const wd = (new Date(date + 'T12:00:00').getDay() + 6) % 7;
  return addDays(date, -wd);
}
