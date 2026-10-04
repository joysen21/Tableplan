/**
 * Demo-Modus: gleiche Schnittstelle wie Supabase, Daten im Browser (localStorage).
 * Tabs desselben Browsers werden über BroadcastChannel live synchronisiert.
 * Doppelbuchungsschutz und Rollenrechte werden wie in der Datenbank nachgebildet.
 */
import { demoVenueData, newId } from '../domain/demo';
import { occupies, tableBusy, resEnd, resStart } from '../domain/logic';
import type { Member, Reservation, Role, Stay, VenueData } from '../domain/types';
import { RepoError, type AuthUser, type ChangeEvent, type EntityKey, type EntityMap, type LiveState, type Membership, type Repo } from './repo';

const KEY = 'tischplan.demo.v2';
const SESSION = 'tischplan.demo.user';
interface DemoDb { venues: { id: string; name: string }[]; members: (Member & { venueId: string })[]; data: Record<string, VenueData> }

export const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: 'admin@demo.local', name: 'Anna (Admin)', role: 'admin' },
  { email: 'empfang@demo.local', name: 'Eva (Empfang)', role: 'empfang' },
  { email: 'service@demo.local', name: 'Toni (Service)', role: 'service' },
  { email: 'kueche@demo.local', name: 'Karl (Küche)', role: 'kueche' }
];
const WRITE: Record<Role, string[]> = {
  admin: ['*'], empfang: ['reservations', 'stays', 'blocks', 'audit'], service: ['status', 'audit'], kueche: []
};

export class DemoRepo implements Repo {
  readonly mode = 'demo' as const;
  private bc: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tischplan-demo') : null;
  private listeners = new Set<(e: ChangeEvent) => void>();
  private signedOut: (() => void)[] = [];

  constructor() {
    this.bc?.addEventListener('message', ev => this.listeners.forEach(l => (ev.data as ChangeEvent[]).forEach(e => l(e))));
  }

