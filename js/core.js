'use strict';
/* =========================================================
   1) Konstanten, Übersetzungen, Hilfsfunktionen
   ========================================================= */
const STORE_KEY = 'tischplan.v1';
const LANG = 'de'; // vorbereitet für 'it' / 'en'
const I18N = {
  de: {
    live:'Live-Plan', zeit:'Zeitleiste', res:'Reservierungen', hotel:'Hotelgäste', berichte:'Berichte',
    editor:'Raumplan-Editor', settings:'Einstellungen',
    angefragt:'Angefragt', bestaetigt:'Bestätigt', eingetroffen:'Eingetroffen', platziert:'Platziert',
    rechnung:'Rechnung', abgeschlossen:'Abgeschlossen', storniert:'Storniert', noshow:'No-Show',
    frei:'Frei', reserviert:'Reserviert', bald:'Bald fällig', ueberfaellig:'Überfällig', gesperrt:'Gesperrt', ueberzogen:'Zeit überzogen',
    admin:'Admin / Betriebsleitung', empfang:'Empfang / Host', service:'Service', kueche:'Küche',
    UF:'Übernachtung/Frühstück', HP:'Halbpension', VP:'Vollpension', AI:'All-Inclusive',
    fenster:'Fensterplatz', rollstuhl:'Rollstuhlgerecht', hund:'Hundeplatz', kinder:'Kinderecke', ruhig:'Ruhig'
  }
};
const t = k => (I18N[LANG] && I18N[LANG][k]) || k;

const RES_STATUS = {
  angefragt:'#8c959f', bestaetigt:'#4f8ef7', eingetroffen:'#a371f7', platziert:'#2da44e',
  rechnung:'#f0883e', abgeschlossen:'#57606a', storniert:'#cf222e', noshow:'#7d2c2c'
};
const STATUS_ORDER = ['angefragt','bestaetigt','eingetroffen','platziert','rechnung','abgeschlossen'];
const TABLE_ST = ['frei','reserviert','bald','platziert','rechnung','ueberfaellig','ueberzogen','gesperrt'];
const TABLE_ST_ICON = {frei:'',reserviert:'◷',bald:'⏳',platziert:'●',rechnung:'€',ueberfaellig:'!',ueberzogen:'⌛',gesperrt:'✕'};
const PROPS = ['fenster','rollstuhl','hund','kinder','ruhig'];
const OCCASIONS = ['','Geburtstag','Jubiläum','Business','Hochzeitstag','Familienfeier','Sonstiges'];
const SOURCES = ['Telefon','Walk-in','Hotel','Hotel-Rezeption','Website','Google','E-Mail','Persönlich'];
const BOARDS = ['UF','HP','VP','AI'];
const BOARD_SERVICES = { UF:[], HP:['abend'], VP:['mittag','abend'], AI:['fruehstueck','mittag','abend'] };
const ROLE_VIEWS = {
  admin:['live','zeit','res','hotel','berichte','editor','settings'],
  empfang:['live','zeit','res','hotel','berichte'],
  service:['live','zeit','berichte'],
  kueche:['berichte']
};
const OPEN_STATES = ['angefragt','bestaetigt']; // noch nicht eingetroffen
const SEATED_STATES = ['eingetroffen','platziert','rechnung'];

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const toMin = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = m => pad(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ':' + pad(((m % 60) + 60) % 60);
const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => dstr(new Date());
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return dstr(d); };
const WD = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const fmtDate = s => { const d = new Date(s + 'T12:00:00'); return WD[d.getDay()] + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); };
const fmtShort = s => { const d = new Date(s + 'T12:00:00'); return WD[d.getDay()] + ' ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; };
const persons = r => (+r.adults || 0) + (+r.children || 0);
const resStart = r => toMin(r.time);
const resEnd = r => toMin(r.time) + (+r.duration || 0);
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const snap = (v, g) => Math.round(v / g) * g;

function toast(msg, type) {
  $$('.toast').forEach(x => x.remove());
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 4500 : 2600);
}

