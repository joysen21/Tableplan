import type { Board, ResStatus, Role, ServiceKind, TableFeature, TableState } from './types';

export const RES_STATUS_COLOR: Record<ResStatus, string> = {
  angefragt: '#8c959f', bestaetigt: '#4f8ef7', eingetroffen: '#a371f7', platziert: '#2da44e',
  rechnung: '#f0883e', abgeschlossen: '#57606a', storniert: '#cf222e', noshow: '#7d2c2c'
};
export const ALL_STATUS = Object.keys(RES_STATUS_COLOR) as ResStatus[];
export const OPEN_STATES: ResStatus[] = ['angefragt', 'bestaetigt'];
export const SEATED_STATES: ResStatus[] = ['eingetroffen', 'platziert', 'rechnung'];
export const TABLE_STATES: TableState[] = ['frei', 'reserviert', 'bald', 'platziert', 'rechnung', 'ueberfaellig', 'ueberzogen', 'gesperrt'];
export const TABLE_STATE_ICON: Record<TableState, string> = { frei: '', reserviert: '◷', bald: '⏳', platziert: '●', rechnung: '€', ueberfaellig: '!', ueberzogen: '⌛', gesperrt: '✕' };
export const FEATURES: TableFeature[] = ['fenster', 'rollstuhl', 'hund', 'kinder', 'ruhig'];
export const OCCASIONS = ['', 'Geburtstag', 'Jubiläum', 'Business', 'Hochzeitstag', 'Familienfeier', 'Sonstiges'];
export const SOURCES = ['Telefon', 'Walk-in', 'Hotel', 'Hotel-Rezeption', 'Website', 'Google', 'E-Mail', 'Persönlich'];
export const BOARDS: Board[] = ['UF', 'HP', 'VP', 'AI'];
export const BOARD_SERVICES: Record<Board, ServiceKind[]> = { UF: [], HP: ['abend'], VP: ['mittag', 'abend'], AI: ['fruehstueck', 'mittag', 'abend'] };
export const ROLES: Role[] = ['admin', 'empfang', 'service', 'kueche'];
export type ViewKey = 'live' | 'zeit' | 'res' | 'hotel' | 'berichte' | 'editor' | 'settings';
export const ROLE_VIEWS: Record<Role, ViewKey[]> = {
  admin: ['live', 'zeit', 'res', 'hotel', 'berichte', 'editor', 'settings'],
  empfang: ['live', 'zeit', 'res', 'hotel', 'berichte'],
  service: ['live', 'zeit', 'berichte'],
  kueche: ['berichte']
};
export const canEdit = (r?: Role | null) => r === 'admin' || r === 'empfang';
export const canStatus = (r?: Role | null) => !!r && r !== 'kueche';
export const isAdmin = (r?: Role | null) => r === 'admin';