  /* ---------- Speicher ---------- */
  private read(): DemoDb {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* leer */ }
    const id = newId();
    const db: DemoDb = { venues: [{ id, name: 'Hotel Sonnenhof – Restaurant' }], members: [], data: {} };
    db.members = DEMO_USERS.map((u, i) => ({ venueId: id, userId: 'demo-' + i, role: u.role, name: u.name, email: u.email }));
    db.data[id] = demoVenueData(id, db.venues[0].name);
    this.write(db);
    return db;
  }
  private write(db: DemoDb) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e: any) { throw new RepoError('other', 'Speichern im Browser fehlgeschlagen: ' + e.message); }
  }
  private emit(events: ChangeEvent[]) { if (events.length) this.bc?.postMessage(events); }
  private user(): (Member & { venueId: string }) | null {
    try { const raw = sessionStorage.getItem(SESSION); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  private guard(venueId: string, what: string) {
    const u = this.user(); const db = this.read();
    const m = u && db.members.find(x => x.venueId === venueId && x.email === u.email);
    if (!m) throw new RepoError('forbidden', 'Keine Berechtigung');
    const w = WRITE[m.role];
    if (!w.includes('*') && !w.includes(what)) throw new RepoError('forbidden', 'Keine Berechtigung für diese Änderung.');
  }
  private mutate<T>(venueId: string, fn: (d: VenueData, db: DemoDb) => T): T {
    const db = this.read(); const d = db.data[venueId];
    if (!d) throw new RepoError('other', 'Betrieb nicht gefunden');
    const res = fn(d, db); this.write(db); return res;
  }

  /* ---------- Anmeldung ---------- */
  async getUser(): Promise<AuthUser | null> { const u = this.user(); return u ? { id: u.userId, email: u.email } : null; }
  async signIn(email: string): Promise<AuthUser> {
    const db = this.read();
    const m = db.members.find(x => x.email.toLowerCase() === email.toLowerCase());
    if (!m) throw new RepoError('auth', 'Unbekannter Demo-Benutzer');
    sessionStorage.setItem(SESSION, JSON.stringify(m));
    return { id: m.userId, email: m.email };
  }
  async signOut() { sessionStorage.removeItem(SESSION); this.signedOut.forEach(cb => cb()); }
  async resetPassword() { /* im Demo-Modus nicht nötig */ }
  async updatePassword() { /* im Demo-Modus nicht nötig */ }
  needsPasswordSetup() { return false; }
  onSignedOut(cb: () => void) { this.signedOut.push(cb); }

  /* ---------- Betriebe & Mitglieder ---------- */
  async memberships(): Promise<Membership[]> {
    const u = this.user(); if (!u) return [];
    const db = this.read();
    return db.members.filter(m => m.email === u.email).map(m => ({ venueId: m.venueId, venueName: db.venues.find(v => v.id === m.venueId)?.name ?? '', role: m.role, name: m.name }));
  }
  async createVenue(name: string) {
    const u = this.user(); if (!u) throw new RepoError('auth', 'Nicht angemeldet');
    const db = this.read(); const id = newId();
    db.venues.push({ id, name }); db.members.push({ ...u, venueId: id, role: 'admin' });
    db.data[id] = { venue: { id, name }, rooms: [], stations: [], tables: [], decor: [], combos: [], layouts: [], services: [], blocks: [], stays: [], reservations: [], audit: [] };
    this.write(db); return id;
  }
  async renameVenue(venueId: string, name: string) {
    this.guard(venueId, 'venue');
    this.mutate(venueId, (d, db) => { d.venue.name = name; const v = db.venues.find(x => x.id === venueId); if (v) v.name = name; });
    this.emit([{ kind: 'venue', type: 'upsert', name }]);
  }
  async members(venueId: string) { return this.read().members.filter(m => m.venueId === venueId).map(({ venueId: _v, ...m }) => m); }
  async addMember(venueId: string, email: string, role: Role, name: string) {
    this.guard(venueId, 'members');
    const db = this.read();
    const ex = db.members.find(m => m.venueId === venueId && m.email === email);
    if (ex) Object.assign(ex, { role, name: name || ex.name }); else db.members.push({ venueId, userId: newId(), email, role, name: name || email });
    this.write(db);
  }
  async updateMember(venueId: string, userId: string, patch: { role?: Role; name?: string }) {
    this.guard(venueId, 'members');
    const db = this.read(); const m = db.members.find(x => x.venueId === venueId && x.userId === userId); if (m) Object.assign(m, patch); this.write(db);
  }
  async removeMember(venueId: string, userId: string) {
    this.guard(venueId, 'members');
    const db = this.read(); db.members = db.members.filter(x => !(x.venueId === venueId && x.userId === userId)); this.write(db);
  }

  /* ---------- Laden ---------- */
  async loadVenue(venueId: string): Promise<VenueData> {
    const d = this.read().data[venueId];
    if (!d) throw new RepoError('other', 'Betrieb nicht gefunden');
    return structuredClone(d);
  }

  /* ---------- Schreiben ---------- */
  private applyReservations(d: VenueData, items: Reservation[], deleteIds: string[]): ChangeEvent[] {
    const events: ChangeEvent[] = [];
    d.reservations = d.reservations.filter(r => { if (deleteIds.includes(r.id)) { events.push({ kind: 'reservations', type: 'delete', id: r.id }); return false; } return true; });
    for (const it of items) {
      const i = d.reservations.findIndex(r => r.id === it.id);
      const row = { ...it, updatedAt: new Date().toISOString() };
      const before = i >= 0 ? d.reservations[i].tableIds : [];
      if (i >= 0) d.reservations[i] = row; else d.reservations.push(row);
      const { tableIds: _t, ...plain } = row;
      events.push({ kind: 'reservations', type: 'upsert', row: plain });
      before.filter(t => !row.tableIds.includes(t)).forEach(t => events.push({ kind: 'reservation_tables', type: 'unlink', reservationId: row.id, tableId: t }));
      row.tableIds.filter(t => !before.includes(t)).forEach(t => events.push({ kind: 'reservation_tables', type: 'link', reservationId: row.id, tableId: t }));
    }
    // Doppelbuchungsschutz wie in der Datenbank
    for (const it of items) {
      const r = d.reservations.find(x => x.id === it.id)!;
      if (!occupies(r)) continue;
      for (const tid of r.tableIds) if (tableBusy(d, tid, r.date, resStart(r), resEnd(r), r.id).length)
        throw new RepoError('overlap', 'Der Tisch ist in diesem Zeitraum bereits belegt. Bitte anderen Tisch oder andere Zeit wählen.');
    }
    return events;
  }
  async saveReservations(venueId: string, items: Reservation[], deleteIds: string[] = []) {
    this.guard(venueId, 'reservations');
    let events: ChangeEvent[] = [];
    this.mutate(venueId, d => { events = this.applyReservations(d, items, deleteIds); });
    this.emit(events);
    const d = this.read().data[venueId];
    return items.map(it => structuredClone(d.reservations.find(r => r.id === it.id)!));
  }
  async setStatus(venueId: string, id: string, patch: Pick<Reservation, 'status' | 'seatedAt' | 'finishedAt'>) {
    this.guard(venueId, this.user()?.role === 'service' ? 'status' : 'reservations');
    let events: ChangeEvent[] = [];
    this.mutate(venueId, d => {
      const r = d.reservations.find(x => x.id === id); if (!r) throw new RepoError('other', 'Reservierung nicht gefunden');
      events = this.applyReservations(d, [{ ...r, ...patch }], []);
    });
    this.emit(events);
  }
  async saveStay(venueId: string, stay: Stay, items: Reservation[], deleteIds: string[]) {
    this.guard(venueId, 'stays');
    let events: ChangeEvent[] = [];
    this.mutate(venueId, d => {
      const i = d.stays.findIndex(s => s.id === stay.id);
      if (i >= 0) d.stays[i] = { ...stay }; else d.stays.push({ ...stay });
      events = [{ kind: 'stays', type: 'upsert', row: stay }, ...this.applyReservations(d, items, deleteIds)];
    });
    this.emit(events);
    const d = this.read().data[venueId];
    return { stay: structuredClone(stay), reservations: items.map(it => structuredClone(d.reservations.find(r => r.id === it.id)!)) };
  }
  async deleteStay(venueId: string, stayId: string, deleteReservationIds: string[]) {
    this.guard(venueId, 'stays');
    const events: ChangeEvent[] = [];
    this.mutate(venueId, d => {
      d.reservations = d.reservations.filter(r => { if (deleteReservationIds.includes(r.id)) { events.push({ kind: 'reservations', type: 'delete', id: r.id }); return false; } return true; });
      d.reservations.forEach(r => { if (r.stayId === stayId) r.stayId = null; });
      d.stays = d.stays.filter(s => s.id !== stayId);
      events.push({ kind: 'stays', type: 'delete', id: stayId });
    });
    this.emit(events);
  }
  async upsert<K extends EntityKey>(venueId: string, kind: K, rows: EntityMap[K][]) {
    this.guard(venueId, kind);
    this.mutate(venueId, d => {
      const list = d[kind] as unknown as { id: string }[];
      for (const r of rows) { const i = list.findIndex(x => x.id === r.id); if (i >= 0) list[i] = { ...r }; else list.push({ ...r }); }
    });
    this.emit(rows.map(row => ({ kind, type: 'upsert', row }) as ChangeEvent));
  }
  async remove(venueId: string, kind: EntityKey, ids: string[]) {
    this.guard(venueId, kind);
    this.mutate(venueId, d => {
      (d as any)[kind] = (d[kind] as unknown as { id: string }[]).filter(x => !ids.includes(x.id));
      if (kind === 'tables') {
        d.reservations.forEach(r => { r.tableIds = r.tableIds.filter(t => !ids.includes(t)); });
        d.combos = d.combos.map(c => ({ ...c, tableIds: c.tableIds.filter(t => !ids.includes(t)) })).filter(c => c.tableIds.length >= 2);
        d.stays.forEach(s => { s.tableIds = s.tableIds.filter(t => !ids.includes(t)); });
        d.blocks = d.blocks.filter(b => !ids.includes(b.tableId));
      }
      if (kind === 'rooms') { const tids = d.tables.filter(t => ids.includes(t.roomId)).map(t => t.id); d.tables = d.tables.filter(t => !tids.includes(t.id)); d.decor = d.decor.filter(x => !ids.includes(x.roomId)); d.reservations.forEach(r => { r.tableIds = r.tableIds.filter(t => !tids.includes(t)); }); }
      if (kind === 'services') d.reservations = d.reservations.filter(r => !ids.includes(r.serviceId));
    });
    this.emit(ids.map(id => ({ kind, type: 'delete', id }) as ChangeEvent));
  }
  async log(venueId: string, entry: { userName: string; action: string; details: string }) {
    const row = { id: newId(), ts: new Date().toISOString(), ...entry };
    try { this.mutate(venueId, d => { d.audit.unshift(row); d.audit.length = Math.min(d.audit.length, 500); }); } catch { return; }
    this.emit([{ kind: 'audit', type: 'insert', row }]);
  }
  async replaceAll(venueId: string, data: VenueData) {
    this.guard(venueId, '*');
    this.mutate(venueId, (_d, db) => { db.data[venueId] = { ...structuredClone(data), venue: { id: venueId, name: data.venue.name } }; });
  }
  async uploadBackground(_venueId: string, file: File): Promise<string> {
    if (file.size > 1_500_000) throw new RepoError('other', 'Bild zu groß (max. 1,5 MB im Demo-Modus)');
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
  }

  /* ---------- Live-Aktualisierung ---------- */
  subscribe(_venueId: string, onEvent: (e: ChangeEvent) => void, onState: (s: LiveState) => void) {
    this.listeners.add(onEvent); onState('live');
    return () => { this.listeners.delete(onEvent); };
  }
}
