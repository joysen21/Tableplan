/** Zusatzmodule mit Rollen-Zuweisung (Einstellungen → Module) – gleiche Regel wie module_allowed() in der DB */
import type { ModuleKey, Role, Venue } from './types';

/** Standard-Rollen je Modul, solange in den Einstellungen nichts zugewiesen ist (Admin sieht immer alles) */
export const DEFAULT_MODULE_ROLES: Partial<Record<ModuleKey, Role[]>> = { bestellliste: ['kueche'], pass: ['service', 'kueche'] };

/** Darf diese Rolle das Modul sehen? (Modul eingeschaltet + Admin oder zugewiesene Rolle) */
export function moduleAllowed(venue: Pick<Venue, 'modules' | 'moduleRoles'>, mod: ModuleKey, role: Role): boolean {
  if (!venue.modules.includes(mod)) return false;
  return role === 'admin' || (venue.moduleRoles?.[mod] ?? DEFAULT_MODULE_ROLES[mod] ?? []).includes(role);
}
