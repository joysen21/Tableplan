import { describe, expect, it } from 'vitest';
import { addMonths, completeDue, dueAlertCount, dueDashboard, dueRelative, dueState, intervalText, reminderDate, reopenDue } from './due';
import type { DueItem } from './types';

const T = '2026-10-26';
const X = (p: Partial<DueItem>): DueItem => ({ id: p.title ?? 'x', title: 'x', groupId: null, dueDate: T, intervalMonths: 0, staffId: null, staffName: '', reminderDays: 14,
  done: false, doneAt: null, lastDone: null, note: '', ...p });

describe('Fälligkeiten', () => {
  it('Stand: überfällig, heute, demnächst (Erinnerung), geplant, erledigt', () => {
    expect(dueState(X({ dueDate: '2026-10-25' }), T)).toBe('ueberfaellig');
    expect(dueState(X({ dueDate: T }), T)).toBe('faellig');
    expect(dueState(X({ dueDate: '2026-11-09', reminderDays: 14 }), T)).toBe('bald');
    expect(dueState(X({ dueDate: '2026-11-10', reminderDays: 14 }), T)).toBe('offen');
    expect(dueState(X({ dueDate: '2026-10-01', done: true }), T)).toBe('erledigt');
    expect(reminderDate(X({ dueDate: '2026-11-10', reminderDays: 14 }))).toBe('2026-10-27');
    const list = [X({ title: 'a', dueDate: '2026-10-20' }), X({ title: 'b', dueDate: T }), X({ title: 'c', dueDate: '2026-10-30' }), X({ title: 'd', dueDate: '2027-01-01' })];
    const dd = dueDashboard(list, T);
    expect([dd.ueberfaellig, dd.faellig, dd.bald].map(l => l.map(x => x.title))).toEqual([['a'], ['b'], ['c']]);
    expect(dueAlertCount(list, T)).toBe(3);
  });

  it('Erledigen: mit Intervall nächster Termin, einmalig erledigt', () => {
    const y = completeDue(X({ dueDate: '2026-10-20', intervalMonths: 12 }), T);
    expect([y.dueDate, y.done, y.lastDone]).toEqual(['2027-10-20', false, T]);
    // sehr überfällig: so oft Intervall, bis der Termin in der Zukunft liegt
    expect(completeDue(X({ dueDate: '2025-01-15', intervalMonths: 6 }), T).dueDate).toBe('2027-01-15');
    const once = completeDue(X({ dueDate: T }), T);
    expect([once.done, once.doneAt]).toEqual([true, T]);
    expect(reopenDue(once).done).toBe(false);
  });

  it('Monate addieren und Texte', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(dueRelative('2026-10-31', T)).toBe('in 5 Tagen');
    expect(dueRelative('2026-10-23', T)).toBe('seit 3 Tagen');
    expect([0, 1, 6, 12, 24].map(intervalText)).toEqual(['einmalig', 'monatlich', 'alle 6 Monate', 'jährlich', 'alle 2 Jahre']);
  });
});

describe('Fälligkeiten: Liste', () => {
  it('filtern, sortieren, gruppieren', async () => {
    const { filterDue, sortDue, groupDue } = await import('./due');
    const items = [
      X({ title: 'Brandschutz', groupId: 'g1', staffName: 'Eva', dueDate: '2026-10-20' }),
      X({ title: 'Aufzug', groupId: 'g2', staffName: '', dueDate: '2026-11-30', reminderDays: 0 }),
      X({ title: 'Versicherung', groupId: null, staffName: 'Karl', dueDate: '2026-11-02' }),
      X({ title: 'Alt', groupId: 'g1', staffName: 'Eva', dueDate: '2026-09-01', done: true })
    ];
    const name = (id: string | null) => ({ g1: 'Wartung', g2: 'Behörden' } as Record<string, string>)[id ?? ''] ?? '';
    const f = { q: '', groupId: '', staff: '', state: 'aktiv' as const };
    expect(filterDue(items, f, T).map(x => x.title)).toEqual(['Brandschutz', 'Aufzug', 'Versicherung']);
    expect(filterDue(items, { ...f, state: 'alle' }, T)).toHaveLength(4);
    expect(filterDue(items, { ...f, state: 'ueberfaellig' }, T).map(x => x.title)).toEqual(['Brandschutz']);
    expect(filterDue(items, { ...f, groupId: '-' }, T).map(x => x.title)).toEqual(['Versicherung']);
    expect(filterDue(items, { ...f, staff: '-' }, T).map(x => x.title)).toEqual(['Aufzug']);
    expect(filterDue(items, { ...f, q: 'aufz' }, T).map(x => x.title)).toEqual(['Aufzug']);
    expect(sortDue(items, 'datum-ab', name).map(x => x.title)).toEqual(['Aufzug', 'Versicherung', 'Brandschutz', 'Alt']);
    expect(sortDue(items, 'gruppe', name).map(x => x.title)).toEqual(['Aufzug', 'Alt', 'Brandschutz', 'Versicherung']);
    expect(sortDue(items, 'verantwortlich', name).map(x => x.staffName)).toEqual(['Eva', 'Eva', 'Karl', '']);
    expect(groupDue(sortDue(items, 'datum', name), 'stand', name, T).map(g => `${g.label}:${g.items.length}`)).toEqual(['Überfällig:1', 'Demnächst fällig:1', 'Geplant:1', 'Erledigt:1']);
    expect(groupDue(items, 'monat', name, T).map(g => g.label)).toEqual(['September 2026', 'Oktober 2026', 'November 2026']);
    expect(groupDue(items, 'gruppe', name, T).map(g => g.label)).toEqual(['Behörden', 'Wartung', 'Ohne Gruppe']);
  });
});
