import { describe, expect, it } from 'vitest';
import { demoVenueData, emptyVenueData, newId } from './demo';
import { brandingOf, buildGuestMenu, choiceSummary, chosenDishes, chosenText, cleanCounts, newQrToken, stayEats } from './guestMenu';
import { dishPlans, snapshotItems } from './menu';
import type { Dish, Menu, MenuItem, Reservation, Stay, VenueData } from './types';
import { addDays } from '../lib/time';

const DAY = '2026-10-10';

/** Tisch T1 mit zwei Hotelzimmern (101: 2 Pers., 102: 3 Pers.) und ein externer Gast an T2; Abendmenü mit 2 Hauptgängen + 1 Dessert */
function setup() {
  const d = emptyVenueData('v1', 'Hotel Test');
  const room = d.rooms[0].id, svc = d.services.find(s => s.kind === 'abend')!.id;
  const t1 = { id: newId(), roomId: room, name: 'T1', shape: 'square' as const, x: 0, y: 0, width: 70, height: 70, rotation: 0, minPersons: 2, maxPersons: 6, stationId: null, features: [], chairs: true, qrToken: newQrToken() };
  const t2 = { ...t1, id: newId(), name: 'T2', qrToken: newQrToken() };
  d.tables.push(t1, t2);
  const dish = (name: string, course: Dish['course']): Dish => ({ id: newId(), name, nameIt: name + ' IT', nameEn: '', course, diet: [], notes: '', ingredients: [] });
  const rind = dish('Rind', 'hauptgang'), fisch = dish('Fisch', 'hauptgang'), strudel = dish('Strudel', 'dessert');
  d.dishes.push(rind, fisch, strudel);
  const item = (x: Dish): MenuItem => ({ course: x.course, dishId: x.id, share: null, name: '', allergens: [] });
  const menu: Menu = { id: newId(), date: DAY, serviceId: svc, portions: null, bufferPct: 0, notes: '', items: snapshotItems(d, [item(rind), item(fisch), item(strudel)]), ordering: 'offen' };
  d.menus.push(menu);
  const stay = (roomNo: string, adults: number): Stay => ({ id: newId(), roomNo, name: 'Gast ' + roomNo, adults, children: 0, arrival: DAY, departure: addDays(DAY, 2), board: 'HP',
    phone: '', allergies: '', allergens: [], notes: '', vip: false, times: {}, tableIds: [t1.id] });
  const s101 = stay('101', 2), s102 = stay('102', 3);
  d.stays.push(s101, s102);
  const res = (p: Partial<Reservation>): Reservation => ({
    id: newId(), date: DAY, serviceId: svc, time: '19:00', duration: 120, adults: 2, children: 0, name: 'Gast', phone: '', email: '', occasion: '',
    allergies: '', allergens: [], notes: '', highchair: false, vip: false, source: 'Hotel', status: 'bestaetigt', wishes: [], stayId: null,
    manualTable: false, seriesId: null, seatedAt: null, finishedAt: null, tableIds: [], ...p
  });
  d.reservations.push(res({ stayId: s101.id, adults: 2, tableIds: [t1.id] }), res({ stayId: s102.id, adults: 3, tableIds: [t1.id] }), res({ adults: 4, tableIds: [t2.id], source: 'Telefon' }));
  return { d, t1, t2, menu, rind, fisch, strudel, s101, s102 };
}

