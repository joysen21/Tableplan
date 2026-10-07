/** Tisch-Popup, Reservierungs-Info (Service), Walk-in, Tischsperre */
import { useState } from 'react';
import { allergyText, hasAllergy } from '../domain/menu';
import { Minus, Plus, PersonStanding } from 'lucide-react';
import { newId } from '../domain/demo';
import { canEdit, canStatus, RES_STATUS_COLOR, SEATED_STATES } from '../domain/constants';
import { byId, capacity, freeMinutes, isBlocked, occupies, persons, resEnd, resStart, suggestTables, tableBusy, tableNames, tableStatusAt, turnTime } from '../domain/logic';
import type { Reservation, ResStatus } from '../domain/types';
import { t } from '../lib/i18n';
import { fmtDate, fmtShort, fromMin, nowMin, today, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useRoomId, useServiceId } from '../store/hooks';
import { useUi } from '../store/ui';
import { closeDialog, openDialog } from '../store/dialogs';
import { toast } from '../ui/notify';
import { Modal } from '../ui/Modal';
import { saveChecked } from './actions';

const STATUS_BUTTONS: ResStatus[] = ['eingetroffen', 'platziert', 'rechnung', 'abgeschlossen', 'noshow', 'storniert'];

function StatusButtons({ r }: { r: Reservation }) {
  const setStatus = useApp(s => s.setStatus);
  return (
    <div className="stbtns">{STATUS_BUTTONS.map(x => (
      <button key={x} className="btn" aria-pressed={r.status === x} style={{ borderLeft: `5px solid ${RES_STATUS_COLOR[x]}` }}
        onClick={async () => { if (await setStatus(r, x)) closeDialog(); }}>{t(x)}</button>
    ))}</div>
  );
}

function ResDetails({ r }: { r: Reservation }) {
  const d = useData();
  const stay = byId(d.stays, r.stayId);
  return (
    <div className="infobox">
      <b>{r.vip ? '★ ' : ''}{r.name}</b> · {persons(r)} P{r.children ? ` (${r.children} Kinder)` : ''} · {r.time}–{fromMin(resEnd(r))}
      {stay && <><br />Hotelgast Zi. {stay.roomNo} · {t(stay.board)} · bis {fmtShort(stay.departure)}</>}
      {hasAllergy(r) && <><br />⚠ <b>{allergyText(r)}</b></>}
      {r.occasion && <><br />🎉 {r.occasion}</>}
      {r.highchair && <><br />Kinderstuhl</>}
      {r.notes && <><br />📝 {r.notes}</>}
      <br />Status: <b>{t(r.status)}</b> · Tisch(e): {tableNames(d, r.tableIds) || '–'}
    </div>
  );
}

