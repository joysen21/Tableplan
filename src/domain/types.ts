/** Fachliche Typen der App (unabhängig von der Datenbank) */

export type Role = 'admin' | 'empfang' | 'service' | 'kueche';
export type ResStatus = 'angefragt' | 'bestaetigt' | 'eingetroffen' | 'platziert' | 'rechnung' | 'abgeschlossen' | 'storniert' | 'noshow';
export type TableShape = 'round' | 'square' | 'rect' | 'bench';
export type DecorKind = 'wall' | 'door' | 'bar' | 'buffet' | 'column' | 'plant' | 'label';
export type ServiceKind = 'fruehstueck' | 'mittag' | 'abend';
export type Board = 'UF' | 'HP' | 'VP' | 'AI';
export type TableFeature = 'fenster' | 'rollstuhl' | 'hund' | 'kinder' | 'ruhig';
/** Die 14 Hauptallergene nach VO (EU) 1169/2011 (LMIV), Anhang II */
export type Allergen = 'gluten' | 'krebstiere' | 'eier' | 'fisch' | 'erdnuesse' | 'soja' | 'milch' | 'schalenfruechte'
  | 'sellerie' | 'senf' | 'sesam' | 'sulfite' | 'lupinen' | 'weichtiere';
export type Unit = 'g' | 'ml' | 'stk';
export type Course = 'vorspeise' | 'suppe' | 'zwischengang' | 'hauptgang' | 'beilage' | 'dessert' | 'sonstiges';
export type Diet = 'vegetarisch' | 'vegan';
export type TableState = 'frei' | 'reserviert' | 'bald' | 'platziert' | 'rechnung' | 'ueberfaellig' | 'ueberzogen' | 'gesperrt';

export interface Venue { id: string; name: string }

export interface Member { userId: string; role: Role; name: string; email: string }

export interface Room { id: string; name: string; width: number; height: number; backgroundUrl: string | null; sort: number }

export interface Station { id: string; name: string; color: string }

export interface DiningTable {
  id: string; roomId: string; name: string; shape: TableShape;
  x: number; y: number; width: number; height: number; rotation: number;
  minPersons: number; maxPersons: number; stationId: string | null; features: TableFeature[];
}

export interface Decor { id: string; roomId: string; kind: DecorKind; x: number; y: number; width: number; height: number; rotation: number; label: string }

export interface TableCombo { id: string; name: string; tableIds: string[] }

export interface LayoutPosition { x: number; y: number; rotation: number; width: number; height: number; shape: TableShape; minPersons: number; maxPersons: number }
export interface Layout { id: string; roomId: string; name: string; positions: Record<string, LayoutPosition> }

export interface TurnTime { maxP: number; min: number }
export interface Service {
  id: string; name: string; kind: ServiceKind;
  start: string; end: string; hotelTime: string | null; // "HH:MM"
  freeSeating: boolean; pacing: number; turnTimes: TurnTime[]; seatings: string[]; sort: number;
}

export interface TableBlock { id: string; tableId: string; date: string; serviceId: string | null; reason: string }

export interface Stay {
  id: string; roomNo: string; name: string; adults: number; children: number;
  arrival: string; departure: string; board: Board; phone: string; allergies: string; allergens: Allergen[]; notes: string;
  vip: boolean; times: Partial<Record<ServiceKind, string>>; tableIds: string[];
}

export interface Reservation {
  id: string; date: string; serviceId: string; time: string; duration: number;
  adults: number; children: number; name: string; phone: string; email: string;
  occasion: string; allergies: string; allergens: Allergen[]; notes: string; highchair: boolean; vip: boolean;
  source: string; status: ResStatus; wishes: TableFeature[]; stayId: string | null;
  manualTable: boolean; seriesId: string | null; seatedAt: number | null; finishedAt: number | null;
  tableIds: string[]; updatedAt?: string;
}

/** Zutat mit Grundeinheit; Allergene werden nur hier gepflegt und an die Gerichte vererbt */
export interface Ingredient { id: string; name: string; unit: Unit; allergens: Allergen[]; traces: Allergen[] }
/** Rezeptzeile: Menge pro Portion in der Einheit der Zutat */
export interface DishLine { ingredientId: string; qty: number }
export interface Dish {
  id: string; name: string; nameIt: string; nameEn: string; course: Course; diet: Diet[]; notes: string; ingredients: DishLine[];
}
/** Gericht im Tagesmenü. share = erwarteter Anteil in % bei einer Wahl (null = gleichmäßig aufteilen).
 *  name/allergens: Momentaufnahme beim Speichern, damit alte Menüs unverändert bleiben. */
export interface MenuItem { course: Course; dishId: string; share: number | null; name: string; allergens: Allergen[] }
/** Menü eines Service an einem Tag. portions = null → automatisch aus den Reservierungen */
export interface Menu { id: string; date: string; serviceId: string; portions: number | null; bufferPct: number; notes: string; items: MenuItem[] }

export interface AuditEntry { id: string; ts: string; userName: string; action: string; details: string }

/** Kompletter, im Speicher gehaltener Datenstand eines Betriebs */
export interface VenueData {
  venue: Venue;
  rooms: Room[]; stations: Station[]; tables: DiningTable[]; decor: Decor[];
  combos: TableCombo[]; layouts: Layout[]; services: Service[]; blocks: TableBlock[];
  stays: Stay[]; reservations: Reservation[]; audit: AuditEntry[];
  ingredients: Ingredient[]; dishes: Dish[]; menus: Menu[];
}

export interface SessionUser { id: string; name: string; email: string; role: Role }
