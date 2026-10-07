/** Hotelaufenthalt bearbeiten, CSV-Import und Zuweisung eines festen Tisches */
import { useState } from 'react';
import { guessAllergens } from '../domain/menu';
import { AllergenPicker } from '../ui/AllergenPicker';
import { Trash2 } from 'lucide-react';
import { newId } from '../domain/demo';
import { BOARDS } from '../domain/constants';
import { byId, capacity, isInHouse, needsTable, stayTableConflicts, tableNames } from '../domain/logic';
import type { Board, ServiceKind, Stay, VenueData } from '../domain/types';
import { t } from '../lib/i18n';
import { addDays, fmtShort, parseDate } from '../lib/time';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { useUi } from '../store/ui';
import { closeDialog, openDialog } from '../store/dialogs';
import { confirmDialog, toast } from '../ui/notify';
import { Modal } from '../ui/Modal';

/** Festen Tisch zuweisen – mit Hinweis auf Nächte, in denen der Tisch schon belegt ist */
export async function assignStayTable(d: VenueData, stay: Stay, tableIds: string[]): Promise<boolean> {
  const p = stay.adults + stay.children, cap = capacity(d, tableIds);
  const lines = stayTableConflicts(d, stay, tableIds);
  if (tableIds.length && p > cap.max) lines.unshift(`Tisch zu klein: ${p} Pers., max. ${cap.max}`);
  if (lines.length && !(await confirmDialog('Hinweise zum festen Tisch', [...lines.slice(0, 12), ...(lines.length > 12 ? [`… und ${lines.length - 12} weitere`] : []),
    'Belegte Nächte bleiben ohne Tisch und müssen einzeln gesetzt werden.'], 'Trotzdem zuweisen'))) return false;
  const res = await useApp.getState().saveStay({ ...stay, tableIds }, { resetManual: true, logText: ['Fester Tisch zugewiesen', `Zi. ${stay.roomNo} ${stay.name} → ${tableNames(d, tableIds) || 'keiner'}`] });
  if (res.ok) toast(res.skipped.length ? `Gespeichert – ohne Tisch: ${res.skipped.join(', ')}` : 'Fester Tisch gespeichert', res.skipped.length ? 'err' : 'ok');
  return res.ok;
}

/** Freien Tisch antippen (Hotel-Plan): Hotelgast ohne festen Tisch auswählen – Alternative zum Ziehen */
export function StayTablePicker({ tableId }: { tableId: string }) {
  const d = useData();
  const D = useUi(s => s.hotelDate);
  const tb = byId(d.tables, tableId);
  if (!tb) return null;
  const open = d.stays.filter(s => isInHouse(s, D) && needsTable(d, s) && !s.tableIds.length)
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo, 'de', { numeric: true }));
  return (
    <Modal title={`Tisch ${tb.name} · fester Tisch`} onClose={closeDialog} width={520} footer={<button className="btn" onClick={closeDialog}>Schließen</button>}>
      <p className="muted" style={{ marginTop: 0 }}>{tb.minPersons}–{tb.maxPersons} Personen · {byId(d.rooms, tb.roomId)?.name} · frei am {fmtShort(D)}</p>
      <h4 style={{ margin: '0 0 6px' }}>Hotelgast ohne festen Tisch hier platzieren</h4>
      <div className="sugg">{open.length ? open.map(s => (
        <button key={s.id} className="btn" onClick={async () => { if (await assignStayTable(d, s, [tb.id])) closeDialog(); }}>
          Zi. {s.roomNo} · {s.name} · {s.adults + s.children}P{s.adults + s.children > tb.maxPersons ? ' ⚠' : ''}</button>
      )) : <span className="muted">Alle Gäste mit Verpflegung haben einen Tisch. ✓</span>}</div>
      <button className="btn mt12" onClick={() => openDialog({ type: 'stay' })}>Neuer Aufenthalt…</button>
    </Modal>
  );
}

