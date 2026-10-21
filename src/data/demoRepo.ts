/**
 * Demo-Modus: gleiche Schnittstelle wie Supabase, Daten im Browser (localStorage).
 * Tabs desselben Browsers werden über BroadcastChannel live synchronisiert.
 * Doppelbuchungsschutz und Rollenrechte werden wie in der Datenbank nachgebildet.
 */
import { demoVenueData, newId, normalizeVenueData } from '../domain/demo';
import { MAX_ROOMS_PER_TABLE } from '../domain/constants';
import { occupies, tableConflicts, resEnd, resStart } from '../domain/logic';
import { canPlanDept } from '../domain/roster';
import { shiftsOverlap, weekStart } from '../domain/rosterPlan';
import type { Branding, Member, MenuChoice, ModuleKey, OnDuty, PublicRoster, Reservation, Role, RosterSettings, Shift, StatusConfig, Stay, VenueData } from '../domain/types';
import { buildGuestMenu, cleanCounts, newQrToken, partyKey } from '../domain/guestMenu';
import { addDays, today } from '../lib/time';
import { ROSTER_KEYS, RepoError, type AuthUser, type ChangeEvent, type EntityKey, type EntityMap, type LiveState, type Membership, type Repo } from './repo';

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
  admin: ['*'], empfang: ['reservations', 'stays', 'blocks', 'menuChoices', 'audit'], service: ['status', 'audit'], kueche: ['ingredients', 'dishes', 'menus', 'menuChoices']
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
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const db: DemoDb = JSON.parse(raw);
        // ältere Demo-Daten: QR-Schlüssel der Tische einmalig vergeben und speichern (müssen stabil bleiben)
        let added = false;
        for (const d of Object.values(db.data)) {
          if (d.venue && !d.venue.qrToken) { d.venue.qrToken = newQrToken(); added = true; }
          for (const t of d.tables ?? []) if (!t.qrToken) { t.qrToken = newQrToken(); added = true; }
        }
        if (added) this.write(db);
        return db;
      }
    } catch { /* leer */ }
    const id = newId();
    const db: DemoDb = { venues: [{ id, name: 'Hotel Sonnenhof – Restaurant' }], members: [], data: {} };
    db.members = DEMO_USERS.map((u, i) => ({ venueId: id, userId: 'demo-' + i, role: u.role, name: u.name, email: u.email }));
    db.data[id] = demoVenueData(id, db.venues[0].name);
    // Bereichsleitungen der Demo: Karl (Küche) leitet die Küche, Toni (Service) den Service
    const lead = (dep: string, email: string) => { const dd = db.data[id].departments.find(x => x.name === dep); const m = db.members.find(x => x.email === email); if (dd && m) dd.leadIds = [m.userId]; };
    lead('Küche', 'kueche@demo.local'); lead('Service', 'service@demo.local');
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
  /** Dienstplan wie in der DB (can_plan): Admin alles, Bereichsleitung nur Daten ihrer Bereiche (alter und neuer Stand) */
  private rosterGuard(venueId: string, kind: EntityKey, rows: { id: string; departmentId?: string | null }[]) {
    const u = this.user(); const db = this.read(); const d = db.data[venueId];
    const m = u && db.members.find(x => x.venueId === venueId && x.email === u.email);
    if (!m || !d) throw new RepoError('forbidden', 'Keine Berechtigung');
    if (m.role === 'admin') return;
    const deny = () => { throw new RepoError('forbidden', 'Keine Berechtigung: Diese Daten gehören zu einem Bereich, den Sie nicht leiten.'); };
    if (kind === 'departments') deny();
    const list = (d as any)[kind] as { id: string; departmentId?: string | null; staffId?: string }[];
    // Abwesenheiten gehören zum Stammbereich der Person
    const dep = (x: { departmentId?: string | null; staffId?: string }) => kind === 'absences' ? d.staff.find(s => s.id === x.staffId)?.departmentId ?? null : x.departmentId ?? null;
    for (const r of rows as { id: string; departmentId?: string | null; staffId?: string }[]) {
      const old = list.find(x => x.id === r.id);
      if (old && !canPlanDept(m.role, d.departments, m.userId, dep(old))) deny();
      if ((r.departmentId !== undefined || r.staffId !== undefined) && !canPlanDept(m.role, d.departments, m.userId, dep(r))) deny();
    }
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
    db.data[id] = normalizeVenueData({ venue: { id, name } } as VenueData);
    this.write(db); return id;
  }
  async renameVenue(venueId: string, name: string) {
    this.guard(venueId, 'venue');
    this.mutate(venueId, (d, db) => { d.venue.name = name; const v = db.venues.find(x => x.id === venueId); if (v) v.name = name; });
    this.emit([{ kind: 'venue', type: 'upsert', name }]);
  }
  async setModules(venueId: string, modules: ModuleKey[]) {
    this.guard(venueId, 'venue');
    let name = '';
    this.mutate(venueId, d => { d.venue.modules = [...modules]; name = d.venue.name; });
    this.emit([{ kind: 'venue', type: 'upsert', name, modules }]);
  }
  async setRosterSettings(venueId: string, settings: Partial<RosterSettings>) {
    this.guard(venueId, 'venue');
    let name = '';
    this.mutate(venueId, d => { d.venue.rosterSettings = { ...settings }; name = d.venue.name; });
    this.emit([{ kind: 'venue', type: 'upsert', name, rosterSettings: settings }]);
  }
  /** wie public_roster() in der DB: ohne Anmeldung, nur veröffentlichte Wochen, Vorwoche bis 6 Wochen voraus */
  async publicRoster(token: string): Promise<PublicRoster | null> {
    const db = this.read();
    for (const d of Object.values(db.data).map(x => normalizeVenueData(x))) {
      const st = d.staff.find(s => s.shareToken === token && s.active);
      if (!st) continue;
      const from = addDays(weekStart(today()), -7), to = addDays(from, 48);
      const inR = (s: Shift) => s.date >= from && s.date <= to;
      const deps = new Set([st.departmentId, ...d.shifts.filter(s => s.staffId === st.id && inR(s)).map(s => s.departmentId)].filter(Boolean));
      const pubOf = (s: Shift) => d.publications.find(p => p.departmentId === s.departmentId && p.weekStart === weekStart(s.date));
      const shifts = d.shifts.filter(s => inR(s) && pubOf(s) && (s.staffId === st.id || deps.has(s.departmentId)))
        .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
        .map(s => {
          const dep = d.departments.find(x => x.id === s.departmentId)!;
          return { ...s, staffName: d.staff.find(x => x.id === s.staffId)?.name ?? 'Offene Schicht', departmentName: dep.name,
            color: d.shiftTemplates.find(t => t.id === s.templateId)?.color ?? dep.color, mine: s.staffId === st.id,
            changed: !!(s.updatedAt && s.updatedAt > pubOf(s)!.publishedAt) };
        });
      const pubs = d.publications.filter(p => deps.has(p.departmentId)).map(p => p.publishedAt).sort();
      return { venueName: d.venue.name, staffName: st.name, from, to, shifts,
        absences: d.absences.filter(a => a.staffId === st.id && a.to >= from && a.from <= to).map(a => ({ ...a, note: '' })), publishedAt: pubs.at(-1) ?? null };
    }
    return null;
  }
  async onDuty(venueId: string, date: string): Promise<OnDuty[]> {
    const d = this.read().data[venueId]; if (!d) return [];
    const n = normalizeVenueData(structuredClone(d));
    return n.shifts.filter(s => s.date === date && s.staffId && n.publications.some(p => p.departmentId === s.departmentId && p.weekStart === weekStart(s.date)))
      .map(s => { const dep = n.departments.find(x => x.id === s.departmentId)!; return { s, dep }; })
      .sort((a, b) => a.dep.sort - b.dep.sort || a.s.start.localeCompare(b.s.start))
      .map(({ s, dep }) => ({ staffName: n.staff.find(x => x.id === s.staffId)?.name ?? '', departmentName: dep.name,
        color: n.shiftTemplates.find(t => t.id === s.templateId)?.color ?? dep.color, start: s.start, end: s.end, start2: s.start2, end2: s.end2 }));
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
    return normalizeVenueData(structuredClone(d));
  }

  /* ---------- Schreiben ---------- */
  private applyReservations(d: VenueData, items: Reservation[], deleteIds: string[]): ChangeEvent[] {
    const events: ChangeEvent[] = [];
    d.reservations = d.reservations.filter(r => { if (deleteIds.includes(r.id)) { events.push({ kind: 'reservations', type: 'delete', id: r.id }); return false; } return true; });
    // Bearbeitungskonflikt wie in der Datenbank: veralteter Stand wird abgelehnt
    for (const it of items) {
      const cur = d.reservations.find(r => r.id === it.id);
      if (cur && cur.updatedAt && cur.updatedAt !== it.updatedAt)
        throw new RepoError('conflict', `Die Reservierung „${it.name}“ wurde inzwischen von jemand anderem geändert. Der aktuelle Stand wurde geladen – bitte nochmals speichern.`);
    }
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
      for (const tid of r.tableIds) {
        const busy = tableConflicts(d, tid, r.date, resStart(r), resEnd(r), r);
        if (busy.length && busy.every(o => o.stayId))
          throw new RepoError('overlap', `An diesem Tisch sitzen in diesem Zeitraum bereits ${MAX_ROOMS_PER_TABLE} Zimmer. Bitte anderen Tisch wählen.`);
        if (busy.length) throw new RepoError('overlap', 'Der Tisch ist in diesem Zeitraum bereits belegt. Bitte anderen Tisch oder andere Zeit wählen.');
      }
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
  async setStatus(venueId: string, id: string, patch: Pick<Reservation, 'status' | 'subStatus' | 'seatedAt' | 'finishedAt'>) {
    this.guard(venueId, this.user()?.role === 'service' ? 'status' : 'reservations');
    let events: ChangeEvent[] = [];
    const updatedAt = this.mutate(venueId, d => {
      const r = d.reservations.find(x => x.id === id); if (!r) throw new RepoError('other', 'Reservierung nicht gefunden');
      events = this.applyReservations(d, [{ ...r, ...patch }], []);
      return d.reservations.find(x => x.id === id)!.updatedAt;
    });
    this.emit(events);
    return updatedAt;
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
    if (ROSTER_KEYS.includes(kind)) this.rosterGuard(venueId, kind, rows as any); else this.guard(venueId, kind);
    const now = new Date().toISOString();
    // Server-Felder wie in der DB: updated_at der Dienste, published_at der Veröffentlichung
    const stamped = rows.map(r => kind === 'shifts' ? { ...r, updatedAt: now } : kind === 'publications' ? { ...r, publishedAt: now } : r) as EntityMap[K][];
    this.mutate(venueId, d => {
      const list = ((d as any)[kind] ??= []) as { id: string }[];
      if (kind === 'shifts') {
        // Doppelbelegung sperren wie der Trigger shifts_no_overlap
        for (const r of stamped as unknown as Shift[]) {
          if (r.staffId && (list as Shift[]).some(o => o.id !== r.id && o.staffId === r.staffId && !(stamped as unknown as Shift[]).some(x => x.id === o.id) && shiftsOverlap(o, r)))
            throw new RepoError('overlap', 'Diese Person hat zu dieser Zeit schon einen Dienst (eventuell gerade auf einem anderen Gerät eingetragen).');
        }
      }
      for (const r of stamped) { const i = list.findIndex(x => x.id === r.id); if (i >= 0) list[i] = { ...r }; else list.push({ ...r }); }
    });
    this.emit(stamped.map(row => ({ kind, type: 'upsert', row }) as ChangeEvent));
  }
  async remove(venueId: string, kind: EntityKey, ids: string[]) {
    if (ROSTER_KEYS.includes(kind)) this.rosterGuard(venueId, kind, ids.map(id => ({ id }))); else this.guard(venueId, kind);
    this.mutate(venueId, d => {
      (d as any)[kind] = ((d[kind] ?? []) as unknown as { id: string }[]).filter(x => !ids.includes(x.id));
      if (kind === 'tables') {
        d.reservations.forEach(r => { r.tableIds = r.tableIds.filter(t => !ids.includes(t)); });
        d.combos = d.combos.map(c => ({ ...c, tableIds: c.tableIds.filter(t => !ids.includes(t)) })).filter(c => c.tableIds.length >= 2);
        d.stays.forEach(s => { s.tableIds = s.tableIds.filter(t => !ids.includes(t)); });
        d.blocks = d.blocks.filter(b => !ids.includes(b.tableId));
      }
      if (kind === 'rooms') { const tids = d.tables.filter(t => ids.includes(t.roomId)).map(t => t.id); d.tables = d.tables.filter(t => !tids.includes(t.id)); d.decor = d.decor.filter(x => !ids.includes(x.roomId)); d.reservations.forEach(r => { r.tableIds = r.tableIds.filter(t => !tids.includes(t)); }); }
      // Kaskaden wie in der DB
      if (kind === 'staff') { d.shifts = (d.shifts ?? []).filter(x => !x.staffId || !ids.includes(x.staffId)); d.absences = (d.absences ?? []).filter(x => !ids.includes(x.staffId)); }
      if (kind === 'shiftTemplates') (d.shifts ?? []).forEach(x => { if (x.templateId && ids.includes(x.templateId)) x.templateId = null; });
      if (kind === 'departments') {
        d.shifts = (d.shifts ?? []).filter(x => !ids.includes(x.departmentId));
        d.publications = (d.publications ?? []).filter(x => !ids.includes(x.departmentId));
        const pids = d.positions.filter(x => ids.includes(x.departmentId)).map(x => x.id);
        d.positions = d.positions.filter(x => !pids.includes(x.id));
        d.shiftTemplates = d.shiftTemplates.filter(x => !ids.includes(x.departmentId));
        d.staff.forEach(s => { if (s.departmentId && ids.includes(s.departmentId)) s.departmentId = null; s.positionIds = s.positionIds.filter(p => !pids.includes(p)); });
      }
      if (kind === 'positions') {
        d.staff.forEach(s => { s.positionIds = s.positionIds.filter(p => !ids.includes(p)); });
        d.shiftTemplates.forEach(x => { if (x.positionId && ids.includes(x.positionId)) x.positionId = null; });
        (d.shifts ?? []).forEach(x => { if (x.positionId && ids.includes(x.positionId)) x.positionId = null; });
      }
      if (kind === 'services') { d.reservations = d.reservations.filter(r => !ids.includes(r.serviceId)); d.menus = (d.menus ?? []).filter(m => !ids.includes(m.serviceId)); }
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
    // Module gehören zum Betrieb, nicht zum Datenstand (wie in der DB)
    this.mutate(venueId, (cur, db) => { db.data[venueId] = normalizeVenueData({ ...structuredClone(data), venue: { id: venueId, name: data.venue.name, modules: cur.venue.modules ?? [], rosterSettings: cur.venue.rosterSettings } }); });
  }
  async uploadBackground(_venueId: string, file: File): Promise<string> {
    if (file.size > 1_500_000) throw new RepoError('other', 'Bild zu groß (max. 1,5 MB im Demo-Modus)');
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
  }

  async setBranding(venueId: string, branding: Branding) {
    this.guard(venueId, 'venue');
    let name = '';
    this.mutate(venueId, d => { d.venue.branding = { ...branding }; name = d.venue.name; });
    this.emit([{ kind: 'venue', type: 'upsert', name, branding }]);
  }
  async setQrToken(venueId: string, token: string) {
    this.guard(venueId, 'venue');
    this.mutate(venueId, d => { d.venue.qrToken = token; });
  }
  async setStatusConfig(venueId: string, cfg: StatusConfig) {
    this.guard(venueId, 'venue');
    let name = '';
    this.mutate(venueId, d => { d.venue.statusConfig = structuredClone(cfg); name = d.venue.name; });
    this.emit([{ kind: 'venue', type: 'upsert', name, statusConfig: cfg }]);
  }

  /* ---------- Gäste-Speisekarte (ohne Anmeldung, wie guest_menu / guest_menu_save in der DB) ---------- */
  private guestVenue(token: string): VenueData | undefined {
    // QR-Code des Betriebs (für alle Tische) oder ein älterer Tisch-QR-Code
    return Object.values(this.read().data).find(d => d.venue?.qrToken === token || d.tables?.some(t => t.qrToken === token));
  }
  async guestMenu(token: string) {
    const d = this.guestVenue(token);
    return d ? buildGuestMenu(normalizeVenueData(d), token, today()) : null;
  }
  async guestSave(token: string, menuId: string, party: { stayId: string | null; resId?: string | null }, counts: Record<string, number>, note = '') {
    const stayId = party.stayId, resId = party.resId ?? null;
    const found = this.guestVenue(token);
    if (!found) throw new RepoError('other', 'Unbekannter Tisch');
    const view = buildGuestMenu(normalizeVenueData(found), token, today())!;
    const m = view.menus.find(x => x.id === menuId);
    if (!m || m.state !== 'offen') throw new RepoError('other', 'Auswahl ist geschlossen');
    const room = m.rooms.find(x => partyKey(x) === partyKey(party));
    if (!room) throw new RepoError('other', 'Zimmer sitzt nicht an diesem Tisch');
    const res = cleanCounts(m.items, room.persons, counts);
    if ('error' in res) throw new RepoError('other', res.error);
    if (note.length > 500) throw new RepoError('other', 'Notiz zu lang');
    let row: MenuChoice | undefined;
    this.mutate(found.venue.id, d => {
      d.menuChoices ??= [];
      const ex = d.menuChoices.find(c => c.menuId === menuId && (resId ? c.reservationId === resId : c.stayId === stayId));
      row = { id: ex?.id ?? newId(), menuId, stayId: resId ? null : stayId, reservationId: resId, counts: res.counts, note: note.trim(), updatedAt: new Date().toISOString() };
      d.menuChoices = ex ? d.menuChoices.map(c => (c === ex ? row! : c)) : [...d.menuChoices, row];
    });
    this.emit([{ kind: 'menuChoices', type: 'upsert', row: row! }]);
  }

  /* ---------- Live-Aktualisierung ---------- */
  subscribe(_venueId: string, onEvent: (e: ChangeEvent) => void, onState: (s: LiveState) => void) {
    this.listeners.add(onEvent); onState('live');
    return () => { this.listeners.delete(onEvent); };
  }
}
