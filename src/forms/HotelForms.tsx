/** Hotelaufenthalt bearbeiten, CSV-Import und Zuweisung eines festen Tisches */
import { useMemo, useState } from 'react';
import { AllergenPicker } from '../ui/AllergenPicker';
import { Trash2 } from '../ui/icons';
import { newId } from '../domain/demo';
import { BOARDS, MAX_ROOMS_PER_TABLE } from '../domain/constants';
import { parseImport, planImport } from '../domain/hotelImport';
import { statusInfo } from '../domain/statuses';
import { byId, capacity, isInHouse, needsTable, stayNights, stayTableConflicts, tableNames } from '../domain/logic';
import type { Board, Stay, VenueData } from '../domain/types';
import { t } from '../lib/i18n';
import { addDays, fmtShort, today } from '../lib/time';
import { readTextFile } from '../lib/text';
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
  // Geteilter Tisch: Nacht mit den meisten Personen am Tisch (zusammen mit den anderen Zimmern) prüfen
  let all = p, rooms: string[] = [];
  if (tableIds.length) for (const date of stayNights(stay)) {
    const here = d.stays.filter(s => s.id !== stay.id && isInHouse(s, date) && s.tableIds.some(x => tableIds.includes(x)));
    const n = p + here.reduce((a, s) => a + s.adults + s.children, 0);
    if (n > all) { all = n; rooms = here.map(s => s.roomNo); }
  }
  if (tableIds.length && all > cap.max) lines.unshift(rooms.length
    ? `Tisch zu klein: ${all} Pers. zusammen mit Zi. ${rooms.join(', ')}, max. ${cap.max}`
    : `Tisch zu klein: ${p} Pers., max. ${cap.max}`);
  if (lines.length && !(await confirmDialog('Hinweise zum festen Tisch', [...lines.slice(0, 12), ...(lines.length > 12 ? [`… und ${lines.length - 12} weitere`] : []),
    'Belegte Nächte bleiben ohne Tisch und müssen einzeln gesetzt werden.'], 'Trotzdem zuweisen'))) return false;
  const res = await useApp.getState().saveStay({ ...stay, tableIds }, { resetManual: true, logText: ['Fester Tisch zugewiesen', `Zi. ${stay.roomNo} ${stay.name} → ${tableNames(d, tableIds) || 'keiner'}`] });
  if (res.ok) toast(res.skipped.length ? `Gespeichert – ohne Tisch: ${res.skipped.join(', ')}` : 'Fester Tisch gespeichert', res.skipped.length ? 'err' : 'ok');
  return res.ok;
}

/** Tisch antippen (Hotel-Plan): Gäste am Tisch anzeigen und Hotelgast ohne festen Tisch dazusetzen – Alternative zum Ziehen.
 *  Bis zu MAX_ROOMS_PER_TABLE Zimmer können sich einen Tisch teilen. */
