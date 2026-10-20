/** Datenzugriff über Supabase (Postgres + Auth + Realtime + Storage) */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MAX_ROOMS_PER_TABLE } from '../domain/constants';
import type { Branding, ModuleKey, OnDuty, PublicRoster, Reservation, Role, RosterSettings, StatusConfig, Stay, VenueData } from '../domain/types';
import type { GuestMenuData } from '../domain/guestMenu';
import { addDays, today } from '../lib/time';
import { entityFromDb, entityToDb, fromDb, KIND_OF, TABLE_OF, toDb } from './mapping';
import { ENTITY_KEYS, ROSTER_BASE_KEYS, ROSTER_KEYS, ROSTER_PLAN_KEYS, RepoError, type AuthUser, type ChangeEvent, type EntityKey, type EntityMap, type LiveState, type Membership, type Repo } from './repo';

const INITIAL_URL = typeof location !== 'undefined' ? location.href : '';

/** Supabase-Fehler in verständliche Meldungen übersetzen */
function wrap(e: any): RepoError {
  if (e instanceof RepoError) return e;
  const msg: string = e?.message || e?.error_description || String(e);
  const code: string = e?.code || '';
  if (msg.includes('shift_overlap'))
    return new RepoError('overlap', 'Diese Person hat zu dieser Zeit schon einen Dienst (eventuell gerade auf einem anderen Gerät eingetragen).');
  if (msg.includes('reservation_tables_max_rooms'))
    return new RepoError('overlap', `An diesem Tisch sitzen in diesem Zeitraum bereits ${MAX_ROOMS_PER_TABLE} Zimmer. Bitte anderen Tisch wählen.`);
  // Gäste-Speisekarte: verständlicher Text steht hinter dem Präfix
  if (msg.includes('guest_menu: ')) return new RepoError('other', msg.slice(msg.indexOf('guest_menu: ') + 12));
  if (code === '23P01' || msg.includes('reservation_tables_no_overlap'))
    return new RepoError('overlap', 'Der Tisch ist in diesem Zeitraum bereits belegt (eine andere Reservierung wurde gerade gespeichert). Bitte anderen Tisch oder andere Zeit wählen.');
  if (code === '40001' || msg.includes('inzwischen von jemand anderem geändert'))
    return new RepoError('conflict', msg.includes('inzwischen') ? msg + ' Der aktuelle Stand wurde geladen – bitte nochmals speichern.' : 'Die Reservierung wurde inzwischen geändert. Bitte nochmals speichern.');
  if (code === '42501' || msg.includes('row-level security')) return new RepoError('forbidden', msg.startsWith('Keine Berechtigung') ? msg : 'Keine Berechtigung für diese Änderung.');
  if (msg === 'Invalid login credentials') return new RepoError('auth', 'E-Mail oder Passwort falsch');
  if (msg === 'Email not confirmed') return new RepoError('auth', 'E-Mail-Adresse noch nicht bestätigt');
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new RepoError('network', 'Keine Verbindung zur Datenbank. Bitte Internetverbindung prüfen.');
  return new RepoError('other', msg);
}
async function run<T = any>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  let res: { data: unknown; error: unknown };
  try { res = await p; } catch (e) { throw wrap(e); }
  if (res.error) throw wrap(res.error);
  return res.data as T;
}

export class SupabaseRepo implements Repo {
  readonly mode = 'cloud' as const;
  private sb: SupabaseClient;
  private signedOutCbs: (() => void)[] = [];
  /** false, solange die Dienstplan-Migration in der Datenbank noch fehlt */
  private rosterReady = true;
  /** false, solange die Migration für Wochenplan/Abwesenheiten (20261014000000) fehlt */
  private planReady = true;
  /** Tabelle menu_choices vorhanden (Migration Gäste-Speisekarte)? */
  private choicesReady = true;

  constructor(url: string, key: string, headers?: Record<string, string>) {
    this.sb = createClient(url, key, {
      auth: { persistSession: !headers, autoRefreshToken: !headers, detectSessionInUrl: !headers },
      global: headers ? { headers } : undefined // nur für automatisierte Tests
    });
    this.sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') this.signedOutCbs.forEach(cb => cb()); });
  }

