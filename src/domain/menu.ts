/** Menüverwaltung: Allergene ableiten, Portionen, Zutatenliste, Allergen-Abgleich mit Gästen – reine Fachlogik */
import { ALLERGENS, COURSES } from './constants';
import { byId, isCancelled, persons, resStart } from './logic';
import type { Allergen, Course, Dish, Ingredient, Menu, MenuItem, Reservation, Unit, VenueData } from './types';
import { t } from '../lib/i18n';
import { addDays, today } from '../lib/time';

const sortAllergens = (a: Iterable<Allergen>) => [...new Set(a)].sort((x, y) => ALLERGENS.indexOf(x) - ALLERGENS.indexOf(y));
const courseIdx = (c: Course) => COURSES.indexOf(c);

/** Allergene eines Gerichts = alle Allergene seiner Zutaten; Spuren nur, wenn nicht ohnehin enthalten */
export function dishAllergens(d: Pick<VenueData, 'ingredients'>, dish: Pick<Dish, 'ingredients'>): { allergens: Allergen[]; traces: Allergen[] } {
  const all = new Set<Allergen>(), tr = new Set<Allergen>();
  for (const l of dish.ingredients) {
    const ing = byId(d.ingredients, l.ingredientId); if (!ing) continue;
    ing.allergens.forEach(a => all.add(a)); ing.traces.forEach(a => tr.add(a));
  }
  return { allergens: sortAllergens(all), traces: sortAllergens([...tr].filter(a => !all.has(a))) };
}

/** Allergene eines Menüeintrags: aktuelles Rezept, sonst die gespeicherte Momentaufnahme */
export function itemAllergens(d: VenueData, it: MenuItem): Allergen[] {
  const dish = byId(d.dishes, it.dishId);
  return dish ? dishAllergens(d, dish).allergens : it.allergens;
}
export const itemName = (d: VenueData, it: MenuItem) => byId(d.dishes, it.dishId)?.name ?? it.name;

/** Name und Allergene vor dem Speichern als Momentaufnahme festhalten, Einträge nach Gang sortieren */
export function snapshotItems(d: VenueData, items: MenuItem[]): MenuItem[] {
  return items
    .map(it => { const dish = byId(d.dishes, it.dishId); return dish ? { ...it, name: dish.name, allergens: dishAllergens(d, dish).allergens } : it; })
    .sort((a, b) => courseIdx(a.course) - courseIdx(b.course));
}

/** Gäste laut Reservierungen (ohne storniert / No-Show). Hotelgäste mit HP/VP haben dort ihre Reservierung. */
export function expectedPortions(d: VenueData, date: string, serviceId: string): number {
  return d.reservations.filter(r => r.date === date && r.serviceId === serviceId && !isCancelled(r)).reduce((a, r) => a + persons(r), 0);
}

/** Portionen für die Küche: von Hand gesetzt oder automatisch, plus Puffer (aufgerundet) */
export function menuPortions(d: VenueData, m: Menu): { auto: number; base: number; total: number } {
  const auto = expectedPortions(d, m.date, m.serviceId);
  const base = m.portions ?? auto;
  return { auto, base, total: Math.ceil(base * (1 + (m.bufferPct || 0) / 100)) };
}

/** Anteil (0–1) jedes Eintrags innerhalb seines Gangs. Gesetzte Anteile in %, der Rest wird gleichmäßig verteilt;
 *  sind alle gesetzt, werden sie auf 100 % umgerechnet. */
export function itemShares(items: MenuItem[]): number[] {
  const out = items.map(() => 0);
  for (const c of new Set(items.map(i => i.course))) {
    const idx = items.map((it, i) => (it.course === c ? i : -1)).filter(i => i >= 0);
    const set = idx.filter(i => items[i].share != null), unset = idx.filter(i => items[i].share == null);
    const sumSet = set.reduce((a, i) => a + Math.max(0, items[i].share!), 0);
    if (!unset.length) set.forEach(i => { out[i] = sumSet > 0 ? Math.max(0, items[i].share!) / sumSet : 1 / set.length; });
    else {
      set.forEach(i => { out[i] = Math.max(0, items[i].share!) / 100; });
      const rest = Math.max(0, 100 - sumSet) / 100;
      unset.forEach(i => { out[i] = rest / unset.length; });
    }
  }
  return out;
}