export function StayForm({ stay }: { stay?: Stay }) {
  const d = useData();
  const ui = useUi();
  const store = useApp();
  const isNew = !stay;
  const [s, setS] = useState<Stay>(() => stay ? { ...stay, allergens: stay.allergens ?? [], times: { ...stay.times } } : {
    id: newId(), roomNo: '', name: '', adults: 2, children: 0, arrival: ui.hotelDate, departure: addDays(ui.hotelDate, 3), board: 'HP',
    phone: '', allergies: '', allergens: [], notes: '', vip: false, times: {}, tableIds: []
  });
  const [busy, setBusy] = useState(false);
  const upd = (p: Partial<Stay>) => setS(prev => ({ ...prev, ...p }));
  const timeSel = (kind: ServiceKind) => {
    const svc = d.services.find(x => x.kind === kind);
    if (!svc || svc.freeSeating) return null;
    const opts = [...new Set([svc.hotelTime || svc.start, ...svc.seatings])];
    return <label>Uhrzeit {svc.name}<select value={s.times[kind] || opts[0]} onChange={e => upd({ times: { ...s.times, [kind]: e.target.value } })}>{opts.map(o => <option key={o}>{o}</option>)}</select></label>;
  };
  const own = d.reservations.filter(r => r.stayId === s.id).sort((a, b) => a.date.localeCompare(b.date));

  async function save() {
    if (!s.roomNo.trim() || !s.name.trim()) return toast('Zimmer und Name sind Pflicht', 'err');
    if (!(s.departure > s.arrival)) return toast('Abreise muss nach der Anreise liegen', 'err');
    setBusy(true);
    const tableChanged = JSON.stringify(stay?.tableIds ?? []) !== JSON.stringify(s.tableIds);
    let ok: boolean;
    if (tableChanged && s.tableIds.length) ok = await assignStayTable(d, s, s.tableIds);
    else {
      const res = await store.saveStay(s, { resetManual: tableChanged, logText: [isNew ? 'Aufenthalt angelegt' : 'Aufenthalt geändert', `Zi. ${s.roomNo} ${s.name}`] });
      ok = res.ok; if (ok) toast(res.skipped.length ? `Gespeichert – ohne Tisch: ${res.skipped.join(', ')}` : 'Gespeichert');
    }
    setBusy(false);
    if (ok) closeDialog();
  }
  async function remove() {
    if (!stay || !(await confirmDialog('Aufenthalt löschen?', [`Zi. ${stay.roomNo} ${stay.name} inkl. offener Reservierungen`], 'Löschen', true))) return;
    if (await store.deleteStay(stay)) closeDialog();
  }
  return (
    <Modal title={isNew ? 'Neuer Aufenthalt' : `Zi. ${stay.roomNo} – ${stay.name}`} onClose={closeDialog}
      footer={<>{!isNew && <button className="btn danger" onClick={remove}><Trash2 />Löschen</button>}<span className="spacer" />
        <button className="btn" onClick={closeDialog}>Abbrechen</button><button className="btn primary" disabled={busy} onClick={save}>Speichern</button></>}>
      <div className="grid3">
        <label>Zimmer *<input value={s.roomNo} onChange={e => upd({ roomNo: e.target.value })} autoFocus={isNew} /></label>
        <label>Name *<input value={s.name} onChange={e => upd({ name: e.target.value })} /></label>
        <label>Verpflegung<select value={s.board} onChange={e => upd({ board: e.target.value as Board })}>{BOARDS.map(b => <option key={b} value={b}>{t(b)}</option>)}</select></label>
        <label>Erwachsene<input type="number" min={1} value={s.adults} onChange={e => upd({ adults: Math.max(1, +e.target.value || 1) })} /></label>
        <label>Kinder<input type="number" min={0} value={s.children} onChange={e => upd({ children: Math.max(0, +e.target.value || 0) })} /></label>
        <label>Telefon<input value={s.phone} onChange={e => upd({ phone: e.target.value })} /></label>
        <label>Anreise<input type="date" value={s.arrival} onChange={e => upd({ arrival: e.target.value })} /></label>
        <label>Abreise<input type="date" value={s.departure} onChange={e => upd({ departure: e.target.value })} /></label>
        <label>Fester Tisch<select value={s.tableIds[0] ?? ''} onChange={e => upd({ tableIds: e.target.value ? [e.target.value] : [] })}>
          <option value="">– keiner –</option>
          {d.tables.map(x => <option key={x.id} value={x.id}>{x.name} ({x.minPersons}–{x.maxPersons}P, {byId(d.rooms, x.roomId)?.name})</option>)}</select></label>
      </div>
      <div className="grid2 mt8">{timeSel('mittag')}{timeSel('abend')}</div>
      <div className="mt8"><AllergenPicker value={s.allergens} text={s.allergies} onChange={allergens => upd({ allergens })} label="Allergene (laut Gast)" /></div>
      <label className="mt8">Weitere Unverträglichkeiten / Notiz<input value={s.allergies} onChange={e => upd({ allergies: e.target.value })} /></label>
      <label className="mt8">Notizen<textarea value={s.notes} onChange={e => upd({ notes: e.target.value })} /></label>
      <label className="chk mt8"><input type="checkbox" checked={s.vip} onChange={e => upd({ vip: e.target.checked })} /> VIP / Stammgast</label>
      <p className="muted" style={{ fontSize: 12 }}>Halbpension = Abendessen, Vollpension = Mittag + Abend, All-Inclusive = alle Services mit Tischzuweisung. Reservierungen werden automatisch für jede Nacht angelegt.
        {!needsTable(d, s) && ' Diese Verpflegung braucht keinen Tisch.'}</p>
      {!isNew && <><h4 style={{ margin: '12px 0 6px' }}>Reservierungen dieses Aufenthalts</h4>
        {own.length ? own.map(r => <div key={r.id} style={{ fontSize: 13 }}>{fmtShort(r.date)} {byId(d.services, r.serviceId)?.name} {r.time} · Tisch {tableNames(d, r.tableIds) || '–'}
          {r.manualTable && <span className="badge"> manuell</span>} · {t(r.status)}</div>) : <span className="muted">keine</span>}</>}
    </Modal>
  );
}