  /* ---------- Anmeldung ---------- */
  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }
  async signIn(email: string, password: string) {
    const data = await run<{ user: { id: string; email?: string } }>(this.sb.auth.signInWithPassword({ email, password }));
    return { id: data.user!.id, email: data.user!.email ?? '' };
  }
  async signOut() { await this.sb.auth.signOut(); }
  async resetPassword(email: string) { await run(this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' })); }
  async updatePassword(password: string) { await run(this.sb.auth.updateUser({ password })); }
  needsPasswordSetup() { return /type=(invite|recovery)/.test(INITIAL_URL); }
  onSignedOut(cb: () => void) { this.signedOutCbs.push(cb); }

  /* ---------- Betriebe & Mitglieder ---------- */
  async memberships(): Promise<Membership[]> {
    const user = await this.getUser(); if (!user) return [];
    const rows = await run(this.sb.from('members').select('venue_id, role, name, venues(name)').eq('user_id', user.id));
    return (rows as any[]).map(r => ({ venueId: r.venue_id, venueName: r.venues?.name ?? 'Betrieb', role: r.role as Role, name: r.name }));
  }
  async createVenue(name: string) { return (await run(this.sb.rpc('create_venue', { p_name: name }))) as string; }
  async renameVenue(venueId: string, name: string) { await run(this.sb.from('venues').update({ name }).eq('id', venueId)); }
  async setModules(venueId: string, modules: ModuleKey[]) {
    if (!this.rosterReady) throw new RepoError('other', 'Das Dienstplan-Modul ist in der Datenbank noch nicht eingerichtet (Migration 20261012000000_dienstplan.sql im Supabase SQL Editor ausführen).');
    await run(this.sb.from('venues').update({ modules }).eq('id', venueId));
  }
  async setRosterSettings(venueId: string, settings: Partial<RosterSettings>) {
    await run(this.sb.from('venues').update({ roster_settings: settings }).eq('id', venueId));
  }
  async publicRoster(token: string): Promise<PublicRoster | null> {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
    return (await run<PublicRoster | null>(this.sb.rpc('public_roster', { p_token: token }))) ?? null;
  }
  async onDuty(venueId: string, date: string): Promise<OnDuty[]> {
    if (!this.planReady) return [];
    return (await run<OnDuty[]>(this.sb.rpc('on_duty', { p_venue: venueId, p_date: date }))) ?? [];
  }
  async members(venueId: string) {
    const rows = await run(this.sb.from('members').select('user_id, role, name, email').eq('venue_id', venueId).order('name'));
    return (rows as any[]).map(fromDb.member);
  }
  async addMember(venueId: string, email: string, role: Role, name: string) {
    await run(this.sb.rpc('add_member', { p_venue: venueId, p_email: email, p_role: role, p_name: name }));
  }
  async updateMember(venueId: string, userId: string, patch: { role?: Role; name?: string }) {
    await run(this.sb.from('members').update(patch).eq('venue_id', venueId).eq('user_id', userId));
  }
  async removeMember(venueId: string, userId: string) { await run(this.sb.from('members').delete().eq('venue_id', venueId).eq('user_id', userId)); }

  /* ---------- Laden ---------- */
  private async all(table: string, build: (q: any) => any, select = '*'): Promise<any[]> {
    const out: any[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = await run<any[]>(build(this.sb.from(table).select(select)).range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }
  async loadVenue(venueId: string, venueName: string, historyDays: number): Promise<VenueData> {
    const cutoff = addDays(today(), -historyDays);
    const byVenue = (q: any) => q.eq('venue_id', venueId).order('id');
    const [rooms, stations, tables, decor, combos, layouts, services, blocks, stays, reservations, audit, venue, ingredients, dishes, menus, roster, choices] = await Promise.all([
      this.all('rooms', byVenue), this.all('stations', byVenue), this.all('dining_tables', byVenue), this.all('decor', byVenue),
      this.all('table_combos', byVenue), this.all('layouts', byVenue), this.all('services', byVenue),
      this.all('table_blocks', q => byVenue(q).gte('date', cutoff)),
      this.all('stays', q => byVenue(q).gte('departure', cutoff)),
      this.all('reservations', q => byVenue(q).gte('date', cutoff), '*, reservation_tables(table_id)'),
      run<any[]>(this.sb.from('audit_log').select('*').eq('venue_id', venueId).order('ts', { ascending: false }).limit(300)),
      run<any>(this.sb.from('venues').select('*').eq('id', venueId).maybeSingle()),
      this.all('ingredients', byVenue), this.all('dishes', byVenue), this.all('menus', q => byVenue(q).gte('date', cutoff)),
      this.loadRoster(venueId, cutoff), this.loadChoices(venueId)
    ]);
    return {
      venue: { id: venueId, name: venue?.name ?? venueName, modules: this.rosterReady ? venue?.modules ?? [] : [], rosterSettings: venue?.roster_settings ?? {}, branding: venue?.branding ?? undefined, statusConfig: venue?.status_config ?? {} },
      rooms: rooms.map(fromDb.rooms).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
      stations: stations.map(fromDb.stations), tables: tables.map(fromDb.tables), decor: decor.map(fromDb.decor),
      combos: combos.map(fromDb.combos), layouts: layouts.map(fromDb.layouts),
      services: services.map(fromDb.services).sort((a, b) => a.sort - b.sort || a.start.localeCompare(b.start)),
      blocks: blocks.map(fromDb.blocks), stays: stays.map(fromDb.stays), reservations: reservations.map(fromDb.reservation),
      audit: audit.map(fromDb.audit),
      ingredients: ingredients.map(fromDb.ingredients).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      dishes: dishes.map(fromDb.dishes).sort((a, b) => a.name.localeCompare(b.name, 'de')), menus: menus.map(fromDb.menus),
      // nur Auswahl zu geladenen Menüs (ältere fallen weg)
      menuChoices: choices.filter(c => menus.some(m => m.id === c.menuId)),
      ...roster
    };
  }
  /** Gäste-Auswahl der Menüs (QR); fehlt die Migration noch, bleibt die Liste leer */
  private async loadChoices(venueId: string) {
    try {
      const rows = await this.all('menu_choices', q => q.eq('venue_id', venueId).order('id'));
      this.choicesReady = true;
      return rows.map(fromDb.menuChoices);
    } catch (e: any) {
      if (!/42P01|PGRST205|does not exist|Could not find the table/.test(String(e?.message) + (e?.code ?? ''))) throw e;
      this.choicesReady = false;
      return [];
    }
  }
  /** Dienstplan-Stammdaten; fehlt die Migration noch, bleibt das Modul einfach aus */
  private async loadRoster(venueId: string, cutoff: string) {
    const byVenue = (q: any) => q.eq('venue_id', venueId).order('id');
    // 42P01 / PGRST205: Tabelle unbekannt (Migration fehlt)
    const missing = (e: any) => /42P01|PGRST205|does not exist|Could not find the table/.test(String(e?.message) + (e?.code ?? ''));
    const empty = { departments: [], positions: [], staff: [], shiftTemplates: [], shifts: [], absences: [], publications: [] };
    let base;
    try { base = await Promise.all(ROSTER_BASE_KEYS.map(k => this.all(TABLE_OF[k], byVenue))); this.rosterReady = true; }
    catch (e) { if (!missing(e)) throw e; this.rosterReady = false; this.planReady = false; return empty; }
    let plan: any[][];
    try {
      plan = await Promise.all([
        this.all('shifts', q => byVenue(q).gte('date', cutoff)), this.all('absences', q => byVenue(q).gte('date_to', cutoff)),
        this.all('roster_publications', q => byVenue(q).gte('week_start', addDays(cutoff, -7)))
      ]);
      this.planReady = true;
    } catch (e) { if (!missing(e)) throw e; this.planReady = false; plan = [[], [], []]; }
    const [departments, positions, staff, shiftTemplates] = base;
    return {
      departments: departments.map(fromDb.departments), positions: positions.map(fromDb.positions),
      staff: staff.map(fromDb.staff), shiftTemplates: shiftTemplates.map(fromDb.shiftTemplates),
      shifts: plan[0].map(fromDb.shifts), absences: plan[1].map(fromDb.absences), publications: plan[2].map(fromDb.publications)
    };
  }

  /* ---------- Schreiben ---------- */
  async saveReservations(venueId: string, items: Reservation[], deleteIds: string[] = []): Promise<Reservation[]> {
    const out: Reservation[] = [];
    for (let i = 0; i < Math.max(items.length, 1); i += 200) {
      const chunk = items.slice(i, i + 200);
      if (!chunk.length && i > 0) break;
      const rows = await run<any[]>(this.sb.rpc('save_reservations', { p_venue: venueId, p_items: chunk.map(toDb.reservation), p_delete: i === 0 ? deleteIds : [] }));
      out.push(...(rows || []).map(fromDb.reservation));
    }
    return out;
  }
  async setStatus(venueId: string, id: string, patch: Pick<Reservation, 'status' | 'subStatus' | 'seatedAt' | 'finishedAt'>) {
    const row = await run<{ updated_at: string } | null>(this.sb.from('reservations').update({ status: patch.status, sub_status: patch.subStatus ?? null, seated_at: patch.seatedAt, finished_at: patch.finishedAt })
      .eq('venue_id', venueId).eq('id', id).select('updated_at').maybeSingle());
    return row?.updated_at;
  }
  async saveStay(venueId: string, stay: Stay, items: Reservation[], deleteIds: string[]): Promise<{ stay: Stay; reservations: Reservation[] }> {
    const res = await run<any>(this.sb.rpc('save_stay', { p_venue: venueId, p_stay: toDb.stays(stay, venueId), p_items: items.map(toDb.reservation), p_delete: deleteIds }));
    return { stay: fromDb.stays(res.stay), reservations: (res.reservations || []).map(fromDb.reservation) };
  }
  async deleteStay(venueId: string, stayId: string, deleteReservationIds: string[]) {
    if (deleteReservationIds.length) await run(this.sb.from('reservations').delete().eq('venue_id', venueId).in('id', deleteReservationIds));
    await run(this.sb.from('stays').delete().eq('venue_id', venueId).eq('id', stayId));
  }
  async upsert<K extends EntityKey>(venueId: string, kind: K, rows: EntityMap[K][]) {
    // Spalten der Planungs-Migration weglassen, solange sie noch nicht eingespielt ist
    const strip = this.planReady ? [] : ['guests_per_staff', 'min_staff', 'vacation_days', 'share_token'];
    const toRow = (r: EntityMap[K]) => { const row = entityToDb(kind, r, venueId); strip.forEach(k => delete row[k]); return row; };
    for (let i = 0; i < rows.length; i += 500)
      await run(this.sb.from(TABLE_OF[kind]).upsert(rows.slice(i, i + 500).map(toRow)));
  }
  async remove(venueId: string, kind: EntityKey, ids: string[]) {
    if (ids.length) await run(this.sb.from(TABLE_OF[kind]).delete().eq('venue_id', venueId).in('id', ids));
  }
  async log(venueId: string, entry: { userName: string; action: string; details: string }) {
    await run(this.sb.from('audit_log').insert({ venue_id: venueId, user_name: entry.userName, action: entry.action, details: entry.details }));
  }
  async replaceAll(venueId: string, d: VenueData) {
    // Bestehendes löschen (Reservierungen zuerst, Tischbelegung kaskadiert)
    const roster = [...(this.planReady ? ['roster_publications', 'absences', 'shifts'] : []), ...(this.rosterReady ? ['shift_templates', 'staff', 'positions', 'departments'] : [])];
    for (const t of [...roster, 'menus', 'dishes', 'ingredients', 'reservations', 'stays', 'table_blocks', 'table_combos', 'layouts', 'decor', 'dining_tables', 'stations', 'rooms', 'services'])
      await run(this.sb.from(t).delete().eq('venue_id', venueId));
    for (const k of ENTITY_KEYS) {
      if ((!this.rosterReady && ROSTER_KEYS.includes(k)) || (!this.planReady && ROSTER_PLAN_KEYS.includes(k))) continue;
      await this.upsert(venueId, k, d[k] as any);
    }
    await this.upsertStaysRaw(venueId, d.stays);
    await this.saveReservations(venueId, d.reservations);
  }
  private async upsertStaysRaw(venueId: string, stays: Stay[]) {
    for (let i = 0; i < stays.length; i += 500)
      await run(this.sb.from('stays').upsert(stays.slice(i, i + 500).map(s => toDb.stays(s, venueId))));
  }
  async uploadBackground(venueId: string, file: File) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${venueId}/${crypto.randomUUID()}.${ext}`;
    await run(this.sb.storage.from('floorplans').upload(path, file, { upsert: false, contentType: file.type }));
    return this.sb.storage.from('floorplans').getPublicUrl(path).data.publicUrl;
  }

  async setBranding(venueId: string, branding: Branding) {
    await run(this.sb.from('venues').update({ branding }).eq('id', venueId));
  }
  async setStatusConfig(venueId: string, cfg: StatusConfig) {
    await run(this.sb.from('venues').update({ status_config: cfg }).eq('id', venueId));
  }

  /* ---------- Gäste-Speisekarte (ohne Anmeldung) ---------- */
  async guestMenu(token: string) {
    return (await run<GuestMenuData | null>(this.sb.rpc('guest_menu', { p_token: token }))) ?? null;
  }
  async guestSave(token: string, menuId: string, party: { stayId: string | null; resId?: string | null }, counts: Record<string, number>, note = '') {
    await run(this.sb.rpc('guest_menu_save', { p_token: token, p_menu: menuId, p_stay: party.stayId, p_counts: counts, p_note: note, p_res: party.resId ?? null }));
  }

  /* ---------- Live-Aktualisierung ---------- */
  subscribe(venueId: string, onEvent: (e: ChangeEvent) => void, onState: (s: LiveState) => void) {
    onState('connecting');
    const ch = this.sb.channel(`venue-${venueId}-${crypto.randomUUID()}`);
    const skip = [...(this.rosterReady ? this.planReady ? [] : ROSTER_PLAN_KEYS : ROSTER_KEYS).map(k => TABLE_OF[k]), ...(this.choicesReady ? [] : ['menu_choices'])];
    const tables = Object.values(TABLE_OF).filter(t => !skip.includes(t)).concat('venues');
    const handle = (p: any) => {
      const table: string = p.table;
      if (table === 'venues') {
        if (p.new?.id === venueId) onEvent({ kind: 'venue', type: 'upsert', name: p.new.name, modules: this.rosterReady ? p.new.modules : undefined, rosterSettings: p.new.roster_settings, branding: p.new.branding ?? undefined, statusConfig: p.new.status_config ?? undefined });
        return;
      }
      const kind = KIND_OF[table];
      if (!kind) return;
      if (p.eventType === 'DELETE') {
        const o = p.old || {};
        if (kind === 'reservation_tables') { if (o.reservation_id) onEvent({ kind, type: 'unlink', reservationId: o.reservation_id, tableId: o.table_id }); return; }
        if (o.id && kind !== 'audit') onEvent({ kind: kind as any, type: 'delete', id: o.id });
        return;
      }
      const n = p.new; if (!n || n.venue_id !== venueId) return;
      if (kind === 'reservation_tables') onEvent({ kind, type: 'link', reservationId: n.reservation_id, tableId: n.table_id });
      else if (kind === 'reservations') { const { tableIds: _t, ...row } = fromDb.reservation(n); onEvent({ kind, type: 'upsert', row }); }
      else if (kind === 'stays') onEvent({ kind, type: 'upsert', row: fromDb.stays(n) });
      else if (kind === 'audit') onEvent({ kind, type: 'insert', row: fromDb.audit(n) });
      else onEvent({ kind, type: 'upsert', row: entityFromDb(kind, n) } as ChangeEvent);
    };
    for (const t of tables) {
      if (t === 'venues') { ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: t, filter: `id=eq.${venueId}` }, handle); continue; }
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: t, filter: `venue_id=eq.${venueId}` }, handle);
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: t, filter: `venue_id=eq.${venueId}` }, handle);
      // DELETE-Ereignisse lassen sich nicht filtern; unbekannte IDs werden im Store ignoriert
      if (t !== 'audit_log') ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: t }, handle);
    }
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') onState('live');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onState('down');
    });
    return () => { this.sb.removeChannel(ch); };
  }
}