export function StayTablePicker({ tableId }: { tableId: string }) {
  const d = useData();
  const D = useUi(s => s.hotelDate);
  const tb = byId(d.tables, tableId);
  if (!tb) return null;
  const byRoom = (a: Stay, b: Stay) => a.roomNo.localeCompare(b.roomNo, 'de', { numeric: true });
  const here = d.stays.filter(s => isInHouse(s, D) && s.tableIds.includes(tb.id)).sort(byRoom);
  const open = d.stays.filter(s => isInHouse(s, D) && needsTable(d, s) && !s.tableIds.length).sort(byRoom);
  const seated = here.reduce((a, s) => a + s.adults + s.children, 0);
  return (
    <Modal title={`Tisch ${tb.name} · fester Tisch`} onClose={closeDialog} width={520} footer={<button className="btn" onClick={closeDialog}>Schließen</button>}>
      <p className="muted" style={{ marginTop: 0 }}>{tb.minPersons}–{tb.maxPersons} Personen · {byId(d.rooms, tb.roomId)?.name} · {here.length ? `${seated} Pers. am ${fmtShort(D)}` : `frei am ${fmtShort(D)}`}</p>
      {here.length > 0 && <>
        <h4 style={{ margin: '0 0 6px' }}>Am Tisch ({here.length} von max. {MAX_ROOMS_PER_TABLE} Zimmern)</h4>
        <div className="sugg mb8">{here.map(s => (
          <button key={s.id} className="btn" onClick={() => openDialog({ type: 'stay', stay: s })}>Zi. {s.roomNo} · {s.name} · {s.adults + s.children}P</button>
        ))}</div>
      </>}
      {here.length < MAX_ROOMS_PER_TABLE ? <>
        <h4 style={{ margin: '0 0 6px' }}>Hotelgast ohne festen Tisch hier platzieren</h4>
        <div className="sugg">{open.length ? open.map(s => (
          <button key={s.id} className="btn" onClick={async () => { if (await assignStayTable(d, s, [tb.id])) closeDialog(); }}>
            Zi. {s.roomNo} · {s.name} · {s.adults + s.children}P{seated + s.adults + s.children > tb.maxPersons ? ' ⚠' : ''}</button>
        )) : <span className="muted">Alle Gäste mit Verpflegung haben einen Tisch. ✓</span>}</div>
      </> : <p className="muted">Der Tisch ist mit {MAX_ROOMS_PER_TABLE} Zimmern voll.</p>}
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
        <label>Personen<input type="number" min={1} value={s.adults + s.children} onChange={e => upd({ adults: Math.max(1, +e.target.value || 1), children: 0 })} /></label>
        <label>Telefon<input value={s.phone} onChange={e => upd({ phone: e.target.value })} /></label>
        <label>Anreise<input type="date" value={s.arrival} onChange={e => upd({ arrival: e.target.value })} /></label>
        <label>Abreise<input type="date" value={s.departure} onChange={e => upd({ departure: e.target.value })} /></label>
        <label>Fester Tisch<select value={s.tableIds[0] ?? ''} onChange={e => upd({ tableIds: e.target.value ? [e.target.value] : [] })}>
          <option value="">– keiner –</option>
          {d.tables.map(x => <option key={x.id} value={x.id}>{x.name} ({x.minPersons}–{x.maxPersons}P, {byId(d.rooms, x.roomId)?.name})</option>)}</select></label>
      </div>
      <div className="mt8"><AllergenPicker value={s.allergens} text={s.allergies} onChange={allergens => upd({ allergens })} label="Allergene (laut Gast)" /></div>
      <label className="mt8">Weitere Unverträglichkeiten / Notiz<input value={s.allergies} onChange={e => upd({ allergies: e.target.value })} /></label>
      <label className="mt8">Notizen<textarea value={s.notes} onChange={e => upd({ notes: e.target.value })} /></label>
      <label className="chk mt8"><input type="checkbox" checked={s.vip} onChange={e => upd({ vip: e.target.checked })} /> VIP / Stammgast</label>
      <p className="muted" style={{ fontSize: 12 }}>Halbpension = Abendessen, Vollpension = Mittag + Abend, All-Inclusive = alle Services mit Tischzuweisung. Reservierungen werden automatisch für jede Nacht angelegt.
        {!needsTable(d, s) && ' Diese Verpflegung braucht keinen Tisch.'}</p>
      {!isNew && <><h4 style={{ margin: '12px 0 6px' }}>Reservierungen dieses Aufenthalts</h4>
        {own.length ? own.map(r => <div key={r.id} style={{ fontSize: 13 }}>{fmtShort(r.date)} {byId(d.services, r.serviceId)?.name} {r.time} · Tisch {tableNames(d, r.tableIds) || '–'}
          {r.manualTable && <span className="badge"> manuell</span>} · {statusInfo(d.venue, r).label}</div>) : <span className="muted">keine</span>}</>}
    </Modal>
  );
}

