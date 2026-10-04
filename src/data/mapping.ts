/** Umwandlung Datenbankzeile (snake_case) ↔ Fachobjekt (camelCase) */
import type {
  AuditEntry, Decor, DiningTable, Layout, Member, Reservation, Room, Service, Station, Stay, TableBlock, TableCombo
} from '../domain/types';
import type { EntityKey, EntityMap } from './repo';
import { hhmm } from '../lib/time';

type Row = Record<string, any>;

export const TABLE_OF: Record<EntityKey | 'stays' | 'reservations' | 'reservation_tables' | 'audit', string> = {
  rooms: 'rooms', stations: 'stations', tables: 'dining_tables', decor: 'decor', combos: 'table_combos', layouts: 'layouts',
  services: 'services', blocks: 'table_blocks', stays: 'stays', reservations: 'reservations', reservation_tables: 'reservation_tables', audit: 'audit_log'
};
export const KIND_OF: Record<string, keyof typeof TABLE_OF> =
  Object.fromEntries(Object.entries(TABLE_OF).map(([k, v]) => [v, k as keyof typeof TABLE_OF]));

export const fromDb = {
  rooms: (r: Row): Room => ({ id: r.id, name: r.name, width: r.width, height: r.height, backgroundUrl: r.background_url ?? null, sort: r.sort ?? 0 }),
  stations: (r: Row): Station => ({ id: r.id, name: r.name, color: r.color }),
  tables: (r: Row): DiningTable => ({
    id: r.id, roomId: r.room_id, name: r.name, shape: r.shape, x: +r.x, y: +r.y, width: +r.width, height: +r.height, rotation: +r.rotation || 0,
    minPersons: r.min_persons, maxPersons: r.max_persons, stationId: r.station_id ?? null, features: r.features ?? []
  }),
  decor: (r: Row): Decor => ({ id: r.id, roomId: r.room_id, kind: r.kind, x: +r.x, y: +r.y, width: +r.width, height: +r.height, rotation: +r.rotation || 0, label: r.label ?? '' }),
  combos: (r: Row): TableCombo => ({ id: r.id, name: r.name, tableIds: r.table_ids ?? [] }),
  layouts: (r: Row): Layout => ({ id: r.id, roomId: r.room_id, name: r.name, positions: r.positions ?? {} }),
  services: (r: Row): Service => ({
    id: r.id, name: r.name, kind: r.kind, start: hhmm(r.start_time), end: hhmm(r.end_time), hotelTime: r.hotel_time ? hhmm(r.hotel_time) : null,
    freeSeating: !!r.free_seating, pacing: r.pacing ?? 0, turnTimes: r.turn_times ?? [], seatings: r.seatings ?? [], sort: r.sort ?? 0
  }),
  blocks: (r: Row): TableBlock => ({ id: r.id, tableId: r.table_id, date: r.date, serviceId: r.service_id ?? null, reason: r.reason ?? '' }),
  stays: (r: Row): Stay => ({
    id: r.id, roomNo: r.room_no, name: r.name, adults: r.adults, children: r.children, arrival: r.arrival, departure: r.departure,
    board: r.board, phone: r.phone ?? '', allergies: r.allergies ?? '', notes: r.notes ?? '', vip: !!r.vip, times: r.times ?? {}, tableIds: r.table_ids ?? []
  }),
  reservation: (r: Row): Reservation => ({
    id: r.id, date: r.date, serviceId: r.service_id, time: hhmm(r.time), duration: r.duration, adults: r.adults, children: r.children,
    name: r.name, phone: r.phone ?? '', email: r.email ?? '', occasion: r.occasion ?? '', allergies: r.allergies ?? '', notes: r.notes ?? '',
    highchair: !!r.highchair, vip: !!r.vip, source: r.source ?? '', status: r.status, wishes: r.wishes ?? [], stayId: r.stay_id ?? null,
    manualTable: !!r.manual_table, seriesId: r.series_id ?? null, seatedAt: r.seated_at ?? null, finishedAt: r.finished_at ?? null,
    tableIds: Array.isArray(r.table_ids) ? r.table_ids : Array.isArray(r.reservation_tables) ? r.reservation_tables.map((x: Row) => x.table_id) : [],
    updatedAt: r.updated_at
  }),
  audit: (r: Row): AuditEntry => ({ id: String(r.id), ts: r.ts, userName: r.user_name ?? '', action: r.action, details: r.details ?? '' }),
  member: (r: Row): Member => ({ userId: r.user_id, role: r.role, name: r.name ?? '', email: r.email ?? '' })
};

export function entityFromDb<K extends EntityKey>(kind: K, r: Row): EntityMap[K] {
  return (fromDb[kind] as (r: Row) => EntityMap[K])(r);
}

export const toDb = {
  rooms: (x: Room, v: string) => ({ id: x.id, venue_id: v, name: x.name, width: Math.round(x.width), height: Math.round(x.height), background_url: x.backgroundUrl, sort: x.sort }),
  stations: (x: Station, v: string) => ({ id: x.id, venue_id: v, name: x.name, color: x.color }),
  tables: (x: DiningTable, v: string) => ({
    id: x.id, venue_id: v, room_id: x.roomId, name: x.name, shape: x.shape, x: x.x, y: x.y, width: x.width, height: x.height, rotation: x.rotation,
    min_persons: x.minPersons, max_persons: x.maxPersons, station_id: x.stationId, features: x.features
  }),
  decor: (x: Decor, v: string) => ({ id: x.id, venue_id: v, room_id: x.roomId, kind: x.kind, x: x.x, y: x.y, width: x.width, height: x.height, rotation: x.rotation, label: x.label }),
  combos: (x: TableCombo, v: string) => ({ id: x.id, venue_id: v, name: x.name, table_ids: x.tableIds }),
  layouts: (x: Layout, v: string) => ({ id: x.id, venue_id: v, room_id: x.roomId, name: x.name, positions: x.positions }),
  services: (x: Service, v: string) => ({
    id: x.id, venue_id: v, name: x.name, kind: x.kind, start_time: x.start, end_time: x.end, hotel_time: x.hotelTime || null,
    free_seating: x.freeSeating, pacing: x.pacing, turn_times: x.turnTimes, seatings: x.seatings, sort: x.sort
  }),
  blocks: (x: TableBlock, v: string) => ({ id: x.id, venue_id: v, table_id: x.tableId, date: x.date, service_id: x.serviceId, reason: x.reason }),
  stays: (x: Stay, v: string) => ({
    id: x.id, venue_id: v, room_no: x.roomNo, name: x.name, adults: x.adults, children: x.children, arrival: x.arrival, departure: x.departure,
    board: x.board, phone: x.phone, allergies: x.allergies, notes: x.notes, vip: x.vip, times: x.times, table_ids: x.tableIds
  }),
  reservation: (x: Reservation) => ({
    id: x.id, date: x.date, service_id: x.serviceId, time: x.time, duration: x.duration, adults: x.adults, children: x.children, name: x.name,
    phone: x.phone, email: x.email, occasion: x.occasion, allergies: x.allergies, notes: x.notes, highchair: x.highchair, vip: x.vip,
    source: x.source, status: x.status, wishes: x.wishes, stay_id: x.stayId, manual_table: x.manualTable, series_id: x.seriesId,
    seated_at: x.seatedAt, finished_at: x.finishedAt, table_ids: x.tableIds
  })
};

export function entityToDb<K extends EntityKey>(kind: K, x: EntityMap[K], venueId: string): Row {
  return (toDb[kind] as (x: EntityMap[K], v: string) => Row)(x, venueId);
}