export function TablePopup({ tableId }: { tableId: string }) {
  const d = useData();
  const role = useApp(s => s.user!.role);
  const store = useApp();
  const ui = useUi();
  const serviceId = useServiceId();
  const tb = byId(d.tables, tableId);
  if (!tb) return null;
  const s = tableStatusAt(d, tb, ui.date, serviceId, ui.time);
  const r = s.r;
  const dayRes = d.reservations.filter(x => x.date === ui.date && x.tableIds.includes(tb.id) && x.status !== 'storniert').sort((a, b) => resStart(a) - resStart(b));
  const block = d.blocks.find(b => b.tableId === tb.id && b.date === ui.date && (!b.serviceId || b.serviceId === serviceId));
  const station = byId(d.stations, tb.stationId);
  const edit = canEdit(role);
  const freeT = r ? d.tables.filter(x => x.id !== tb.id && !r.tableIds.includes(x.id) && !tableBusy(d, x.id, r.date, resStart(r), resEnd(r), r.id).length) : [];
  // Reservierungen dieses Service ohne Tisch – lassen sich per Antippen hier platzieren (Alternative zum Ziehen)
  const waiting = !r && !block && edit ? d.reservations.filter(x => x.date === ui.date && x.serviceId === serviceId && occupies(x) && !x.tableIds.length)
    .sort((a, b) => resStart(a) - resStart(b)) : [];
  const run = (p: Promise<boolean>) => p.then(ok => ok && closeDialog());

  return (
    <Modal title={'Tisch ' + tb.name} onClose={closeDialog} footer={<>
      {edit && (block
        ? <button className="btn" onClick={async () => { if (await store.remove('blocks', [block.id], ['Tischsperre aufgehoben', tb.name])) closeDialog(); }}>Sperre aufheben</button>
        : <button className="btn" onClick={() => openDialog({ type: 'block', tableId: tb.id })}>Tisch sperren</button>)}
      <span className="spacer" />
      {r && edit && <button className="btn primary" onClick={() => openDialog({ type: 'reservation', r })}>Reservierung bearbeiten</button>}
      <button className="btn" onClick={closeDialog}>Schließen</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{tb.minPersons}–{tb.maxPersons} Personen · {byId(d.rooms, tb.roomId)?.name}{station ? ' · ' + station.name : ''}
        {tb.features.length > 0 && <><br />{tb.features.map(t).join(', ')}</>} · Status: <b>{t(s.st)}</b></p>
      {r && <ResDetails r={r} />}
      {r && canStatus(role) && <StatusButtons r={r} />}
      {r && edit && (
        <div className="row mt12">
          <select style={{ width: 'auto' }} value="" aria-label="Umsetzen an" onChange={e => { const to = e.target.value; if (to) run(saveChecked({ ...r, tableIds: r.tableIds.map(x => (x === tb.id ? to : x)) }, r, ['Tisch gewechselt', `${r.name} → ${byId(d.tables, to)?.name}`])); }}>
            <option value="">Umsetzen an…</option>
            {freeT.map(x => <option key={x.id} value={x.id}>{x.name} ({x.maxPersons}P, {byId(d.rooms, x.roomId)?.name})</option>)}
          </select>
          <select style={{ width: 'auto' }} value="" aria-label="Tisch dazunehmen" onChange={e => e.target.value && run(saveChecked({ ...r, tableIds: [...r.tableIds, e.target.value] }, r, ['Tische zusammengelegt', r.name]))}>
            <option value="">Tisch dazunehmen…</option>
            {freeT.map(x => <option key={x.id} value={x.id}>{x.name} ({x.maxPersons}P, {byId(d.rooms, x.roomId)?.name})</option>)}
          </select>
          {r.tableIds.length > 1 && <button className="btn" onClick={() => saveChecked({ ...r, tableIds: r.tableIds.filter(x => x !== tb.id) }, r, ['Tisch abgetrennt', r.name]).then(ok => ok && closeDialog())}>{tb.name} abtrennen</button>}
        </div>
      )}
      {!r && !block && edit && (
        <div className="row">
          <button className="btn primary" onClick={() => openDialog({ type: 'walkin', tableId: tb.id })}><PersonStanding />Walk-in hier platzieren</button>
          <button className="btn" onClick={() => {
            const svc = byId(d.services, serviceId);
            openDialog({ type: 'reservation', preset: { tableIds: [tb.id], serviceId, time: fromMin(Math.max(toMin(svc?.start), Math.ceil(ui.time / 15) * 15)) } });
          }}><Plus />Reservierung für diesen Tisch</button>
        </div>
      )}
      {waiting.length > 0 && <>
        <h4 style={{ margin: '16px 0 6px' }}>Ohne Tisch – hier platzieren</h4>
        <div className="sugg">{waiting.map(x => (
          <button key={x.id} className="btn" onClick={() => run(saveChecked({ ...x, tableIds: [tb.id] }, x, ['Tisch zugewiesen', `${x.name} → ${tb.name}`]))}>
            {x.time} · {x.name} · {persons(x)}P{persons(x) > tb.maxPersons ? ' ⚠' : ''}</button>))}</div>
      </>}
      {block && <div className="warnbox">Gesperrt: {block.reason || '–'}</div>}
      <h4 style={{ margin: '16px 0 6px' }}>{ui.date === today() ? 'Heute' : fmtDate(ui.date)} an diesem Tisch</h4>
      {dayRes.length ? dayRes.map(x => (
        <div key={x.id} className="row" style={{ fontSize: 13, padding: '3px 0' }}>
          <b>{x.time}–{fromMin(resEnd(x))}</b> {x.name} · {persons(x)}P <span className="badge st" style={{ background: RES_STATUS_COLOR[x.status] }}>{t(x.status)}</span>
        </div>)) : <p className="muted">Keine Reservierungen.</p>}
    </Modal>
  );
}

export function ResInfo({ id }: { id: string }) {
  const d = useData();
  const role = useApp(s => s.user!.role);
  const r = byId(d.reservations, id);
  if (!r) return null;
  return (
    <Modal title={r.name} onClose={closeDialog} footer={<button className="btn" onClick={closeDialog}>Schließen</button>}>
      <p style={{ marginTop: 0 }}>{fmtDate(r.date)}</p>
      <ResDetails r={r} />
      {canStatus(role) && <StatusButtons r={r} />}
    </Modal>
  );
}

export function WalkIn({ tableId }: { tableId?: string }) {
  const d = useData();
  const ui = useUi();
  const serviceId = useServiceId();
  const roomId = useRoomId();
  const store = useApp();
  const [p, setP] = useState(2);
  const [name, setName] = useState('');
  const fixed = byId(d.tables, tableId);
  const start = Math.round((ui.date === today() ? nowMin() : ui.time) / 5) * 5;
  const draft: Reservation = {
    id: newId(), date: ui.date, serviceId, time: fromMin(start), duration: turnTime(d, serviceId, p), adults: p, children: 0, name: '',
    phone: '', email: '', occasion: '', allergies: '', allergens: [], notes: '', highchair: false, vip: false, source: 'Walk-in', status: 'platziert', wishes: [],
    stayId: null, manualTable: false, seriesId: null, seatedAt: nowMin(), finishedAt: null, tableIds: []
  };
  // Walk-ins dürfen auch Tische nutzen, die später reserviert sind – die Dauer wird dann gekürzt (min. 30 Min.)
  const options = (fixed ? [{ ids: [fixed.id] }] : suggestTables(d, { ...draft, duration: 30 }, roomId, 8)).map(s => {
    const free = freeMinutes(d, s.ids, draft.date, start);
    return { ids: s.ids, duration: Math.min(draft.duration, free), free };
  }).filter(o => o.duration >= 30 && !o.ids.some(id => isBlocked(d, id, draft.date, serviceId)));

  async function place(o: { ids: string[]; duration: number }) {
    const r = { ...draft, name: name.trim() || 'Walk-in', tableIds: o.ids, duration: o.duration };
    if (await saveChecked(r, undefined, ['Walk-in platziert', `${r.name} ${p}P → ${tableNames(d, o.ids)}`], 'Trotzdem platzieren')) closeDialog();
  }
  return (
    <Modal title={'Walk-in' + (fixed ? ' an ' + fixed.name : '')} onClose={closeDialog} footer={<button className="btn" onClick={closeDialog}>Abbrechen</button>}>
      <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
        <button className="btn" style={{ minWidth: 60 }} onClick={() => setP(Math.max(1, p - 1))} aria-label="weniger"><Minus /></button>
        <b style={{ fontSize: 36, minWidth: 50, textAlign: 'center' }}>{p}</b>
        <button className="btn" style={{ minWidth: 60 }} onClick={() => setP(Math.min(40, p + 1))} aria-label="mehr"><Plus /></button>
        <span className="muted">Personen</span>
      </div>
      <label className="mt12">Name (optional)<input value={name} placeholder="Walk-in" onChange={e => setName(e.target.value)} /></label>
      <h4 style={{ margin: '14px 0 6px' }}>{fixed ? 'Tisch' : 'Freie Tische (beste Passung zuerst)'}</h4>
      <div className="sugg">{options.length ? options.map((o, i) => (
        <button key={o.ids.join()} className={'btn' + (i === 0 ? ' primary' : '')} onClick={() => place(o)} disabled={store.saving > 0}>
          {tableNames(d, o.ids)} ({capacity(d, o.ids).max}P){o.free < Infinity && o.free < turnTime(d, serviceId, p) ? ` · frei bis ${fromMin(start + o.free)}` : ''}
        </button>)) : <span className="warnbox">Aktuell kein passender Tisch frei.</span>}</div>
    </Modal>
  );
}

export function BlockDialog({ tableId }: { tableId: string }) {
  const d = useData();
  const ui = useUi();
  const serviceId = useServiceId();
  const store = useApp();
  const tb = byId(d.tables, tableId);
  const [date, setDate] = useState(ui.date);
  const [svc, setSvc] = useState<string>(serviceId);
  const [reason, setReason] = useState('');
  if (!tb) return null;
  return (
    <Modal title={`Tisch ${tb.name} sperren`} onClose={closeDialog} width={520} footer={<>
      <button className="btn" onClick={closeDialog}>Abbrechen</button>
      <button className="btn primary" onClick={async () => {
        const busy = d.reservations.filter(r => r.date === date && r.tableIds.includes(tb.id) && (!svc || r.serviceId === svc) && !SEATED_STATES.includes(r.status) && r.status !== 'abgeschlossen' && r.status !== 'storniert');
        if (await store.upsert('blocks', [{ id: newId(), tableId: tb.id, date, serviceId: svc || null, reason }], ['Tisch gesperrt', `${tb.name} ${date}`])) {
          if (busy.length) toast(`Hinweis: ${busy.length} Reservierung(en) an diesem Tisch – bitte umsetzen`, 'err'); else toast('Gesperrt');
          closeDialog();
        }
      }}>Sperren</button></>}>
      <div className="grid2">
        <label>Datum<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Service<select value={svc} onChange={e => setSvc(e.target.value)}><option value="">ganzer Tag</option>{d.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>
      <label className="mt8">Grund<input value={reason} placeholder="z. B. defekt, Event, Personal" onChange={e => setReason(e.target.value)} /></label>
    </Modal>
  );
}
