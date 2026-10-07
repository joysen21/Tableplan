import type { Allergen, Board, Course, Diet, ResStatus, Role, ServiceKind, TableFeature, TableState, Unit } from './types';

export const RES_STATUS_COLOR: Record<ResStatus, string> = {
  angefragt: '#8A97B0', bestaetigt: '#4F7BD1', eingetroffen: '#a371f7', platziert: '#2da44e',
  rechnung: '#f0883e', abgeschlossen: '#4A5B7D', storniert: '#cf222e', noshow: '#7d2c2c'
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
/** Reihenfolge und Nummern wie in Anhang II der LMIV (auf Speisekarten oft als Nummer angegeben) */
export const ALLERGENS: Allergen[] = ['gluten', 'krebstiere', 'eier', 'fisch', 'erdnuesse', 'soja', 'milch', 'schalenfruechte', 'sellerie', 'senf', 'sesam', 'sulfite', 'lupinen', 'weichtiere'];
export const allergenNo = (a: Allergen) => ALLERGENS.indexOf(a) + 1;
export const COURSES: Course[] = ['vorspeise', 'suppe', 'zwischengang', 'hauptgang', 'beilage', 'dessert', 'sonstiges'];
export const UNITS: Unit[] = ['g', 'ml', 'stk'];
export const DIETS: Diet[] = ['vegetarisch', 'vegan'];
export const ROLES: Role[] = ['admin', 'empfang', 'service', 'kueche'];
export type ViewKey = 'live' | 'zeit' | 'res' | 'hotel' | 'menue' | 'berichte' | 'editor' | 'settings';
export const ROLE_VIEWS: Record<Role, ViewKey[]> = {
  admin: ['live', 'zeit', 'res', 'hotel', 'menue', 'berichte', 'editor', 'settings'],
  empfang: ['live', 'zeit', 'res', 'hotel', 'menue', 'berichte'],
  service: ['live', 'zeit', 'menue', 'berichte'],
  kueche: ['berichte', 'menue']
};
export const canEdit = (r?: Role | null) => r === 'admin' || r === 'empfang';
/** Zutaten, Gerichte und Menüs pflegen */
export const canEditMenu = (r?: Role | null) => r === 'admin' || r === 'kueche';
export const canStatus = (r?: Role | null) => !!r && r !== 'kueche';
export const isAdmin = (r?: Role | null) => r === 'admin';
