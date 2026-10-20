import { describe, expect, it } from 'vitest';
import { pickableStatuses, resolveStatus, statusConfigErrors, statusInfo, statusKey, statusOptions } from './statuses';
import type { StatusConfig } from './types';

const cfg: StatusConfig = {
  builtIn: { angefragt: { hidden: true }, rechnung: { label: 'Zahlt', color: '#ff0000' } },
  custom: [{ id: 'c1', label: 'Aperitif', color: '#00aa00', base: 'platziert' }]
};

describe('Reservierungs-Status je Betrieb', () => {
  it('ohne Einstellungen gibt es die Standard-Status', () => {
    expect(statusOptions(undefined).map(o => o.key)).toEqual(['angefragt', 'bestaetigt', 'eingetroffen', 'platziert', 'rechnung', 'abgeschlossen', 'storniert', 'noshow']);
    expect(statusInfo({}, { status: 'platziert' })).toMatchObject({ label: 'Platziert', custom: false });
  });
  it('eigene Status stehen hinter ihrem Grundstatus, umbenannte zeigen die neue Bezeichnung', () => {
    const keys = statusOptions(cfg).map(o => o.key);
    expect(keys.slice(keys.indexOf('platziert'), keys.indexOf('platziert') + 2)).toEqual(['platziert', 'c1']);
    expect(statusInfo({ statusConfig: cfg }, { status: 'rechnung' })).toMatchObject({ label: 'Zahlt', color: '#ff0000' });
  });
  it('ausgeblendete sind nicht wählbar – außer sie sind gerade gesetzt', () => {
    expect(pickableStatuses(cfg).some(o => o.key === 'angefragt')).toBe(false);
    expect(pickableStatuses(cfg, 'angefragt').some(o => o.key === 'angefragt')).toBe(true);
  });
  it('eigener Status setzt den Grundstatus (für alle Abläufe) und merkt sich den eigenen', () => {
    expect(resolveStatus(cfg, 'c1')).toEqual({ status: 'platziert', subStatus: 'c1' });
    expect(resolveStatus(cfg, 'storniert')).toEqual({ status: 'storniert', subStatus: null });
    expect(statusInfo({ statusConfig: cfg }, { status: 'platziert', subStatus: 'c1' })).toMatchObject({ label: 'Aperitif', color: '#00aa00' });
  });
  it('gelöschter oder umgehängter eigener Status fällt auf den Grundstatus zurück', () => {
    expect(statusKey(cfg, { status: 'platziert', subStatus: 'weg' })).toBe('platziert');
    expect(statusKey(cfg, { status: 'rechnung', subStatus: 'c1' })).toBe('rechnung');
  });
  it('prüft Bezeichnungen', () => {
    expect(statusConfigErrors(cfg)).toEqual([]);
    expect(statusConfigErrors({ custom: [{ id: 'x', label: ' ', color: '#000000', base: 'platziert' }] })).toContain('Jeder eigene Status braucht eine Bezeichnung');
    expect(statusConfigErrors({ custom: [{ id: 'x', label: 'Platziert', color: '#000000', base: 'platziert' }] })[0]).toMatch(/doppelt/);
  });
});
