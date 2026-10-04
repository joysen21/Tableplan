/** Demo-Daten: Hotelrestaurant mit 2 Räumen, 30 Tischen und einer Woche Reservierungen */
import { OCCASIONS } from './constants';
import { planStay, resEnd, resStart, stayTableConflicts, suggestTables, turnTime } from './logic';
import type { DiningTable, Reservation, Service, Stay, TableFeature, TableShape, VenueData } from './types';
import { addDays, fromMin, nowMin, toMin, today } from '../lib/time';

export const newId = () => crypto.randomUUID();

export function defaultServices(): Service[] {
  return [
    { id: newId(), name: 'Frühstück', kind: 'fruehstueck', start: '07:00', end: '10:30', hotelTime: '08:00', freeSeating: true, pacing: 0,
      turnTimes: [{ maxP: 2, min: 45 }, { maxP: 4, min: 60 }, { maxP: 99, min: 75 }], seatings: [], sort: 0 },
    { id: newId(), name: 'Mittagessen', kind: 'mittag', start: '12:00', end: '14:30', hotelTime: '12:30', freeSeating: false, pacing: 14,
      turnTimes: [{ maxP: 2, min: 75 }, { maxP: 4, min: 90 }, { maxP: 99, min: 120 }], seatings: [], sort: 1 },
    { id: newId(), name: 'Abendessen', kind: 'abend', start: '18:00', end: '21:30', hotelTime: '19:00', freeSeating: false, pacing: 18,
      turnTimes: [{ maxP: 2, min: 105 }, { maxP: 4, min: 120 }, { maxP: 6, min: 150 }, { maxP: 99, min: 180 }], seatings: ['18:30', '20:30'], sort: 2 }
  ];
}

/** Leerer Betrieb mit Grundeinstellungen */
export function emptyVenueData(venueId: string, name: string): VenueData {
  return {
    venue: { id: venueId, name },
    rooms: [{ id: newId(), name: 'Restaurant', width: 1000, height: 650, backgroundUrl: null, sort: 0 }],
    stations: [], tables: [], decor: [], combos: [], layouts: [], services: defaultServices(), blocks: [], stays: [], reservations: [], audit: []
  };
}

