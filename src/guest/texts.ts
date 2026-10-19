/** Texte der Gäste-Speisekarte (QR) in Deutsch, Italienisch und Englisch – der Gast sieht sie, nicht das Personal */
import type { Allergen, Course } from '../domain/types';

export type Lang = 'de' | 'it' | 'en';
export const LANGS: Lang[] = ['de', 'it', 'en'];

type Dict = Record<string, string>;
const T: Record<Lang, Dict> = {
  de: {
    today: 'Heute', tomorrow: 'Morgen', table: 'Tisch', whichRoom: 'Für welches Zimmer wählen Sie?', room: 'Zimmer', persons: 'Pers.',
    chooseHint: 'Bitte wählen Sie je Gang, wie oft welches Gericht gewünscht ist.', save: 'Auswahl senden', saving: 'Wird gesendet…',
    saved: 'Danke! Ihre Auswahl ist bei der Küche angekommen.', change: 'Sie können sie ändern, solange die Auswahl offen ist.',
    chosen: 'gewählt', missing: 'noch offen', closed: 'Die Auswahl für dieses Menü ist abgeschlossen.', yourChoice: 'Ihre Auswahl',
    noMenu: 'Für heute ist noch kein Menü zur Auswahl freigegeben. Bitte schauen Sie später noch einmal vorbei.',
    noRoom: 'Für diesen Tisch ist bei diesem Menü kein Hotelzimmer eingetragen. Bitte wenden Sie sich an unser Team.',
    invalid: 'Dieser QR-Code ist nicht mehr gültig. Bitte wenden Sie sich an unser Team.', error: 'Senden fehlgeschlagen', retry: 'Erneut laden',
    allergens: 'Allergene', allergenInfo: 'Allergene nach EU-Verordnung 1169/2011', veg: 'vegetarisch', vegan: 'vegan', partial: 'Noch nicht alle Personen haben gewählt – Sie können trotzdem senden.',
    loading: 'Speisekarte wird geladen…',
    freeSeating: 'Freie Platzwahl – bitte wählen Sie Ihr Zimmer.', pickRoom: 'Zimmer auswählen',
    noRoomFree: 'Für dieses Menü ist kein Hotelzimmer eingetragen. Bitte wenden Sie sich an unser Team.'
  },
  it: {
    today: 'Oggi', tomorrow: 'Domani', table: 'Tavolo', whichRoom: 'Per quale camera sceglie?', room: 'Camera', persons: 'pers.',
    chooseHint: 'Indichi per ogni portata quante volte desidera ciascun piatto.', save: 'Invia la scelta', saving: 'Invio in corso…',
    saved: 'Grazie! La Sua scelta è arrivata in cucina.', change: 'Può modificarla finché la scelta è aperta.',
    chosen: 'scelti', missing: 'ancora da scegliere', closed: 'La scelta per questo menù è chiusa.', yourChoice: 'La Sua scelta',
    noMenu: 'Per oggi non è ancora disponibile un menù da scegliere. Riprovi più tardi.',
    noRoom: 'Per questo tavolo non risulta nessuna camera per questo menù. Si rivolga al nostro personale.',
    invalid: 'Questo codice QR non è più valido. Si rivolga al nostro personale.', error: 'Invio non riuscito', retry: 'Ricarica',
    allergens: 'Allergeni', allergenInfo: 'Allergeni secondo il Regolamento UE 1169/2011', veg: 'vegetariano', vegan: 'vegano', partial: 'Non tutte le persone hanno scelto – può comunque inviare.',
    loading: 'Caricamento del menù…',
    freeSeating: 'Posto libero – selezioni la Sua camera.', pickRoom: 'Selezionare la camera',
    noRoomFree: 'Per questo menù non risulta nessuna camera. Si rivolga al nostro personale.'
  },
  en: {
    today: 'Today', tomorrow: 'Tomorrow', table: 'Table', whichRoom: 'Which room are you choosing for?', room: 'Room', persons: 'guests',
    chooseHint: 'Please choose for each course how many of each dish you would like.', save: 'Send choice', saving: 'Sending…',
    saved: 'Thank you! Your choice has reached the kitchen.', change: 'You can change it as long as the choice is open.',
    chosen: 'chosen', missing: 'still open', closed: 'Choices for this menu are closed.', yourChoice: 'Your choice',
    noMenu: 'There is no menu to choose from yet today. Please check back later.',
    noRoom: 'No hotel room is assigned to this table for this menu. Please ask our team.',
    invalid: 'This QR code is no longer valid. Please ask our team.', error: 'Sending failed', retry: 'Reload',
    allergens: 'Allergens', allergenInfo: 'Allergens according to EU Regulation 1169/2011', veg: 'vegetarian', vegan: 'vegan', partial: 'Not everyone has chosen yet – you can still send.',
    loading: 'Loading menu…',
    freeSeating: 'Free seating – please select your room.', pickRoom: 'Select room',
    noRoomFree: 'No hotel room is registered for this menu. Please ask our team.'
  }
};

