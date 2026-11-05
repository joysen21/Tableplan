import { describe, expect, it } from 'vitest';
import { decideRequest, inSeason, pendingFor, rangeInSeason, requestErrors, requestList, seasonErrors, sickEffects, takeError } from './requests';
import { rosterWarnings, DEFAULT_ROSTER_SETTINGS } from './rosterPlan';
import { emptyVenueData } from './demo';
import type { Department, RosterRequest, Season, Shift } from './types';

const T0 = '2026-11-05';
const sh = (id: string, staffId: string | null, date: string, start = '08:00', end = '16:00'): Shift => ({
  id, departmentId: 'dep', staffId, positionId: null, templateId: null, date, start, end, start2: null, end2: null, breakMin: 0, note: ''
});
const req = (p: Partial<RosterRequest>): RosterRequest => ({
  id: 'r', staffId: 'max', departmentId: 'dep', kind: 'urlaub', from: '2026-11-20', to: '2026-11-22', shiftId: null, takerId: null, note: '',
  status: 'offen', answer: '', decidedBy: '', decidedAt: null, createdAt: '2026-11-04T10:00:00Z', ...p
});
const S = (from: string, to: string, id = from): Season => ({ id, name: '', from, to });
let n = 0; const newId = () => 'id' + ++n;

describe('Saison', () => {
  const seasons = [S('2026-05-01', '2026-10-31'), S('2026-12-05', '2027-04-06')];
  it('ohne Saison ist immer geöffnet', () => {
    expect(inSeason([], '2026-01-01')).toBe(true);
    expect(inSeason(undefined, '2026-01-01')).toBe(true);
  });
  it('Tage zwischen den Saisonen sind geschlossen, Zeiträume müssen ganz drin liegen', () => {
    expect(inSeason(seasons, '2026-11-15')).toBe(false);
    expect(inSeason(seasons, '2027-01-10')).toBe(true);
    expect(rangeInSeason(seasons, '2026-10-30', '2026-11-02')).toBe(false);
    expect(rangeInSeason(seasons, '2026-12-24', '2026-12-26')).toBe(true);
  });
  it('Saison prüfen: Ende vor Beginn, Überschneidung', () => {
    expect(seasonErrors(S('2026-06-01', '2026-05-01', 'x'), seasons)).toHaveLength(1);
    expect(seasonErrors(S('2026-10-01', '2026-12-10', 'x'), seasons)[0]).toMatch(/Überschneidet/);
    expect(seasonErrors(S('2026-11-01', '2026-11-30', 'x'), seasons)).toEqual([]);
  });
  it('Planer warnt bei Diensten außerhalb der Saison', () => {
    const d = emptyVenueData('v', 'Test');
    d.staff = [{ id: 'max', name: 'Max', active: true, departmentId: 'dep', positionIds: [], contractFrom: null, contractTo: null } as any];
    d.shifts = [sh('a', 'max', '2026-11-09')];
    const w = rosterWarnings(d, '2026-11-09', { ...DEFAULT_ROSTER_SETTINGS, seasons }).filter(x => x.kind === 'season');
    expect(w).toHaveLength(1);
    expect(rosterWarnings(d, '2026-11-09', DEFAULT_ROSTER_SETTINGS).some(x => x.kind === 'season')).toBe(false);
  });
});

describe('Anfrage stellen', () => {
  it('Frei/Urlaub ab heute, Krank bis 7 Tage rückwirkend', () => {
    expect(requestErrors({ kind: 'urlaub', from: '2026-11-04', to: '2026-11-06' }, T0, [], [], [])).toEqual(['past']);
    expect(requestErrors({ kind: 'krank', from: '2026-11-01', to: '2026-11-06' }, T0, [], [], [])).toEqual([]);
    expect(requestErrors({ kind: 'krank', from: '2026-10-20', to: '2026-11-06' }, T0, [], [], [])).toEqual(['past']);
    expect(requestErrors({ kind: 'frei', from: '2026-11-08', to: '2026-11-07' }, T0, [], [], [])).toEqual(['range']);
  });
  it('außerhalb der Saison und bei Überschneidung nicht möglich', () => {
    expect(requestErrors({ kind: 'frei', from: '2026-11-10', to: '2026-11-10' }, T0, [S('2026-05-01', '2026-10-31')], [], [])).toEqual(['season']);
    expect(requestErrors({ kind: 'frei', from: '2026-11-10', to: '2026-11-10' }, T0, [], [{ from: '2026-11-09', to: '2026-11-12' }], [])).toEqual(['overlap']);
    expect(requestErrors({ kind: 'urlaub', from: '2026-11-21', to: '2026-11-21' }, T0, [], [], [req({})])).toEqual(['overlap']);
    // abgelehnte Anfrage blockiert nicht
    expect(requestErrors({ kind: 'urlaub', from: '2026-11-21', to: '2026-11-21' }, T0, [], [], [req({ status: 'abgelehnt' })])).toEqual([]);
  });
  it('Krankmeldung: Abwesenheit, Dienste ab heute werden offen (mit Hinweis)', () => {
    const shifts = [sh('alt', 'max', '2026-11-04'), sh('heute', 'max', T0), sh('morgen', 'max', '2026-11-06'), sh('lisa', 'lisa', T0)];
    const fx = sickEffects(shifts, 'max', 'Max', '2026-11-04', '2026-11-06', T0, newId);
    expect(fx.absence).toMatchObject({ staffId: 'max', kind: 'krank', from: '2026-11-04', to: '2026-11-06' });
    expect(fx.opened.map(s => s.id)).toEqual(['heute', 'morgen']);
    expect(fx.opened[0]).toMatchObject({ staffId: null, note: 'Max krank' });
  });
});

