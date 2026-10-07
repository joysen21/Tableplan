/** Vergibt neue IDs für einen kompletten Datenstand (z. B. beim Einspielen einer Sicherung in einen anderen Betrieb) */
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
    tables: d.tables.map(x => ({ ...x, id: m(x.id)!, roomId: m(x.roomId)!, stationId: m(x.stationId) })),
    decor: d.decor.map(x => ({ ...x, id: m(x.id)!, roomId: m(x.roomId)! })),
    combos: d.combos.map(x => ({ ...x, id: m(x.id)!, tableIds: mm(x.tableIds) })),
    layouts: d.layouts.map(x => ({ ...x, id: m(x.id)!, roomId: m(x.roomId)!, positions: Object.fromEntries(Object.entries(x.positions).map(([k, v]) => [m(k)!, v])) })),
    blocks: d.blocks.map(x => ({ ...x, id: m(x.id)!, tableId: m(x.tableId)!, serviceId: m(x.serviceId) })),
    stays: d.stays.map(x => ({ ...x, id: m(x.id)!, tableIds: mm(x.tableIds) })),
    reservations: d.reservations.map(x => ({ ...x, id: m(x.id)!, serviceId: m(x.serviceId)!, stayId: m(x.stayId), seriesId: x.seriesId ? m(x.seriesId) : null, tableIds: mm(x.tableIds) })),
    audit: [],
    ingredients: (d.ingredients ?? []).map(x => ({ ...x, id: m(x.id)! })),
    dishes: (d.dishes ?? []).map(x => ({ ...x, id: m(x.id)!, ingredients: x.ingredients.map(l => ({ ...l, ingredientId: m(l.ingredientId)! })) })),
    menus: (d.menus ?? []).map(x => ({ ...x, id: m(x.id)!, serviceId: m(x.serviceId)!, items: x.items.map(i => ({ ...i, dishId: m(i.dishId)! })) }))
  };
}
