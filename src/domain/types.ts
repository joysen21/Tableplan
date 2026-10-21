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

export type ModuleKey = 'dienstplan' | 'bestellliste';
/** modules: zugeschaltete Zusatzmodule des Betriebs */
/** Erscheinungsbild der Gäste-Speisekarte (QR): Logo, Titelbild, Akzentfarbe, Titel und Begrüßung */
/** welcomeIt/welcomeEn optional – fehlt die Übersetzung, erscheint der deutsche Text */
export interface Branding { title: string; welcome: string; welcomeIt?: string; welcomeEn?: string; color: string; logoUrl: string | null; coverUrl: string | null }
/** Eigener Reservierungs-Status: verhält sich wie sein Grundstatus (base), hat aber eigene Bezeichnung und Farbe */
export interface CustomStatus { id: string; label: string; color: string; base: ResStatus; icon?: string }
/** Status-Einstellungen je Betrieb: Standard-Status umbenennen/umfärben/ausblenden, eigene Status ergänzen */
export interface StatusConfig { builtIn?: Partial<Record<ResStatus, { label?: string; color?: string; hidden?: boolean; icon?: string }>>; custom?: CustomStatus[] }
/** qrToken = Schlüssel im QR-Code der Gäste-Speisekarte (ein Code für alle Tische) */
export interface Venue { id: string; name: string; modules: ModuleKey[]; rosterSettings?: Partial<RosterSettings>; branding?: Branding; statusConfig?: StatusConfig; qrToken?: string; qrWindow?: QrWindow;
  /** Welche Rollen ein Modul sehen (Admin immer) – zuweisbar in Einstellungen → Module */
  moduleRoles?: Partial<Record<ModuleKey, Role[]>> }

/* ---------- Bestellliste (Modul) ---------- */
/** Lieferant mit Telefonnummer für WhatsApp */
export interface Supplier { id: string; name: string; phone: string; sort: number }
/** Artikel eines Lieferanten, nach Gruppe (z. B. Rotwein) */
export interface SupplierProduct { id: string; supplierId: string; name: string; unit: string; group: string; sort: number; active: boolean }
export interface OrderLine { productId: string; name: string; unit: string; qty: number }
/** Gesendete Bestellung (Historie) */
export interface SupplierOrder { id: string; supplierId: string; createdAt: string; createdBy: string; items: OrderLine[]; note: string }

export interface Member { userId: string; role: Role; name: string; email: string }

export interface Room { id: string; name: string; width: number; height: number; backgroundUrl: string | null; sort: number }

export interface Station { id: string; name: string; color: string }

export interface DiningTable {
  id: string; roomId: string; name: string; shape: TableShape;
  x: number; y: number; width: number; height: number; rotation: number;
  minPersons: number; maxPersons: number; stationId: string | null; features: TableFeature[];
  /** Stühle im Raumplan zeichnen (aus = z. B. Stehtisch, Bar, Bank ohne Stühle) */
  chairs: boolean;
  /** geheimer Schlüssel im QR-Code des Tisches (Gäste-Speisekarte) */
  qrToken?: string;
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
  /** Kennung im Hotelprogramm (CSV-Import, z. B. „ASA:3613/2026/1“) – fehlt bei von Hand angelegten Aufenthalten */
  externalId?: string | null;
}

