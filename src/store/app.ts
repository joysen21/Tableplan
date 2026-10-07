/**
 * Zentraler Daten-Store: Anmeldung, Betriebswahl, Datenstand des Betriebs,
 * Schreiboperationen (über das Repo) und Live-Aktualisierungen.
 */
import { create } from 'zustand';
import { repo, HISTORY_DAYS } from '../data';
import { RepoError, type ChangeEvent, type EntityKey, type EntityMap, type LiveState, type Membership } from '../data/repo';
import { demoVenueData, emptyVenueData, newId, normalizeVenueData } from '../domain/demo';
import { OPEN_STATES } from '../domain/constants';
import { planStay } from '../domain/logic';
import type { Reservation, ResStatus, SessionUser, Stay, VenueData } from '../domain/types';
import { nowMin, today } from '../lib/time';
import { toast } from '../ui/notify';

export type Phase = 'init' | 'login' | 'setpw' | 'loading' | 'select' | 'novenue' | 'empty' | 'ready' | 'error';

interface AppState {
  phase: Phase; error: string; authEmail: string; memberships: Membership[];
  user: SessionUser | null; data: VenueData | null; live: LiveState; saving: number;
  init(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setPassword(pw: string): Promise<void>;
  selectVenue(m: Membership): Promise<void>;
  switchVenue(): void;
  createVenue(name: string): Promise<void>;
  setupVenue(kind: 'demo' | 'empty'): Promise<void>;
  reload(): Promise<void>;
  saveReservations(items: Reservation[], deleteIds?: string[], logText?: [string, string]): Promise<boolean>;
  setStatus(r: Reservation, status: ResStatus): Promise<boolean>;
  saveStay(stay: Stay, opts?: { resetManual?: boolean; logText?: [string, string] }): Promise<{ ok: boolean; skipped: string[] }>;
  deleteStay(stay: Stay): Promise<boolean>;
  upsert<K extends EntityKey>(kind: K, rows: EntityMap[K][], logText?: [string, string]): Promise<boolean>;
  remove(kind: EntityKey, ids: string[], logText?: [string, string]): Promise<boolean>;
  renameVenue(name: string): Promise<void>;
  replaceAll(data: VenueData, logText: string): Promise<boolean>;
  log(action: string, details?: string): void;
}

let unsubscribe: (() => void) | null = null;
const pendingLinks = new Map<string, Set<string>>(); // Tischzuordnungen, deren Reservierung noch nicht da ist

function errorMessage(e: unknown) { return e instanceof RepoError ? e.message : (e as Error)?.message || String(e); }

/** Live-Ereignis auf den Datenstand anwenden (unveränderlich, für React) */
export function applyEvent(d: VenueData, e: ChangeEvent): VenueData {
  const upsertIn = <T extends { id: string }>(list: T[], row: T) => {
    const i = list.findIndex(x => x.id === row.id);
    return i >= 0 ? list.map((x, j) => (j === i ? row : x)) : [...list, row];
  };
  switch (e.kind) {
    case 'venue': return { ...d, venue: { ...d.venue, name: e.name } };
    case 'audit': return d.audit.some(a => a.id === e.row.id) ? d : { ...d, audit: [e.row, ...d.audit].slice(0, 500) };
    case 'reservation_tables': {
      const r = d.reservations.find(x => x.id === e.reservationId);
      if (!r) {
        if (e.type === 'link') { const s = pendingLinks.get(e.reservationId) ?? new Set(); s.add(e.tableId); pendingLinks.set(e.reservationId, s); }
        return d;
      }
      const has = r.tableIds.includes(e.tableId);
      if ((e.type === 'link') === has) return d;
      const tableIds = e.type === 'link' ? [...r.tableIds, e.tableId] : r.tableIds.filter(t => t !== e.tableId);
      return { ...d, reservations: d.reservations.map(x => (x.id === r.id ? { ...x, tableIds } : x)) };
    }
    case 'reservations': {
      if (e.type === 'delete') return d.reservations.some(r => r.id === e.id) ? { ...d, reservations: d.reservations.filter(r => r.id !== e.id) } : d;
      const cur = d.reservations.find(r => r.id === e.row.id);
      if (cur && cur.updatedAt && e.row.updatedAt && cur.updatedAt > e.row.updatedAt) return d; // veraltetes Echo
      const extra = pendingLinks.get(e.row.id); pendingLinks.delete(e.row.id);
      const tableIds = cur ? cur.tableIds : [...(extra ?? [])];
      return { ...d, reservations: upsertIn(d.reservations, { ...e.row, tableIds }) };
    }
    case 'stays':
      if (e.type === 'delete') return { ...d, stays: d.stays.filter(s => s.id !== e.id) };
      return { ...d, stays: upsertIn(d.stays, e.row) };
    default: {
      const k = e.kind as EntityKey;
      const list = d[k] as unknown as { id: string }[];
      if (e.type === 'delete') return list.some(x => x.id === e.id) ? { ...d, [k]: list.filter(x => x.id !== e.id) } : d;
      return { ...d, [k]: upsertIn(list, (e as any).row) };
    }
  }
}

export const useApp = create<AppState>((set, get) => {
  /** Schreibvorgang mit Zähler für die Statusanzeige und einheitlicher Fehlerbehandlung */
  async function write<T>(fn: () => Promise<T>): Promise<T | undefined> {
    set(s => ({ saving: s.saving + 1 }));
    try { return await fn(); }
    catch (e) {
      const msg = errorMessage(e);
      toast(msg, 'err');
      if (e instanceof RepoError && e.code === 'forbidden') get().reload();
      return undefined;
    } finally { set(s => ({ saving: s.saving - 1 })); }
  }
  const venueId = () => get().data!.venue.id;
  const mergeReservations = (saved: Reservation[], deleteIds: string[]) => set(s => {
    if (!s.data) return {};
    let list = s.data.reservations.filter(r => !deleteIds.includes(r.id));
    for (const r of saved) { const i = list.findIndex(x => x.id === r.id); list = i >= 0 ? list.map((x, j) => (j === i ? r : x)) : [...list, r]; }
    return { data: { ...s.data, reservations: list } };
  });
  async function startVenue(m: Membership) {
    const user = await repo.getUser();
    if (!user) { set({ phase: 'login' }); return; }
    set({ phase: 'loading', user: { id: user.id, email: user.email, name: m.name || user.email, role: m.role } });
    try { localStorage.setItem('tischplan.venue', m.venueId); } catch { /* egal */ }
    try {
      const data = await repo.loadVenue(m.venueId, m.venueName, HISTORY_DAYS);
      set({ data, phase: data.services.length ? 'ready' : 'empty' });
      unsubscribe?.();
      unsubscribe = repo.subscribe(m.venueId, ev => set(s => (s.data ? { data: applyEvent(s.data, ev) } : {})), live => {
        const was = get().live; set({ live });
        if (live === 'live' && was === 'down') get().reload(); // nach Verbindungsabbruch neu laden
      });
    } catch (e) { set({ phase: 'error', error: errorMessage(e) }); }
  }
  async function afterLogin() {
    set({ phase: 'loading' });
    try {
      const user = await repo.getUser();
      if (!user) { set({ phase: 'login' }); return; }
      set({ authEmail: user.email });
      if (repo.needsPasswordSetup() && !sessionStorage.getItem('tischplan.pwset')) { set({ phase: 'setpw' }); return; }
      const ms = await repo.memberships();
      set({ memberships: ms });
      if (!ms.length) { set({ phase: 'novenue' }); return; }
      let last: string | null = null; try { last = localStorage.getItem('tischplan.venue'); } catch { /* egal */ }
      const m = ms.find(x => x.venueId === last) ?? (ms.length === 1 ? ms[0] : undefined);
      if (m) await startVenue(m); else set({ phase: 'select' });
    } catch (e) { set({ phase: 'error', error: errorMessage(e) }); }
  }
  repo.onSignedOut(() => { unsubscribe?.(); unsubscribe = null; set({ phase: 'login', user: null, data: null, memberships: [] }); });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && get().phase === 'ready' && get().live !== 'live') get().reload(); });
  }

  return {
    phase: 'init', error: '', authEmail: '', memberships: [], user: null, data: null, live: 'connecting', saving: 0,

    async init() { await afterLogin(); },
    async login(email, password) {
      try { await repo.signIn(email, password); await afterLogin(); }
      catch (e) { toast('Anmeldung fehlgeschlagen: ' + errorMessage(e), 'err'); }
    },
    async logout() { unsubscribe?.(); unsubscribe = null; await repo.signOut(); set({ phase: 'login', user: null, data: null }); },
    async setPassword(pw) {
      try { await repo.updatePassword(pw); sessionStorage.setItem('tischplan.pwset', '1'); history.replaceState(null, '', location.pathname); toast('Passwort gespeichert'); await afterLogin(); }
      catch (e) { toast(errorMessage(e), 'err'); }
    },
    async selectVenue(m) { await startVenue(m); },
    switchVenue() { unsubscribe?.(); unsubscribe = null; try { localStorage.removeItem('tischplan.venue'); } catch { /* egal */ } set({ data: null, phase: 'select' }); },
    async createVenue(name) {
      try { const id = await repo.createVenue(name); try { localStorage.setItem('tischplan.venue', id); } catch { /* egal */ } await afterLogin(); }
      catch (e) { toast(errorMessage(e), 'err'); }
    },
    async setupVenue(kind) {
      const d = get().data!; const v = d.venue;
      const next = kind === 'demo' ? demoVenueData(v.id, v.name) : emptyVenueData(v.id, v.name);
      const ok = await get().replaceAll(next, kind === 'demo' ? 'Betrieb mit Demo-Daten eingerichtet' : 'Betrieb leer eingerichtet');
      if (ok) set({ phase: 'ready' });
    },
    async reload() {
      const d = get().data; const u = get().user; if (!d || !u) return;
      try { const data = await repo.loadVenue(d.venue.id, d.venue.name, HISTORY_DAYS); set({ data }); }
      catch (e) { toast(errorMessage(e), 'err'); }
    },

    async saveReservations(items, deleteIds = [], logText) {
      const saved = await write(() => repo.saveReservations(venueId(), items, deleteIds));
      if (!saved) return false;
      mergeReservations(saved, deleteIds);
      if (logText) get().log(...logText);
      return true;
    },
    async setStatus(r, status) {
      const patch = {
        status,
        seatedAt: status === 'platziert' && r.status !== 'platziert' && r.date === today() ? nowMin() : r.seatedAt,
        finishedAt: status === 'abgeschlossen' && r.date === today() ? nowMin() : r.finishedAt
      };
      const ok = await write(async () => { await repo.setStatus(venueId(), r.id, patch); return true; });
      if (!ok) return false;
      set(s => (s.data ? { data: { ...s.data, reservations: s.data.reservations.map(x => (x.id === r.id ? { ...x, ...patch } : x)) } } : {}));
      get().log('Status geändert', `${r.name}: ${r.status} → ${status}`);
      return true;
    },
    async saveStay(stay, opts = {}) {
      const d = get().data!;
      const temp = { ...d, stays: d.stays.some(s => s.id === stay.id) ? d.stays.map(s => (s.id === stay.id ? stay : s)) : [...d.stays, stay] };
      const plan = planStay(temp, stay, newId, opts.resetManual);
      const res = await write(() => repo.saveStay(venueId(), stay, plan.upserts, plan.deleteIds));
      if (!res) return { ok: false, skipped: [] };
      set(s => (s.data ? { data: { ...s.data, stays: temp.stays.map(x => (x.id === stay.id ? res.stay : x)) } } : {}));
      mergeReservations(res.reservations, plan.deleteIds);
      if (opts.logText) get().log(...opts.logText);
      return { ok: true, skipped: plan.skipped };
    },
    async deleteStay(stay) {
      const d = get().data!;
      const del = d.reservations.filter(r => r.stayId === stay.id && OPEN_STATES.includes(r.status)).map(r => r.id);
      const ok = await write(async () => { await repo.deleteStay(venueId(), stay.id, del); return true; });
      if (!ok) return false;
      set(s => (s.data ? { data: { ...s.data, stays: s.data.stays.filter(x => x.id !== stay.id),
        reservations: s.data.reservations.filter(r => !del.includes(r.id)).map(r => (r.stayId === stay.id ? { ...r, stayId: null } : r)) } } : {}));
      get().log('Aufenthalt gelöscht', `Zi. ${stay.roomNo} ${stay.name}`);
      return true;
    },
    async upsert(kind, rows, logText) {
      const before = get().data!;
      // optimistisch übernehmen, bei Fehler Serverstand neu laden
      set(s => {
        if (!s.data) return {};
        let list = s.data[kind] as unknown as { id: string }[];
        for (const r of rows) { const i = list.findIndex(x => x.id === r.id); list = i >= 0 ? list.map((x, j) => (j === i ? r : x)) : [...list, r]; }
        return { data: { ...s.data, [kind]: list } };
      });
      const ok = await write(async () => { await repo.upsert(before.venue.id, kind, rows); return true; });
      if (!ok) { set({ data: before }); return false; }
      if (logText) get().log(...logText);
      return true;
    },
    async remove(kind, ids, logText) {
      const ok = await write(async () => { await repo.remove(venueId(), kind, ids); return true; });
      if (!ok) return false;
      if (kind === 'tables' || kind === 'rooms' || kind === 'services') await get().reload(); // Folgeänderungen (Kaskaden) übernehmen
      else set(s => (s.data ? { data: { ...s.data, [kind]: (s.data[kind] as unknown as { id: string }[]).filter(x => !ids.includes(x.id)) } } : {}));
      if (logText) get().log(...logText);
      return true;
    },
    async renameVenue(name) {
      const ok = await write(async () => { await repo.renameVenue(venueId(), name); return true; });
      if (ok) set(s => (s.data ? { data: { ...s.data, venue: { ...s.data.venue, name } } } : {}));
    },
    async replaceAll(data, logText) {
      const ok = await write(async () => { await repo.replaceAll(venueId(), normalizeVenueData(data)); return true; });
      if (!ok) return false;
      await get().reload();
      get().log(logText);
      return true;
    },
    log(action, details = '') {
      const s = get(); if (!s.data || !s.user || s.user.role === 'kueche') return;
      const entry = { userName: s.user.name, action, details };
      if (repo.mode === 'demo') set(st => (st.data ? { data: { ...st.data, audit: [{ id: newId(), ts: new Date().toISOString(), ...entry }, ...st.data.audit] } } : {}));
      repo.log(s.data.venue.id, entry).catch(() => { /* Protokoll ist nicht kritisch */ });
    }
  };
});
