/**
 * Datenzugriff – Schnittstelle, die von der Supabase-Implementierung
 * und der Demo-Implementierung (Daten im Browser) erfüllt wird.
 */
import type {
  AuditEntry, Decor, DiningTable, Layout, Member, Reservation, Role, Room, Service, Station, Stay, TableBlock, TableCombo, VenueData
} from '../domain/types';

export interface EntityMap {
  rooms: Room; stations: Station; tables: DiningTable; decor: Decor; combos: TableCombo; layouts: Layout; services: Service; blocks: TableBlock;
}
export type EntityKey = keyof EntityMap;
export const ENTITY_KEYS: EntityKey[] = ['services', 'rooms', 'stations', 'tables', 'decor', 'combos', 'layouts', 'blocks'];

export interface AuthUser { id: string; email: string }
export interface Membership { venueId: string; venueName: string; role: Role; name: string }

export type ChangeEvent =
  | { kind: EntityKey; type: 'upsert'; row: EntityMap[EntityKey] }
  | { kind: EntityKey | 'stays' | 'reservations'; type: 'delete'; id: string }
  | { kind: 'stays'; type: 'upsert'; row: Stay }
  | { kind: 'reservations'; type: 'upsert'; row: Omit<Reservation, 'tableIds'> }
  | { kind: 'reservation_tables'; type: 'link' | 'unlink'; reservationId: string; tableId: string }
  | { kind: 'audit'; type: 'insert'; row: AuditEntry }
  | { kind: 'venue'; type: 'upsert'; name: string };

export type LiveState = 'connecting' | 'live' | 'down';

export type RepoErrorCode = 'overlap' | 'forbidden' | 'network' | 'auth' | 'other';
export class RepoError extends Error {
  constructor(public code: RepoErrorCode, message: string) { super(message); }
}

export interface Repo {
  readonly mode: 'cloud' | 'demo';
  // Anmeldung
  getUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** true, wenn die Seite über einen Einladungs-/Passwort-Link geöffnet wurde */
  needsPasswordSetup(): boolean;
  onSignedOut(cb: () => void): void;
  // Betriebe & Mitglieder
  memberships(): Promise<Membership[]>;
  createVenue(name: string): Promise<string>;
  renameVenue(venueId: string, name: string): Promise<void>;
  members(venueId: string): Promise<Member[]>;
  addMember(venueId: string, email: string, role: Role, name: string): Promise<void>;
  updateMember(venueId: string, userId: string, patch: Partial<Pick<Member, 'role' | 'name'>>): Promise<void>;
  removeMember(venueId: string, userId: string): Promise<void>;
  // Laden
  loadVenue(venueId: string, venueName: string, historyDays: number): Promise<VenueData>;
  // Schreiben
  saveReservations(venueId: string, items: Reservation[], deleteIds?: string[]): Promise<Reservation[]>;
  setStatus(venueId: string, id: string, patch: Pick<Reservation, 'status' | 'seatedAt' | 'finishedAt'>): Promise<void>;
  saveStay(venueId: string, stay: Stay, items: Reservation[], deleteIds: string[]): Promise<{ stay: Stay; reservations: Reservation[] }>;
  deleteStay(venueId: string, stayId: string, deleteReservationIds: string[]): Promise<void>;
  upsert<K extends EntityKey>(venueId: string, kind: K, rows: EntityMap[K][]): Promise<void>;
  remove(venueId: string, kind: EntityKey, ids: string[]): Promise<void>;
  log(venueId: string, entry: Omit<AuditEntry, 'id' | 'ts'>): Promise<void>;
  /** Kompletten Datenstand ersetzen (Einrichtung, Demo-Daten, Sicherung einspielen) */
  replaceAll(venueId: string, data: VenueData): Promise<void>;
  uploadBackground(venueId: string, file: File): Promise<string>;
  // Live-Aktualisierung
  subscribe(venueId: string, onEvent: (e: ChangeEvent) => void, onState: (s: LiveState) => void): () => void;
}