describe('Tausch', () => {
  const shift = sh('s1', 'max', '2026-11-10', '18:00', '01:00');
  it('übernehmen nur ohne eigenen Dienst zur gleichen Zeit und ohne Abwesenheit', () => {
    expect(takeError({ shifts: [shift], absences: [] }, shift, 'lisa')).toBeNull();
    expect(takeError({ shifts: [shift, sh('x', 'lisa', '2026-11-10', '20:00', '23:00')], absences: [] }, shift, 'lisa')).toBe('busy');
    expect(takeError({ shifts: [shift, sh('y', 'lisa', '2026-11-10', '07:00', '15:00')], absences: [] }, shift, 'lisa')).toBeNull();
    expect(takeError({ shifts: [shift], absences: [{ id: 'a', staffId: 'lisa', from: '2026-11-10', to: '2026-11-10', kind: 'frei', note: '' }] }, shift, 'lisa')).toBe('absent');
  });
  it('Leitung bestätigt: Dienst wird umgetragen; ohne Übernahme nicht möglich', () => {
    const r = req({ kind: 'tausch', from: shift.date, to: shift.date, shiftId: 's1' });
    expect(decideRequest({ shifts: [shift], absences: [] }, r, true, '', 'Toni', 'now', newId).error).toMatch(/niemand/);
    const ok = decideRequest({ shifts: [shift], absences: [] }, { ...r, status: 'uebernommen', takerId: 'lisa' }, true, 'passt', 'Toni', 'now', newId);
    expect(ok.error).toBeUndefined();
    expect(ok.shift).toMatchObject({ id: 's1', staffId: 'lisa' });
    expect(ok.request).toMatchObject({ status: 'genehmigt', answer: 'passt', decidedBy: 'Toni' });
    // Dienst inzwischen jemand anderem gegeben
    expect(decideRequest({ shifts: [{ ...shift, staffId: 'eva' }], absences: [] }, { ...r, status: 'uebernommen', takerId: 'lisa' }, true, '', 'Toni', 'now', newId).error).toMatch(/geändert/);
  });
});

describe('Entscheidung der Leitung', () => {
  it('Urlaub genehmigt → Abwesenheit; abgelehnt → nur Status mit Begründung', () => {
    const yes = decideRequest({ shifts: [], absences: [] }, req({ note: 'Hochzeit' }), true, '', 'Toni', 'now', newId);
    expect(yes.absence).toMatchObject({ staffId: 'max', kind: 'urlaub', from: '2026-11-20', to: '2026-11-22', note: 'Hochzeit' });
    const no = decideRequest({ shifts: [], absences: [] }, req({}), false, ' Hochsaison ', 'Toni', 'now', newId);
    expect(no.absence).toBeUndefined();
    expect(no.request).toMatchObject({ status: 'abgelehnt', answer: 'Hochsaison' });
    expect(decideRequest({ shifts: [], absences: [] }, req({ status: 'genehmigt' }), true, '', 'Toni', 'now', newId).error).toMatch(/schon bearbeitet/);
  });
  it('rote Zahl: nur wartende Anfragen der eigenen Bereiche (Tausch erst nach Übernahme)', () => {
    const departments = [{ id: 'dep', leadIds: ['toni'] }, { id: 'kue', leadIds: ['karl'] }] as Department[];
    const requests = [req({ id: 'a' }), req({ id: 'b', departmentId: 'kue' }), req({ id: 'c', kind: 'tausch', shiftId: 's' }),
      req({ id: 'd', kind: 'tausch', shiftId: 's2', status: 'uebernommen', takerId: 'lisa' }), req({ id: 'e', status: 'genehmigt' })];
    expect(pendingFor({ requests, departments }, 'service', 'toni').map(r => r.id)).toEqual(['a', 'd']);
    expect(pendingFor({ requests, departments }, 'admin', 'anna').map(r => r.id)).toEqual(['a', 'b', 'd']);
    expect(pendingFor({ requests, departments }, 'kueche', 'niemand')).toEqual([]);
    const l = requestList(requests, T0);
    expect(l.wait.map(r => r.id)).toEqual(['a', 'b', 'd']);
    expect(l.offered.map(r => r.id)).toEqual(['c']);
  });
});
