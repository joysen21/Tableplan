import { describe, expect, it } from 'vitest';
import { demoVenueData, emptyVenueData, newId } from './demo';
import {
  checkReservation, freeMinutes, hasErrors, occupies, planStay, resEnd, resStart, stayTableConflicts, suggestTables, tableBusy, tableStatusAt, turnTime
} from './logic';
import type { Reservation, VenueData } from './types';
import { addDays, today } from '../lib/time';

function base(): { d: VenueData; t1: string; t2: string; svc: string } {
  const d = emptyVenueData('v1', 'Test');
  const room = d.rooms[0].id;
  const t1 = newId(), t2 = newId();
  d.tables.push(
    { id: t1, roomId: room, name: 'T1', shape: 'square', x: 0, y: 0, width: 70, height: 70, rotation: 0, minPersons: 2, maxPersons: 4, stationId: null, features: ['fenster'] },
    { id: t2, roomId: room, name: 'T2', shape: 'square', x: 0, y: 0, width: 70, height: 70, rotation: 0, minPersons: 2, maxPersons: 4, stationId: null, features: [] }
  );
  return { d, t1, t2, svc: d.services.find(s => s.kind === 'abend')!.id };
}
const res = (p: Partial<Reservation> & { serviceId: string }): Reservation => ({
  id: newId(), date: '2026-10-10', time: '19:00', duration: 120, adults: 2, children: 0, name: 'Gast', phone: '', email: '', occasion: '',
  allergies: '', allergens: [], notes: '', highchair: false, vip: false, source: 'Telefon', status: 'bestaetigt', wishes: [], stayId: null, manualTable: false,
  seriesId: null, seatedAt: null, finishedAt: null, tableIds: [], ...p
});

describe('Verweildauer', () => {
  it('nimmt die passende Stufe je Personenzahl', () => {
    const { d, svc } = base();
    expect(turnTime(d, svc, 2)).toBe(105);
    expect(turnTime(d, svc, 3)).toBe(120);
    expect(turnTime(d, svc, 12)).toBe(180);
  });
});

describe('Konfliktprüfung', () => {
  it('meldet Überschneidung als Fehler, angrenzende Zeiten nicht', () => {
    const { d, t1, svc } = base();
    d.reservations.push(res({ serviceId: svc, tableIds: [t1] }));
    expect(hasErrors(checkReservation(d, res({ serviceId: svc, time: '20:00', tableIds: [t1] })))).toBe(true);
    expect(hasErrors(checkReservation(d, res({ serviceId: svc, time: '21:00', tableIds: [t1] })))).toBe(false);
  });
  it('ignoriert stornierte und abgeschlossene Reservierungen', () => {
    const { d, t1, svc } = base();
    d.reservations.push(res({ serviceId: svc, tableIds: [t1], status: 'storniert' }), res({ serviceId: svc, tableIds: [t1], status: 'abgeschlossen' }));
    expect(checkReservation(d, res({ serviceId: svc, tableIds: [t1] }))).toEqual([]);
  });
  it('warnt bei zu kleinem Tisch und Pacing', () => {
    const { d, t1, svc } = base();
    const issues = checkReservation(d, res({ serviceId: svc, adults: 6, tableIds: [t1] }));
    expect(issues.some(i => i.level === 'warn' && i.text.includes('zu klein'))).toBe(true);
    for (let i = 0; i < 9; i++) d.reservations.push(res({ serviceId: svc, adults: 2 }));
    expect(checkReservation(d, res({ serviceId: svc })).some(i => i.text.startsWith('Pacing'))).toBe(true);
  });
});

describe('Tischvorschläge & Walk-in', () => {
  it('bevorzugt Wunsch-Eigenschaften und meidet belegte Tische', () => {
    const { d, t1, t2, svc } = base();
    expect(suggestTables(d, res({ serviceId: svc, wishes: ['fenster'] }))[0].ids).toEqual([t1]);
    d.reservations.push(res({ serviceId: svc, tableIds: [t1] }));
    expect(suggestTables(d, res({ serviceId: svc, wishes: ['fenster'] }))[0].ids).toEqual([t2]);
  });
  it('berechnet die freie Zeit bis zur nächsten Reservierung', () => {
    const { d, t1, svc } = base();
    d.reservations.push(res({ serviceId: svc, time: '20:00', tableIds: [t1] }));
    expect(freeMinutes(d, [t1], '2026-10-10', 18 * 60 + 30)).toBe(90);
    expect(freeMinutes(d, [t1], '2026-10-10', 20 * 60 + 30)).toBe(0);
  });
  it('liefert den Live-Status', () => {
    const { d, t1, svc } = base();
    const r = res({ serviceId: svc, tableIds: [t1] });
    d.reservations.push(r);
    const tb = d.tables[0];
    expect(tableStatusAt(d, tb, r.date, svc, 18 * 60 + 30).st).toBe('bald');
    expect(tableStatusAt(d, tb, r.date, svc, 19 * 60 + 5).st).toBe('reserviert');
    expect(tableStatusAt(d, tb, r.date, svc, 19 * 60 + 30).st).toBe('ueberfaellig');
    r.status = 'platziert';
    expect(tableStatusAt(d, tb, r.date, svc, 21 * 60 + 30).st).toBe('ueberzogen');
  });
});

describe('Hotel', () => {
  it('legt je Nacht eine Reservierung an und lässt belegte Nächte ohne Tisch', () => {
    const { d, t1, svc } = base();
    const stay = { id: newId(), roomNo: '101', name: 'Huber', adults: 2, children: 0, arrival: '2026-10-10', departure: '2026-10-13',
      board: 'HP' as const, phone: '', allergies: '', allergens: [], notes: '', vip: false, times: {}, tableIds: [t1] };
    d.reservations.push(res({ serviceId: svc, date: '2026-10-11', tableIds: [t1], name: 'Extern' }));
    expect(stayTableConflicts(d, stay, [t1]).length).toBe(1);
    const plan = planStay(d, stay, newId);
    expect(plan.upserts.length).toBe(3);
    expect(plan.skipped.length).toBe(1);
    expect(plan.upserts.find(r => r.date === '2026-10-11')!.tableIds).toEqual([]);
    expect(plan.upserts.find(r => r.date === '2026-10-12')!.tableIds).toEqual([t1]);
  });
  it('entfernt offene Reservierungen bei verkürztem Aufenthalt', () => {
    const { d, svc } = base();
    const stay = { id: newId(), roomNo: '101', name: 'Huber', adults: 2, children: 0, arrival: '2026-10-10', departure: '2026-10-13',
      board: 'HP' as const, phone: '', allergies: '', allergens: [], notes: '', vip: false, times: {}, tableIds: [] };
    d.reservations.push(...planStay(d, stay, newId).upserts);
    const shorter = { ...stay, departure: '2026-10-11' };
    const plan = planStay(d, shorter, newId);
    expect(plan.deleteIds.length).toBe(2);
    expect(d.reservations.every(r => r.serviceId === svc)).toBe(true);
  });
});

describe('Demo-Daten', () => {
  it('enthalten keine Doppelbelegung (würde von der Datenbank abgelehnt)', () => {
    const d = demoVenueData('v', 'Demo');
    expect(d.tables.length).toBe(30);
    expect(d.stays.length).toBe(24);
    for (const r of d.reservations) if (occupies(r)) for (const t of r.tableIds)
      expect(tableBusy(d, t, r.date, resStart(r), resEnd(r), r.id)).toEqual([]);
    expect(d.reservations.some(r => r.date === addDays(today(), 3))).toBe(true);
  });
});
