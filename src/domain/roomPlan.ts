/** Raumplan exportieren / in einen (anderen) Betrieb importieren: Räume, Tische, Deko, Reviere, Kombinationen, Layout-Varianten */
import type { Decor, DiningTable, Layout, Room, Station, TableCombo, VenueData } from './types';

export const ROOM_PLAN_FORMAT = 'tischplan-raumplan';

export interface RoomPlanFile {
  format: typeof ROOM_PLAN_FORMAT; version: 1; exportedAt: string; venueName: string;
  rooms: Room[]; tables: Omit<DiningTable, 'qrToken'>[]; decor: Decor[]; stations: Station[]; combos: TableCombo[]; layouts: Layout[];
}

export function exportRoomPlan(d: VenueData, now = new Date()): RoomPlanFile {
  const tableIds = new Set(d.tables.map(t => t.id));
  return {
    format: ROOM_PLAN_FORMAT, version: 1, exportedAt: now.toISOString(), venueName: d.venue.name,
    rooms: d.rooms, decor: d.decor, layouts: d.layouts,
    // QR-Schlüssel gehören zum Betrieb und bleiben draußen
    tables: d.tables.map(({ qrToken: _q, ...t }) => t),
    stations: d.stations.filter(s => d.tables.some(t => t.stationId === s.id)),
    combos: d.combos.filter(c => c.tableIds.length && c.tableIds.every(id => tableIds.has(id))),
  };
}

/** Datei prüfen; wirft mit verständlicher Meldung */
export function parseRoomPlan(text: string): RoomPlanFile {
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (j?.format === 'tischplan' && j.data?.rooms) throw new Error('Das ist eine Gesamtsicherung – bitte unter „Daten & Sicherung“ → „Sicherung importieren“ einspielen.');
  if (j?.format !== ROOM_PLAN_FORMAT || !Array.isArray(j.rooms) || !Array.isArray(j.tables)) throw new Error('Keine gültige Raumplan-Datei.');
  if (!j.rooms.length) throw new Error('Die Datei enthält keine Räume.');
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  return { ...j, decor: arr(j.decor), stations: arr(j.stations), combos: arr(j.combos), layouts: arr(j.layouts) };
}

export type ImportChoice = 'neu' | 'ersetzen';
export interface ImportRow { room: Room; tables: number; existing: Room | null; future: number }

/** Reservierungen / Aufenthalte ab heute auf Tischen eines Raums */
export function futureBookings(d: VenueData, roomId: string, today: string): number {
  const ids = new Set(d.tables.filter(t => t.roomId === roomId).map(t => t.id));
  const hit = (tids: string[]) => tids.some(id => ids.has(id));
  return d.reservations.filter(r => r.date >= today && r.status !== 'storniert' && r.status !== 'noshow' && hit(r.tableIds)).length
    + d.stays.filter(s => s.departure >= today && hit(s.tableIds)).length;
}

/** Übersicht für den Import-Dialog: je Raum der Datei, ob es ihn schon gibt und ob Ersetzen gesperrt ist */
export function importRows(d: VenueData, plan: RoomPlanFile, today: string): ImportRow[] {
  return [...plan.rooms].sort((a, b) => a.sort - b.sort).map(room => {
    const existing = d.rooms.find(r => r.name.trim().toLowerCase() === room.name.trim().toLowerCase()) ?? null;
    return { room, tables: plan.tables.filter(t => t.roomId === room.id).length, existing, future: existing ? futureBookings(d, existing.id, today) : 0 };
  });
}

function freeName(name: string, taken: Set<string>) {
  let n = 2; while (taken.has(`${name} (${n})`.toLowerCase())) n++;
  return `${name} (${n})`;
}

export interface ImportResult {
  upsert: { stations: Station[]; rooms: Room[]; tables: DiningTable[]; decor: Decor[]; layouts: Layout[]; combos: TableCombo[] };
  remove: { tables: string[]; decor: string[]; layouts: string[]; combos: string[] };
  summary: { added: string[]; replaced: string[] };
}

/**
 * Baut die Schreiboperationen. „neu“ legt den Raum (bei gleichem Namen mit „(2)“) neu an,
 * „ersetzen“ behält den bestehenden Raum und gleichnamige Tische (ihre IDs, QR-Codes und Reservierungs-Historie),
 * übernimmt Lage/Größe aus der Datei, löscht übrige Tische und ersetzt Deko, Layout-Varianten und Kombinationen.
 * Reviere werden über den Namen zugeordnet, fehlende angelegt.
 */
