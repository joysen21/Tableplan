import { describe, expect, it } from 'vitest';
import { newId } from './demo';
import { parseBoard, parseCsv, parseImport, planImport } from './hotelImport';
import type { Stay } from './types';
import { decodeText } from '../lib/text';

/** Aufbau wie die ASA-Zimmerliste (anonymisierte Namen) */
const HEAD = 'Ausgewählt;Nr.;Jahr;Position;Zimmerreservierung;Gast;Name;Geburtsdatum;Alter (Aufenthalt);Land;Eigene Meldung;Meldung;'
  + 'Einwilligungserklärung vorhanden;Web Check-in;Anreise;Tage;Abreise;Status;Ehrung (Jahre);Ehrung (Aufenthalte);Konto';
const row = (nr: string, year: string, pos: number, room: string, gast: string, name: string, arr: string, dep: string, status = 'Anwesend') =>
  `Nein;${nr};${year};${pos};${room};${gast};${name};01.01.1960;66;D;Ja;700;Nein;Ja;${arr};7;${dep};${status};;;`;
const ASA = [HEAD,
  row('3613', '2026', 1, '103', 'Muster Max', 'Muster Max', '14.10.2026', '23.10.2026'),
  row('3613', '2026', 2, '103', '', 'Muster Erika', '14.10.2026', '23.10.2026'),
  // eine Reservierung, drei Zimmer
  row('2564', '2026', 3, '104', 'Beispiel Paula', 'Beispiel Paula', '11.10.2026', '18.10.2026'),
  row('2564', '2026', 2, '107', 'Test Erna', 'Test Erna', '11.10.2026', '18.10.2026'),
  row('2564', '2026', 1, '125', 'Probe Sigrid', 'Probe Sigrid', '11.10.2026', '18.10.2026'),
  // Hauptgast steht nicht in der ersten Zeile
  row('2770', '2026', 4, '110', 'Kunz Dieter', 'Kunz Dieter', '10.10.2026', '16.10.2026'),
  row('2770', '2026', 3, '110', 'Kunz Margit', 'Kunz Margit', '10.10.2026', '16.10.2026'),
  row('2994', '2026', 1, '114', 'Glaßner Jürgen', 'Glaßner Jürgen', '10.10.2026', '15.10.2026', 'Storniert'),
  ''].join('\r\n');

const stay = (p: Partial<Stay>): Stay => ({
  id: newId(), roomNo: '101', name: 'Gast', adults: 2, children: 0, arrival: '2026-10-10', departure: '2026-10-17', board: 'HP',
  phone: '', allergies: '', allergens: [], notes: '', vip: false, times: {}, tableIds: [], ...p
});
const opts = { today: '2026-10-15', newId, defaultBoard: 'HP' as const };