export function StayImport() {
  const store = useApp();
  const d = useData();
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  async function run() {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return toast('Keine Daten', 'err');
    const sep = lines[0].includes(';') ? ';' : ',';
    let created = 0, updated = 0, failed = 0; const errs: string[] = [];
    setBusy(true);
    for (const [i, l] of lines.slice(1).entries()) {
      const c = l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
      const arrival = parseDate(c[4]), departure = parseDate(c[5]), board = (c[6] || 'HP').toUpperCase() as Board;
      if (!c[0] || !c[1] || !arrival || !departure || departure <= arrival || !BOARDS.includes(board)) { errs.push(`Zeile ${i + 2}: ungültig`); continue; }
      const ex = useApp.getState().data!.stays.find(x => x.roomNo === c[0] && x.arrival === arrival);
      const stay: Stay = { ...(ex ?? { id: newId(), tableIds: [], vip: false, phone: '', times: {} }), roomNo: c[0], name: c[1], adults: +c[2] || 1, children: +c[3] || 0,
        arrival, departure, board, allergies: c[7] || '', allergens: guessAllergens(c[7] || ''), notes: c[8] || '' } as Stay;
      const res = await store.saveStay(stay);
      if (!res.ok) failed++; else if (ex) updated++; else created++;
    }
    setBusy(false);
    store.log('CSV-Import Hotelgäste', `${created} neu, ${updated} aktualisiert`);
    setResult(`${created} neu, ${updated} aktualisiert${failed ? `, ${failed} fehlgeschlagen` : ''}${errs.length ? ' · ' + errs.join(' · ') : ''}`);
  }
  return (
    <Modal title="Hotelgäste importieren (CSV)" onClose={closeDialog} footer={<><button className="btn" onClick={closeDialog}>Schließen</button><button className="btn primary" disabled={busy} onClick={run}>Importieren</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>Spalten (Trennzeichen ; oder ,), erste Zeile = Überschrift:<br />
        <code>Zimmer;Name;Erwachsene;Kinder;Anreise;Abreise;Verpflegung;Allergien;Notiz</code><br />
        Datum als TT.MM.JJJJ oder JJJJ-MM-TT · Verpflegung UF / HP / VP / AI. Bestehende Aufenthalte (gleiches Zimmer + Anreise) werden aktualisiert.</p>
      <input type="file" accept=".csv,text/csv,text/plain" onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(setText); }} />
      <textarea style={{ minHeight: 160, marginTop: 8 }} value={text} placeholder="…oder hier einfügen" onChange={e => setText(e.target.value)} />
      {busy && <p className="muted">Import läuft…</p>}
      {result && <div className="infobox">{result}</div>}
      <p className="muted" style={{ fontSize: 12 }}>{d.stays.length} Aufenthalte vorhanden.</p>
    </Modal>
  );
}
