import type { Allergen, Board, ContractType, Course, Department, Diet, ResStatus, Role, ServiceKind, TableFeature, Unit, Venue } from './types';
import { moduleAllowed } from './orders';

export const RES_STATUS_COLOR: Record<ResStatus, string> = {
  angefragt: '#8A97B0', bestaetigt: '#4F7BD1', eingetroffen: '#a371f7', platziert: '#2da44e',
  rechnung: '#f0883e', abgeschlossen: '#4A5B7D', storniert: '#cf222e', noshow: '#7d2c2c'
};
export const ALL_STATUS = Object.keys(RES_STATUS_COLOR) as ResStatus[];
export const OPEN_STATES: ResStatus[] = ['angefragt', 'bestaetigt'];
export const SEATED_STATES: ResStatus[] = ['eingetroffen', 'platziert', 'rechnung'];
export const FEATURES: TableFeature[] = ['fenster', 'rollstuhl', 'hund', 'kinder', 'ruhig'];
export const OCCASIONS = ['', 'Geburtstag', 'Jubiläum', 'Business', 'Hochzeitstag', 'Familienfeier', 'Sonstiges'];
export const SOURCES = ['Telefon', 'Walk-in', 'Hotel', 'Hotel-Rezeption', 'Website', 'Google', 'E-Mail', 'Persönlich'];
export const BOARDS: Board[] = ['UF', 'HP', 'VP', 'AI'];
/** So viele Hotelzimmer dürfen sich gleichzeitig einen Tisch teilen (externe Gäste nie) – gleiche Zahl in der DB-Migration */
export const MAX_ROOMS_PER_TABLE = 3;
export const BOARD_SERVICES: Record<Board, ServiceKind[]> = { UF: [], HP: ['abend'], VP: ['mittag', 'abend'], AI: ['fruehstueck', 'mittag', 'abend'] };
/** Mahlzeiten, die eine Verpflegung enthält (Frühstück immer) – für Services mit freier Platzwahl, wo es keine Tischreservierung gibt */
export const BOARD_MEALS: Record<Board, ServiceKind[]> = { UF: ['fruehstueck'], HP: ['fruehstueck', 'abend'], VP: ['fruehstueck', 'mittag', 'abend'], AI: ['fruehstueck', 'mittag', 'abend'] };
/** Reihenfolge und Nummern wie in Anhang II der LMIV (auf Speisekarten oft als Nummer angegeben) */
export const ALLERGENS: Allergen[] = ['gluten', 'krebstiere', 'eier', 'fisch', 'erdnuesse', 'soja', 'milch', 'schalenfruechte', 'sellerie', 'senf', 'sesam', 'sulfite', 'lupinen', 'weichtiere'];
export const allergenNo = (a: Allergen) => ALLERGENS.indexOf(a) + 1;
export const COURSES: Course[] = ['vorspeise', 'suppe', 'zwischengang', 'hauptgang', 'beilage', 'dessert', 'sonstiges'];
/** Gänge, die beim Anlegen/Bearbeiten eines Gerichts zur Auswahl stehen (Zwischengang und Beilage entfallen; alte Gerichte behalten ihren Gang) */
export const DISH_COURSES: Course[] = COURSES.filter(c => c !== 'zwischengang' && c !== 'beilage');
export const UNITS: Unit[] = ['g', 'ml', 'stk'];
export const DIETS: Diet[] = ['vegetarisch', 'vegan'];
export const ROLES: Role[] = ['admin', 'empfang', 'service', 'kueche'];
export type ViewKey = 'live' | 'zeit' | 'res' | 'hotel' | 'menue' | 'dienst' | 'bestell' | 'berichte' | 'editor' | 'settings';
export const ROLE_VIEWS: Record<Role, ViewKey[]> = {
  admin: ['live', 'zeit', 'res', 'hotel', 'menue', 'berichte', 'editor', 'settings'],
  empfang: ['live', 'zeit', 'res', 'hotel', 'menue', 'berichte'],
  service: ['live', 'zeit', 'menue', 'berichte'],
  kueche: ['berichte', 'menue']
};
/** Ansichten eines Benutzers: Rolle + Dienstplan, wenn das Modul an ist und er Admin oder Bereichsleiter ist
 *  (gleiche Regel wie is_planner() in der DB). Vor „Berichte“ – außer die Berichte sind die Startansicht. */
export function viewsFor(role: Role, venue: Venue, departments: Department[], userId: string, edition: 'tischplan' | 'dienstplan' = 'tischplan'): ViewKey[] {
  const planner = role === 'admin' || departments.some(x => x.leadIds.includes(userId));
  // eigenständige Dienstplan-App: nur Dienstplan (Planer) und Einstellungen (Admin), Modul immer an
  if (edition === 'dienstplan') return [...(planner ? ['dienst' as const] : []), ...(role === 'admin' ? ['settings' as const] : [])];
  const views = [...ROLE_VIEWS[role]];
  if (venue.modules.includes('dienstplan') && planner) {
    const i = views.indexOf('berichte');
    views.splice(i > 0 ? i : views.length, 0, 'dienst');
  }
  // Module mit Rollen-Zuweisung (Einstellungen → Module)
  if (moduleAllowed(venue, 'bestellliste', role)) {
    const i = views.indexOf('berichte');
    views.splice(i > 0 ? i : views.length, 0, 'bestell');
  }
  return views;
}
export const CONTRACTS: ContractType[] = ['unbefristet', 'befristet', 'saison', 'lehrling', 'aushilfe'];
/** Farbvorschläge für Bereiche, Mitarbeitende und Schichtvorlagen */
export const ROSTER_COLORS = ['#4F7BD1', '#2da44e', '#e36209', '#a371f7', '#cf222e', '#0F2347', '#bf8700', '#1b7c83', '#d63384', '#4A5B7D'];
export const canEdit = (r?: Role | null) => r === 'admin' || r === 'empfang';
/** Zutaten, Gerichte und Menüs pflegen */
export const canEditMenu = (r?: Role | null) => r === 'admin' || r === 'kueche';
export const canStatus = (r?: Role | null) => !!r && r !== 'kueche';
export const isAdmin = (r?: Role | null) => r === 'admin';