describe('CSV lesen', () => {
  it('erkennt Trennzeichen und Anführungszeichen', () => {
    expect(parseCsv('a;"b;c";"d ""e"""\r\n1;2;3\n')).toEqual([['a', 'b;c', 'd "e"'], ['1', '2', '3']]);
    expect(parseCsv('a,b\n\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('ordnet Verpflegung aus Kürzel und Klartext zu', () => {
    expect(parseBoard('HP')).toBe('HP');
    expect(parseBoard('Halbpension')).toBe('HP');
    expect(parseBoard('Übernachtung/Frühstück')).toBe('UF');
    expect(parseBoard('Vollpension')).toBe('VP');
    expect(parseBoard('All inclusive')).toBe('AI');
    expect(parseBoard('')).toBeUndefined();
  });
});

describe('ASA-Zimmerliste', () => {
  it('fasst Personen je Reservierung und Zimmer zusammen', () => {
    const p = parseImport(ASA);
    expect(p.format).toBe('asa');
    expect(p.errors).toEqual([]);
    expect(p.cancelled).toBe(1);
    expect(p.stays).toHaveLength(5);
    const z103 = p.stays.find(s => s.roomNo === '103')!;
    expect(z103).toMatchObject({ externalId: 'ASA:3613/2026/1', name: 'Muster Max', adults: 2, children: 0, arrival: '2026-10-14', departure: '2026-10-23' });
    expect(z103.board).toBeUndefined();
    expect(p.stays.filter(s => s.externalId?.startsWith('ASA:2564/')).map(s => s.roomNo)).toEqual(['104', '107', '125']);
  });
  it('nimmt den Gast mit der niedrigsten Position als Namen', () => {
    const z110 = parseImport(ASA).stays.find(s => s.roomNo === '110')!;
    expect(z110).toMatchObject({ name: 'Kunz Margit', externalId: 'ASA:2770/2026/3', adults: 2 });
  });
  it('liest die ANSI-Datei aus ASA mit Umlauten', () => {
    const bytes = Uint8Array.from([...HEAD, '\r\n', row('1', '2026', 1, '201', 'Müller Jürgen', 'Müller Jürgen', '14.10.2026', '16.10.2026')].join('')
      .split('').map(ch => ({ ä: 0xe4, ü: 0xfc, ö: 0xf6, ß: 0xdf } as Record<string, number>)[ch] ?? ch.charCodeAt(0)));
    expect(parseImport(decodeText(bytes)).stays[0].name).toBe('Müller Jürgen');
  });
  it('meldet unvollständige Zeilen', () => {
    expect(parseImport([HEAD, row('5', '2026', 1, '', 'X', 'X', '14.10.2026', '16.10.2026')].join('\n')).errors).toHaveLength(1);
  });
});

describe('Abgleich mit dem Bestand', () => {
  it('legt neue Aufenthalte mit Standard-Verpflegung an', () => {
    const plan = planImport([], parseImport(ASA), { ...opts, defaultBoard: 'VP' });
    expect(plan.create).toHaveLength(5);
    expect(plan.create[0]).toMatchObject({ board: 'VP', tableIds: [], externalId: 'ASA:3613/2026/1' });
  });
  it('aktualisiert nur Hotel-Daten – Tisch, Zeiten, Notizen und Verpflegung bleiben', () => {
    const ex = stay({ externalId: 'ASA:3613/2026/1', roomNo: '103', name: 'Muster Max', arrival: '2026-10-14', departure: '2026-10-20', adults: 1, children: 1,
      board: 'VP', tableIds: ['t1'], times: { abend: '19:30' }, notes: 'Fensterplatz', vip: true });
    const plan = planImport([ex], parseImport(ASA), opts);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].changes).toEqual(['Abreise 2026-10-20 → 2026-10-23']);
    // Personenzahl gleich (2) → Aufteilung Erwachsene/Kinder bleibt
    expect(plan.update[0].stay).toMatchObject({ departure: '2026-10-23', adults: 1, children: 1, board: 'VP', tableIds: ['t1'], times: { abend: '19:30' }, notes: 'Fensterplatz', vip: true });
  });
  it('findet einen Zimmerwechsel über die Kennung', () => {
    const ex = stay({ externalId: 'ASA:3613/2026/1', roomNo: '102', name: 'Muster Max', arrival: '2026-10-14', departure: '2026-10-23', tableIds: ['t1'] });
    const plan = planImport([ex], parseImport(ASA), opts);
    expect(plan.update[0].changes).toEqual(['Zimmer 102 → 103']);
    expect(plan.update[0].stay.id).toBe(ex.id);
  });
  it('verknüpft von Hand angelegte Aufenthalte über Zimmer + Anreise', () => {
    const ex = stay({ roomNo: '103', name: 'Muster Max', arrival: '2026-10-14', departure: '2026-10-23' });
    const plan = planImport([ex], parseImport(ASA), opts);
    expect(plan.update[0]).toMatchObject({ changes: ['mit Hotelprogramm verknüpft'], stay: { id: ex.id, externalId: 'ASA:3613/2026/1' } });
    expect(plan.create).toHaveLength(4);
  });
  it('zählt unveränderte Aufenthalte', () => {
    const first = planImport([], parseImport(ASA), opts);
    const again = planImport(first.create, parseImport(ASA), opts);
    expect(again).toMatchObject({ create: [], update: [], remove: [], unchanged: 5 });
  });
  it('entfernt fehlende Gäste aus dem Hotelprogramm – von Hand angelegte und abgereiste bleiben', () => {
    const inHouse = stay({ externalId: 'ASA:9/2026/1', arrival: '2026-10-12', departure: '2026-10-19' });
    const future = stay({ externalId: 'ASA:8/2026/1', arrival: '2026-10-16', departure: '2026-10-19' });
    const gone = stay({ externalId: 'ASA:7/2026/1', arrival: '2026-10-10', departure: '2026-10-15' });
    const manual = stay({ roomNo: '999', arrival: '2026-10-12', departure: '2026-10-19' });
    const plan = planImport([inHouse, future, gone, manual], parseImport(ASA), opts);
    expect(plan.remove.map(r => [r.stay.id, r.action])).toEqual([[inHouse.id, 'depart'], [future.id, 'delete']]);
  });
  it('entfernt beim einfachen Format nichts', () => {
    const ex = stay({ externalId: 'ASA:9/2026/1', arrival: '2026-10-12', departure: '2026-10-19' });
    const p = parseImport('Zimmer;Name;Erwachsene;Kinder;Anreise;Abreise;Verpflegung\n201;Neu Gast;2;1;15.10.2026;18.10.2026;VP');
    expect(p.format).toBe('einfach');
    const plan = planImport([ex], p, opts);
    expect(plan.remove).toEqual([]);
    expect(plan.create[0]).toMatchObject({ roomNo: '201', adults: 2, children: 1, board: 'VP', externalId: null });
  });
});

describe('Leere Zimmer im Export', () => {
  it('Zeilen mit nur der Zimmernummer werden übersprungen, nicht als Fehler gemeldet', () => {
    const empty = 'Nein;;;;301;;;;;;;;;;;;;;;;';
    const p = parseImport([HEAD, row('3613', '2026', 1, '103', 'Muster Max', 'Muster Max', '14.10.2026', '23.10.2026'), empty, ';;;;302;;;;;;;;;;;;;;;;'].join('\r\n'));
    expect(p).toMatchObject({ errors: [], emptyRooms: 2 });
    expect(p.stays.map(s => s.roomNo)).toEqual(['103']);
    const simple = parseImport('Zimmer;Name;Erwachsene;Kinder;Anreise;Abreise;Verpflegung\n201;;;;;;\n202;Gast;2;0;15.10.2026;18.10.2026;HP');
    expect(simple).toMatchObject({ errors: [], emptyRooms: 1 });
  });
});