export interface DishPlan { item: MenuItem; dish: Dish | undefined; portions: number; lines: { ingredient: Ingredient; qty: number }[] }
export interface IngredientTotal { ingredient: Ingredient; qty: number; uses: { dish: string; qty: number }[] }

/** Portionen und Zutatenmengen je Gericht eines Menüs (Portionen je Gericht aufgerundet) */
export function dishPlans(d: VenueData, m: Menu, total = menuPortions(d, m).total): DishPlan[] {
  const shares = itemShares(m.items);
  return m.items.map((item, i) => {
    const dish = byId(d.dishes, item.dishId);
    const portions = Math.ceil(total * shares[i] - 1e-9);
    const lines = (dish?.ingredients ?? []).flatMap(l => { const ing = byId(d.ingredients, l.ingredientId); return ing ? [{ ingredient: ing, qty: l.qty * portions }] : []; });
    return { item, dish, portions, lines };
  });
}

/** Zutatenliste über ein oder mehrere Menüs: je Zutat summiert, alphabetisch */
export function ingredientTotals(d: VenueData, menus: Menu[]): IngredientTotal[] {
  const map = new Map<string, IngredientTotal>();
  for (const m of menus) for (const p of dishPlans(d, m)) for (const l of p.lines) {
    const e = map.get(l.ingredient.id) ?? { ingredient: l.ingredient, qty: 0, uses: [] };
    e.qty += l.qty; e.uses.push({ dish: p.dish?.name ?? p.item.name, qty: l.qty });
    map.set(l.ingredient.id, e);
  }
  return [...map.values()].sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'de'));
}

/** Menge lesbar: 2400 g → „2,4 kg“, 1500 ml → „1,5 l“, Stück aufgerundet */
export function fmtQty(qty: number, unit: Unit): string {
  const n = (v: number, digits = 2) => v.toLocaleString('de-DE', { maximumFractionDigits: digits });
  if (unit === 'stk') return `${Math.ceil(qty - 1e-9)} Stk.`;
  if (qty >= 1000) return `${n(qty / 1000)} ${unit === 'g' ? 'kg' : 'l'}`;
  return `${n(qty, qty < 10 ? 1 : 0)} ${unit}`;
}

export interface AllergenWarning {
  r: Reservation; allergen: Allergen; course: Course;
  dishes: string[];        // Gerichte im Gang, die das Allergen enthalten
  alternatives: string[];  // Gerichte im Gang ohne das Allergen (leer = Problem)
  traces: boolean;         // nur „kann Spuren enthalten“
}

/** Gäste-Allergene (Auswahl) gegen das Menü prüfen – je Gast, Allergen und Gang ein Eintrag */
export function allergenWarnings(d: VenueData, m: Menu): AllergenWarning[] {
  const guests = d.reservations.filter(r => r.date === m.date && r.serviceId === m.serviceId && !isCancelled(r) && r.allergens?.length)
    .sort((a, b) => resStart(a) - resStart(b));
  const info = m.items.map(it => {
    const dish = byId(d.dishes, it.dishId);
    const a = dish ? dishAllergens(d, dish) : { allergens: it.allergens, traces: [] as Allergen[] };
    return { it, name: itemName(d, it), ...a };
  });
  const out: AllergenWarning[] = [];
  for (const r of guests) for (const allergen of sortAllergens(r.allergens)) for (const c of COURSES) {
    const inCourse = info.filter(x => x.it.course === c); if (!inCourse.length) continue;
    const hit = inCourse.filter(x => x.allergens.includes(allergen)), trace = inCourse.filter(x => x.traces.includes(allergen));
    if (!hit.length && !trace.length) continue;
    const bad = hit.length ? hit : trace;
    out.push({ r, allergen, course: c, dishes: bad.map(x => x.name), alternatives: inCourse.filter(x => !bad.includes(x) && !x.allergens.includes(allergen)).map(x => x.name), traces: !hit.length });
  }
  return out;
}

