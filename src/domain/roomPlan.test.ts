import { describe, expect, it } from 'vitest';
import { demoVenueData } from './demo';
import { buildImport, exportRoomPlan, futureBookings, importRows, parseRoomPlan } from './roomPlan';
import type { VenueData } from './types';

let n = 0;
const id = () => 'id' + ++n;
const qr = () => 'qr' + ++n;
const today = new Date().toLocaleDateString('sv-SE');
const src = () => demoVenueData('v1', 'Quelle');
const empty = (): VenueData => ({ ...demoVenueData('v2', 'Ziel'), rooms: [], tables: [], decor: [], combos: [], layouts: [], stations: [], reservations: [], stays: [] });

describe('Raumplan Export/Import', () => {
  it('Export ohne QR-Schlüssel, Datei wird erkannt', () => {
    const f = exportRoomPlan(src());
    expect(f.rooms.length).toBeGreaterThan(0);
    expect(f.tables.every(t => !('qrToken' in t))).toBe(true);
    expect(parseRoomPlan(JSON.stringify(f)).rooms.length).toBe(f.rooms.length);
    expect(() => parseRoomPlan('{"format":"tischplan","data":{"rooms":[]}}')).toThrow(/Gesamtsicherung/);
    expect(() => parseRoomPlan('kein json')).toThrow(/JSON/);
  });

  it('in leeren Betrieb: alles neu, neue IDs, Reviere angelegt', () => {
    const s = src(); const f = exportRoomPlan(s); const d = empty();
    const r = buildImport(d, f, {}, today, id, qr);
    expect(r.upsert.rooms.map(x => x.name)).toEqual([...s.rooms].sort((a, b) => a.sort - b.sort).map(x => x.name));
    expect(r.upsert.tables.length).toBe(s.tables.length);
    expect(r.upsert.tables.some(t => s.tables.some(o => o.id === t.id))).toBe(false);
    expect(r.upsert.tables.every(t => t.qrToken)).toBe(true);
    const sids = new Set(r.upsert.stations.map(x => x.id));
    expect(r.upsert.tables.filter(t => t.stationId).every(t => sids.has(t.stationId!))).toBe(true);
    const tids = new Set(r.upsert.tables.map(t => t.id));
    expect(r.upsert.combos.every(c => c.tableIds.every(x => tids.has(x)))).toBe(true);
    expect(r.upsert.layouts.every(l => Object.keys(l.positions).every(k => tids.has(k)))).toBe(true);
  });

  it('gleicher Name: „neu“ hängt (2) an, Reviere werden per Name wiederverwendet', () => {
    const s = src(); const f = exportRoomPlan(s);
    const r = buildImport(s, f, {}, today, id, qr);
    expect(r.upsert.rooms.every(x => x.name.endsWith('(2)'))).toBe(true);
    expect(r.upsert.stations).toEqual([]);
    expect(r.remove.tables).toEqual([]);
  });

  it('„ersetzen“ behält gleichnamige Tische (ID + QR), löscht übrige; gesperrt bei Buchungen ab heute', () => {
    const s = { ...src(), reservations: [], stays: [] };
    const room = s.rooms[0];
    const f = exportRoomPlan(s);
    const [first, ...rest] = f.tables.filter(t => t.roomId === room.id);
    f.tables = f.tables.filter(t => t.roomId !== room.id || t.id === first.id);
    f.tables.push({ ...first, id: 'neuer', name: 'Neu1' });
    const r = buildImport(s, f, { [room.id]: 'ersetzen' }, today, id, qr);
    const kept = r.upsert.tables.find(t => t.name === first.name)!;
    expect(kept.id).toBe(first.id);
    expect(kept.qrToken).toBe(s.tables.find(t => t.id === first.id)!.qrToken);
    expect(r.remove.tables.sort()).toEqual(rest.map(t => t.id).sort());
    expect(r.summary.replaced).toContain(room.name);

    const tb = s.tables.find(t => t.roomId === room.id)!;
    const booked: VenueData = { ...s, reservations: [{ ...src().reservations[0], date: today, status: 'bestaetigt', tableIds: [tb.id] }] };
    expect(futureBookings(booked, room.id, today)).toBe(1);
    expect(importRows(booked, f, today).find(x => x.room.id === room.id)!.future).toBe(1);
    const r2 = buildImport(booked, f, { [room.id]: 'ersetzen' }, today, id, qr);
    expect(r2.summary.replaced).toEqual([]);
    expect(r2.remove.tables).toEqual([]);
  });
});
