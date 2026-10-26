/** Umwandlung Datenbankzeile (snake_case) ↔ Fachobjekt (camelCase) */
import type {
  Absence, AuditEntry, Decor, Department, DiningTable, Dish, Ingredient, Layout, Member, Menu, MenuChoice, PassCall, DueGroup, DueItem, HotelResource, Therapy, Presence, Booking, Position, Publication, Reservation, Room, Service, Shift,
  ShiftTemplate, Staff, Station, Stay, Supplier, SupplierOrder, SupplierProduct, TableBlock, TableCombo
} from '../domain/types';
import type { EntityKey, EntityMap } from './repo';
import { hhmm } from '../lib/time';

type Row = Record<string, any>;

export const TABLE_OF: Record<EntityKey | 'stays' | 'reservations' | 'reservation_tables' | 'audit', string> = {
  rooms: 'rooms', stations: 'stations', tables: 'dining_tables', decor: 'decor', combos: 'table_combos', layouts: 'layouts',
  services: 'services', blocks: 'table_blocks', ingredients: 'ingredients', dishes: 'dishes', menus: 'menus', menuChoices: 'menu_choices',
  departments: 'departments', positions: 'positions', staff: 'staff', shiftTemplates: 'shift_templates',
  shifts: 'shifts', absences: 'absences', publications: 'roster_publications',
  suppliers: 'order_suppliers', supplierProducts: 'order_products', supplierOrders: 'supplier_orders', passCalls: 'pass_calls', hotelResources: 'hotel_resources', therapies: 'massage_therapies', presence: 'resource_presence', bookings: 'resource_bookings', dueGroups: 'due_groups', dueItems: 'due_items', stays: 'stays', reservations: 'reservations', reservation_tables: 'reservation_tables', audit: 'audit_log'
};
export const KIND_OF: Record<string, keyof typeof TABLE_OF> =
  Object.fromEntries(Object.entries(TABLE_OF).map(([k, v]) => [v, k as keyof typeof TABLE_OF]));