/** CSV-Import: Datei lesen → Vorschau (neu / geändert / abgereist) → übernehmen */
export function StayImport() {
  const store = useApp();
  const d = useData();
  const [text, setText] = useState('');
  const [defaultBoard, setDefaultBoard] = useState<Board>('HP');
  const [withRemovals, setWithRemovals] = useState(true);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (text.trim() ? parseImport(text) : null), [text]);
  const plan = useMemo(() => parsed && planImport(d.stays, parsed, { today: today(), newId, defaultBoard }), [parsed, d.stays, defaultBoard]);
  const boardInFile = !!parsed?.stays.some(s => s.board);
  // Sicherung gegen eine unvollständige Datei: mehr als die Hälfte der Gäste aus dem Hotelprogramm würde wegfallen
  const activeExternal = d.stays.filter(s => s.externalId?.startsWith('ASA:') && s.departure > today()).length;
  const manyRemovals = !!plan && plan.remove.length > 2 && plan.remove.length > activeExternal / 2;

  async function run() {
    if (!plan) return;
    const removals = withRemovals ? plan.remove : [];
    if (manyRemovals && removals.length && !(await confirmDialog('Viele Gäste fehlen in der Datei', [
      `${removals.length} von ${activeExternal} Aufenthalten aus dem Hotelprogramm stehen nicht in der Datei und würden entfernt.`,
      'Ist die Datei vollständig?'], 'Trotzdem übernehmen', true))) return;
    setBusy(true);
    let ok = 0, failed = 0; const skipped: string[] = [];
    const save = async (stay: Stay) => {
      const res = await store.saveStay(stay);
      if (!res.ok) return void failed++;
      ok++;
      if (res.skipped.length) skipped.push(`Zi. ${stay.roomNo}: ${res.skipped.join(', ')}`);
    };
    for (const s of plan.create) await save(s);
    for (const u of plan.update) await save(u.stay);
    for (const r of removals) {
      if (r.action === 'depart') await save({ ...r.stay, departure: today() });
      else if (await store.deleteStay(r.stay)) ok++; else failed++;
    }
    setBusy(false);
    const summary = `${plan.create.length} neu, ${plan.update.length} geändert, ${removals.length} entfernt/abgereist`;
    store.log('CSV-Import Hotelgäste', summary + (failed ? `, ${failed} fehlgeschlagen` : ''));
    setResult(`${summary}${failed ? ` · ${failed} fehlgeschlagen` : ''}${skipped.length ? ' · ohne Tisch (belegt): ' + skipped.join(' · ') : ''}`);
    setText('');
    toast(failed ? 'Import mit Fehlern abgeschlossen' : 'Import abgeschlossen', failed ? 'err' : 'ok');
  }

  const Section = ({ title, lines }: { title: string; lines: string[] }) => lines.length ? <>
    <h4 style={{ margin: '10px 0 4px' }}>{title} ({lines.length})</h4>
    <div style={{ fontSize: 13, maxHeight: 150, overflow: 'auto' }}>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
  </> : null;
  const label = (s: Stay) => `Zi. ${s.roomNo} · ${s.name} · ${s.adults + s.children}P · ${fmtShort(s.arrival)} – ${fmtShort(s.departure)}`;
  const changes = plan ? plan.create.length + plan.update.length + (withRemovals ? plan.remove.length : 0) : 0;

  return (
    <Modal title="Hotelgäste importieren (CSV)" onClose={closeDialog} width={640} footer={<><button className="btn" onClick={closeDialog}>Schließen</button>
      <button className="btn primary" disabled={busy || !changes} onClick={run}>{changes ? `${changes} Änderungen übernehmen` : 'Übernehmen'}</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>
        <b>ASA-Zimmerliste</b>: wird erkannt und je Reservierung + Zimmer zu einem Aufenthalt zusammengefasst. Die Datei gilt als kompletter Gästestand –
        wer fehlt, gilt als abgereist bzw. storniert. Geburtsdatum, Land und Meldedaten werden nicht gespeichert.<br />
        <b>Einfaches Format</b>: <code>Zimmer;Name;Personen;;Anreise;Abreise;Verpflegung;Allergien;Notiz</code> (4. Spalte leer; steht dort eine Zahl, wird sie dazugezählt)<br />
        Feste Tische, Essenszeiten, Allergien und Notizen aus dem Tischplan bleiben erhalten.</p>
      <input type="file" accept=".csv,.txt,text/csv,text/plain" aria-label="CSV-Datei" onChange={e => { const f = e.target.files?.[0]; if (f) { setResult(''); readTextFile(f).then(setText); } }} />
      <textarea style={{ minHeight: 80, marginTop: 8 }} value={text} placeholder="…oder hier einfügen" onChange={e => { setResult(''); setText(e.target.value); }} />
      {parsed && plan && <>
        <p style={{ margin: '8px 0 0' }}><b>{parsed.format === 'asa' ? 'ASA-Zimmerliste' : 'Einfaches Format'}</b>: {parsed.stays.length} Aufenthalte gelesen
          {parsed.cancelled ? `, ${parsed.cancelled} stornierte Zeilen übersprungen` : ''}{parsed.emptyRooms ? `, ${parsed.emptyRooms} leere Zimmer` : ''} · {plan.unchanged} unverändert</p>
        {!boardInFile && plan.create.length > 0 && <label className="mt8">Verpflegung für neue Gäste (nicht in der Datei)
          <select value={defaultBoard} onChange={e => setDefaultBoard(e.target.value as Board)}>{BOARDS.map(b => <option key={b} value={b}>{t(b)}</option>)}</select></label>}
        <Section title="Neu" lines={plan.create.map(label)} />
        <Section title="Geändert" lines={plan.update.map(u => `Zi. ${u.before.roomNo} · ${u.before.name}: ${u.changes.join(', ')}`)} />
        {plan.remove.length > 0 && <>
          <Section title="Nicht mehr in der Datei" lines={plan.remove.map(r => `${label(r.stay)} → ${r.action === 'delete' ? 'löschen (noch nicht angereist)' : 'Abreise heute'}`)} />
          <label className="chk mt8"><input type="checkbox" checked={withRemovals} onChange={e => setWithRemovals(e.target.checked)} /> Fehlende Gäste entfernen bzw. abreisen lassen</label>
          {manyRemovals && withRemovals && <div className="infobox mt8" style={{ color: 'var(--danger)' }}>Achtung: mehr als die Hälfte der Gäste aus dem Hotelprogramm fehlt – ist die Datei vollständig?</div>}
        </>}
        <Section title="Fehler" lines={parsed.errors} />
      </>}
      {busy && <p className="muted">Import läuft…</p>}
      {result && <div className="infobox mt8">{result}</div>}
      <p className="muted" style={{ fontSize: 12 }}>{d.stays.length} Aufenthalte vorhanden.</p>
    </Modal>
  );
}