/** Vorschlag aus dem bisherigen Freitext („Nüsse, Laktose“ → Schalenfrüchte, Milch). DE + IT. */
const GUESS: [RegExp, Allergen[]][] = [
  [/glut|weizen|zöliak|zoeliak|celiac|celiach|dinkel|roggen|gerste/, ['gluten']],
  [/krebs|krusten|garnel|shrimp|scampi|hummer|crostace|gamber/, ['krebstiere']],
  [/schalentier|meeresfrücht|meeresfruecht|frutti di mare/, ['krebstiere', 'weichtiere']],
  [/\beier?\b|eiweiß|eiweiss|\buov/, ['eier']],
  [/fisch|pesce/, ['fisch']],
  [/erdnu|arachid/, ['erdnuesse']],
  [/soja|\bsoia\b/, ['soja']],
  [/lakto|lacto|laktos|milch|käse|kaese|lattos|latte/, ['milch']],
  [/nuss|nüsse|nuesse|mandel|walnu|hasel|cashew|pistaz|pecan|macadamia|noci|nocciol|mandorl|frutta a guscio/, ['schalenfruechte']],
  [/sellerie|sedano/, ['sellerie']],
  [/senf|senape/, ['senf']],
  [/sesam/, ['sesam']],
  [/sulfit|schwefel|solfit/, ['sulfite']],
  [/lupin/, ['lupinen']],
  [/weichtier|muschel|tintenfisch|calamar|oktopus|octopus|schnecke|molluschi|cozze|vongole/, ['weichtiere']]
];
export function guessAllergens(text: string): Allergen[] {
  const s = (text || '').toLowerCase();
  const noPeanut = s.replace(/erdn(u|ü|ue)ss?\S*/g, ''); // Erdnüsse sind keine Schalenfrüchte
  return sortAllergens(GUESS.flatMap(([re, a]) => (re.test(a[0] === 'schalenfruechte' ? noPeanut : s) ? a : [])));
}

/** In welchen Gerichten wird eine Zutat verwendet? (dann nicht löschbar) */
export const ingredientUsage = (d: VenueData, id: string) => d.dishes.filter(x => x.ingredients.some(l => l.ingredientId === id)).map(x => x.name);
/** Heutige/künftige Menüs mit diesem Gericht (vergangene behalten ihre Momentaufnahme) */
export const dishUsage = (d: VenueData, id: string, from = today()) => d.menus.filter(m => m.date >= from && m.items.some(i => i.dishId === id));

/** Montag der Woche (ISO) und die 7 Tage */
export function weekDates(date: string): string[] {
  const wd = (new Date(date + 'T12:00:00').getDay() + 6) % 7;
  const mon = addDays(date, -wd);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

export const findMenu = (d: VenueData, date: string, serviceId: string) => d.menus.find(m => m.date === date && m.serviceId === serviceId);

/** Menüs der Vorwoche in die Woche von `date` übernehmen – vorhandene Menüs bleiben unangetastet */
export function copyPreviousWeek(d: VenueData, date: string, newId: () => string): Menu[] {
  const out: Menu[] = [];
  for (const day of weekDates(date)) for (const src of d.menus.filter(m => m.date === addDays(day, -7))) {
    if (findMenu(d, day, src.serviceId) || !src.items.length) continue;
    out.push({ ...src, id: newId(), date: day, portions: null, items: snapshotItems(d, src.items) });
  }
  return out;
}

type WithAllergy = { allergies: string; allergens?: Allergen[] };
/** Hat der Gast Allergien (Auswahl oder Notiz)? */
export const hasAllergy = (r: WithAllergy) => !!(r.allergens?.length || r.allergies.trim());
/** Anzeige: „Gluten, Milch/Laktose · Notiz“ */
export function allergyText(r: WithAllergy): string {
  const sel = r.allergens ?? [];
  // Teile der Notiz, die schon durch die Auswahl abgedeckt sind („Nüsse“ bei Schalenfrüchte), nicht doppelt zeigen
  const rest = r.allergies.split(/[,;]/).map(s => s.trim())
    .filter(p => { const g = guessAllergens(p); return p && !(g.length && g.every(a => sel.includes(a))); });
  return [sel.map(t).join(', '), rest.join(', ')].filter(Boolean).join(' · ');
}
