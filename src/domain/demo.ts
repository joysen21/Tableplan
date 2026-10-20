/** Demo-Daten: Hotelrestaurant mit 2 Räumen, 30 Tischen und einer Woche Reservierungen */
import { OCCASIONS } from './constants';
import { guessAllergens, snapshotItems } from './menu';
import { shiftFromTemplate, weekStart } from './rosterPlan';
import { menuCourses, menuRooms, newQrToken } from './guestMenu';
import { planStay, resEnd, resStart, serviceTime, stayTableConflicts, suggestTables, tableBusy, untilEnd } from './logic';
import type { Allergen, Course, Dish, DiningTable, Ingredient, Menu, MenuItem, Reservation, Service, ShiftTemplate, Staff, Stay, TableFeature, TableShape, Unit, VenueData } from './types';
import { addDays, nowMin, today } from '../lib/time';

export const newId = () => crypto.randomUUID();

export function defaultServices(): Service[] {
  return [
    { id: newId(), name: 'Frühstück', kind: 'fruehstueck', start: '07:00', end: '10:30', hotelTime: '08:00', freeSeating: true, pacing: 0,
      turnTimes: [{ maxP: 2, min: 45 }, { maxP: 4, min: 60 }, { maxP: 99, min: 75 }], seatings: [], sort: 0 },
    { id: newId(), name: 'Mittagessen', kind: 'mittag', start: '12:00', end: '14:00', hotelTime: '12:30', freeSeating: false, pacing: 14,
      turnTimes: [{ maxP: 2, min: 75 }, { maxP: 4, min: 90 }, { maxP: 99, min: 120 }], seatings: [], sort: 1 },
    { id: newId(), name: 'Abendessen', kind: 'abend', start: '18:00', end: '20:30', hotelTime: '19:00', freeSeating: false, pacing: 18,
      turnTimes: [{ maxP: 2, min: 105 }, { maxP: 4, min: 120 }, { maxP: 6, min: 150 }, { maxP: 99, min: 180 }], seatings: ['18:30', '20:30'], sort: 2 }
  ];
}

/** Leerer Betrieb mit Grundeinstellungen */
export function emptyVenueData(venueId: string, name: string): VenueData {
  return {
    venue: { id: venueId, name, modules: [] },
    rooms: [{ id: newId(), name: 'Restaurant', width: 1000, height: 650, backgroundUrl: null, sort: 0 }],
    stations: [], tables: [], decor: [], combos: [], layouts: [], services: defaultServices(), blocks: [], stays: [], reservations: [], audit: [],
    ingredients: [], dishes: [], menus: [], menuChoices: [], departments: [], positions: [], staff: [], shiftTemplates: [], shifts: [], absences: [], publications: []
  };
}

/** Fehlende Listen/Felder ergänzen (ältere Sicherungen, Demo-Daten aus früheren Versionen) */
export function normalizeVenueData(d: VenueData): VenueData {
  const L = ['rooms', 'stations', 'tables', 'decor', 'combos', 'layouts', 'services', 'blocks', 'stays', 'reservations', 'audit', 'ingredients', 'dishes', 'menus', 'menuChoices',
    'departments', 'positions', 'staff', 'shiftTemplates', 'shifts', 'absences', 'publications'] as const;
  const out = { ...d } as VenueData;
  for (const k of L) (out as any)[k] = (d as any)[k] ?? [];
  out.venue = { ...d.venue, modules: d.venue?.modules ?? [] };
  out.departments = out.departments.map(x => ({ ...x, guestsPerStaff: x.guestsPerStaff ?? null, minStaff: x.minStaff ?? 0 }));
  out.staff = out.staff.map(x => ({ ...x, vacationDays: x.vacationDays ?? 0, shareToken: x.shareToken || newId() }));
  out.shifts = out.shifts.map(x => ({ ...x, note: x.note ?? '', breakMin: x.breakMin ?? 0 }));
  out.reservations = out.reservations.map(r => (r.allergens ? r : { ...r, allergens: [] }));
  out.stays = out.stays.map(s => (s.allergens ? s : { ...s, allergens: [] }));
  out.tables = out.tables.map(x => (typeof x.chairs === 'boolean' ? x : { ...x, chairs: true }));
  out.tables = out.tables.map(x => (x.qrToken ? x : { ...x, qrToken: newQrToken() }));
  return out;
}