export const fromDb = {
  rooms: (r: Row): Room => ({ id: r.id, name: r.name, width: r.width, height: r.height, backgroundUrl: r.background_url ?? null, sort: r.sort ?? 0 }),
  stations: (r: Row): Station => ({ id: r.id, name: r.name, color: r.color }),
  tables: (r: Row): DiningTable => ({
    id: r.id, roomId: r.room_id, name: r.name, shape: r.shape, x: +r.x, y: +r.y, width: +r.width, height: +r.height, rotation: +r.rotation || 0,
    minPersons: r.min_persons, maxPersons: r.max_persons, stationId: r.station_id ?? null, features: r.features ?? [], chairs: r.show_chairs ?? true, qrToken: r.qr_token ?? undefined
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
    board: r.board, phone: r.phone ?? '', allergies: r.allergies ?? '', allergens: r.allergens ?? [], notes: r.notes ?? '', vip: !!r.vip, times: r.times ?? {}, tableIds: r.table_ids ?? [],
    externalId: r.external_id ?? null
  }),
  reservation: (r: Row): Reservation => ({
    id: r.id, date: r.date, serviceId: r.service_id, time: hhmm(r.time), duration: r.duration, adults: r.adults, children: r.children,
    name: r.name, phone: r.phone ?? '', email: r.email ?? '', occasion: r.occasion ?? '', allergies: r.allergies ?? '', allergens: r.allergens ?? [], notes: r.notes ?? '',
    highchair: !!r.highchair, vip: !!r.vip, source: r.source ?? '', status: r.status, subStatus: r.sub_status ?? null, wishes: r.wishes ?? [], stayId: r.stay_id ?? null,
    manualTable: !!r.manual_table, seriesId: r.series_id ?? null, seatedAt: r.seated_at ?? null, finishedAt: r.finished_at ?? null,
    tableIds: Array.isArray(r.table_ids) ? r.table_ids : Array.isArray(r.reservation_tables) ? r.reservation_tables.map((x: Row) => x.table_id) : [],
    updatedAt: r.updated_at
  }),
  ingredients: (r: Row): Ingredient => ({ id: r.id, name: r.name, unit: r.unit, allergens: r.allergens ?? [], traces: r.traces ?? [] }),
  dishes: (r: Row): Dish => ({
    id: r.id, name: r.name, nameIt: r.name_it ?? '', nameEn: r.name_en ?? '', course: r.course, diet: r.diet ?? [], notes: r.notes ?? '',
    ingredients: (r.ingredients ?? []).map((l: Row) => ({ ingredientId: l.ingredientId, qty: +l.qty || 0 }))
  }),
  menus: (r: Row): Menu => ({
    id: r.id, date: r.date, serviceId: r.service_id, portions: r.portions ?? null, bufferPct: r.buffer_pct ?? 0, notes: r.notes ?? '',
    items: (r.items ?? []).map((i: Row) => ({ course: i.course, dishId: i.dishId, share: i.share ?? null, name: i.name ?? '', allergens: i.allergens ?? [] })),
    ordering: r.ordering ?? 'aus'
  }),
  menuChoices: (r: Row): MenuChoice => ({ id: r.id, menuId: r.menu_id, stayId: r.stay_id ?? null, reservationId: r.reservation_id ?? null, counts: r.counts ?? {}, note: r.note ?? '', updatedAt: r.updated_at }),
  departments: (r: Row): Department => ({
    id: r.id, name: r.name, color: r.color ?? '#4F7BD1', sort: r.sort ?? 0, leadIds: r.lead_ids ?? [], guestsPerStaff: r.guests_per_staff ?? null, minStaff: r.min_staff ?? 0,
    icon: r.icon ?? null
  }),
  positions: (r: Row): Position => ({ id: r.id, departmentId: r.department_id, name: r.name, sort: r.sort ?? 0 }),
  staff: (r: Row): Staff => ({
    id: r.id, name: r.name, short: r.short ?? '', departmentId: r.department_id ?? null, positionIds: r.position_ids ?? [], contract: r.contract,
    weeklyHours: +r.weekly_hours || 0, contractFrom: r.contract_from ?? null, contractTo: r.contract_to ?? null, phone: r.phone ?? '', email: r.email ?? '',
    color: r.color ?? '#4F7BD1', notes: r.notes ?? '', active: r.active !== false, vacationDays: +r.vacation_days || 0, shareToken: r.share_token ?? ''
  }),
  shifts: (r: Row): Shift => ({
    id: r.id, departmentId: r.department_id, staffId: r.staff_id ?? null, positionId: r.position_id ?? null, templateId: r.template_id ?? null, date: r.date,
    start: hhmm(r.start_time), end: hhmm(r.end_time), start2: r.start2 ? hhmm(r.start2) : null, end2: r.end2 ? hhmm(r.end2) : null,
    breakMin: r.break_min ?? 0, note: r.note ?? '', updatedAt: r.updated_at
  }),
  absences: (r: Row): Absence => ({ id: r.id, staffId: r.staff_id, from: r.date_from, to: r.date_to, kind: r.kind, note: r.note ?? '' }),
  suppliers: (r: Row): Supplier => ({ id: r.id, name: r.name, phone: r.phone ?? '', sort: r.sort ?? 0 }),
  supplierProducts: (r: Row): SupplierProduct => ({ id: r.id, supplierId: r.supplier_id, name: r.name, unit: r.unit ?? '', group: r.grp ?? '', sort: r.sort ?? 0, active: r.active !== false }),
  supplierOrders: (r: Row): SupplierOrder => ({ id: r.id, supplierId: r.supplier_id, createdAt: r.created_at, createdBy: r.created_by ?? '', items: r.items ?? [], note: r.note ?? '' }),
  passCalls: (r: Row): PassCall => ({ id: r.id, reservationId: r.reservation_id, menuId: r.menu_id, course: r.course, counts: r.counts ?? {}, cancelled: r.cancelled ?? {},
    state: r.state, calledBy: r.called_by ?? '', calledByName: r.called_by_name ?? '', calledAt: r.called_at, readyAt: r.ready_at ?? null, servedAt: r.served_at ?? null, updatedAt: r.updated_at }),
  hotelResources: (r: Row): HotelResource => ({ id: r.id, module: r.module, name: r.name, sort: r.sort ?? 0, active: r.active !== false, ev: !!r.ev, art: r.art ?? '', size: r.size ?? '' }),
  therapies: (r: Row): Therapy => ({ id: r.id, name: r.name, duration: r.duration ?? 50, price: Number(r.price ?? 0), sort: r.sort ?? 0, active: r.active !== false }),
  presence: (r: Row): Presence => ({ id: r.id, resourceId: r.resource_id, date: r.date, start: hhmm(r.start_time), end: hhmm(r.end_time) }),
  bookings: (r: Row): Booking => ({ id: r.id, module: r.module, resourceId: r.resource_id, stayId: r.stay_id, starts: String(r.starts).slice(0, 16), ends: String(r.ends).slice(0, 16),
    therapyId: r.therapy_id ?? null, plate: r.plate ?? '', ev: !!r.ev, part: r.part ?? null, price: r.price == null ? null : Number(r.price), note: r.note ?? '', createdBy: r.created_by ?? '', updatedAt: r.updated_at }),
  dueGroups: (r: Row): DueGroup => ({ id: r.id, name: r.name, sort: r.sort ?? 0 }),
  dueItems: (r: Row): DueItem => ({ id: r.id, title: r.title, groupId: r.group_id ?? null, dueDate: r.due_date, intervalMonths: r.interval_months ?? 0,
    staffId: r.staff_id ?? null, staffName: r.staff_name ?? '', reminderDays: r.reminder_days ?? 14, done: !!r.done, doneAt: r.done_at ?? null, lastDone: r.last_done ?? null, note: r.note ?? '', updatedAt: r.updated_at }),
  publications: (r: Row): Publication => ({ id: r.id, departmentId: r.department_id, weekStart: r.week_start, publishedAt: r.published_at, publishedBy: r.published_by ?? '' }),
  shiftTemplates: (r: Row): ShiftTemplate => ({
    id: r.id, departmentId: r.department_id, positionId: r.position_id ?? null, name: r.name, short: r.short ?? '', start: hhmm(r.start_time), end: hhmm(r.end_time),
    start2: r.start2 ? hhmm(r.start2) : null, end2: r.end2 ? hhmm(r.end2) : null, breakMin: r.break_min ?? 0, color: r.color ?? '#4F7BD1', sort: r.sort ?? 0
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
    min_persons: x.minPersons, max_persons: x.maxPersons, station_id: x.stationId, features: x.features, show_chairs: x.chairs !== false,
    ...(x.qrToken ? { qr_token: x.qrToken } : {})
  }),
  decor: (x: Decor, v: string) => ({ id: x.id, venue_id: v, room_id: x.roomId, kind: x.kind, x: x.x, y: x.y, width: x.width, height: x.height, rotation: x.rotation, label: x.label }),
  combos: (x: TableCombo, v: string) => ({ id: x.id, venue_id: v, name: x.name, table_ids: x.tableIds }),
  layouts: (x: Layout, v: string) => ({ id: x.id, venue_id: v, room_id: x.roomId, name: x.name, positions: x.positions }),
  services: (x: Service, v: string) => ({
    id: x.id, venue_id: v, name: x.name, kind: x.kind, start_time: x.start, end_time: x.end, hotel_time: x.hotelTime || null,
    free_seating: x.freeSeating, pacing: x.pacing, turn_times: x.turnTimes, seatings: x.seatings, sort: x.sort
  }),
  blocks: (x: TableBlock, v: string) => ({ id: x.id, venue_id: v, table_id: x.tableId, date: x.date, service_id: x.serviceId, reason: x.reason }),
  ingredients: (x: Ingredient, v: string) => ({ id: x.id, venue_id: v, name: x.name, unit: x.unit, allergens: x.allergens, traces: x.traces }),
  dishes: (x: Dish, v: string) => ({
    id: x.id, venue_id: v, name: x.name, name_it: x.nameIt, name_en: x.nameEn, course: x.course, diet: x.diet, notes: x.notes, ingredients: x.ingredients
  }),
  menus: (x: Menu, v: string) => ({
    id: x.id, venue_id: v, date: x.date, service_id: x.serviceId, portions: x.portions, buffer_pct: x.bufferPct, notes: x.notes, items: x.items, ordering: x.ordering ?? 'aus'
  }),
  menuChoices: (x: MenuChoice, v: string) => ({ id: x.id, venue_id: v, menu_id: x.menuId, stay_id: x.stayId ?? null, counts: x.counts, note: (x.note ?? '').trim(),
    ...(x.reservationId ? { reservation_id: x.reservationId } : {}) }),
  departments: (x: Department, v: string) => ({
    id: x.id, venue_id: v, name: x.name, color: x.color, sort: x.sort, lead_ids: x.leadIds, guests_per_staff: x.guestsPerStaff || null, min_staff: x.minStaff || 0,
    icon: x.icon ?? null
  }),
  positions: (x: Position, v: string) => ({ id: x.id, venue_id: v, department_id: x.departmentId, name: x.name, sort: x.sort }),
  staff: (x: Staff, v: string) => ({
    id: x.id, venue_id: v, name: x.name, short: x.short, department_id: x.departmentId, position_ids: x.positionIds, contract: x.contract,
    weekly_hours: x.weeklyHours, contract_from: x.contractFrom || null, contract_to: x.contractTo || null, phone: x.phone, email: x.email,
    color: x.color, notes: x.notes, active: x.active, vacation_days: x.vacationDays || 0, share_token: x.shareToken
  }),
  shifts: (x: Shift, v: string) => ({
    id: x.id, venue_id: v, department_id: x.departmentId, staff_id: x.staffId, position_id: x.positionId, template_id: x.templateId, date: x.date,
    start_time: x.start, end_time: x.end, start2: x.start2 || null, end2: x.end2 || null, break_min: x.breakMin, note: x.note
  }),
  absences: (x: Absence, v: string) => ({ id: x.id, venue_id: v, staff_id: x.staffId, date_from: x.from, date_to: x.to, kind: x.kind, note: x.note }),
  // published_at setzt der Server (Trigger)
  suppliers: (x: Supplier, v: string) => ({ id: x.id, venue_id: v, name: x.name.trim(), phone: x.phone.trim(), sort: x.sort }),
  supplierProducts: (x: SupplierProduct, v: string) => ({ id: x.id, venue_id: v, supplier_id: x.supplierId, name: x.name.trim(), unit: x.unit, grp: x.group, sort: x.sort, active: x.active }),
  supplierOrders: (x: SupplierOrder, v: string) => ({ id: x.id, venue_id: v, supplier_id: x.supplierId, created_at: x.createdAt, created_by: x.createdBy, items: x.items, note: x.note }),
  passCalls: (x: PassCall, v: string) => ({ id: x.id, venue_id: v, reservation_id: x.reservationId, menu_id: x.menuId, course: x.course, counts: x.counts, cancelled: x.cancelled,
    state: x.state, called_by: x.calledBy, called_by_name: x.calledByName, called_at: x.calledAt, ready_at: x.readyAt, served_at: x.servedAt }),
  hotelResources: (x: HotelResource, v: string) => ({ id: x.id, venue_id: v, module: x.module, name: x.name.trim(), sort: x.sort, active: x.active, ev: x.ev, art: x.art, size: x.size }),
  therapies: (x: Therapy, v: string) => ({ id: x.id, venue_id: v, name: x.name.trim(), duration: x.duration, price: x.price, sort: x.sort, active: x.active }),
  presence: (x: Presence, v: string) => ({ id: x.id, venue_id: v, resource_id: x.resourceId, date: x.date, start_time: x.start, end_time: x.end }),
  bookings: (x: Booking, v: string) => ({ id: x.id, venue_id: v, module: x.module, resource_id: x.resourceId, stay_id: x.stayId, starts: x.starts, ends: x.ends,
    therapy_id: x.therapyId, plate: x.plate.trim(), ev: x.ev, part: x.part, price: x.price, note: x.note, created_by: x.createdBy }),
  dueGroups: (x: DueGroup, v: string) => ({ id: x.id, venue_id: v, name: x.name.trim(), sort: x.sort }),
  dueItems: (x: DueItem, v: string) => ({ id: x.id, venue_id: v, title: x.title.trim(), group_id: x.groupId, due_date: x.dueDate, interval_months: x.intervalMonths,
    staff_id: x.staffId, staff_name: x.staffName, reminder_days: x.reminderDays, done: x.done, done_at: x.doneAt, last_done: x.lastDone, note: x.note }),
  publications: (x: Publication, v: string) => ({ id: x.id, venue_id: v, department_id: x.departmentId, week_start: x.weekStart, published_by: x.publishedBy }),
  shiftTemplates: (x: ShiftTemplate, v: string) => ({
    id: x.id, venue_id: v, department_id: x.departmentId, position_id: x.positionId, name: x.name, short: x.short, start_time: x.start, end_time: x.end,
    start2: x.start2 || null, end2: x.end2 || null, break_min: x.breakMin, color: x.color, sort: x.sort
  }),
  stays: (x: Stay, v: string) => ({
    id: x.id, venue_id: v, room_no: x.roomNo, name: x.name, adults: x.adults, children: x.children, arrival: x.arrival, departure: x.departure,
    board: x.board, phone: x.phone, allergies: x.allergies, allergens: x.allergens, notes: x.notes, vip: x.vip, times: x.times, table_ids: x.tableIds,
    // nur mitschicken, wenn gesetzt – so klappt das Speichern auch, solange die Migration 20261016000000 fehlt
    ...(x.externalId ? { external_id: x.externalId } : {})
  }),
  reservation: (x: Reservation) => ({
    id: x.id, date: x.date, service_id: x.serviceId, time: x.time, duration: x.duration, adults: x.adults, children: x.children, name: x.name,
    phone: x.phone, email: x.email, occasion: x.occasion, allergies: x.allergies, allergens: x.allergens, notes: x.notes, highchair: x.highchair, vip: x.vip,
    source: x.source, status: x.status, sub_status: x.subStatus ?? null, wishes: x.wishes, stay_id: x.stayId, manual_table: x.manualTable, series_id: x.seriesId,
    seated_at: x.seatedAt, finished_at: x.finishedAt, table_ids: x.tableIds,
    expected_updated_at: x.updatedAt ?? null // Stand beim Bearbeiten → Konfliktprüfung in save_reservations
  })
};

export function entityToDb<K extends EntityKey>(kind: K, x: EntityMap[K], venueId: string): Row {
  return (toDb[kind] as (x: EntityMap[K], v: string) => Row)(x, venueId);
}
