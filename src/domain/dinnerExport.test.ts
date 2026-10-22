import { describe, expect, it } from 'vitest';
import { emptyVenueData, newId } from './demo';
import { dinnerCsv, dinnerExport } from './dinnerExport';
import { newQrToken } from './guestMenu';
import { snapshotItems } from './menu';
import type { Dish, Menu, MenuItem, Reservation, Stay } from './types';
import { addDays } from '../lib/time';

const DAY = '2026-10-10';

describe('Export Abendessen', () => {
  it('je Zimmer Tisch, Gerichte je Gang, Notiz, Allergien; Summen und Zimmer ohne Auswahl', () => {
    const d = emptyVenueData('v1', 'Hotel Test');
    const svc = d.services.find(s => s.kind === 'abend')!.id;
    const t1 = { id: newId(), roomId: d.rooms[0].id, name: 'T1', shape: 'square' as const, x: 0, y: 0, width: 70, height: 70, rotation: 0, minPersons: 2, maxPersons: 6, stationId: null, features: [], chairs: true, qrToken: newQrToken() };
    d.tables.push(t1);
    const dish = (name: string, course: Dish['course']): Dish => ({ id: newId(), name, nameIt: '', nameEn: '', course, diet: [], notes: '', ingredients: [] });
    const rind = dish('Rind', 'hauptgang'), fisch = dish('Fisch', 'hauptgang'), strudel = dish('Strudel', 'dessert');
    d.dishes.push(rind, fisch, strudel);
    const item = (x: Dish): MenuItem => ({ course: x.course, dishId: x.id, share: null, name: '', allergens: [] });
    const menu: Menu = { id: newId(), date: DAY, serviceId: svc, portions: null, bufferPct: 0, notes: '', items: snapshotItems(d, [rind, fisch, strudel].map(item)) };
    d.menus.push(menu);
    const stay = (roomNo: string, x: Partial<Stay> = {}): Stay => ({ id: newId(), roomNo, name: 'Gast ' + roomNo, adults: 2, children: 0, arrival: DAY, departure: addDays(DAY, 2), board: 'HP',
      phone: '', allergies: '', allergens: [], notes: '', vip: false, times: {}, tableIds: [t1.id], ...x });
    const s101 = stay('101', { allergens: ['gluten'] }), s102 = stay('102');
    d.stays.push(s101, s102);
    const res = (stayId: string): Reservation => ({ id: newId(), date: DAY, serviceId: svc, time: '19:00', duration: 120, adults: 2, children: 0, name: 'x', phone: '', email: '', occasion: '',
      allergies: '', allergens: [], notes: '', highchair: false, vip: false, source: 'Hotel', status: 'bestaetigt', wishes: [], stayId, manualTable: false, seriesId: null, seatedAt: null, finishedAt: null, tableIds: [t1.id] });
    d.reservations.push(res(s101.id), res(s102.id));
    d.menuChoices.push({ id: newId(), menuId: menu.id, stayId: s101.id, counts: { [rind.id]: 1, [fisch.id]: 1, [strudel.id]: 2 }, note: 'Fleisch medium' });

    const x = dinnerExport(d, DAY);
    expect(x.courses).toEqual(['hauptgang', 'dessert']);
    expect(x.rows[0]).toMatchObject({ room: '101', table: 'T1', persons: 2, dishes: { hauptgang: '1× Rind, 1× Fisch', dessert: '2× Strudel' }, note: 'Fleisch medium', chosen: true });
    expect(x.rows[0].allergies).toContain('Gluten');
    expect(x.rows[1]).toMatchObject({ room: '102', chosen: false });
    expect(x.open).toBe(1);
    expect(x.totals.map(t => `${t.n} ${t.name}`)).toEqual(['1 Rind', '1 Fisch', '2 Strudel']);
    const csv = dinnerCsv(x, c => c);
    expect(csv[0]).toEqual(['Zimmer', 'Name', 'Tisch', 'Personen', 'hauptgang', 'dessert', 'Notiz', 'Allergien']);
    expect(csv[1].slice(0, 6)).toEqual(['101', 'Gast 101', 'T1', 2, '1× Rind, 1× Fisch', '2× Strudel']);
  });

  it('ohne Menü leer', () => {
    expect(dinnerExport(emptyVenueData('v', 'H'), DAY).rows).toEqual([]);
  });
});