/* =========================================================
   2) Datenhaltung (localStorage) + Audit-Log
   ========================================================= */
let DB = null;
const S = { // Sitzungszustand (nicht gespeichert)
  user: null, view: 'live', date: today(), serviceId: null, roomId: null,
  time: nowMin(), follow: true, edit: { roomId: null, sel: null }, resFilter: {}, hotelDate: today()
};

// Cloud-Modus (Supabase), wenn config.js mit URL + Key vorhanden ist – sonst Daten im Browser
const CFG = window.TISCHPLAN_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);

function load() {
  try { DB = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { DB = null; }
  if (!DB || !DB.version) { DB = demoData(); save(true); }
}
function save(silent) {
  DB.rev = (DB.rev || 0) + 1;
  if (CLOUD) return Cloud.scheduleSync(); // siehe cloud.js
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
  catch (e) { toast('Speichern fehlgeschlagen: ' + e.message, 'err'); }
}
function log(action, detail) {
  DB.audit.unshift({ id: uid(), ts: Date.now(), user: S.user ? S.user.name : '-', action, detail: detail || '' });
  if (DB.audit.length > 1500) DB.audit.length = 1500;
}
// Darstellung (hell/dunkel) ist eine Geräte-Einstellung
const getTheme = () => { try { return localStorage.getItem('tischplan.theme') || 'light'; } catch (e) { return 'light'; } };
const setTheme = v => { try { localStorage.setItem('tischplan.theme', v); } catch (e) {} };
// Synchronisation zwischen Browser-Tabs am selben Gerät (nur lokaler Modus)
window.addEventListener('storage', e => { if (!CLOUD && e.key === STORE_KEY && e.newValue) { DB = JSON.parse(e.newValue); render(); } });

/* =========================================================
   3) Fachlogik: Services, Verweildauer, Konflikte, Vorschläge
   ========================================================= */
const svcById = id => DB.services.find(s => s.id === id);
const tblById = id => DB.tables.find(x => x.id === id);
const roomById = id => DB.rooms.find(x => x.id === id);
const stayById = id => DB.stays.find(x => x.id === id);
const tblNames = ids => (ids || []).map(id => (tblById(id) || {}).name || '?').join('+');

function turnTime(serviceId, p) {
  const s = svcById(serviceId); if (!s) return 120;
  const row = [...s.turn].sort((a, b) => a.maxP - b.maxP).find(x => p <= x.maxP);
  return row ? row.min : s.turn[s.turn.length - 1].min;
}
function serviceForTime(min) {
  const list = DB.services.filter(s => min >= toMin(s.start) - 60 && min <= toMin(s.end));
  if (list.length) return list[list.length - 1].id;
  const later = DB.services.find(s => toMin(s.start) > min);
  return (later || DB.services[DB.services.length - 1]).id;
}
function isBlocked(tb, date, serviceId) {
  return (tb.blocks || []).some(b => b.date === date && (!b.serviceId || b.serviceId === serviceId));
}
// Reservierungen, die einen Tisch belegen (für Konflikte)
const occupies = r => r.status !== 'storniert' && r.status !== 'noshow' && r.status !== 'abgeschlossen';

function tableBusy(tid, date, start, end, exceptId) {
  return DB.reservations.filter(o => o.id !== exceptId && o.date === date && occupies(o) &&
    (o.tableIds || []).includes(tid) && overlaps(start, end, resStart(o), resEnd(o)));
}
function capOf(ids) {
  const tb = ids.map(tblById).filter(Boolean);
  return { max: tb.reduce((a, x) => a + (+x.max), 0), min: tb.reduce((a, x) => a + (+x.min), 0) };
}

/** Liefert eine Liste von Warnungen für eine (geplante) Reservierung */
function conflicts(r) {
  const out = [];
  if (!occupies(r)) return out;
  const st = resStart(r), en = resEnd(r), p = persons(r), s = svcById(r.serviceId);
  for (const tid of r.tableIds || []) {
    const tb = tblById(tid);
    if (!tb) { out.push('Tisch existiert nicht mehr'); continue; }
    if (isBlocked(tb, r.date, r.serviceId)) out.push(`Tisch ${tb.name} ist gesperrt`);
    for (const o of tableBusy(tid, r.date, st, en, r.id))
      out.push(`Überschneidung an Tisch ${tb.name} mit ${o.name} (${o.time}–${fromMin(resEnd(o))})`);
  }
  if ((r.tableIds || []).length) {
    const c = capOf(r.tableIds);
    if (p > c.max) out.push(`Tisch zu klein: ${p} Pers., max. ${c.max}`);
    else if (p < c.min) out.push(`Tisch zu groß: ${p} Pers., min. ${c.min}`);
  }
  if (s && s.pacing > 0) {
    const slot = Math.floor(st / 15) * 15;
    const covers = DB.reservations.filter(o => o.id !== r.id && o.date === r.date && o.serviceId === r.serviceId &&
      o.status !== 'storniert' && o.status !== 'noshow' && Math.floor(resStart(o) / 15) * 15 === slot)
      .reduce((a, o) => a + persons(o), 0) + p;
    if (covers > s.pacing) out.push(`Pacing: ${covers} Gäste im Slot ${fromMin(slot)} (Limit ${s.pacing})`);
  }
  if (s && (st < toMin(s.start) || st > toMin(s.end))) out.push(`Uhrzeit außerhalb Service ${s.name} (${s.start}–${s.end})`);
  // Doppelbuchung desselben Gastes (gleicher Hotelaufenthalt oder Telefon) – auch über Räume/Outlets hinweg
  const dup = DB.reservations.find(o => o.id !== r.id && o.date === r.date && occupies(o) &&
    overlaps(st, en, resStart(o), resEnd(o)) &&
    ((r.stayId && o.stayId === r.stayId) || (r.phone && o.phone && o.phone.replace(/\D/g, '') === r.phone.replace(/\D/g, ''))));
  if (dup) out.push(`Mögliche Doppelbuchung: ${dup.name} ist bereits um ${dup.time} reserviert`);
  return [...new Set(out)];
}

/** Tischvorschläge (einzelne Tische und Kombinationen), sortiert nach bester Passung */
function suggestTables(r, limit = 6) {
  const st = resStart(r), en = resEnd(r), p = persons(r);
  const wish = r.wishes || [];
  const free = tid => { const tb = tblById(tid); return tb && !isBlocked(tb, r.date, r.serviceId) && !tableBusy(tid, r.date, st, en, r.id).length; };
  const prefRoom = r.roomPref || S.roomId;
  const out = [];
  for (const tb of DB.tables) {
    if (p > +tb.max || !free(tb.id)) continue;
    // Tische unter Mindestbelegung nur als Ausweichvorschlag (hohe Strafpunkte)
    let score = (tb.max - p) * 10 + (tb.roomId !== prefRoom ? 4 : 0) + (p < +tb.min ? 40 + (tb.min - p) * 20 : 0);
    score -= wish.filter(w => (tb.props || []).includes(w)).length * 8;
    out.push({ ids: [tb.id], score });
  }
  for (const c of DB.combos) {
    if (!c.tableIds.every(free)) continue;
    const cap = capOf(c.tableIds);
    if (p > cap.max || p <= Math.max(...c.tableIds.map(id => +tblById(id).max))) continue;
    out.push({ ids: [...c.tableIds], score: (cap.max - p) * 10 + 15 });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit);
}

/** Status eines Tisches zu einem Zeitpunkt (Live-Plan) */
function tableStatusAt(tb, date, serviceId, tm) {
  if (isBlocked(tb, date, serviceId)) return { st: 'gesperrt' };
  const rs = DB.reservations.filter(r => r.date === date && (r.tableIds || []).includes(tb.id) && occupies(r))
    .sort((a, b) => resStart(a) - resStart(b));
  const seated = rs.find(r => SEATED_STATES.includes(r.status));
  if (seated) return { st: seated.status === 'rechnung' ? 'rechnung' : (tm > resEnd(seated) ? 'ueberzogen' : 'platziert'), r: seated };
  const cur = rs.find(r => resStart(r) <= tm && tm < resEnd(r));
  if (cur) return { st: tm > resStart(cur) + 15 ? 'ueberfaellig' : 'reserviert', r: cur };
  const next = rs.find(r => resStart(r) > tm);
  if (next && resStart(next) - tm <= 60) return { st: 'bald', r: next };
  return { st: 'frei', next };
}

/* =========================================================
   4) Hotel: Aufenthalte → Reservierungen je Tag/Service
   ========================================================= */
function stayNights(stay) {
  const out = []; for (let d = stay.arrival; d < stay.departure; d = addDays(d, 1)) out.push(d); return out;
}
function stayServices(stay) {
  return DB.services.filter(s => BOARD_SERVICES[stay.board].includes(s.type) && !s.freeSeating);
}
function isInHouse(stay, date) { return stay.arrival <= date && date < stay.departure; }

/** Legt fehlende Reservierungen eines Aufenthalts an, aktualisiert bestehende, entfernt überflüssige */
function syncStay(stay) {
  const need = [];
  for (const d of stayNights(stay)) for (const s of stayServices(stay)) need.push({ date: d, serviceId: s.id, svc: s });
  const existing = DB.reservations.filter(r => r.stayId === stay.id);
  for (const ex of existing) {
    if (!need.some(n => n.date === ex.date && n.serviceId === ex.serviceId) && OPEN_STATES.includes(ex.status))
      DB.reservations.splice(DB.reservations.indexOf(ex), 1);
  }
  for (const n of need) {
    let r = existing.find(x => x.date === n.date && x.serviceId === n.serviceId && DB.reservations.includes(x));
    const p = (+stay.adults || 0) + (+stay.children || 0);
    if (!r) {
      r = { id: uid(), date: n.date, serviceId: n.serviceId, time: (stay.times && stay.times[n.svc.type]) || n.svc.hotelTime || n.svc.start,
        duration: turnTime(n.serviceId, p), status: 'bestaetigt', source: 'Hotel', stayId: stay.id, tableIds: [], createdAt: Date.now() };
      DB.reservations.push(r);
    }
    Object.assign(r, { name: `${stay.name} · Zi. ${stay.room}`, adults: stay.adults, children: stay.children,
      allergies: stay.allergies || '', notes: stay.notes || '', vip: !!stay.vip, phone: stay.phone || '' });
    if (OPEN_STATES.includes(r.status) && !r.manualTable) r.tableIds = [...(stay.tableIds || [])];
  }
}
/** Prüft, an welchen Tagen der feste Tisch eines Aufenthalts kollidiert */
function stayTableConflicts(stay, tableIds) {
  const days = [];
  for (const d of stayNights(stay)) for (const s of stayServices(stay)) {
    const own = DB.reservations.find(r => r.stayId === stay.id && r.date === d && r.serviceId === s.id);
    const st = own ? resStart(own) : toMin(s.hotelTime || s.start);
    const en = own ? resEnd(own) : st + turnTime(s.id, +stay.adults + +stay.children);
    for (const tid of tableIds) {
      const busy = tableBusy(tid, d, st, en, own && own.id).filter(o => o.stayId !== stay.id);
      if (busy.length) days.push(`${fmtShort(d)} ${s.name}: ${tblById(tid).name} belegt (${busy[0].name})`);
    }
  }
  return days;
}