export interface Reservation {
  id: string; date: string; serviceId: string; time: string; duration: number;
  adults: number; children: number; name: string; phone: string; email: string;
  occasion: string; allergies: string; allergens: Allergen[]; notes: string; highchair: boolean; vip: boolean;
  source: string; status: ResStatus; wishes: TableFeature[]; stayId: string | null;
  /** eigener Status (id aus venue.statusConfig.custom); status bleibt der Grundstatus für alle Abläufe */
  subStatus?: string | null;
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
/** Gäste-Auswahl per QR: aus = Gäste sehen das Menü nicht, offen = Gäste wählen, geschlossen = nur anzeigen */
export type MenuOrdering = 'aus' | 'offen' | 'geschlossen' | 'auto';
/** Wirksamer Zustand für Gäste ('auto' aufgelöst nach dem Zeitfenster) */
export type MenuState = Exclude<MenuOrdering, 'auto'>;
/** Zeitfenster der automatischen QR-Menüwahl: ab open am Vorabend bis close am Tag selbst (HH:MM) */
export interface QrWindow { open: string; close: string }
export interface Menu { id: string; date: string; serviceId: string; portions: number | null; bufferPct: number; notes: string; items: MenuItem[]; ordering?: MenuOrdering }
/** Auswahl eines Hotelzimmers für ein Menü: Anzahl je Gericht (dishId → Anzahl) */
/** Auswahl zu einem Menü: je Hotelzimmer (stayId) oder je externer Reservierung (reservationId) – Anzahl je Gericht */
export interface MenuChoice { id: string; menuId: string; stayId: string | null; reservationId?: string | null; counts: Record<string, number>; note?: string; updatedAt?: string }

/* ---------- Dienstplan ---------- */
export type ContractType = 'unbefristet' | 'befristet' | 'saison' | 'lehrling' | 'aushilfe';
/** Bereich/Abteilung (Küche, Service …). leadIds = Benutzer (user_id), die den Bereich planen dürfen */
/** guestsPerStaff: Besetzungsschlüssel (1 Kraft je n Gäste im Spitzen-Service, null = aus), minStaff: Mindestbesetzung pro Tag */
export interface Department { id: string; name: string; color: string; sort: number; leadIds: string[]; guestsPerStaff: number | null; minStaff: number;
  /** Icon statt Farbpunkt (Schlüssel aus DEPARTMENT_ICONS) */
  icon?: string | null }
/** Tätigkeit innerhalb eines Bereichs (Koch, Commis …) */
export interface Position { id: string; departmentId: string; name: string; sort: number }
/** Mitarbeiter/in. departmentId = Stammbereich; positionIds = Qualifikationen (auch aus anderen Bereichen) */
export interface Staff {
  id: string; name: string; short: string; departmentId: string | null; positionIds: string[];
  contract: ContractType; weeklyHours: number; contractFrom: string | null; contractTo: string | null;
  phone: string; email: string; color: string; notes: string; active: boolean;
  /** Urlaubsanspruch in Tagen pro Jahr */
  vacationDays: number;
  /** geheimer Schlüssel für den Lesezugang (Link /p/<token>, Kalender-Abo) */
  shareToken: string;
}
/** Dienst. staffId null = offene Schicht. Zeiten wie bei der Vorlage (Ende vor Beginn = über Mitternacht) */
export interface Shift {
  id: string; departmentId: string; staffId: string | null; positionId: string | null; templateId: string | null;
  date: string; start: string; end: string; start2: string | null; end2: string | null; breakMin: number; note: string; updatedAt?: string;
}
export type AbsenceKind = 'urlaub' | 'krank' | 'frei' | 'sonstiges';
export interface Absence { id: string; staffId: string; from: string; to: string; kind: AbsenceKind; note: string }
/** Veröffentlichter Dienstplan eines Bereichs für eine Woche (weekStart = Montag) */
export interface Publication { id: string; departmentId: string; weekStart: string; publishedAt: string; publishedBy: string }
/** Prüfregeln (Warnungen) – Standard nach D.Lgs. 66/2003 / CCNL Turismo, je Betrieb anpassbar */
export interface RosterSettings {
  restHours: number; maxWeekHours: number; breakAfterHours: number; minBreakMin: number; freeDaysPerWeek: number;
}
/** Lesezugang einer Mitarbeiterin / eines Mitarbeiters (öffentliche Seite, Kalender-Abo) */
export interface PublicRoster {
  venueName: string; staffName: string; from: string; to: string;
  shifts: (Shift & { staffName: string; departmentName: string; color: string; mine: boolean; changed: boolean })[];
  absences: Absence[]; publishedAt: string | null;
}
/** „Heute im Dienst“ (nur veröffentlichte Dienste) */
export interface OnDuty { staffName: string; departmentName: string; color: string; start: string; end: string; start2: string | null; end2: string | null }
/** Schichtvorlage, optional als Teildienst mit zweitem Block (start2/end2). Ende vor Beginn = über Mitternacht */
export interface ShiftTemplate {
  id: string; departmentId: string; positionId: string | null; name: string; short: string;
  start: string; end: string; start2: string | null; end2: string | null; breakMin: number; color: string; sort: number;
}

export interface AuditEntry { id: string; ts: string; userName: string; action: string; details: string }

/** Kompletter, im Speicher gehaltener Datenstand eines Betriebs */
export interface VenueData {
  venue: Venue;
  rooms: Room[]; stations: Station[]; tables: DiningTable[]; decor: Decor[];
  combos: TableCombo[]; layouts: Layout[]; services: Service[]; blocks: TableBlock[];
  stays: Stay[]; reservations: Reservation[]; audit: AuditEntry[];
  ingredients: Ingredient[]; dishes: Dish[]; menus: Menu[]; menuChoices: MenuChoice[];
  departments: Department[]; positions: Position[]; staff: Staff[]; shiftTemplates: ShiftTemplate[];
  shifts: Shift[]; absences: Absence[]; publications: Publication[];
  suppliers: Supplier[]; supplierProducts: SupplierProduct[]; supplierOrders: SupplierOrder[];
}

export interface SessionUser { id: string; name: string; email: string; role: Role }
