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
