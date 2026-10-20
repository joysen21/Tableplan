/**
 * Hotelgäste-Import aus CSV und Abgleich mit dem Bestand.
 * Formate: ASA-Zimmerliste (eine Zeile pro Person, wird je Reservierung + Zimmer zu einem Aufenthalt zusammengefasst)
 * und das einfache Format Zimmer;Name;Erwachsene;Kinder;Anreise;Abreise;Verpflegung;Allergien;Notiz.
 * Die ASA-Datei enthält immer den kompletten Gästestand – fehlende Aufenthalte gelten als abgereist bzw. storniert.
 * Personenbezogene Zusatzdaten (Geburtsdatum, Land, Meldung …) werden nicht übernommen.
 */
import { BOARDS } from './constants';
import { guessAllergens } from './menu';
import type { Board, Stay } from './types';
import { parseDate } from '../lib/time';

export type ImportFormat = 'asa' | 'einfach';

/** Ein Aufenthalt, wie er aus der Datei gelesen wurde */
export interface ImportStay {
  /** Kennung im Hotelprogramm (ASA: „ASA:Nr/Jahr/erste Position“) – null beim einfachen Format */
  externalId: string | null;
  roomNo: string; name: string; adults: number; children: number; arrival: string; departure: string;
  /** undefined = nicht in der Datei, bestehende Verpflegung bleibt */
  board?: Board;
  allergies?: string; notes?: string;
}

export interface ParsedImport {
  format: ImportFormat; stays: ImportStay[]; errors: string[];
  /** stornierte Zeilen, nicht übernommen */ cancelled: number;
  /** leere Zimmer (nur Zimmernummer, sonst nichts) – werden still übersprungen */ emptyRooms: number;
}

