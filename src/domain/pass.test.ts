import { describe, expect, it } from 'vitest';
import { emptyVenueData, newId } from './demo';
import { newQrToken } from './guestMenu';
import { snapshotItems } from './menu';
import { moduleAllowed } from './modules';
import { cancelPortion, chefOverview, newCall, passProgress, tablePass } from './pass';
import type { Dish, Menu, MenuItem, Reservation } from './types';

const DAY = '2026-10-10';
const user = { id: 'u1', name: 'Toni' };

/** Tisch T1 mit externer Reservierung (2 Pers.): Suppe, 2 Hauptgänge, Dessert; Auswahl 2× Suppe, 1× Rind, 1× Fisch, 2× Strudel */
function setup(choice = true) {
  const d = emptyVenueData('v1', 'Hotel Test');
  const svc = d.services.find(s => s.kind === 'abend')!.id;
  const t1 = { id: newId(), roomId: d.rooms[0].id, name: 'T1', shape: 'square' as const, x: 0, y: 0, width: 70, height: 70, rotation: 0, minPersons: 2, maxPersons: 6, stationId: null, features: [], chairs: true, qrToken: newQrToken() };
  d.tables.push(t1);
  const dish = (name: string, course: Dish['course']): Dish => ({ id: newId(), name, nameIt: '', nameEn: '', course, diet: [], notes: '', ingredients: [] });
  const suppe = dish('Suppe', 'suppe'), rind = dish('Rind', 'hauptgang'), fisch = dish('Fisch', 'hauptgang'), strudel = dish('Strudel', 'dessert');
  d.dishes.push(suppe, rind, fisch, strudel);
  const item = (x: Dish): MenuItem => ({ course: x.course, dishId: x.id, share: null, name: '', allergens: [] });
  const menu: Menu = { id: newId(), date: DAY, serviceId: svc, portions: null, bufferPct: 0, notes: '', items: snapshotItems(d, [suppe, rind, fisch, strudel].map(item)) };
  d.menus.push(menu);
  const r: Reservation = {
    id: newId(), date: DAY, serviceId: svc, time: '19:00', duration: 120, adults: 2, children: 0, name: 'Rossi', phone: '', email: '', occasion: '',
    allergies: '', allergens: [], notes: '', highchair: false, vip: false, source: 'Telefon', status: 'platziert', wishes: [], stayId: null, tableIds: [t1.id],
    manualTable: false, seriesId: null, seatedAt: null, finishedAt: null
  };
  d.reservations.push(r);
  if (choice) d.menuChoices.push({ id: newId(), menuId: menu.id, stayId: null, reservationId: r.id, counts: { [suppe.id]: 2, [rind.id]: 1, [fisch.id]: 1, [strudel.id]: 2 } });
  return { d, r, t1, svc, suppe, rind, fisch, strudel };
}

describe('Pass + Chef', () => {
  it('Gang für Gang: abrufen → fertig → serviert → nächster Gang frei', () => {
    const { d, r, t1, svc, suppe, rind } = setup();
    let p = passProgress(d, r);
    expect(p.current?.course).toBe('suppe');
    expect(tablePass(d, t1.id, DAY, svc).look).toBe('wartet');
    const c = newCall(p, r, user, newId)!;
    expect(c.counts).toEqual({ [suppe.id]: 2 });
    d.passCalls.push(c);
    p = passProgress(d, r);
    expect(p.current?.state).toBe('abgerufen');
    expect(tablePass(d, t1.id, DAY, svc).look).toBe('abgerufen');
    expect(chefOverview(d, DAY, svc).active.map(x => x.call.id)).toEqual([c.id]);
    c.state = 'fertig';
    expect(tablePass(d, t1.id, DAY, svc).look).toBe('fertig');
    expect(chefOverview(d, DAY, svc).ready).toHaveLength(1);
    c.state = 'serviert';
    p = passProgress(d, r);
    expect(p.current?.course).toBe('hauptgang');
    // demnächst = nächster Gang nach dem servierten
    const o = chefOverview(d, DAY, svc);
    expect(o.soon[0].lines).toEqual([{ name: 'Rind', n: 1 }, { name: 'Fisch', n: 1 }]);
    expect(o.dishes.find(x => x.dishId === suppe.id)).toMatchObject({ total: 2, served: 2, open: 0 });
    // einzelnes Gericht abrufen
    const one = newCall(p, r, user, newId, rind.id)!;
    expect(one.counts).toEqual({ [rind.id]: 1 });
  });

  it('Storno abgerufener Portionen: Küche sieht sie, Gesamtmenge sinkt', () => {
    const { d, r, svc, suppe } = setup();
    const c = newCall(passProgress(d, r), r, user, newId)!;
    const s = cancelPortion(c, suppe.id)!;
    d.passCalls.push(s);
    const o = chefOverview(d, DAY, svc);
    expect(o.active[0].lines[0]).toMatchObject({ n: 2, cancelled: 1 });
    expect(o.dishes.find(x => x.dishId === suppe.id)).toMatchObject({ total: 1, inKitchen: 1 });
    // ganz storniert → Gang erledigt
    d.passCalls[0] = cancelPortion(s, suppe.id)!;
    expect(cancelPortion(d.passCalls[0], suppe.id)).toBeNull();
    expect(passProgress(d, r).current?.course).toBe('hauptgang');
  });

  it('ohne Menüauswahl: Tisch „ohne“, nichts abrufbar', () => {
    const { d, r, t1, svc } = setup(false);
    expect(tablePass(d, t1.id, DAY, svc).look).toBe('ohne');
    expect(newCall(passProgress(d, r), r, user, newId)).toBeNull();
  });

  it('Sichtbarkeit: Standard Service + Küche, zuweisbar', () => {
    const v = { modules: ['pass' as const], moduleRoles: undefined };
    expect(moduleAllowed(v, 'pass', 'service')).toBe(true);
    expect(moduleAllowed(v, 'pass', 'empfang')).toBe(false);
    expect(moduleAllowed({ ...v, moduleRoles: { pass: ['empfang'] } }, 'pass', 'service')).toBe(false);
    expect(moduleAllowed({ modules: [], moduleRoles: undefined }, 'pass', 'admin')).toBe(false);
  });
});