const COURSE: Record<Lang, Record<Course, string>> = {
  de: { vorspeise: 'Vorspeise', suppe: 'Suppe', zwischengang: 'Zwischengang', hauptgang: 'Hauptgang', beilage: 'Beilage', dessert: 'Dessert', sonstiges: 'Weiteres' },
  it: { vorspeise: 'Antipasto', suppe: 'Zuppa', zwischengang: 'Primo', hauptgang: 'Secondo', beilage: 'Contorno', dessert: 'Dessert', sonstiges: 'Altro' },
  en: { vorspeise: 'Starter', suppe: 'Soup', zwischengang: 'Intermediate course', hauptgang: 'Main course', beilage: 'Side dish', dessert: 'Dessert', sonstiges: 'More' }
};
const SERVICE: Record<Lang, Record<string, string>> = {
  de: { fruehstueck: 'Frühstück', mittag: 'Mittagessen', abend: 'Abendessen' },
  it: { fruehstueck: 'Colazione', mittag: 'Pranzo', abend: 'Cena' },
  en: { fruehstueck: 'Breakfast', mittag: 'Lunch', abend: 'Dinner' }
};
const ALLERGEN: Record<Lang, Record<Allergen, string>> = {
  de: { gluten: 'Gluten', krebstiere: 'Krebstiere', eier: 'Eier', fisch: 'Fisch', erdnuesse: 'Erdnüsse', soja: 'Soja', milch: 'Milch/Laktose', schalenfruechte: 'Schalenfrüchte', sellerie: 'Sellerie', senf: 'Senf', sesam: 'Sesam', sulfite: 'Sulfite', lupinen: 'Lupinen', weichtiere: 'Weichtiere' },
  it: { gluten: 'Glutine', krebstiere: 'Crostacei', eier: 'Uova', fisch: 'Pesce', erdnuesse: 'Arachidi', soja: 'Soia', milch: 'Latte/lattosio', schalenfruechte: 'Frutta a guscio', sellerie: 'Sedano', senf: 'Senape', sesam: 'Sesamo', sulfite: 'Solfiti', lupinen: 'Lupini', weichtiere: 'Molluschi' },
  en: { gluten: 'Gluten', krebstiere: 'Crustaceans', eier: 'Eggs', fisch: 'Fish', erdnuesse: 'Peanuts', soja: 'Soy', milch: 'Milk/lactose', schalenfruechte: 'Tree nuts', sellerie: 'Celery', senf: 'Mustard', sesam: 'Sesame', sulfite: 'Sulphites', lupinen: 'Lupin', weichtiere: 'Molluscs' }
};

export const tr = (l: Lang, k: string) => T[l][k] ?? T.de[k] ?? k;
export const courseName = (l: Lang, c: Course) => COURSE[l][c] ?? c;
export const serviceName = (l: Lang, kind: string, fallback: string) => SERVICE[l][kind] ?? fallback;
export const allergenName = (l: Lang, a: Allergen) => ALLERGEN[l][a] ?? a;

/** Sprache: gemerkt, sonst wie das Handy (it/en), sonst Deutsch */
export function initialLang(): Lang {
  try { const s = localStorage.getItem('tischplan.guest.lang'); if (s === 'de' || s === 'it' || s === 'en') return s; } catch { /* egal */ }
  const n = (typeof navigator !== 'undefined' ? navigator.language : 'de').slice(0, 2);
  return n === 'it' ? 'it' : n === 'en' ? 'en' : 'de';
}
export function rememberLang(l: Lang) { try { localStorage.setItem('tischplan.guest.lang', l); } catch { /* egal */ } }
