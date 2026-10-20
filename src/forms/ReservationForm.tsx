/** Reservierung anlegen / bearbeiten */
import { useEffect, useState } from 'react';
import { Trash2, X } from '../ui/icons';
import { newId } from '../domain/demo';
import { guessAllergens } from '../domain/menu';
import { FEATURES, OCCASIONS, SOURCES } from '../domain/constants';
import { pickableStatuses, resolveStatus, statusKey } from '../domain/statuses';
import { byId, capacity, checkReservation, isInHouse, mergeEdits, persons, resEnd, resStart, serviceTime, suggestTables, tableBusy, tableConflicts, tableNames, untilEnd } from '../domain/logic';
import type { Reservation } from '../domain/types';
import { t } from '../lib/i18n';
import { addDays, fmtDate, fromMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useRoomId, useServiceId } from '../store/hooks';
import { useUi } from '../store/ui';
import { closeDialog } from '../store/dialogs';
import { confirmDialog, toast } from '../ui/notify';
import { Modal } from '../ui/Modal';
import { cleanCounts, menuChoiceFor } from '../domain/guestMenu';
import { MenuChoiceEditor, type ChoiceDraft } from './MenuChoiceEditor';

/** Feldnamen für die Rückfrage bei Bearbeitungskonflikten */
const FIELD_LABEL: Partial<Record<keyof Reservation, string>> = {
  date: 'Datum', serviceId: 'Service', time: 'Uhrzeit', duration: 'Dauer', adults: 'Personen', children: 'Personen', name: 'Name',
  phone: 'Telefon', email: 'E-Mail', occasion: 'Anlass', allergies: 'Notiz zu Unverträglichkeiten', allergens: 'Allergene', notes: 'Notizen',
  highchair: 'Kinderstuhl', vip: 'VIP', source: 'Quelle', status: 'Status', wishes: 'Wünsche', stayId: 'Hotelgast', tableIds: 'Tisch',
  seatedAt: 'Platziert um', finishedAt: 'Fertig um'
};

