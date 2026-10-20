/**
 * Reservierungs-Status je Betrieb: Standard-Status umbenennen, umfärben, ausblenden und eigene Status anlegen.
 * Ein eigener Status hat einen Grundstatus (base) – nur dieser zählt für Abläufe (Konflikte, Live-Plan, Doppelbuchungsschutz).
 */
import { ALL_STATUS, RES_STATUS_COLOR } from './constants';
import type { CustomStatus, Reservation, ResStatus, StatusConfig, Venue } from './types';
import { t } from '../lib/i18n';

export interface StatusOption { key: string; label: string; color: string; icon: string; base: ResStatus; custom: boolean; hidden: boolean }

/** Standard-Symbol je Status (Schlüssel aus STATUS_ICONS in ui/StatusIcon) */
export const DEFAULT_STATUS_ICON: Record<ResStatus, string> = {
  angefragt: 'anfrage', bestaetigt: 'ok', eingetroffen: 'tuer', platziert: 'sessel', rechnung: 'rechnung', abgeschlossen: 'fertig', storniert: 'storno', noshow: 'noshow'
};

/** Alle Status in Reihenfolge: jeder Standard-Status, gefolgt von seinen eigenen Status */
export function statusOptions(cfg: StatusConfig | undefined): StatusOption[] {
  const custom = cfg?.custom ?? [];
  return ALL_STATUS.flatMap(s => {
    const b = cfg?.builtIn?.[s] ?? {};
    const own: StatusOption = { key: s, label: b.label?.trim() || t(s), color: b.color || RES_STATUS_COLOR[s], icon: b.icon || DEFAULT_STATUS_ICON[s], base: s, custom: false, hidden: !!b.hidden };
    return [own, ...custom.filter(c => c.base === s).map(c => ({ key: c.id, label: c.label, color: c.color, icon: c.icon || DEFAULT_STATUS_ICON[c.base], base: c.base, custom: true, hidden: false }))];
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

/** Status, die im Raumplan einen Tisch belegen (Legende und Farben im Live-Plan) */
export const PLAN_BASES: ResStatus[] = ['angefragt', 'bestaetigt', 'eingetroffen', 'platziert', 'rechnung'];

export interface TableLook {
  /** Füllfarbe (Farbe des Reservierungs-Status, sonst Frei/Gesperrt) */ fill: string;
  /** Bezeichnung wie in der Legende */ label: string;
  /** Gast kommt bald (≤ 60 Min.) → blass */ faded: boolean;
  /** überfällig (Gast nicht da) bzw. Zeit überzogen → rote Umrandung */ alert: '' | 'spaet' | 'ueberzogen';
  /** kurzes Zeichen hinter dem Tischnamen */ mark: string;
}

/** Darstellung eines Tisches im Raumplan – deckungsgleich mit den Reservierungs-Status aus den Einstellungen */
export function tableLook(venue: Pick<Venue, 'statusConfig'>, s: { st: string; r?: Pick<Reservation, 'status' | 'subStatus'> & Partial<Reservation> }): TableLook {
  if (s.st === 'frei') return { fill: 'var(--st-frei)', label: 'Frei', faded: false, alert: '', mark: '' };
  if (s.st === 'gesperrt') return { fill: 'var(--st-gesperrt)', label: 'Gesperrt', faded: false, alert: '', mark: '✕' };
  // Hotel-Zuweisung zeigt Aufenthalte ohne Reservierungs-Status
  if (!s.r?.status) return { fill: `var(--st-${s.st})`, label: t(s.st), faded: false, alert: '', mark: '' };
  const info = statusInfo(venue, s.r);
  const alert = s.st === 'ueberfaellig' ? 'spaet' : s.st === 'ueberzogen' ? 'ueberzogen' : '';
  const extra = s.st === 'bald' ? ' · kommt bald' : alert === 'spaet' ? ' · überfällig' : alert === 'ueberzogen' ? ' · Zeit überzogen' : '';
  return { fill: info.color, label: info.label + extra, faded: s.st === 'bald', alert, mark: s.st === 'bald' ? '⏳' : alert === 'spaet' ? '!' : alert === 'ueberzogen' ? '⌛' : '' };
}
