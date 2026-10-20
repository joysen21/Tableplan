/**
 * Reservierungs-Status je Betrieb: Standard-Status umbenennen, umfärben, ausblenden und eigene Status anlegen.
 * Ein eigener Status hat einen Grundstatus (base) – nur dieser zählt für Abläufe (Konflikte, Live-Plan, Doppelbuchungsschutz).
 */
import { ALL_STATUS, RES_STATUS_COLOR } from './constants';
import type { CustomStatus, Reservation, ResStatus, StatusConfig, Venue } from './types';
import { t } from '../lib/i18n';

export interface StatusOption { key: string; label: string; color: string; base: ResStatus; custom: boolean; hidden: boolean }

/** Alle Status in Reihenfolge: jeder Standard-Status, gefolgt von seinen eigenen Status */
export function statusOptions(cfg: StatusConfig | undefined): StatusOption[] {
  const custom = cfg?.custom ?? [];
  return ALL_STATUS.flatMap(s => {
    const b = cfg?.builtIn?.[s] ?? {};
    const own: StatusOption = { key: s, label: b.label?.trim() || t(s), color: b.color || RES_STATUS_COLOR[s], base: s, custom: false, hidden: !!b.hidden };
    return [own, ...custom.filter(c => c.base === s).map(c => ({ key: c.id, label: c.label, color: c.color, base: c.base, custom: true, hidden: false }))];
  });
}

/** Auswählbare Status (ohne ausgeblendete) – der aktuelle bleibt immer wählbar */
export const pickableStatuses = (cfg: StatusConfig | undefined, current?: string) =>
  statusOptions(cfg).filter(o => !o.hidden || o.key === current);

/** Schlüssel des angezeigten Status einer Reservierung (eigener Status, falls gesetzt und noch vorhanden) */
export function statusKey(cfg: StatusConfig | undefined, r: Pick<Reservation, 'status' | 'subStatus'>): string {
  const c = r.subStatus && cfg?.custom?.find(x => x.id === r.subStatus && x.base === r.status);
  return c ? c.id : r.status;
}

/** Bezeichnung und Farbe des Status einer Reservierung */
export function statusInfo(venue: Pick<Venue, 'statusConfig'>, r: Pick<Reservation, 'status' | 'subStatus'>): StatusOption {
  const key = statusKey(venue.statusConfig, r);
  return statusOptions(venue.statusConfig).find(o => o.key === key)!;
}

/** Gewählten Status (Standard-Schlüssel oder eigene id) in Grundstatus + eigenen Status umsetzen */
export function resolveStatus(cfg: StatusConfig | undefined, key: string): { status: ResStatus; subStatus: string | null } {
  const c = cfg?.custom?.find(x => x.id === key);
  if (c) return { status: c.base, subStatus: c.id };
  return { status: (ALL_STATUS.includes(key as ResStatus) ? key : 'bestaetigt') as ResStatus, subStatus: null };
}

/** Eigene Status prüfen: Bezeichnung nötig und eindeutig, Farbe als #rrggbb */
export function statusConfigErrors(cfg: StatusConfig): string[] {
  const errs: string[] = [];
  const labels = statusOptions(cfg).map(o => o.label.trim().toLowerCase());
  for (const c of cfg.custom ?? [] as CustomStatus[]) {
    if (!c.label.trim()) errs.push('Jeder eigene Status braucht eine Bezeichnung');
    if (!/^#[0-9a-f]{6}$/i.test(c.color)) errs.push(`Ungültige Farbe bei „${c.label}“`);
  }
  const dup = labels.find((l, i) => l && labels.indexOf(l) !== i);
  if (dup) errs.push(`Bezeichnung doppelt: „${dup}“`);
  return [...new Set(errs)];
}
