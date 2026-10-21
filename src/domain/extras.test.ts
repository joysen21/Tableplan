import { describe, expect, it } from 'vitest';
import { emptyVenueData, newId } from './demo';
import {
  bikeCols, bikeRange, bookingConflicts, bookingWarnings, freeResources, garageCols, garageRange, massageCols, massageRange, presentFor, spanOf, staysBetween, weekMonday
} from './extras';
import type { Booking, HotelResource, Stay } from './types';

const R = (module: HotelResource['module'], name: string, x: Partial<HotelResource> = {}): HotelResource =>
  ({ id: newId(), module, name, sort: 0, active: true, ev: false, art: '', size: '', ...x });
const stay = (roomNo: string, arrival: string, departure: string): Stay => ({ id: newId(), roomNo, name: 'Gast ' + roomNo, adults: 2, children: 0, arrival, departure, board: 'HP',
  phone: '', allergies: '', allergens: [], notes: '', vip: false, times: {}, tableIds: [] });
const B = (x: Partial<Booking> & Pick<Booking, 'module' | 'resourceId' | 'stayId' | 'starts' | 'ends'>): Booking =>
  ({ id: newId(), therapyId: null, plate: '', ev: false, part: null, price: null, note: '', createdBy: '', ...x });

describe('Garage, Massage, Fahrrad', () => {
  it('Garage: Abreisetag und Anreisetag eines anderen Gasts überschneiden sich nicht', () => {
    const d = emptyVenueData('v', 'H');
    const p1 = R('garage', 'Platz 1', { ev: true }), p2 = R('garage', 'Platz 2');
    d.hotelResources.push(p1, p2);
    const a = stay('101', '2026-10-10', '2026-10-13'), b = stay('102', '2026-10-13', '2026-10-15');
    d.stays.push(a, b);
    d.bookings.push(B({ module: 'garage', resourceId: p1.id, stayId: a.id, ...garageRange('2026-10-10', '2026-10-13') }));
    const next = B({ module: 'garage', resourceId: p1.id, stayId: b.id, ...garageRange('2026-10-13', '2026-10-15') });
    expect(bookingConflicts(d, next)).toHaveLength(0);
    const clash = B({ module: 'garage', resourceId: p1.id, stayId: b.id, ...garageRange('2026-10-12', '2026-10-14') });
    expect(bookingConflicts(d, clash)).toHaveLength(1);
    // E-Auto: Ladeplatz zuerst, belegter fällt weg
    expect(freeResources(d, 'garage', garageRange('2026-10-11', '2026-10-12'), { ev: true }).map(r => r.name)).toEqual(['Platz 2']);
    expect(freeResources(d, 'garage', garageRange('2026-10-13', '2026-10-14'), { ev: true }).map(r => r.name)).toEqual(['Platz 1', 'Platz 2']);
    expect(bookingWarnings(d, { ...clash, resourceId: p2.id, ev: true })).toEqual(expect.arrayContaining(['Platz 2 ist kein Ladeplatz.', expect.stringContaining('nur vom')]));
    // Raster: 3 Nächte = 3 Spalten
    expect(spanOf(garageCols('2026-10-09', 14), d.bookings[0])).toEqual({ first: 1, n: 3 });
  });

  it('Fahrrad: ganzer Tag blockiert Vor- und Nachmittag, halbe Tage nicht gegenseitig', () => {
    const d = emptyVenueData('v', 'H');
    const bike = R('fahrrad', 'E-Bike 1'), s = stay('101', '2026-10-10', '2026-10-13');
    d.hotelResources.push(bike); d.stays.push(s);
    d.bookings.push(B({ module: 'fahrrad', resourceId: bike.id, stayId: s.id, ...bikeRange('2026-10-11', 'vm'), part: 'vm' }));
    expect(bookingConflicts(d, B({ module: 'fahrrad', resourceId: bike.id, stayId: s.id, ...bikeRange('2026-10-11', 'nm') }))).toHaveLength(0);
    expect(bookingConflicts(d, B({ module: 'fahrrad', resourceId: bike.id, stayId: s.id, ...bikeRange('2026-10-11', 'tag') }))).toHaveLength(1);
    const cols = bikeCols('2026-10-10', 7);
    expect(cols).toHaveLength(14);
    expect(spanOf(cols, bikeRange('2026-10-11', 'tag'))).toEqual({ first: 2, n: 2 });
  });

  it('Massage: Dauer aus der Therapie, keine Überschneidung, Hinweis außerhalb der Anwesenheit', () => {
    const d = emptyVenueData('v', 'H');
    const lena = R('massage', 'Lena'), s = stay('101', '2026-10-10', '2026-10-13');
    d.hotelResources.push(lena); d.stays.push(s);
    d.presence.push({ id: newId(), resourceId: lena.id, date: '2026-10-11', start: '09:00', end: '17:00' });
    const m = massageRange('2026-10-11', '10:00', 50);
    expect(m).toEqual({ starts: '2026-10-11T10:00', ends: '2026-10-11T10:50' });
    d.bookings.push(B({ module: 'massage', resourceId: lena.id, stayId: s.id, ...m }));
    expect(bookingConflicts(d, B({ module: 'massage', resourceId: lena.id, stayId: s.id, ...massageRange('2026-10-11', '10:45', 25) }))).toHaveLength(1);
    expect(bookingConflicts(d, B({ module: 'massage', resourceId: lena.id, stayId: s.id, ...massageRange('2026-10-11', '10:50', 25) }))).toHaveLength(0);
    expect(presentFor(d, lena.id, massageRange('2026-10-11', '16:30', 50))).toBe(false);
    expect(bookingWarnings(d, B({ module: 'massage', resourceId: lena.id, stayId: s.id, ...massageRange('2026-10-11', '16:30', 50) }))).toEqual(['Lena ist zu dieser Zeit nicht eingetragen.']);
    expect(massageCols('2026-10-11')).toHaveLength(52);
  });

  it('Gäste im Zeitraum und Wochenanfang', () => {
    const d = emptyVenueData('v', 'H');
    d.stays.push(stay('12', '2026-10-01', '2026-10-05'), stay('3', '2026-10-04', '2026-10-08'), stay('7', '2026-10-09', '2026-10-10'));
    expect(staysBetween(d, '2026-10-05').map(s => s.roomNo)).toEqual(['3', '12']);
    expect(weekMonday('2026-10-22')).toBe('2026-10-19');
    expect(weekMonday('2026-10-19')).toBe('2026-10-19');
  });
});