describe('Gäste-Speisekarte (QR)', () => {
  it('zeigt für den Tisch-Schlüssel nur die Zimmer an diesem Tisch und nur freigegebene Menüs', () => {
    const { d, t1, t2, menu, s101, s102 } = setup();
    const v = buildGuestMenu(d, t1.qrToken, DAY)!;
    expect(v.table.name).toBe('T1');
    expect(v.menus.map(m => m.id)).toEqual([menu.id]);
    expect(v.menus[0].rooms.map(r => [r.stayId, r.persons])).toEqual([[s101.id, 2], [s102.id, 3]]);
    expect(v.menus[0].items[0].nameIt).toBe('Rind IT');
    // externer Gast wählt am Tisch mit – ohne Zimmernummer und ohne Namen
    const ext = buildGuestMenu(d, t2.qrToken, DAY)!.menus[0].rooms;
    expect(ext).toHaveLength(1);
    expect(ext[0]).toMatchObject({ stayId: null, roomNo: '', persons: 4 });
    expect(ext[0].resId).toBe(d.reservations.find(r => !r.stayId)!.id);
    expect(buildGuestMenu(d, 'falsch-falsch-falsch', DAY)).toBeNull();
    menu.ordering = 'aus';
    expect(buildGuestMenu(d, t1.qrToken, DAY)!.menus).toEqual([]);
    menu.ordering = 'offen';
    expect(buildGuestMenu(d, t1.qrToken, addDays(DAY, 2))!.menus).toEqual([]); // nur heute und morgen
  });

  it('Frühstück mit freier Platzwahl: jeder QR-Code zeigt alle Zimmer mit Frühstück zur Auswahl', () => {
    const { d, t2, rind, s101, s102 } = setup();
    const svc = d.services.find(s => s.kind === 'fruehstueck')!;
    expect(svc.freeSeating).toBe(true);
    const breakfast: Menu = { id: newId(), date: addDays(DAY, 1), serviceId: svc.id, portions: null, bufferPct: 0, notes: '',
      items: snapshotItems(d, [{ course: 'hauptgang', dishId: rind.id, share: null, name: '', allergens: [] }]), ordering: 'offen' };
    d.menus.push(breakfast);
    // Zimmer 103 mit Frühstück (UF), aber ohne Tisch und ohne Reservierung
    d.stays.push({ ...s101, id: newId(), roomNo: '103', board: 'UF', adults: 1, tableIds: [] });
    const v = buildGuestMenu(d, t2.qrToken, addDays(DAY, 1))!;
    const m = v.menus.find(x => x.id === breakfast.id)!;
    expect(m.pick).toBe(true);
    expect(m.rooms.map(r => [r.roomNo, r.persons])).toEqual([['101', 2], ['102', 3], ['103', 1]]);
    expect(buildGuestMenu(d, t2.qrToken, DAY)!.menus.find(x => x.id !== breakfast.id)!.pick).toBe(false); // Abendessen: feste Tische
    // am Anreisetag gibt es noch kein Frühstück
    breakfast.date = DAY;
    expect(buildGuestMenu(d, t2.qrToken, DAY)!.menus.find(x => x.id === breakfast.id)!.rooms).toEqual([]);
    expect(choiceSummary(d, { ...breakfast, date: addDays(DAY, 1) }).open.map(o => o.label)).toEqual(['Zi. 101', 'Zi. 102', 'Zi. 103']);
    expect(s102.board).toBe('HP');
  });

  it('Mahlzeiten je Verpflegung: Frühstück morgens nach jeder Nacht, Abendessen bis vor der Abreise', () => {
    const s = { arrival: '2026-10-10', departure: '2026-10-12' };
    expect(['2026-10-10', '2026-10-11', '2026-10-12'].map(x => stayEats({ ...s, board: 'UF' }, 'fruehstueck', x))).toEqual([false, true, true]);
    expect(['2026-10-10', '2026-10-11', '2026-10-12'].map(x => stayEats({ ...s, board: 'HP' }, 'abend', x))).toEqual([true, true, false]);
    expect(stayEats({ ...s, board: 'UF' }, 'abend', '2026-10-10')).toBe(false);
    expect(stayEats({ ...s, board: 'HP' }, 'mittag', '2026-10-10')).toBe(false);
    expect(stayEats({ ...s, board: 'VP' }, 'mittag', '2026-10-10')).toBe(true);
  });

  it('Live-Plan: gewähltes Menü eines Zimmers in Gang-Reihenfolge', () => {
    const { d, menu, rind, fisch, strudel, s102 } = setup();
    const r = d.reservations.find(x => x.stayId === s102.id)!;
    expect(chosenDishes(d, r)).toEqual([]);
    d.menuChoices.push({ id: newId(), menuId: menu.id, stayId: s102.id, counts: { [strudel.id]: 3, [fisch.id]: 2, [rind.id]: 1 } });
    expect(chosenText(chosenDishes(d, r))).toBe('1× Rind, 2× Fisch, 3× Strudel');
    expect(chosenDishes(d, { ...r, stayId: null })).toEqual([]); // externe Gäste wählen nicht
  });

  it('prüft die Auswahl: nur Gerichte des Menüs, je Gang höchstens so viele wie Personen', () => {
    const { menu, rind, fisch, strudel } = setup();
    expect(cleanCounts(menu.items, 3, { [rind.id]: 2, [fisch.id]: 1, [strudel.id]: 0 })).toEqual({ counts: { [rind.id]: 2, [fisch.id]: 1 } });
    expect('error' in cleanCounts(menu.items, 3, { [rind.id]: 3, [fisch.id]: 1 })).toBe(true);
    expect('error' in cleanCounts(menu.items, 3, { [newId()]: 1 })).toBe(true);
    expect('error' in cleanCounts(menu.items, 3, { [rind.id]: 1.5 })).toBe(true);
    expect('error' in cleanCounts(menu.items, 3, { [rind.id]: -1 })).toBe(true);
  });

  it('Küche: gewählte Gerichte zählen fest, nur die übrigen Gäste werden nach Anteilen geschätzt', () => {
    const { d, menu, rind, fisch, strudel, s102 } = setup();
    // ohne Auswahl: 9 Gäste (2 + 3 Hotel + 4 extern), Hauptgang je zur Hälfte
    expect(dishPlans(d, menu).map(p => p.portions)).toEqual([5, 5, 9]);
    d.menuChoices.push({ id: newId(), menuId: menu.id, stayId: s102.id, counts: { [fisch.id]: 3, [strudel.id]: 3 } });
    const s = choiceSummary(d, menu);
    // 2 Zimmer + 1 externe Reservierung (4 P)
    expect([s.rooms, s.chosenRooms, s.persons, s.chosenPersons]).toEqual([3, 1, 9, 3]);
    expect(s.open.map(o => o.label)).toEqual(['Zi. 101 · T1', 'Gast · T2']);
    // 3 fest gewählt, übrige 6 Gäste: Rind 3, Fisch 3 + 3 gewählt, Strudel 6 + 3
    const plans = dishPlans(d, menu);
    expect(plans.map(p => [p.portions, p.chosen])).toEqual([[3, 0], [6, 3], [9, 3]]);
    expect(plans.find(p => p.item.dishId === rind.id)!.portions).toBe(3);
  });

  it('Erscheinungsbild: Titel fällt auf den Namen des Betriebs zurück', () => {
    expect(brandingOf({ name: 'Hotel X' })).toMatchObject({ title: 'Hotel X', color: '#0F2347', logoUrl: null });
    expect(brandingOf({ name: 'Hotel X', branding: { title: 'Sonnenhof', welcome: 'Hallo', color: '#aa0000', logoUrl: 'l', coverUrl: null } }).title).toBe('Sonnenhof');
  });

  it('Demo-Daten: jeder Tisch hat einen eigenen QR-Schlüssel, heutige Menüs sind offen', () => {
    const d: VenueData = demoVenueData('v', 'Demo');
    const tokens = d.tables.map(t => t.qrToken);
    expect(new Set(tokens).size).toBe(d.tables.length);
    expect(tokens.every(t => /^[0-9a-f]{24}$/.test(t!))).toBe(true);
    expect(d.menuChoices.length).toBeGreaterThan(0);
  });
});