export function demoVenueData(venueId: string, name: string): VenueData {
  let seed = 42;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const r1 = newId(), r2 = newId(), sA = newId(), sB = newId(), sC = newId();
  const d: VenueData = {
    venue: { id: venueId, name, modules: ['dienstplan'], branding: { title: 'Hotel Sonnenhof', welcome: 'Herzlich willkommen! Wählen Sie hier Ihr Menü – unsere Küche bereitet es frisch für Sie zu.', welcomeIt: 'Benvenuti! Scegliete qui il vostro menù – la nostra cucina lo prepara fresco per voi.', welcomeEn: 'Welcome! Choose your menu here – our kitchen prepares it fresh for you.', color: '#0F2347', logoUrl: null, coverUrl: null } },
    rooms: [
      { id: r1, name: 'Restaurant', width: 1000, height: 650, backgroundUrl: null, sort: 0 },
      { id: r2, name: 'Stube', width: 720, height: 500, backgroundUrl: null, sort: 1 }
    ],
    stations: [{ id: sA, name: 'Revier A', color: '#1f6feb' }, { id: sB, name: 'Revier B', color: '#e36209' }, { id: sC, name: 'Revier Stube', color: '#1a7f37' }],
    tables: [], decor: [], combos: [], layouts: [], services: defaultServices(), blocks: [], stays: [], reservations: [], audit: [],
    ingredients: [], dishes: [], menus: [], menuChoices: [], departments: [], positions: [], staff: [], shiftTemplates: [], shifts: [], absences: [], publications: []
  };
  const T = (roomId: string, nm: string, shape: TableShape, x: number, y: number, w: number, h: number, min: number, max: number, stationId: string, features: TableFeature[] = []) =>
    d.tables.push({ id: newId(), roomId, name: nm, shape, x, y, width: w, height: h, rotation: 0, minPersons: min, maxPersons: max, stationId, features, chairs: true, qrToken: newQrToken() } as DiningTable);
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
  const allerg = () => { const allergies = pick(ALLERG); return { allergies, allergens: guessAllergens(allergies) }; };
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
      board, tableIds: [], ...allerg(), notes: '', vip: rnd() < 0.12, phone: '', times: { abend: pick(['18:30', '19:00', '19:00', '19:30']) } });
  }
  let openLeft = 3;
  for (const st of d.stays) {
    if (st.board === 'UF') continue;
    applyPlan(st);
    if ((st.arrival === t0 || st.arrival === addDays(t0, 1)) && openLeft > 0) { openLeft--; continue; }
    const p = st.adults + st.children;
    const cand = [...d.tables].filter(x => p <= x.maxPersons && p >= x.minPersons).sort((a, b) => a.maxPersons - b.maxPersons)
      // Demo: jedes Zimmer bekommt einen eigenen Tisch (Teilen ist möglich, aber nicht der Normalfall)
      // – kein anderer Gast darf zu den Zeiten dieses Zimmers am Tisch sitzen
      .find(x => !stayTableConflicts(d, st, [x.id]).length && d.reservations.every(r => r.stayId !== st.id || !tableBusy(d, x.id, r.date, resStart(r), resEnd(r), r.id).length));
    if (cand) { st.tableIds = [cand.id]; applyPlan(st); }
  }
  // Externe Reservierungen
  const phone = () => '+39 ' + (330 + Math.floor(rnd() * 60)) + ' ' + Math.floor(1000000 + rnd() * 8999999);
  for (let dd = -2; dd < 7; dd++) {
    const date = addDays(t0, dd);
    for (const svc of d.services.filter(s => !s.freeSeating)) {
      const n = svc.kind === 'abend' ? 4 + Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        // Uhrzeit fest: Beginn des Service, Ende = Service-Ende
        const time = serviceTime(d, svc.id);
        const adults = rnd() < 0.55 ? 2 : rnd() < 0.6 ? 4 : rnd() < 0.5 ? 3 : 6, children = rnd() < 0.2 ? 1 : 0;
        const r: Reservation = {
          id: newId(), date, serviceId: svc.id, time, adults, children, duration: untilEnd(d, svc.id, time),
          name: pick(NAMES) + (rnd() < 0.5 ? ' ' + pick(['A.', 'M.', 'S.', 'L.', 'K.']) : ''), phone: phone(), email: '',
          notes: rnd() < 0.15 ? pick(['Kinderwagen', 'Ruhiger Tisch gewünscht', 'Kommt evtl. später', 'Stammgast – bevorzugt Fenster']) : '',
          occasion: rnd() < 0.12 ? pick(OCCASIONS.slice(1)) : '', ...allerg(), highchair: children > 0 && rnd() < 0.5,
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
  // wie in der Datenbank hat jede Reservierung einen Bearbeitungsstand
  const now = new Date().toISOString();
  d.reservations.forEach(r => { r.updatedAt = now; });
  demoKitchen(d);
  demoGuestChoices(d);
  demoRoster(d);
  return d;
}

/** Demo-Dienstplan: Bereiche mit Positionen, Mitarbeitende (inkl. Saisonkräfte) und Schichtvorlagen.
 *  Bereichsleitungen (Benutzer) setzt das Demo-Repo, weil die Benutzer-IDs nur dort bekannt sind. */
export function demoRoster(d: VenueData) {
  const dep = (name: string, color: string, sort: number, guestsPerStaff: number | null, minStaff: number, icon: string) => ({ id: newId(), name, color, sort, leadIds: [] as string[], guestsPerStaff, minStaff, icon });
  const kueche = dep('Küche', '#e36209', 0, 40, 2, 'kueche'), service = dep('Service', '#4F7BD1', 1, 25, 2, 'service'), bar = dep('Bar', '#a371f7', 2, null, 1, 'bar'), rez = dep('Rezeption', '#2da44e', 3, null, 1, 'rezeption');
  d.departments = [kueche, service, bar, rez];
  const P: Record<string, string> = {};
  const pos = (departmentId: string, names: string[]) => names.forEach((name, sort) => { const id = newId(); P[name] = id; d.positions.push({ id, departmentId, name, sort }); });
  pos(kueche.id, ['Küchenchef', 'Koch', 'Beikoch', 'Abwasch']);
  pos(service.id, ['Oberkellner', 'Chef de Rang', 'Kellner', 'Commis']);
  pos(bar.id, ['Barkeeper']);
  pos(rez.id, ['Rezeptionist']);
  const season = { contractFrom: addDays(today(), -60), contractTo: addDays(today(), 120) };
  const st = (name: string, short: string, departmentId: string, positions: string[], contract: Staff['contract'], weeklyHours: number, color: string, extra: Partial<Staff> = {}): Staff =>
    ({ id: newId(), name, short, departmentId, positionIds: positions.map(p => P[p]), contract, weeklyHours, contractFrom: null, contractTo: null,
      phone: '', email: '', color, notes: '', active: true, vacationDays: contract === 'aushilfe' ? 0 : 26, shareToken: newId(), ...(contract === 'saison' ? season : {}), ...extra });
  d.staff = [
    st('Karl Pichler', 'KP', kueche.id, ['Küchenchef', 'Koch'], 'unbefristet', 40, '#e36209'),
    st('Lukas Mair', 'LM', kueche.id, ['Koch'], 'unbefristet', 40, '#bf8700'),
    st('Sara Rossi', 'SR', kueche.id, ['Koch', 'Beikoch'], 'saison', 40, '#d63384'),
    st('Jonas Egger', 'JE', kueche.id, ['Beikoch'], 'lehrling', 40, '#1b7c83'),
    st('Mirela Popescu', 'MP', kueche.id, ['Abwasch'], 'befristet', 30, '#4A5B7D', { contractTo: addDays(today(), 200) }),
    st('Toni Gruber', 'TG', service.id, ['Oberkellner', 'Chef de Rang'], 'unbefristet', 40, '#4F7BD1'),
    st('Anna Hofer', 'AH', service.id, ['Chef de Rang', 'Kellner'], 'unbefristet', 40, '#2da44e'),
    st('Marco Bianchi', 'MB', service.id, ['Kellner'], 'saison', 40, '#cf222e'),
    st('Lena Thaler', 'LT', service.id, ['Kellner', 'Barkeeper'], 'saison', 30, '#a371f7'),
    st('David Kofler', 'DK', service.id, ['Commis'], 'lehrling', 40, '#0F2347'),
    st('Eva Moser', 'EM', service.id, ['Kellner', 'Abwasch'], 'aushilfe', 12, '#bf8700', { notes: 'Nur am Wochenende' }),
    st('Paul Steiner', 'PS', bar.id, ['Barkeeper'], 'unbefristet', 40, '#a371f7'),
    st('Julia Brunner', 'JB', rez.id, ['Rezeptionist'], 'unbefristet', 40, '#2da44e'),
    st('Franz Weber', 'FW', rez.id, ['Rezeptionist'], 'unbefristet', 20, '#1b7c83', { active: false, contractTo: addDays(today(), -30), notes: 'Ausgeschieden' })
  ];
  const tp = (departmentId: string, name: string, short: string, start: string, end: string, breakMin: number, color: string, extra: Partial<ShiftTemplate> = {}): ShiftTemplate =>
    ({ id: newId(), departmentId, positionId: null, name, short, start, end, start2: null, end2: null, breakMin, color, sort: 0, ...extra });
  d.shiftTemplates = [
    tp(kueche.id, 'Frühdienst', 'F', '06:30', '14:30', 30, '#bf8700'),
    tp(kueche.id, 'Spätdienst', 'S', '14:00', '22:30', 30, '#0F2347'),
    tp(kueche.id, 'Teildienst', 'T', '10:00', '14:30', 0, '#1b7c83', { start2: '17:30', end2: '21:30' }),
    tp(service.id, 'Frühstück', 'FR', '06:45', '11:00', 0, '#bf8700'),
    tp(service.id, 'Mittag', 'M', '11:00', '15:00', 0, '#2da44e'),
    tp(service.id, 'Abend', 'A', '17:00', '23:00', 30, '#4F7BD1'),
    tp(service.id, 'Teildienst', 'T', '11:00', '14:30', 0, '#a371f7', { start2: '18:00', end2: '22:30' }),
    tp(bar.id, 'Bar Abend', 'B', '18:00', '01:00', 30, '#a371f7'),
    tp(rez.id, 'Früh', 'F', '07:00', '15:00', 30, '#2da44e'),
    tp(rez.id, 'Spät', 'S', '15:00', '23:00', 30, '#4F7BD1')
  ].map((x, i) => ({ ...x, sort: i }));
  demoShifts(d);
}

/** Demo-Dienste für diese und nächste Woche (gleiche Vorlage je Person und Woche, 2 freie Tage),
 *  Urlaub/Krankheit, eine offene Schicht und veröffentlichte Pläne für Küche und Service */
function demoShifts(d: VenueData) {
  const t0 = today(), mon = weekStart(t0);
  const by = (name: string) => d.staff.find(s => s.name === name)!;
  d.absences = [
    { id: newId(), staffId: by('Sara Rossi').id, from: addDays(mon, 7), to: addDays(mon, 9), kind: 'urlaub', note: 'Familienfeier' },
    { id: newId(), staffId: by('Jonas Egger').id, from: t0, to: addDays(t0, 1), kind: 'krank', note: '' }
  ];
  const earlier = new Date(Date.now() - 86400000).toISOString();
  for (const dep of d.departments) {
    const tpls = d.shiftTemplates.filter(x => x.departmentId === dep.id);
    const people = d.staff.filter(s => s.active && s.departmentId === dep.id);
    people.forEach((s, i) => {
      for (let w = 0; w < 2; w++) {
        const days = s.contract === 'aushilfe' ? [5, 6] : s.weeklyHours < 35 ? [0, 2, 4, 5] : [0, 1, 2, 3, 4, 5, 6].filter(k => k !== (i + w) % 7 && k !== (i + w + 3) % 7);
        const t = s.contract === 'aushilfe' ? tpls.find(x => x.name === 'Abend') ?? tpls[0] : tpls[(i + w) % tpls.length];
        for (const k of days) {
          const date = addDays(mon, w * 7 + k);
          if (d.absences.some(a => a.staffId === s.id && date >= a.from && date <= a.to)) continue;
          d.shifts.push({ ...shiftFromTemplate(t, s.id, date, newId()), updatedAt: earlier });
        }
      }
    });
  }
  const abend = d.shiftTemplates.find(x => x.name === 'Abend')!;
  d.shifts.push({ ...shiftFromTemplate(abend, null, addDays(mon, 12), newId()), note: 'Hochzeit – Verstärkung gesucht', updatedAt: earlier });
  d.publications = [d.departments[0], d.departments[1]].map(x => ({ id: newId(), departmentId: x.id, weekStart: mon, publishedAt: earlier, publishedBy: 'Anna (Admin)' }));
}

/** Demo-Küche: Zutaten, Gerichte und Menüs für Mittag- und Abendessen von vorgestern bis in einer Woche */
export function demoKitchen(d: VenueData) {
  const I: Record<string, Ingredient> = {};
  const ing = (key: string, name: string, unit: Unit, allergens: Allergen[] = [], traces: Allergen[] = []) => { I[key] = { id: newId(), name, unit, allergens, traces }; };
  ing('mehl', 'Weizenmehl', 'g', ['gluten']); ing('ei', 'Eier', 'stk', ['eier']); ing('butter', 'Butter', 'g', ['milch']);
  ing('sahne', 'Sahne', 'ml', ['milch']); ing('parmesan', 'Parmesan', 'g', ['milch']); ing('milch', 'Milch', 'ml', ['milch']);
  ing('kartoffel', 'Kartoffeln', 'g'); ing('zwiebel', 'Zwiebeln', 'g'); ing('sellerie', 'Knollensellerie', 'g', ['sellerie']);
  ing('karotte', 'Karotten', 'g'); ing('rind', 'Rindfleisch (Tafelspitz)', 'g'); ing('kalb', 'Kalbsschnitzel', 'g');
  ing('brösel', 'Semmelbrösel', 'g', ['gluten'], ['sesam']); ing('saibling', 'Saiblingsfilet', 'g', ['fisch']);
  ing('reis', 'Risottoreis', 'g'); ing('steinpilz', 'Steinpilze', 'g'); ing('wein', 'Weißwein', 'ml', ['sulfite']);
  ing('spinat', 'Spinat', 'g'); ing('knödelbrot', 'Knödelbrot', 'g', ['gluten']); ing('speck', 'Südtiroler Speck', 'g');
  ing('apfel', 'Äpfel', 'g'); ing('strudelteig', 'Strudelteig', 'g', ['gluten', 'eier']); ing('hasel', 'Haselnüsse', 'g', ['schalenfruechte']);
  ing('zucker', 'Zucker', 'g'); ing('beeren', 'Waldbeeren', 'g'); ing('salat', 'Blattsalat', 'g'); ing('senf', 'Senf', 'g', ['senf']);
  ing('oel', 'Olivenöl', 'ml'); ing('brühe', 'Gemüsebrühe', 'ml', ['sellerie']);
  d.ingredients = Object.values(I).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const D: Record<string, Dish> = {};
  const dish = (key: string, name: string, nameIt: string, course: Course, lines: [string, number][], diet: Dish['diet'] = []) => {
    D[key] = { id: newId(), name, nameIt, nameEn: '', course, diet, notes: '', ingredients: lines.map(([k, qty]) => ({ ingredientId: I[k].id, qty })) };
  };
  dish('salat', 'Bunter Blattsalat mit Senfdressing', 'Insalata mista', 'vorspeise', [['salat', 60], ['senf', 5], ['oel', 10]], ['vegan']);
  dish('speck', 'Speckbrettl mit Bauernbrot', 'Tagliere di speck', 'vorspeise', [['speck', 50], ['knödelbrot', 40]]);
  dish('gersten', 'Selleriecremesuppe', 'Crema di sedano', 'suppe', [['sellerie', 80], ['sahne', 40], ['brühe', 200], ['zwiebel', 20]], ['vegetarisch']);
  dish('knödel', 'Spinatknödel mit Parmesan', 'Canederli agli spinaci', 'vorspeise', [['knödelbrot', 70], ['spinat', 50], ['ei', 0.5], ['milch', 40], ['parmesan', 15], ['butter', 15]], ['vegetarisch']);
  dish('risotto', 'Steinpilzrisotto', 'Risotto ai porcini', 'vorspeise', [['reis', 80], ['steinpilz', 40], ['wein', 30], ['parmesan', 15], ['butter', 15], ['brühe', 250]], ['vegetarisch']);
  dish('schnitzel', 'Wiener Schnitzel mit Petersilkartoffeln', 'Cotoletta alla viennese', 'hauptgang', [['kalb', 160], ['mehl', 20], ['ei', 0.5], ['brösel', 40], ['butter', 30], ['kartoffel', 200]]);
  dish('saibling', 'Saiblingsfilet auf Gemüse', 'Filetto di salmerino', 'hauptgang', [['saibling', 150], ['karotte', 80], ['sellerie', 40], ['butter', 15], ['kartoffel', 150]]);
  dish('tafelspitz', 'Tafelspitz mit Wurzelgemüse', 'Bollito di manzo', 'hauptgang', [['rind', 180], ['karotte', 80], ['sellerie', 40], ['zwiebel', 30], ['kartoffel', 150]]);
  dish('strudel', 'Apfelstrudel mit Vanillesahne', 'Strudel di mele', 'dessert', [['strudelteig', 40], ['apfel', 120], ['zucker', 15], ['hasel', 10], ['butter', 10], ['sahne', 30]], ['vegetarisch']);
  dish('sorbet', 'Waldbeerensorbet', 'Sorbetto ai frutti di bosco', 'dessert', [['beeren', 100], ['zucker', 25]], ['vegan']);
  d.dishes = Object.values(D).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const plans: [string, string, string, string[]][] = [ // Vorspeise/Suppe, Zwischengang, Hauptgänge, Desserts
    ['gersten', 'knödel', 'schnitzel saibling', ['strudel', 'sorbet']], ['salat', 'risotto', 'tafelspitz saibling', ['sorbet']],
    ['speck', 'knödel', 'schnitzel', ['strudel']]];
  const t0 = today(), menus: Menu[] = [];
  for (let dd = -2; dd < 7; dd++) for (const svc of d.services.filter(s => s.kind !== 'fruehstueck')) {
    const [a, b, mains, desserts] = plans[(dd + 9 + (svc.kind === 'mittag' ? 1 : 0)) % plans.length];
    const keys = svc.kind === 'mittag' ? [a, ...mains.split(' ').slice(0, 1), desserts[0]] : [a, b, ...mains.split(' '), ...desserts];
    const items: MenuItem[] = keys.map(k => ({ course: D[k].course, dishId: D[k].id, share: null, name: '', allergens: [] }));
    if (items.filter(i => i.course === 'hauptgang').length === 2) items.find(i => i.course === 'hauptgang')!.share = 60;
    menus.push({ id: newId(), date: addDays(t0, dd), serviceId: svc.id, portions: null, bufferPct: 10, notes: '', items: snapshotItems(d, items) });
  }
  d.menus = menus;
}

/** Gäste-Speisekarte (QR): Menüs von heute und morgen sind für Gäste offen, rund die Hälfte der Zimmer hat heute schon gewählt */
export function demoGuestChoices(d: VenueData) {
  const t0 = today();
  d.menuChoices = [];
  for (const m of d.menus) if (m.date === t0 || m.date === addDays(t0, 1)) m.ordering = 'offen';
  for (const m of d.menus.filter(x => x.date === t0)) {
    menuRooms(d, m).forEach((x, i) => {
      if (i % 2) return;
      const counts: Record<string, number> = {};
      for (const c of menuCourses(m.items)) {
        const list = m.items.filter(it => it.course === c);
        for (let p = 0; p < x.persons; p++) { const it = list[(p + i) % list.length]; counts[it.dishId] = (counts[it.dishId] ?? 0) + 1; }
      }
      d.menuChoices.push({ id: newId(), menuId: m.id, stayId: x.stay.id, counts });
    });
  }
}