/** CSV in Zeilen/Zellen zerlegen – Trennzeichen ; Tab oder , (aus der ersten Zeile), Anführungszeichen nach RFC 4180 */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (t[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (ch === '"' && !cell.trim()) { quoted = true; cell = ''; }
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

/** Verpflegung aus Kürzel oder Klartext (UF/Frühstück, HP/Halbpension, VP/Vollpension, AI/All inclusive) */
export function parseBoard(text: string): Board | undefined {
  const v = norm(text);
  if (!v) return undefined;
  if ((BOARDS as string[]).includes(v.toUpperCase())) return v.toUpperCase() as Board;
  if (/^(üf|fr|bb)|frühst|fruehst|garni/.test(v)) return 'UF';
  if (/^hb|halbp/.test(v)) return 'HP';
  if (/^fb|vollp/.test(v)) return 'VP';
  if (/allinc/.test(v)) return 'AI';
  return undefined;
}

/** Datei einlesen – erkennt das Format an der Kopfzeile */
export function parseImport(text: string): ParsedImport {
  const rows = parseCsv(text);
  if (rows.length < 2) return { format: 'einfach', stays: [], errors: ['Keine Daten'], cancelled: 0, emptyRooms: 0 };
  const head = rows[0].map(norm);
  const col = (...names: string[]) => head.findIndex(h => names.includes(h));
  const c = {
    nr: col('nr'), year: col('jahr'), pos: col('position'), room: col('zimmerreservierung', 'zimmer', 'zimmernr', 'zimmernummer'),
    guest: col('gast'), name: col('name'), arrival: col('anreise'), departure: col('abreise'), status: col('status'),
    board: col('verpflegung', 'pension', 'board')
  };
  return c.nr >= 0 && c.room >= 0 && c.arrival >= 0 && c.departure >= 0 && (c.name >= 0 || c.guest >= 0)
    ? parseAsa(rows, c) : parseSimple(rows);
}

function parseAsa(rows: string[][], c: Record<'nr' | 'year' | 'pos' | 'room' | 'guest' | 'name' | 'arrival' | 'departure' | 'status' | 'board', number>): ParsedImport {
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
  const groups = new Map<string, ImportStay & { firstPos: number }>();
  const errors: string[] = [];
  let cancelled = 0, emptyRooms = 0;
  rows.slice(1).forEach((r, i) => {
    // leeres Zimmer: ASA exportiert auch freie Zimmer, dann steht nur die Zimmernummer in der Zeile
    if (get(r, c.room) && [c.nr, c.guest, c.name, c.arrival, c.departure].every(k => !get(r, k))) { emptyRooms++; return; }
    if (/storn|no.?show/i.test(get(r, c.status))) { cancelled++; return; }
    const nr = get(r, c.nr), roomNo = get(r, c.room);
    const arrival = parseDate(get(r, c.arrival)), departure = parseDate(get(r, c.departure));
    if (!nr || !roomNo || !arrival || !departure || departure <= arrival) { errors.push(`Zeile ${i + 2}: unvollständig oder ungültige Daten`); return; }
    const pos = parseInt(get(r, c.pos)) || 0;
    const name = get(r, c.guest) || get(r, c.name);
    const key = `${nr}/${get(r, c.year)}/${roomNo}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { externalId: '', roomNo, name, adults: 1, children: 0, arrival, departure, board: parseBoard(get(r, c.board)), firstPos: pos });
      return;
    }
    g.adults++;
    if (arrival < g.arrival) g.arrival = arrival;
    if (departure > g.departure) g.departure = departure;
    g.board ??= parseBoard(get(r, c.board));
    // Hauptgast = niedrigste Position im Zimmer
    if (pos < g.firstPos && name) { g.firstPos = pos; g.name = name; }
    else if (!g.name) g.name = name;
  });
  // Kennung über die erste Position statt das Zimmer: ein Zimmerwechsel bleibt derselbe Aufenthalt (mit festem Tisch)
  const stays = [...groups.entries()].map(([key, { firstPos, ...s }]) => {
    const [nr, year, room] = key.split('/');
    return { ...s, externalId: `ASA:${nr}/${year}/${firstPos || 'Zi' + room}` };
  });
  return { format: 'asa', stays, errors, cancelled, emptyRooms };
}

function parseSimple(rows: string[][]): ParsedImport {
  const stays: ImportStay[] = [], errors: string[] = [];
  let emptyRooms = 0;
  rows.slice(1).forEach((c, i) => {
    if (c[0] && !c[1] && !c[4] && !c[5]) { emptyRooms++; return; } // leeres Zimmer
    const arrival = parseDate(c[4] ?? ''), departure = parseDate(c[5] ?? ''), board = c[6] ? parseBoard(c[6]) : 'HP';
    if (!c[0] || !c[1] || !arrival || !departure || departure <= arrival || !board) { errors.push(`Zeile ${i + 2}: ungültig`); return; }
    stays.push({ externalId: null, roomNo: c[0], name: c[1], adults: +c[2] || 1, children: +c[3] || 0, arrival, departure, board,
      allergies: c[7] ?? '', notes: c[8] ?? '' });
  });
  return { format: 'einfach', stays, errors, cancelled: 0, emptyRooms };
}

export interface ImportUpdate { before: Stay; stay: Stay; changes: string[] }
export interface ImportRemoval { stay: Stay; /** noch nicht angereist → löschen; im Haus → Abreise auf heute vorziehen */ action: 'delete' | 'depart' }
export interface ImportPlan { create: Stay[]; update: ImportUpdate[]; remove: ImportRemoval[]; unchanged: number }

/**
 * Abgleich Datei ↔ Bestand. Aus der Datei kommen nur Zimmer, Name, Anreise/Abreise, Personen und (falls vorhanden) Verpflegung –
 * feste Tische, Essenszeiten, Allergien, Notizen und VIP aus dem Tischplan bleiben unverändert.
 * Von Hand angelegte Aufenthalte (ohne Kennung) werden nur übernommen, wenn Zimmer und Anreise übereinstimmen, und nie entfernt.
 */
export function planImport(stays: Stay[], parsed: Pick<ParsedImport, 'format' | 'stays'>, opts: { today: string; newId: () => string; defaultBoard: Board }): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], remove: [], unchanged: 0 };
  const used = new Set<string>();
  for (const inc of parsed.stays) {
    const ex = (inc.externalId && stays.find(s => s.externalId === inc.externalId && !used.has(s.id)))
      || stays.find(s => !used.has(s.id) && !(inc.externalId && s.externalId) && s.roomNo === inc.roomNo && s.arrival === inc.arrival);
    if (!ex) {
      plan.create.push({ id: opts.newId(), externalId: inc.externalId, roomNo: inc.roomNo, name: inc.name, adults: inc.adults, children: inc.children,
        arrival: inc.arrival, departure: inc.departure, board: inc.board ?? opts.defaultBoard, phone: '', allergies: inc.allergies ?? '',
        allergens: guessAllergens(inc.allergies ?? ''), notes: inc.notes ?? '', vip: false, times: {}, tableIds: [] });
      continue;
    }
    used.add(ex.id);
    const next: Stay = { ...ex, roomNo: inc.roomNo, name: inc.name, arrival: inc.arrival, departure: inc.departure, externalId: inc.externalId ?? ex.externalId };
    // Personenzahl: Aufteilung Erwachsene/Kinder aus dem Tischplan behalten, solange die Summe stimmt
    if (ex.adults + ex.children !== inc.adults + inc.children) { next.adults = inc.adults; next.children = inc.children; }
    if (inc.board) next.board = inc.board;
    if (inc.allergies !== undefined && inc.allergies !== ex.allergies) {
      next.allergies = inc.allergies;
      next.allergens = [...new Set([...(ex.allergens ?? []), ...guessAllergens(inc.allergies)])];
    }
    if (inc.notes !== undefined) next.notes = inc.notes;
    const changes = describeChanges(ex, next);
    if (changes.length) plan.update.push({ before: ex, stay: next, changes });
    else if (next.externalId !== ex.externalId) plan.update.push({ before: ex, stay: next, changes: ['mit Hotelprogramm verknüpft'] });
    else plan.unchanged++;
  }
  // Kompletter Gästestand (ASA): Aufenthalte aus dem Hotelprogramm, die fehlen und noch nicht abgereist sind
  if (parsed.format === 'asa') for (const s of stays) {
    if (used.has(s.id) || !s.externalId?.startsWith('ASA:') || s.departure <= opts.today) continue;
    plan.remove.push({ stay: s, action: s.arrival >= opts.today ? 'delete' : 'depart' });
  }
  return plan;
}

function describeChanges(a: Stay, b: Stay): string[] {
  const out: string[] = [];
  if (a.roomNo !== b.roomNo) out.push(`Zimmer ${a.roomNo} → ${b.roomNo}`);
  if (a.name !== b.name) out.push(`Name ${a.name} → ${b.name}`);
  if (a.arrival !== b.arrival) out.push(`Anreise ${a.arrival} → ${b.arrival}`);
  if (a.departure !== b.departure) out.push(`Abreise ${a.departure} → ${b.departure}`);
  if (a.adults + a.children !== b.adults + b.children || a.adults !== b.adults) out.push(`Personen ${a.adults + a.children} → ${b.adults + b.children}`);
  if (a.board !== b.board) out.push(`Verpflegung ${a.board} → ${b.board}`);
  if (a.allergies !== b.allergies) out.push('Allergien');
  if (a.notes !== b.notes) out.push('Notiz');
  return out;
}