export function buildImport(d: VenueData, plan: RoomPlanFile, choice: Record<string, ImportChoice>, today: string, newId: () => string, newQr: () => string): ImportResult {
  const res: ImportResult = { upsert: { stations: [], rooms: [], tables: [], decor: [], layouts: [], combos: [] }, remove: { tables: [], decor: [], layouts: [], combos: [] }, summary: { added: [], replaced: [] } };
  const ids = new Map<string, string>();
  const stationOf = new Map<string, string>();
  const stationName = (n: string) => n.trim().toLowerCase();
  const allStations = [...d.stations];
  for (const s of plan.stations) {
    const hit = allStations.find(x => stationName(x.name) === stationName(s.name));
    if (hit) stationOf.set(s.id, hit.id);
    else { const ns = { ...s, id: newId() }; allStations.push(ns); res.upsert.stations.push(ns); stationOf.set(s.id, ns.id); }
  }
  const taken = new Set(d.rooms.map(r => r.name.trim().toLowerCase()));
  let sort = Math.max(-1, ...d.rooms.map(r => r.sort)) + 1;
  for (const row of importRows(d, plan, today)) {
    const src = row.room;
    const replace = choice[src.id] === 'ersetzen' && row.existing && row.future === 0;
    const fileTables = plan.tables.filter(t => t.roomId === src.id);
    let roomId: string;
    if (replace && row.existing) {
      roomId = row.existing.id;
      res.upsert.rooms.push({ ...src, id: roomId, name: row.existing.name, sort: row.existing.sort });
      const old = d.tables.filter(t => t.roomId === roomId);
      for (const t of fileTables) {
        const same = old.find(o => o.name.trim().toLowerCase() === t.name.trim().toLowerCase());
        ids.set(t.id, same?.id ?? newId());
      }
      const keep = new Set(fileTables.map(t => ids.get(t.id)));
      res.remove.tables.push(...old.filter(o => !keep.has(o.id)).map(o => o.id));
      res.remove.decor.push(...d.decor.filter(x => x.roomId === roomId).map(x => x.id));
      res.remove.layouts.push(...d.layouts.filter(x => x.roomId === roomId).map(x => x.id));
      const oldIds = new Set(old.map(o => o.id));
      res.remove.combos.push(...d.combos.filter(c => c.tableIds.some(id => oldIds.has(id))).map(c => c.id));
      res.summary.replaced.push(row.existing.name);
    } else {
      roomId = newId();
      const name = row.existing || taken.has(src.name.trim().toLowerCase()) ? freeName(src.name, taken) : src.name;
      taken.add(name.toLowerCase());
      res.upsert.rooms.push({ ...src, id: roomId, name, sort: sort++ });
      for (const t of fileTables) ids.set(t.id, newId());
      res.summary.added.push(name);
    }
    ids.set(src.id, roomId);
    const qrOf = new Map(d.tables.map(t => [t.id, t.qrToken]));
    for (const t of fileTables) {
      const id = ids.get(t.id)!;
      res.upsert.tables.push({ ...t, id, roomId, stationId: t.stationId ? stationOf.get(t.stationId) ?? null : null, qrToken: qrOf.get(id) ?? newQr() });
    }
    res.upsert.decor.push(...plan.decor.filter(x => x.roomId === src.id).map(x => ({ ...x, id: newId(), roomId })));
    res.upsert.layouts.push(...plan.layouts.filter(x => x.roomId === src.id).map(x => ({
      ...x, id: newId(), roomId,
      positions: Object.fromEntries(Object.entries(x.positions).filter(([k]) => ids.has(k)).map(([k, v]) => [ids.get(k)!, v])),
    })));
  }
  const imported = new Set(plan.rooms.map(r => r.id));
  const tableRoom = new Map(plan.tables.map(t => [t.id, t.roomId]));
  res.upsert.combos = plan.combos
    .filter(c => c.tableIds.length && c.tableIds.every(id => ids.has(id) && imported.has(tableRoom.get(id)!)))
    .map(c => ({ ...c, id: newId(), tableIds: c.tableIds.map(id => ids.get(id)!) }));
  res.remove.tables = res.remove.tables.filter(id => !res.upsert.tables.some(t => t.id === id));
  return res;
}
