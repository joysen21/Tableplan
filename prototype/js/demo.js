'use strict';
/* =========================================================
   5) Demo-Daten: Hotelrestaurant, 2 Räume, 30 Tische, 1 Woche
   ========================================================= */
function demoData() {
  let seed = 42; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const D = {
    version: 1, rev: 0, betrieb: 'Hotel Sonnenhof – Restaurant', theme: 'light',
    rooms: [
      { id: 'r1', name: 'Restaurant', w: 1000, h: 650, bg: '' },
      { id: 'r2', name: 'Stube', w: 720, h: 500, bg: '' }
    ],
    stations: [
      { id: 'sA', name: 'Revier A', color: '#1f6feb' },
      { id: 'sB', name: 'Revier B', color: '#e36209' },
      { id: 'sC', name: 'Revier Stube', color: '#1a7f37' }
    ],
    services: [
      { id: 'fr', name: 'Frühstück', type: 'fruehstueck', start: '07:00', end: '10:30', hotelTime: '08:00', freeSeating: true, pacing: 0,
        turn: [{ maxP: 2, min: 45 }, { maxP: 4, min: 60 }, { maxP: 99, min: 75 }], seatings: [] },
      { id: 'mi', name: 'Mittagessen', type: 'mittag', start: '12:00', end: '14:30', hotelTime: '12:30', freeSeating: false, pacing: 14,
        turn: [{ maxP: 2, min: 75 }, { maxP: 4, min: 90 }, { maxP: 99, min: 120 }], seatings: [] },
      { id: 'ab', name: 'Abendessen', type: 'abend', start: '18:00', end: '21:30', hotelTime: '19:00', freeSeating: false, pacing: 18,
        turn: [{ maxP: 2, min: 105 }, { maxP: 4, min: 120 }, { maxP: 6, min: 150 }, { maxP: 99, min: 180 }], seatings: ['18:30', '20:30'] }
    ],
    tables: [], decor: [], combos: [], stays: [], reservations: [], audit: [],
    users: [
      { id: 'u1', name: 'Admin', role: 'admin', pin: '0000' },
      { id: 'u2', name: 'Empfang', role: 'empfang', pin: '1111' },
      { id: 'u3', name: 'Service', role: 'service', pin: '2222' },
      { id: 'u4', name: 'Küche', role: 'kueche', pin: '3333' }
    ],
    closedDays: []
  };
  const T = (roomId, name, shape, x, y, w, h, min, max, station, props = []) =>
    D.tables.push({ id: 't' + (D.tables.length + 1), roomId, name, shape, x, y, w, h, rot: 0, min, max, station, props, blocks: [] });
  // Restaurant (20 Tische)
  for (let i = 0; i < 6; i++) T('r1', 'T' + (i + 1), 'square', 110 + i * 140, 90, 72, 72, 2, 4, 'sA', ['fenster']);
  for (let i = 0; i < 5; i++) T('r1', 'T' + (i + 7), 'round', 130 + i * 160, 260, 92, 92, 4, 6, i < 3 ? 'sA' : 'sB');
  for (let i = 0; i < 6; i++) T('r1', 'T' + (i + 12), 'square', 110 + i * 120, 420, 58, 58, 1, 2, 'sB', i === 0 ? ['rollstuhl'] : []);
  T('r1', 'T18', 'rect', 170, 560, 170, 80, 6, 8, 'sB', ['kinder']);
  T('r1', 'T19', 'rect', 420, 560, 170, 80, 6, 8, 'sB');
  T('r1', 'T20', 'rect', 670, 560, 170, 80, 6, 8, 'sB', ['hund']);
  // Stube (10 Tische)
  for (let i = 0; i < 3; i++) T('r2', 'S' + (i + 1), 'square', 120 + i * 170, 100, 72, 72, 2, 4, 'sC', ['ruhig']);
  for (let i = 0; i < 3; i++) T('r2', 'S' + (i + 4), 'round', 120 + i * 170, 250, 90, 90, 4, 6, 'sC');
  T('r2', 'S7', 'square', 110, 400, 58, 58, 1, 2, 'sC');
  T('r2', 'S8', 'square', 210, 400, 58, 58, 1, 2, 'sC');
  T('r2', 'S9', 'rect', 420, 400, 190, 84, 8, 10, 'sC', ['ruhig']);
  T('r2', 'S10', 'bench', 640, 250, 60, 170, 3, 5, 'sC');
  const byName = n => D.tables.find(x => x.name === n).id;
  D.combos = [['T1', 'T2'], ['T3', 'T4'], ['T5', 'T6'], ['T12', 'T13'], ['T14', 'T15'], ['S7', 'S8']]
    .map(a => ({ id: uid(), name: a.join('+'), tableIds: a.map(byName) }));
  D.decor = [
    { id: uid(), roomId: 'r1', type: 'wall', x: 500, y: 12, w: 980, h: 10, rot: 0, text: '' },
    { id: uid(), roomId: 'r1', type: 'label', x: 500, y: 36, w: 200, h: 20, rot: 0, text: 'Fensterfront / Seeblick' },
    { id: uid(), roomId: 'r1', type: 'buffet', x: 930, y: 330, w: 60, h: 260, rot: 0, text: 'Buffet' },
    { id: uid(), roomId: 'r1', type: 'door', x: 930, y: 610, w: 80, h: 14, rot: 0, text: 'Eingang' },
    { id: uid(), roomId: 'r1', type: 'column', x: 420, y: 345, w: 26, h: 26, rot: 0, text: '' },
    { id: uid(), roomId: 'r2', type: 'bar', x: 600, y: 60, w: 180, h: 50, rot: 0, text: 'Bar' },
    { id: uid(), roomId: 'r2', type: 'door', x: 40, y: 480, w: 70, h: 14, rot: 0, text: 'Zugang Restaurant' }
  ];

  const NAMES = ['Gruber', 'Huber', 'Mair', 'Pichler', 'Rossi', 'Bianchi', 'Hofer', 'Schmid', 'Weber', 'Kofler', 'Ferrari', 'Moser',
    'Wagner', 'Fischer', 'Ricci', 'Thaler', 'Egger', 'Brunner', 'Colombo', 'Steiner', 'Lang', 'Kerschbaumer', 'Marini', 'Wolf',
    'Unterhofer', 'Fink', 'Rainer', 'Gamper', 'Romano', 'Baumann', 'Seidl', 'Kaufmann', 'Greco', 'Walder', 'Bauer', 'Esposito'];
  const ALLERG = ['', '', '', '', '', 'Gluten', 'Laktose', 'Nüsse', 'vegetarisch', 'vegan', 'Schalentiere'];
  const t0 = today(), nm = nowMin();
  const statusFor = r => {
    if (r.date < t0) return 'abgeschlossen';
    if (r.date > t0) return rnd() < 0.15 ? 'angefragt' : 'bestaetigt';
    if (resEnd(r) <= nm) return 'abgeschlossen';
    if (resStart(r) <= nm) return 'platziert';
    return 'bestaetigt';
  };
  // ein gesperrter Tisch heute Abend
  D.tables.find(x => x.name === 'T20').blocks.push({ date: t0, serviceId: 'ab', reason: 'Firmenfeier (Aufbau)' });
  DB = D; // Hilfsfunktionen (tableBusy, suggestTables …) arbeiten auf DB

  // Hotelaufenthalte
  for (let i = 0; i < 24; i++) {
    const arr = addDays(t0, Math.floor(rnd() * 9) - 4), nights = 3 + Math.floor(rnd() * 5);
    const adults = rnd() < 0.7 ? 2 : (rnd() < 0.5 ? 1 : 3), children = rnd() < 0.25 ? 1 + Math.floor(rnd() * 2) : 0;
    const board = rnd() < 0.7 ? 'HP' : (rnd() < 0.5 ? 'VP' : 'UF');
    D.stays.push({ id: uid(), room: String(101 + i + (i > 11 ? 88 : 0)), name: NAMES[i], adults, children, arrival: arr, departure: addDays(arr, nights),
      board, tableIds: [], allergies: pick(ALLERG), notes: '', vip: rnd() < 0.12, phone: '', times: { abend: pick(['18:30', '19:00', '19:00', '19:30']) } });
  }
  // fester Tisch für die meisten – einige bewusst offen (Anreise heute/morgen)
  let openLeft = 3;
  for (const st of D.stays) {
    if (st.board === 'UF') continue;
    syncStay(st);
    if ((st.arrival === t0 || st.arrival === addDays(t0, 1)) && openLeft > 0) { openLeft--; continue; }
    const p = st.adults + st.children;
    const cand = D.tables.filter(x => p <= x.max && p >= x.min).sort((a, b) => a.max - b.max)
      .find(x => !stayTableConflicts(st, [x.id]).length);
    if (cand) { st.tableIds = [cand.id]; syncStay(st); }
  }
  // Externe Reservierungen
  const PHONE = () => '+39 ' + (330 + Math.floor(rnd() * 60)) + ' ' + Math.floor(1000000 + rnd() * 8999999);
  for (let d = -2; d < 7; d++) {
    const date = addDays(t0, d);
    for (const svc of D.services.filter(s => !s.freeSeating)) {
      const n = svc.type === 'abend' ? 9 + Math.floor(rnd() * 5) : 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const startM = toMin(svc.start) + Math.floor(rnd() * ((toMin(svc.end) - toMin(svc.start) - 30) / 15)) * 15;
        const adults = rnd() < 0.55 ? 2 : (rnd() < 0.6 ? 4 : (rnd() < 0.5 ? 3 : 6)), children = rnd() < 0.2 ? 1 : 0;
        const r = { id: uid(), date, serviceId: svc.id, time: fromMin(startM), adults, children, duration: turnTime(svc.id, adults + children),
          name: pick(NAMES) + (rnd() < 0.5 ? ' ' + pick(['A.', 'M.', 'S.', 'L.', 'K.']) : ''), phone: PHONE(), email: '',
          notes: rnd() < 0.15 ? pick(['Kinderwagen', 'Ruhiger Tisch gewünscht', 'Kommt evtl. später', 'Stammgast – bevorzugt Fenster']) : '',
          occasion: rnd() < 0.12 ? pick(OCCASIONS.slice(1)) : '', allergies: pick(ALLERG), highchair: children > 0 && rnd() < 0.5,
          vip: rnd() < 0.07, source: pick(['Telefon', 'Telefon', 'Website', 'Google', 'E-Mail']), tableIds: [], status: 'bestaetigt', createdAt: Date.now() };
        r.status = statusFor(r);
        const sug = suggestTables(r, 1);
        if (sug.length && !(d === 0 && k < 2 && svc.type === 'abend')) r.tableIds = sug[0].ids;
        D.reservations.push(r);
      }
    }
  }
  for (const r of D.reservations) if (r.stayId) r.status = statusFor(r);
  // ein No-Show und ein Storno in der Vergangenheit/heute zur Demonstration
  const past = D.reservations.filter(r => r.date < t0 && !r.stayId);
  if (past[0]) past[0].status = 'noshow';
  if (past[1]) past[1].status = 'storniert';
  D.audit.push({ ts: Date.now(), user: 'System', action: 'Demo-Daten erzeugt', detail: '' });
  return D;
}