export function ReservationForm({ r, preset }: { r?: Reservation; preset?: Partial<Reservation> }) {
  const d = useData();
  const ui = useUi();
  const currentSvc = useServiceId();
  const roomId = useRoomId();
  const store = useApp();
  const isNew = !r;
  const [draft, setDraft] = useState<Reservation>(() => {
    if (r) return { ...r, allergens: r.allergens ?? [] };
    const svc = byId(d.services, preset?.serviceId || currentSvc) ?? d.services[0];
    const base: Reservation = {
      id: newId(), date: ui.date, serviceId: svc.id, time: svc.hotelTime || svc.start, duration: 0, adults: 2, children: 0,
      name: '', phone: '', email: '', occasion: '', allergies: '', allergens: [], notes: '', highchair: false, vip: false, source: 'Telefon',
      status: 'bestaetigt', wishes: [], stayId: null, manualTable: false, seriesId: null, seatedAt: null, finishedAt: null, tableIds: [], ...preset
    };
    return withServiceTime(base);
  });
  const [repeat, setRepeat] = useState(0);
  const [busy, setBusy] = useState(false);
  // Menüauswahl des Hotelzimmers (null = unverändert); bei anderem Tag/Service/Zimmer verwerfen
  const [mc, setMc] = useState<ChoiceDraft | null>(null);
  useEffect(() => setMc(null), [draft.date, draft.serviceId, draft.stayId]);

  // Uhrzeit und Dauer werden nicht eingegeben: Beginn des Service (Hotelgäste: Hotel-Standardzeit) bis zum festen Service-Ende
  function withServiceTime(x: Reservation): Reservation {
    const time = serviceTime(d, x.serviceId, !!x.stayId);
    return { ...x, time, duration: untilEnd(d, x.serviceId, time) };
  }
  const upd = (p: Partial<Reservation>) => setDraft(prev => {
    const next = { ...prev, ...p };
    // Allergene werden nicht mehr angeklickt, sondern aus der Notiz erkannt (plus die des Hotelgasts) – für die Warnungen in der Küche
    if ('allergies' in p) next.allergens = [...new Set([...(byId(d.stays, next.stayId)?.allergens ?? []), ...guessAllergens(next.allergies)])];
    return 'serviceId' in p || 'stayId' in p ? withServiceTime(next) : next;
  });
  const svc = byId(d.services, draft.serviceId);
  const issues = checkReservation(d, draft);
  const sugg = suggestTables(d, draft, roomId, 6);
  const live = r && d.reservations.find(x => x.id === r.id);
  const changedMeanwhile = !!r && (!live || live.updatedAt !== r.updatedAt);
  const inHouse = d.stays.filter(s => isInHouse(s, draft.date)).sort((a, b) => a.roomNo.localeCompare(b.roomNo, 'de', { numeric: true }));

  async function save() {
    if (!draft.name.trim()) return toast('Bitte Namen eingeben', 'err');
    if (persons(draft) < 1) return toast('Personenanzahl fehlt', 'err');
    const err = issues.find(i => i.level === 'error');
    if (err) return toast(err.text, 'err');
    const warns = issues.filter(i => i.level === 'warn').map(i => i.text);
    if (warns.length && !(await confirmDialog('Bitte prüfen', warns))) return;
    let mine = draft;
    // Hat jemand anderes die Reservierung inzwischen gespeichert? Dann eigene Eingaben auf den aktuellen Stand legen.
    if (r) {
      const live = useApp.getState().data?.reservations.find(x => x.id === r.id);
      if (!live) return toast('Diese Reservierung wurde inzwischen gelöscht.', 'err');
      if (live.updatedAt !== r.updatedAt) {
        const { merged, overlap } = mergeEdits(r, draft, live);
        if (overlap.length) {
          const fields = overlap.map(k => FIELD_LABEL[k] ?? k).join(', ');
          const keepMine = await confirmDialog('Inzwischen geändert', [`Jemand anderes hat diese Reservierung gerade ebenfalls geändert: ${fields}.`,
            'Deine Eingaben speichern (überschreibt diese Felder) oder den aktuellen Stand übernehmen und prüfen?'], 'Meine Eingaben speichern');
          if (!keepMine) {
            setDraft({ ...merged, ...Object.fromEntries(overlap.map(k => [k, live[k]])) });
            return toast('Aktueller Stand übernommen – bitte prüfen und speichern.');
          }
        }
        mine = merged;
      }
    }
    const next = { ...mine, name: mine.name.trim() };
    if (r?.stayId && JSON.stringify(r.tableIds) !== JSON.stringify(next.tableIds)) next.manualTable = true;
    const items = [next];
    // Menüauswahl vorab prüfen, damit nicht nur die Hälfte gespeichert wird
    const { menu, choice } = menuChoiceFor(d, next);
    let choiceRow = null;
    if (mc && menu) {
      const res = cleanCounts(menu.items, persons(next), mc.counts);
      if ('error' in res) return toast(res.error, 'err');
      // Hotelgast: Auswahl gehört zum Zimmer, sonst zur Reservierung
      choiceRow = { id: choice?.id ?? newId(), menuId: menu.id, stayId: next.stayId ?? null, reservationId: next.stayId ? null : next.id, counts: res.counts, note: mc.note.trim() };
    }
    let skipped = 0;
    if (isNew && repeat > 0) {
      next.seriesId = next.id;
      for (let i = 1; i <= repeat; i++) {
        const c: Reservation = { ...next, id: newId(), date: addDays(next.date, 7 * i), tableIds: [...next.tableIds] };
        if (c.tableIds.some(tid => tableBusy(d, tid, c.date, resStart(c), resEnd(c)).length)) { c.tableIds = []; skipped++; }
        items.push(c);
      }
    }
    setBusy(true);
    const ok = await store.saveReservations(items, [], [isNew ? 'Reservierung angelegt' : 'Reservierung geändert',
      `${next.name} ${next.date} ${next.time} ${persons(next)}P${repeat ? ` (+${repeat} Wiederholungen)` : ''}`]);
    if (ok && choiceRow) await store.upsert('menuChoices', [choiceRow], ['Menüauswahl geändert', `${next.name}`]);
    setBusy(false);
    if (ok) { toast(skipped ? `Gespeichert – ${skipped} Wiederholung(en) ohne Tisch (belegt)` : 'Gespeichert'); closeDialog(); }
  }
  async function remove() {
    if (!r || !(await confirmDialog('Reservierung löschen?', [`${r.name} – ${fmtDate(r.date)} ${r.time}`], 'Endgültig löschen', true))) return;
    if (await store.saveReservations([], [r.id], ['Reservierung gelöscht', r.name])) { toast('Gelöscht'); closeDialog(); }
  }

  return (
    <Modal title={isNew ? 'Neue Reservierung' : 'Reservierung bearbeiten'} onClose={closeDialog}
      footer={<>{!isNew && <button className="btn danger" onClick={remove}><Trash2 />Löschen</button>}<span className="spacer" />
        <button className="btn" onClick={closeDialog}>Abbrechen</button><button className="btn primary" onClick={save} disabled={busy}>Speichern</button></>}>
      {changedMeanwhile && <div className="infobox" role="status">{live ? 'Diese Reservierung wurde gerade von jemand anderem geändert. Beim Speichern werden deine Eingaben mit dem aktuellen Stand zusammengeführt.' : 'Diese Reservierung wurde inzwischen gelöscht.'}</div>}
      <div className="grid3">
        <label>Datum<input type="date" value={draft.date} onChange={e => e.target.value && upd({ date: e.target.value })} /></label>
        <label>Service<select value={draft.serviceId} onChange={e => upd({ serviceId: e.target.value })}>
          {d.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Personen<input type="number" min={1} max={99} value={persons(draft)} onChange={e => upd({ adults: Math.max(0, +e.target.value || 0), children: 0 })} /></label>
      </div>
      <div className="grid3 mt8">
        <div className="muted" style={{ alignSelf: 'end', fontSize: 13, paddingBottom: 8 }} data-testid="res-time">Zeit {draft.time}–{fromMin(resEnd(draft))} (laut {svc?.name ?? 'Service'})</div>
      </div>
      <div className="grid2 mt8">
        <label>Name *<input value={draft.name} autoFocus={isNew} autoComplete="off" onChange={e => upd({ name: e.target.value })} /></label>
        <label>Telefon<input type="tel" value={draft.phone} onChange={e => upd({ phone: e.target.value })} /></label>
        <label>Quelle<select value={draft.source} onChange={e => upd({ source: e.target.value })}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Anlass<select value={draft.occasion} onChange={e => upd({ occasion: e.target.value })}>{OCCASIONS.map(s => <option key={s} value={s}>{s || '–'}</option>)}</select></label>
        <label>Status<select value={statusKey(d.venue.statusConfig, draft)} onChange={e => upd(resolveStatus(d.venue.statusConfig, e.target.value))}>
          {pickableStatuses(d.venue.statusConfig, statusKey(d.venue.statusConfig, draft)).map(o => <option key={o.key} value={o.key}>{o.custom ? '– ' : ''}{o.label}</option>)}</select></label>
      </div>
      <label className="mt8">Hotelgast verknüpfen
        <select value={draft.stayId ?? ''} onChange={e => {
          const st = byId(d.stays, e.target.value);
          if (!st) return upd({ stayId: null });
          upd({ stayId: st.id, name: `${st.name} · Zi. ${st.roomNo}`, adults: st.adults + st.children, children: 0, allergies: st.allergies || draft.allergies, allergens: st.allergens?.length ? [...st.allergens] : draft.allergens, source: 'Hotel', vip: st.vip });
        }}>
          <option value="">– kein Hotelgast –</option>
          {inHouse.map(s => <option key={s.id} value={s.id}>Zi. {s.roomNo} · {s.name} ({s.adults + s.children}P, {s.board})</option>)}
        </select></label>
      <h4 style={{ margin: '14px 0 6px' }}>Menü</h4><MenuChoiceEditor d={d} r={draft} value={mc} onChange={setMc} />
      <label className="mt8">Weitere Unverträglichkeiten / Notiz<input value={draft.allergies} placeholder="z. B. vegetarisch, keine Zwiebeln" onChange={e => upd({ allergies: e.target.value })} /></label>
      <label className="mt8">Notizen<textarea value={draft.notes} onChange={e => upd({ notes: e.target.value })} /></label>
      <div className="row mt8">
        <label className="chk"><input type="checkbox" checked={draft.highchair} onChange={e => upd({ highchair: e.target.checked })} /> Kinderstuhl</label>
        <label className="chk"><input type="checkbox" checked={draft.vip} onChange={e => upd({ vip: e.target.checked })} /> VIP</label>
        <span className="muted">Wünsche:</span>
        {FEATURES.map(f => <label key={f} className="chk"><input type="checkbox" checked={draft.wishes.includes(f)}
          onChange={e => upd({ wishes: e.target.checked ? [...draft.wishes, f] : draft.wishes.filter(x => x !== f) })} /> {t(f)}</label>)}
      </div>
      <h4 style={{ margin: '14px 0 6px' }}>Tisch(e)</h4>
      <div className="row">
        {draft.tableIds.length ? <>{draft.tableIds.map(id => <span key={id} className="badge" style={{ fontSize: 14, padding: '6px 10px' }}>{byId(d.tables, id)?.name}{' '}
          <button className="link" aria-label="Tisch entfernen" onClick={() => upd({ tableIds: draft.tableIds.filter(x => x !== id) })}><X size={14} /></button></span>)}
          <span className="muted">Kapazität {capacity(d, draft.tableIds).max} P</span></>
          : <span className="muted">Noch kein Tisch – Vorschlag wählen oder später im Plan zuweisen.</span>}
      </div>
      <div className="row mt8">
        <select style={{ width: 'auto' }} value="" onChange={e => e.target.value && upd({ tableIds: [...draft.tableIds, e.target.value] })}>
          <option value="">Tisch manuell hinzufügen…</option>
          {d.rooms.map(rm => <optgroup key={rm.id} label={rm.name}>{d.tables.filter(x => x.roomId === rm.id && !draft.tableIds.includes(x.id)).map(x => (
            <option key={x.id} value={x.id}>{x.name} ({x.minPersons}–{x.maxPersons}P){tableConflicts(d, x.id, draft.date, resStart(draft), resEnd(draft), draft).length ? ' – belegt' : ''}</option>))}</optgroup>)}
        </select>
      </div>
      <div className="muted mt8" style={{ fontSize: 12 }}>Vorschläge:</div>
      <div className="sugg">{sugg.length ? sugg.map(s => <button key={s.ids.join()} className="btn small" onClick={() => upd({ tableIds: s.ids })}>
        {tableNames(d, s.ids)} · {capacity(d, s.ids).max}P · {byId(d.rooms, byId(d.tables, s.ids[0])?.roomId)?.name}</button>)
        : <span className="muted">Kein passender freier Tisch.</span>}</div>
      {isNew && <label className="mt12">Wöchentlich wiederholen (Stammtisch) – Anzahl weiterer Wochen<input type="number" min={0} max={52} value={repeat} onChange={e => setRepeat(Math.min(52, Math.max(0, +e.target.value || 0)))} /></label>}
      {issues.length > 0 ? <div className={issues.some(i => i.level === 'error') ? 'warnbox' : 'infobox'}>
        {issues.map(i => <div key={i.text} className={i.level === 'warn' ? 'issue-warn' : undefined}>{i.level === 'error' ? '⛔ ' : '⚠ '}{i.text}</div>)}</div>
        : draft.tableIds.length > 0 && <div className="infobox">Keine Konflikte.</div>}
    </Modal>
  );
}