export function demoVenueData(venueId: string, name: string): VenueData {
  let seed = 42;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const r1 = newId(), r2 = newId(), sA = newId(), sB = newId(), sC = newId();
  const d: VenueData = {
    venue: { id: venueId, name },
    rooms: [
      { id: r1, name: 'Restaurant', width: 1000, height: 650, backgroundUrl: null, sort: 0 },
      { id: r2, name: 'Stube', width: 720, height: 500, backgroundUrl: null, sort: 1 }
    ],
    stations: [{ id: sA, name: 'Revier A', color: '#1f6feb' }, { id: sB, name: 'Revier B', color: '#e36209' }, { id: sC, name: 'Revier Stube', color: '#1a7f37' }],
    tables: [], decor: [], combos: [], layouts: [], services: defaultServices(), blocks: [], stays: [], reservations: [], audit: []
  };
  const T = (roomId: string, nm: string, shape: TableShape, x: number, y: number, w: number, h: number, min: number, max: number, stationId: string, features: TableFeature[] = []) =>
    d.tables.push({ id: newId(), roomId, name: nm, shape, x, y, width: w, height: h, rotation: 0, minPersons: min, maxPersons: max, stationId, features } as DiningTable);
  for (let i = 0; i < 6; i++) T(r1, 'T' + (i + 1), 'square', 110 + i * 140, 90, 72, 72, 2, 4, sA, ['fenster']);
  for (let i = 0; i < 5; i++) T(r1, 'T' + (i + 7), 'round', 130 + i * 160, 260, 92, 92, 4, 6, i < 3 ? sA : sB);
  for (let i = 0; i < 6; i++) T(r1, 'T' + (i + 12), 'square', 110 + i * 120, 420, 58, 58, 1, 2, sB, i === 0 ? ['rollstuhl'] : []);
  T(r1, 'T18', 'rect', 170, 560, 170, 80, 6, 8, sB, ['kinder']);
  T(r1, 'T19', 'rect', 420, 560, 170, 80, 6, 8, sB);
  T(r1, 'T20', 'rect', 670, 560, 170, 80, 6, 8, sB, ['hund']);
  for (let i = 0; i < 3; i++) T(r2, 'S' + (i + 1), 'square', 120 + i * 170, 100, 72, 72, 2, 4, sC, ['ruhig']);
  for (let i = 0; i < 3; i++) T(r2, 'S' + (i + 4), 'round', 120 + i * 170, 250, 90, 90, 4, 6, sC);
  T(r2, 'S7', 'square', 110, 400, 58, 58, 1, 2, sC);
  T(r2, 'S8', 'square', 210, 400, 58, 58, 1, 2, sC);
  T(r2, 'S9', 'rect', 420, 400, 190, 84, 8, 10, sC, ['ruhig']);
  T(r2, 'S10', 'bench', 640, 250, 60, 170, 3, 5, sC);
  const tid = (n: string) => d.tables.find(x => x.name === n)!.id;
  d.combos = [['T1', 'T2'], ['T3', 'T4'], ['T5', 'T6'], ['T12', 'T13'], ['T14', 'T15'], ['S7', 'S8']].map(a => ({ id: newId(), name: a.join('+'), tableIds: a.map(tid) }));
  d.decor = [
    { id: newId(), roomId: r1, kind: 'wall', x: 500, y: 12, width: 980, height: 10, rotation: 0, label: '' },
    { id: newId(), roomId: r1, kind: 'label', x: 500, y: 36, width: 200, height: 20, rotation: 0, label: 'Fensterfront / Seeblick' },
    { id: newId(), roomId: r1, kind: 'buffet', x: 930, y: 330, width: 60, height: 260, rotation: 0, label: 'Buffet' },
    { id: newId(), roomId: r1, kind: 'door', x: 930, y: 610, width: 80, height: 14, rotation: 0, label: 'Eingang' },
    { id: newId(), roomId: r1, kind: 'column', x: 420, y: 345, width: 26, height: 26, rotation: 0, label: '' },
    { id: newId(), roomId: r2, kind: 'bar', x: 600, y: 60, width: 180, height: 50, rotation: 0, label: 'Bar' },
    { id: newId(), roomId: r2, kind: 'door', x: 40, y: 480, width: 70, height: 14, rotation: 0, label: 'Zugang Restaurant' }
  ];
  const t0 = today(), nm = nowMin();
  const dinner = d.services.find(s => s.kind === 'abend')!;
  d.blocks.push({ id: newId(), tableId: tid('T20'), date: t0, serviceId: dinner.id, reason: 'Firmenfeier (Aufbau)' });

  const NAMES = ['Gruber', 'Huber', 'Mair', 'Pichler', 'Rossi', 'Bianchi', 'Hofer', 'Schmid', 'Weber', 'Kofler', 'Ferrari', 'Moser',
    'Wagner', 'Fischer', 'Ricci', 'Thaler', 'Egger', 'Brunner', 'Colombo', 'Steiner', 'Lang', 'Kerschbaumer', 'Marini', 'Wolf',
    'Unterhofer', 'Fink', 'Rainer', 'Gamper', 'Romano', 'Baumann', 'Seidl', 'Kaufmann', 'Greco', 'Walder', 'Bauer', 'Esposito'];
  const ALLERG = ['', '', '', '', '', 'Gluten', 'Laktose', 'Nüsse', 'vegetarisch', 'vegan', 'Schalentiere'];
  const statusFor = (r: Reservation): Reservation['status'] => {
    if (r.date < t0) return 'abgeschlossen';
    if (r.date > t0) return rnd() < 0.15 ? 'angefragt' : 'bestaetigt';
    if (resEnd(r) <= nm) return 'abgeschlossen';
    if (resStart(r) <= nm) return 'platziert';
    return 'bestaetigt';
  };
  const applyPlan = (stay: Stay) => {
    const plan = planStay(d, stay, newId);
    d.reservations = d.reservations.filter(r => !plan.deleteIds.includes(r.id));
    for (const u of plan.upserts) { const i = d.reservations.findIndex(r => r.id === u.id); if (i >= 0) d.reservations[i] = u; else d.reservations.push(u); }
  };

  // Hotelaufenthalte
  for (let i = 0; i < 24; i++) {
    const arr = addDays(t0, Math.floor(rnd() * 9) - 4), nights = 3 + Math.floor(rnd() * 5);
    const adults = rnd() < 0.7 ? 2 : rnd() < 0.5 ? 1 : 3, children = rnd() < 0.25 ? 1 + Math.floor(rnd() * 2) : 0;
    const board = rnd() < 0.7 ? 'HP' : rnd() < 0.5 ? 'VP' : 'UF';
    d.stays.push({ id: newId(), roomNo: String(101 + i + (i > 11 ? 88 : 0)), name: NAMES[i], adults, children, arrival: arr, departure: addDays(arr, nights),
      board, tableIds: [], allergies: pick(ALLERG), notes: '', vip: rnd() < 0.12, phone: '', times: { abend: pick(['18:30', '19:00', '19:00', '19:30']) } });
  }
  let openLeft = 3;
  for (const st of d.stays) {
    if (st.board === 'UF') continue;
    applyPlan(st);
    if ((st.arrival === t0 || st.arrival === addDays(t0, 1)) && openLeft > 0) { openLeft--; continue; }
    const p = st.adults + st.children;
    const cand = [...d.tables].filter(x => p <= x.maxPersons && p >= x.minPersons).sort((a, b) => a.maxPersons - b.maxPersons)
      .find(x => !stayTableConflicts(d, st, [x.id]).length);
    if (cand) { st.tableIds = [cand.id]; applyPlan(st); }
  }
  // Externe Reservierungen
  const phone = () => '+39 ' + (330 + Math.floor(rnd() * 60)) + ' ' + Math.floor(1000000 + rnd() * 8999999);
  for (let dd = -2; dd < 7; dd++) {
    const date = addDays(t0, dd);
    for (const svc of d.services.filter(s => !s.freeSeating)) {
      const n = svc.kind === 'abend' ? 9 + Math.floor(rnd() * 5) : 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const startM = toMin(svc.start) + Math.floor(rnd() * ((toMin(svc.end) - toMin(svc.start) - 30) / 15)) * 15;
        const adults = rnd() < 0.55 ? 2 : rnd() < 0.6 ? 4 : rnd() < 0.5 ? 3 : 6, children = rnd() < 0.2 ? 1 : 0;
        const r: Reservation = {
          id: newId(), date, serviceId: svc.id, time: fromMin(startM), adults, children, duration: turnTime(d, svc.id, adults + children),
          name: pick(NAMES) + (rnd() < 0.5 ? ' ' + pick(['A.', 'M.', 'S.', 'L.', 'K.']) : ''), phone: phone(), email: '',
          notes: rnd() < 0.15 ? pick(['Kinderwagen', 'Ruhiger Tisch gewünscht', 'Kommt evtl. später', 'Stammgast – bevorzugt Fenster']) : '',
          occasion: rnd() < 0.12 ? pick(OCCASIONS.slice(1)) : '', allergies: pick(ALLERG), highchair: children > 0 && rnd() < 0.5,
          vip: rnd() < 0.07, source: pick(['Telefon', 'Telefon', 'Website', 'Google', 'E-Mail']), tableIds: [], status: 'bestaetigt',
          wishes: [], stayId: null, manualTable: false, seriesId: null, seatedAt: null, finishedAt: null
        };
        r.status = statusFor(r);
        const sug = suggestTables(d, r, null, 1);
        if (sug.length && !(dd === 0 && k < 2 && svc.kind === 'abend')) r.tableIds = sug[0].ids;
        d.reservations.push(r);
      }
    }
  }
  for (const r of d.reservations) if (r.stayId) r.status = statusFor(r);
  const past = d.reservations.filter(r => r.date < t0 && !r.stayId);
  if (past[0]) past[0].status = 'noshow';
  if (past[1]) past[1].status = 'storniert';
  return d;
}
