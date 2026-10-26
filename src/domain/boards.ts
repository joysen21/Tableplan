/** Verpflegungsarten je Betrieb (Einstellungen → Verpflegungsarten): Kürzel, Bezeichnung, inbegriffene Mahlzeiten
 *  und die Mahlzeiten, für die automatisch ein Tisch reserviert wird. Ohne Eintrag gelten UF / HP / VP / AI.
 *  Gleiche Regel wie stay_eats_v() in der DB. */
import type { BoardDef, ServiceKind, Venue } from './types';

export const MEALS: ServiceKind[] = ['fruehstueck', 'mittag', 'abend'];

export const DEFAULT_BOARDS: BoardDef[] = [
  { key: 'UF', label: 'Übernachtung/Frühstück', meals: ['fruehstueck'], tables: [] },
  { key: 'HP', label: 'Halbpension', meals: ['fruehstueck', 'abend'], tables: ['abend'] },
  { key: 'VP', label: 'Vollpension', meals: ['fruehstueck', 'mittag', 'abend'], tables: ['mittag', 'abend'] },
  { key: 'AI', label: 'All-Inclusive', meals: ['fruehstueck', 'mittag', 'abend'], tables: ['fruehstueck', 'mittag', 'abend'] }
];

export const boardsOf = (v: Pick<Venue, 'boardConfig'>): BoardDef[] => (v.boardConfig?.length ? v.boardConfig : DEFAULT_BOARDS);
export const boardOf = (v: Pick<Venue, 'boardConfig'>, key: string) => boardsOf(v).find(b => b.key === key);
/** Bezeichnung; unbekanntes (gelöschtes) Kürzel bleibt sichtbar */
export const boardLabel = (v: Pick<Venue, 'boardConfig'>, key: string) => boardOf(v, key)?.label ?? key;
/** inbegriffene Mahlzeiten (Frühstück, Mittag, Abend) */
export const boardMeals = (v: Pick<Venue, 'boardConfig'>, key: string): ServiceKind[] => boardOf(v, key)?.meals ?? [];
/** Mahlzeiten mit Tischreservierung (bei Services ohne freie Platzwahl) */
export const boardTables = (v: Pick<Venue, 'boardConfig'>, key: string): ServiceKind[] => boardOf(v, key)?.tables ?? [];

/** Prüfen vor dem Speichern: Kürzel vorhanden, eindeutig, max. 10 Zeichen; Tisch nur bei inbegriffener Mahlzeit */
export function boardError(list: BoardDef[]): string | null {
  if (!list.length) return 'Mindestens eine Verpflegungsart wird gebraucht.';
  const keys = list.map(b => b.key.trim().toUpperCase());
  if (keys.some(k => !k || k.length > 10)) return 'Jedes Kürzel braucht 1–10 Zeichen.';
  if (new Set(keys).size !== keys.length) return 'Jedes Kürzel darf nur einmal vorkommen.';
  if (list.some(b => !b.label.trim())) return 'Jede Verpflegungsart braucht eine Bezeichnung.';
  return null;
}

/** Zustand einer Mahlzeit in der Verpflegungsart: nicht inbegriffen, inbegriffen, inbegriffen mit Tischreservierung */
export type MealMode = 'nein' | 'ja' | 'tisch';
export const mealMode = (b: BoardDef, m: ServiceKind): MealMode => (!b.meals.includes(m) ? 'nein' : b.tables.includes(m) ? 'tisch' : 'ja');
export function withMealMode(b: BoardDef, m: ServiceKind, mode: MealMode): BoardDef {
  const meals = MEALS.filter(x => (x === m ? mode !== 'nein' : b.meals.includes(x)));
  const tables = MEALS.filter(x => (x === m ? mode === 'tisch' : b.tables.includes(x) && meals.includes(x)));
  return { ...b, meals, tables };
}
