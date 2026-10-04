/**
 * Integrationstest gegen eine echte PostgreSQL-Datenbank mit PostgREST.
 * Läuft nur, wenn TP_INT_URL gesetzt ist (siehe README → Tests).
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { demoVenueData, newId } from '../domain/demo';
import { planStay } from '../domain/logic';
import { RepoError } from './repo';
import { SupabaseRepo } from './supabaseRepo';

const URL_ = process.env.TP_INT_URL, SECRET = process.env.TP_INT_SECRET ?? '', VENUE = process.env.TP_INT_VENUE ?? '';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(sub: string) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const repoAs = (sub: string) => new SupabaseRepo(URL_!, 'anon', { Authorization: `Bearer ${jwt(sub)}` });
const ADMIN = '00000000-0000-0000-0000-00000000000a', SERVICE = '00000000-0000-0000-0000-00000000000b';

describe.skipIf(!URL_)('SupabaseRepo gegen echte Datenbank', () => {
  it('richtet einen Betrieb mit Demo-Daten ein und lädt ihn vollständig', async () => {
    const repo = repoAs(ADMIN);
    const demo = demoVenueData(VENUE, 'Hotel Int');
    await repo.replaceAll(VENUE, demo);
    const d = await repo.loadVenue(VENUE, 'x', 120);
    expect(d.tables.length).toBe(30);
    expect(d.services.length).toBe(3);
    expect(d.stays.length).toBe(24);
    expect(d.reservations.length).toBe(demo.reservations.length);
    const withTables = demo.reservations.filter(r => r.tableIds.length).length;
    expect(d.reservations.filter(r => r.tableIds.length).length).toBe(withTables);
    const r0 = demo.reservations.find(r => r.tableIds.length)!;
    const l0 = d.reservations.find(r => r.id === r0.id)!;
    expect(l0.time).toBe(r0.time);
    expect(l0.tableIds).toEqual(r0.tableIds);
  }, 60000);

  it('verhindert Doppelbuchungen und meldet sie verständlich', async () => {
    const repo = repoAs(ADMIN);
    const d = await repo.loadVenue(VENUE, 'x', 120);
    const busy = d.reservations.find(r => r.tableIds.length && ['bestaetigt', 'angefragt'].includes(r.status))!;
    const clash = { ...busy, id: newId(), name: 'Konflikt', stayId: null, seriesId: null };
    await expect(repo.saveReservations(VENUE, [clash])).rejects.toMatchObject({ code: 'overlap' });
    // Tisch wechseln + Zeit verschieben in einem Schritt funktioniert
    const moved = await repo.saveReservations(VENUE, [{ ...clash, time: '23:00', duration: 30, tableIds: [] }]);
    expect(moved[0].tableIds).toEqual([]);
    await repo.saveReservations(VENUE, [], [clash.id]);
  }, 30000);

  it('speichert Hotelaufenthalt samt Reservierungen atomar', async () => {
    const repo = repoAs(ADMIN);
    const d = await repo.loadVenue(VENUE, 'x', 120);
    const stay = { id: newId(), roomNo: '999', name: 'Integration', adults: 2, children: 0, arrival: '2030-01-10', departure: '2030-01-13', board: 'HP' as const,
      phone: '', allergies: '', notes: '', vip: false, times: {}, tableIds: [d.tables[0].id] };
    const plan = planStay({ ...d, stays: [...d.stays, stay] }, stay, newId);
    const res = await repo.saveStay(VENUE, stay, plan.upserts, plan.deleteIds);
    expect(res.reservations.length).toBe(3);
    expect(res.reservations.every(r => r.tableIds[0] === d.tables[0].id)).toBe(true);
    await repo.deleteStay(VENUE, stay.id, res.reservations.map(r => r.id));
  }, 30000);

  it('Service darf nur den Status ändern', async () => {
    const admin = repoAs(ADMIN);
    await admin.addMember(VENUE, 'service@x.it', 'service', 'Toni');
    const svc = repoAs(SERVICE);
    const d = await svc.loadVenue(VENUE, 'x', 120);
    const r = d.reservations.find(x => x.status === 'bestaetigt')!;
    await svc.setStatus(VENUE, r.id, { status: 'eingetroffen', seatedAt: null, finishedAt: null });
    await expect(svc.saveReservations(VENUE, [{ ...r, name: 'gehackt' }])).rejects.toBeInstanceOf(RepoError);
    await expect(svc.upsert(VENUE, 'tables', [{ ...d.tables[0], name: 'X' }])).rejects.toMatchObject({ code: 'forbidden' });
    const after = await admin.loadVenue(VENUE, 'x', 120);
    expect(after.reservations.find(x => x.id === r.id)!.status).toBe('eingetroffen');
    expect(after.reservations.find(x => x.id === r.id)!.name).toBe(r.name);
    const members = await admin.members(VENUE);
    expect(members.map(m => m.role).sort()).toEqual(['admin', 'service']);
  }, 30000);

  it('löscht Tische inkl. Folgedaten', async () => {
    const repo = repoAs(ADMIN);
    const d = await repo.loadVenue(VENUE, 'x', 120);
    const t1 = d.tables.find(t => t.name === 'T1')!;
    await repo.remove(VENUE, 'tables', [t1.id]);
    const after = await repo.loadVenue(VENUE, 'x', 120);
    expect(after.tables.length).toBe(29);
    expect(after.combos.some(c => c.tableIds.includes(t1.id))).toBe(false);
    expect(after.reservations.some(r => r.tableIds.includes(t1.id))).toBe(false);
  }, 30000);
});
