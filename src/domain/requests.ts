/** Dienstplan: Anfragen vom Mitarbeiter-Link (Frei-Wunsch, Urlaub, Krankmeldung, Dienst-Tausch) und Saisonzeiträume.
 *  Die Regeln hier spiegeln die DB-Funktionen roster_request*, roster_swap_* und roster_request_decide
 *  (Migration 20261105000000_dienstplan_anfragen.sql) – der Demo-Modus nutzt sie direkt. */
import type { Absence, RequestKind, RequestStatus, Role, RosterRequest, Season, Shift, VenueData } from './types';
import { canPlanDept } from './roster';
import { inSeason, shiftsOverlap } from './rosterPlan';
import { addDays } from '../lib/time';

export const REQUEST_LABEL: Record<RequestKind, string> = { frei: 'Frei-Wunsch', urlaub: 'Urlaub', krank: 'Krankmeldung', tausch: 'Dienst-Tausch' };
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = { offen: 'Offen', uebernommen: 'Übernommen', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt' };

/* ---------- Saison ---------- */

export { inSeason };
/** Alle Tage von–bis in der Saison? */
export function rangeInSeason(seasons: Season[] | undefined, from: string, to: string) {
  if (!seasons?.length) return true;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!inSeason(seasons, d)) return false;
  return true;
}
export function seasonErrors(s: Season, all: Season[]): string[] {
  const err: string[] = [];
  if (!s.from || !s.to) err.push('Bitte Beginn und Ende eintragen.');
  else if (s.to < s.from) err.push('Das Ende liegt vor dem Beginn.');
  else if (all.some(o => o.id !== s.id && o.from <= s.to && s.from <= o.to)) err.push('Überschneidet sich mit einer anderen Saison.');
  return err;
}
/** Saisonen nach Jahr (Jahr des Beginns), je Jahr nach Datum */
export function seasonsByYear(seasons: Season[]): [number, Season[]][] {
  const m = new Map<number, Season[]>();
  for (const s of [...seasons].sort((a, b) => a.from.localeCompare(b.from))) { const y = +s.from.slice(0, 4); m.set(y, [...(m.get(y) ?? []), s]); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/* ---------- Anfrage stellen (Mitarbeiter-Link) ---------- */

/** Fehlercodes (für DE/IT-Texte auf dem Link) */
export type RequestError = 'range' | 'past' | 'future' | 'season' | 'overlap';
export const REQUEST_ERROR_TEXT: Record<'de' | 'it', Record<RequestError, string>> = {
  de: { range: 'Das Bis-Datum liegt vor dem Von-Datum.', past: 'Dieser Zeitraum liegt zu weit in der Vergangenheit.', future: 'Bitte höchstens ein Jahr im Voraus anfragen.',
    season: 'Außerhalb der Saison sind keine Anfragen möglich.', overlap: 'Für diesen Zeitraum gibt es schon eine Abwesenheit oder offene Anfrage.' },
  it: { range: 'La data finale è precedente a quella iniziale.', past: 'Questo periodo è troppo lontano nel passato.', future: 'Richiedi al massimo un anno in anticipo.',
    season: 'Fuori stagione non sono possibili richieste.', overlap: 'Per questo periodo esiste già un’assenza o una richiesta aperta.' }
};
/** Prüfung einer neuen Anfrage. Krank darf bis 7 Tage rückwirkend gemeldet werden, Frei/Urlaub ab heute, höchstens ein gut ein Jahr voraus. */
export function requestErrors(r: { kind: RequestKind; from: string; to: string }, today: string, seasons: Season[] | undefined,
  absences: Pick<Absence, 'from' | 'to'>[], open: Pick<RosterRequest, 'kind' | 'from' | 'to' | 'status'>[]): RequestError[] {
  const err: RequestError[] = [];
  if (!r.from || !r.to || r.to < r.from) return ['range'];
  if (r.from < (r.kind === 'krank' ? addDays(today, -7) : today)) err.push('past');
  if (r.to > addDays(today, 400)) err.push('future');
  if (!rangeInSeason(seasons, r.from, r.to)) err.push('season');
  if (absences.some(a => a.from <= r.to && r.from <= a.to)
    || open.some(o => o.kind !== 'tausch' && o.status === 'offen' && o.kind !== 'krank' && o.from <= r.to && r.from <= o.to)) err.push('overlap');
  return err;
}

/** Krankmeldung: Abwesenheit eintragen, Dienste ab heute im Zeitraum werden offene Schichten (mit Hinweis in der Notiz) */
export function sickEffects(shifts: Shift[], staffId: string, staffName: string, from: string, to: string, today: string, newId: () => string, note = '') {
  const absence: Absence = { id: newId(), staffId, from, to, kind: 'krank', note: ['Krankmeldung über den Mitarbeiter-Link', note.trim()].filter(Boolean).join(' · ') };
  const opened = shifts.filter(s => s.staffId === staffId && s.date >= from && s.date <= to && s.date >= today)
    .map(s => ({ ...s, staffId: null, note: [s.note.trim(), `${staffName} krank`].filter(Boolean).join(' · ') }));
  return { absence, opened };
}

/** Kann die Person den angebotenen Dienst übernehmen? (kein eigener Dienst zur gleichen Zeit, nicht abwesend) */
export function takeError(d: Pick<VenueData, 'shifts' | 'absences'>, shift: Shift, takerId: string): 'busy' | 'absent' | null {
  if (d.absences.some(a => a.staffId === takerId && shift.date >= a.from && shift.date <= a.to)) return 'absent';
  if (d.shifts.some(s => s.staffId === takerId && s.id !== shift.id && shiftsOverlap(s, shift))) return 'busy';
  return null;
}

/* ---------- Entscheidung der Leitung ---------- */

/** Wartet die Anfrage auf die Leitung? (Tausch erst, wenn jemand übernommen hat) */
export const needsDecision = (r: RosterRequest) => r.kind === 'tausch' ? r.status === 'uebernommen' : r.status === 'offen';
/** Kann die Leitung jetzt entscheiden? (auch ein noch nicht übernommenes Tauschangebot darf sie ablehnen) */
export const decidable = (r: RosterRequest) => r.status === 'offen' || r.status === 'uebernommen';

/** Anfragen, die diese Person entscheiden darf und die auf sie warten (für die rote Zahl) */
export function pendingFor(d: Pick<VenueData, 'requests' | 'departments'>, role: Role | null | undefined, userId: string | null | undefined) {
  return (d.requests ?? []).filter(r => needsDecision(r) && canPlanDept(role ?? null, d.departments, userId ?? '', r.departmentId));
}

/** Folgen einer Entscheidung: neuer Stand der Anfrage, einzutragende Abwesenheit, umzutragender Dienst */
export function decideRequest(d: Pick<VenueData, 'shifts' | 'absences'>, r: RosterRequest, approve: boolean, answer: string, by: string, now: string, newId: () => string):
  { request: RosterRequest; absence?: Absence; shift?: Shift; error?: string } {
  if (!decidable(r)) return { request: r, error: 'Diese Anfrage wurde schon bearbeitet.' };
  const request: RosterRequest = { ...r, status: approve ? 'genehmigt' : 'abgelehnt', answer: answer.trim(), decidedBy: by, decidedAt: now };
  if (!approve) return { request };
  if (r.kind === 'frei' || r.kind === 'urlaub') {
    if (d.absences.some(a => a.staffId === r.staffId && a.from <= r.to && r.from <= a.to)) return { request: r, error: 'Für diesen Zeitraum ist schon eine Abwesenheit eingetragen.' };
    return { request, absence: { id: newId(), staffId: r.staffId, from: r.from, to: r.to, kind: r.kind, note: r.note } };
  }
  if (r.kind === 'tausch') {
    if (r.status !== 'uebernommen' || !r.takerId) return { request: r, error: 'Den Dienst hat noch niemand übernommen.' };
    const s = d.shifts.find(x => x.id === r.shiftId);
    if (!s || s.staffId !== r.staffId) return { request: r, error: 'Der Dienst wurde inzwischen geändert.' };
    const shift = { ...s, staffId: r.takerId };
    if (d.shifts.some(x => x.staffId === r.takerId && x.id !== s.id && shiftsOverlap(x, shift))) return { request: r, error: 'Die Person hat zu dieser Zeit schon einen Dienst.' };
    return { request, shift };
  }
  return { request }; // krank: zur Kenntnis genommen
}

/** Anfragen-Liste der Leitung: zuerst die wartenden (älteste zuerst), dann offene Tauschangebote, dann erledigte der letzten 60 Tage (neueste zuerst) */
export function requestList(list: RosterRequest[], today: string) {
  const wait = list.filter(needsDecision).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const offered = list.filter(r => r.kind === 'tausch' && r.status === 'offen' && r.to >= today).sort((a, b) => a.from.localeCompare(b.from));
  const done = list.filter(r => !decidable(r) && (r.decidedAt ?? r.createdAt).slice(0, 10) >= addDays(today, -60))
    .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt));
  return { wait, offered, done };
}
