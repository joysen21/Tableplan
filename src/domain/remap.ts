/** Vergibt neue IDs für einen kompletten Datenstand (z. B. beim Einspielen einer Sicherung in einen anderen Betrieb) */
import { newQrToken } from './guestMenu';
import type { VenueData } from './types';

export function remapIds(d: VenueData, newId: () => string): VenueData {
  const map = new Map<string, string>();
  const m = (id: string | null | undefined) => { if (!id) return id ?? null; if (!map.has(id)) map.set(id, newId()); return map.get(id)!; };
  const mm = (ids: string[]) => ids.map(x => m(x)!);
  return {
    venue: d.venue,
    rooms: d.rooms.map(x => ({ ...x, id: m(x.id)! })),
    stations: d.stations.map(x => ({ ...x, id: m(x.id)! })),
    services: d.services.map(x => ({ ...x, id: m(x.id)! })),
    // neuer QR-Schlüssel je Tisch (muss in der Datenbank eindeutig sein; alte QR-Codes gehören zum alten Betrieb)
    tables: d.tables.map(x => ({ ...x, id: m(x.id)!, roomId: m(x.roomId)!, stationId: m(x.stationId), qrToken: newQrToken() })),
    decor: d.decor.map(x => ({ ...x, id: m(x.id)!, roomId: m(x.roomId)! })),
    combos: d.combos.map(x => ({ ...x, id: m(x.id)!, tableIds: mm(x.tableIds) })),
    layouts: d.layouts.map(x => ({ ...x, id: m(x.id)!, roomId: m(x.roomId)!, positions: Object.fromEntries(Object.entries(x.positions).map(([k, v]) => [m(k)!, v])) })),
    blocks: d.blocks.map(x => ({ ...x, id: m(x.id)!, tableId: m(x.tableId)!, serviceId: m(x.serviceId) })),
    stays: d.stays.map(x => ({ ...x, id: m(x.id)!, tableIds: mm(x.tableIds) })),
    reservations: d.reservations.map(x => ({ ...x, id: m(x.id)!, serviceId: m(x.serviceId)!, stayId: m(x.stayId), seriesId: x.seriesId ? m(x.seriesId) : null, tableIds: mm(x.tableIds) })),
    audit: [],
    ingredients: (d.ingredients ?? []).map(x => ({ ...x, id: m(x.id)! })),
    dishes: (d.dishes ?? []).map(x => ({ ...x, id: m(x.id)!, ingredients: x.ingredients.map(l => ({ ...l, ingredientId: m(l.ingredientId)! })) })),
    menus: (d.menus ?? []).map(x => ({ ...x, id: m(x.id)!, serviceId: m(x.serviceId)!, items: x.items.map(i => ({ ...i, dishId: m(i.dishId)! })) })),
    menuChoices: [], // Gäste-Auswahl wird nicht übernommen
    passCalls: [],
    hotelResources: (d.hotelResources ?? []).map(x => ({ ...x, id: m(x.id)! })),
    therapies: (d.therapies ?? []).map(x => ({ ...x, id: m(x.id)! })),
    presence: (d.presence ?? []).map(x => ({ ...x, id: m(x.id)!, resourceId: m(x.resourceId)! })),
    bookings: (d.bookings ?? []).map(x => ({ ...x, id: m(x.id)!, resourceId: m(x.resourceId)!, stayId: m(x.stayId)!, therapyId: m(x.therapyId) })),
    // Bereichsleitungen sind Benutzer des alten Betriebs → im neuen Betrieb neu zuweisen
    departments: (d.departments ?? []).map(x => ({ ...x, id: m(x.id)!, leadIds: [] })),
    shifts: (d.shifts ?? []).map(x => ({ ...x, id: m(x.id)!, departmentId: m(x.departmentId)!, staffId: m(x.staffId), positionId: m(x.positionId), templateId: m(x.templateId) })),
    absences: (d.absences ?? []).map(x => ({ ...x, id: m(x.id)!, staffId: m(x.staffId)! })),
    publications: (d.publications ?? []).map(x => ({ ...x, id: m(x.id)!, departmentId: m(x.departmentId)! })),
    positions: (d.positions ?? []).map(x => ({ ...x, id: m(x.id)!, departmentId: m(x.departmentId)! })),
    // neue Links: die alten gehören zum anderen Betrieb
    staff: (d.staff ?? []).map(x => ({ ...x, id: m(x.id)!, departmentId: m(x.departmentId), positionIds: mm(x.positionIds), shareToken: newId() })),
    shiftTemplates: (d.shiftTemplates ?? []).map(x => ({ ...x, id: m(x.id)!, departmentId: m(x.departmentId)!, positionId: m(x.positionId) })),
    suppliers: (d.suppliers ?? []).map(x => ({ ...x, id: m(x.id)! })),
    supplierProducts: (d.supplierProducts ?? []).map(x => ({ ...x, id: m(x.id)!, supplierId: m(x.supplierId)! })),
    supplierOrders: (d.supplierOrders ?? []).map(x => ({ ...x, id: m(x.id)!, supplierId: m(x.supplierId)!, items: x.items.map(i => ({ ...i, productId: m(i.productId)! })) }))
  };
}
