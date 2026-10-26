/** Module Garage, Massage, Fahrrad: Belegungsraster je Ressource, Buchung nur für Hotelgäste, Doppelbuchung gesperrt.
 *  Garage: 14 Nächte · Fahrrad: Woche mit Vormittag/Nachmittag · Massage: Tages-Zeitleiste je Masseurin + Anwesenheit. */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from '../ui/icons';
import {
  BIKE_PARTS, EXTRA_LABEL, bikeCols, bikeRange, bookingConflicts, bookingWarnings, fmtDay, freeResources, garageCols, garageDays, garageRange,
  bikeHalves, bikeSpan, massageCols, massageRange, movedBike, movedMassage, presentFor, resizedBike, resizedMassage, type Half, resourcesOf, spanOf, stayLabel, staysBetween, weekMonday, type GridCol
} from '../domain/extras';
import { byId } from '../domain/logic';
import { newId } from '../domain/demo';
import type { BikePart, Booking, ExtraModule, HotelResource, Presence } from '../domain/types';
import { addDays, today } from '../lib/time';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { useUi } from '../store/ui';
import { Modal } from '../ui/Modal';
import { confirmDialog, toast } from '../ui/notify';
import { dragState, startDragOrTap } from '../ui/drag';

/** Datum wählen: zurück/vor um step Tage, Heute */
function DateBar({ step, label }: { step: number; label?: string }) {
  const ui = useUi();
  return (
    <div className="row xdate">
      <button className="btn small icon" aria-label="Zurück" title="Zurück" onClick={() => ui.set({ date: addDays(ui.date, -step), follow: false })}><ChevronLeft /></button>
      <input type="date" value={ui.date} aria-label="Datum" style={{ width: 'auto' }} onChange={e => e.target.value && ui.set({ date: e.target.value, follow: false })} />
      <button className="btn small icon" aria-label="Weiter" title="Weiter" onClick={() => ui.set({ date: addDays(ui.date, step), follow: false })}><ChevronRight /></button>
      <button className={'btn small' + (ui.date === today() ? ' is-today' : '')} onClick={() => ui.goToday()}>Heute</button>
      {label && <span className="muted">{label}</span>}
    </div>
  );
}

interface GridProps {
  rows: HotelResource[]; cols: GridCol[]; mod: ExtraModule; colW: number;
  /** Zeilenhöhe (px) – Massage höher, damit die Einträge mehrzeilig lesbar sind */
  rowH?: number;
  sub?: (r: HotelResource) => string; cellClass?: (r: HotelResource, c: GridCol) => string;
  onEmpty: (r: HotelResource, c: GridCol) => void; onOpen: (b: Booking) => void; barText: (b: Booking) => string;
  /** Balken per Drag & Drop auf ein anderes Feld ziehen (neue Zeile/Spalte = Ressource/Beginn) */
  onMove?: (b: Booking, r: HotelResource, c: GridCol) => void;
  /** Balken am linken/rechten Rand ziehen = Beginn/Ende ändern (wie im Outlook-Kalender) */
  onResize?: (b: Booking, edge: 'start' | 'end', c: GridCol) => void;
}
/** Belegungsraster: Zeilen = Ressourcen, Spalten = Zeitabschnitte, Buchungen als Balken */
function ResourceGrid(p: GridProps) {
  const d = useData();
  const bookings = d.bookings.filter(b => b.module === p.mod);
  return (
    <div className="table-scroll">
      <div className="xgrid" style={{ gridTemplateColumns: `minmax(110px,170px) repeat(${p.cols.length}, minmax(${p.colW}px,1fr))`, minWidth: 140 + p.cols.length * p.colW, gridTemplateRows: '30px', gridAutoRows: p.rowH ?? 44 }} role="grid" aria-label={`Belegung ${EXTRA_LABEL[p.mod]}`}>
        <div className="xg-corner" style={{ gridRow: 1, gridColumn: 1 }} />
        {p.cols.map((c, j) => <div key={c.key} className={'xg-head' + (c.head ? ' start' : '')} style={{ gridRow: 1, gridColumn: j + 2 }}>{c.label}</div>)}
        {p.rows.map((r, i) => {
          const row = i + 2;
          return [
            <div key={r.id} className="xg-label" style={{ gridRow: row, gridColumn: 1 }}><b>{r.name}</b>{p.sub?.(r) && <small className="muted">{p.sub(r)}</small>}</div>,
            ...p.cols.map((c, j) => <button key={r.id + c.key} type="button" className={'xg-cell' + (c.head ? ' start' : '') + ' ' + (p.cellClass?.(r, c) ?? '')}
              style={{ gridRow: row, gridColumn: j + 2 }} aria-label={`${r.name} ${c.aria} buchen`} data-cell={`${r.id}|${c.key}`} onClick={() => !dragState.active && p.onEmpty(r, c)} />),
            ...bookings.filter(b => b.resourceId === r.id).flatMap(b => {
              const s = spanOf(p.cols, b);
              return s ? [<button key={b.id} type="button" className={'xg-bar m-' + p.mod} style={{ gridRow: row, gridColumn: `${s.first + 2} / span ${s.n}` }}
                title={p.barText(b)} {...(p.onMove ? { 'data-drag-handle': '' } : {})}
                onPointerDown={e => {
                  const edge = (e.target as Element).closest('[data-edge]')?.getAttribute('data-edge') as 'start' | 'end' | undefined;
                  startDragOrTap(e, {
                    label: edge ? (edge === 'start' ? '⇤ Beginn ändern' : 'Ende ändern ⇥') : p.barText(b).split('\n').join(' · '), onClick: () => p.onOpen(b),
                    onDrop: el => {
                      const [rid, key] = ((el?.closest('[data-cell]') as HTMLElement | null)?.dataset.cell ?? '').split('|');
                      const r2 = p.rows.find(x => x.id === rid), c2 = p.cols.find(x => x.key === key);
                      if (!r2 || !c2) return;
                      if (edge) p.onResize?.(b, edge, c2); else p.onMove?.(b, r2, c2);
                    }
                  });
                }}
                // Tastatur (Enter/Leertaste): öffnen
                onClick={e => { if (e.detail === 0) p.onOpen(b); }}>
                {p.onResize && <span className="xg-edge l" data-edge="start" title="Beginn ziehen" />}{p.barText(b)}{p.onResize && <span className="xg-edge r" data-edge="end" title="Ende ziehen" />}</button>] : [];
            })
          ];
        })}
      </div>
    </div>
  );
}

const blank = (mod: ExtraModule, x: Partial<Booking> & Pick<Booking, 'resourceId' | 'starts' | 'ends'>): Booking =>
  ({ id: newId(), module: mod, stayId: '', therapyId: null, plate: '', ev: false, part: null, price: null, note: '', createdBy: '', ...x });

/* ---------- Garage ---------- */
export function GarageView() {
  const d = useData();
  const ui = useUi();
  const [open, setOpen] = useState<{ b: Booking; isNew: boolean } | null>(null);
  const rows = resourcesOf(d, 'garage');
  const cols = garageCols(ui.date, 14);
  const tonight = cols[0];
  const used = rows.filter(r => d.bookings.some(b => b.resourceId === r.id && b.starts < tonight.ends && tonight.starts < b.ends)).length;
  return (
    <div className="extras">
      <div className="panel">
        <div className="xhead">
          <DateBar step={7} label={`${used} von ${rows.length} Plätzen belegt (Nacht ${fmtDay(ui.date)})`} />
          <button className="btn primary small" onClick={() => setOpen({ b: blank('garage', { resourceId: freeResources(d, 'garage', garageRange(ui.date, addDays(ui.date, 1)))[0]?.id ?? rows[0]?.id ?? '', ...garageRange(ui.date, addDays(ui.date, 1)) }), isNew: true })}><Plus />Buchung</button>
        </div>
        {!rows.length ? <p className="muted pad">Noch keine Stellplätze – in Einstellungen → Module anlegen.</p>
          : <ResourceGrid mod="garage" rows={rows} cols={cols} colW={58} sub={r => (r.ev ? '⚡ Ladeplatz' : '')}
            onEmpty={(r, c) => setOpen({ b: blank('garage', { resourceId: r.id, ...garageRange(c.day, addDays(c.day, 1)) }), isNew: true })}
            onOpen={b => setOpen({ b, isNew: false })}
            barText={b => `${byId(d.stays, b.stayId)?.roomNo ?? '?'}${b.plate ? ' · ' + b.plate : ''}${b.ev ? ' ⚡' : ''}`} />}
        <p className="muted pad" style={{ fontSize: 12 }}>Je Spalte eine Nacht (12–12 Uhr). Freies Feld antippen = neue Buchung, Balken antippen = bearbeiten.</p>
      </div>
      {open && <BookingDialog initial={open.b} isNew={open.isNew} onClose={() => setOpen(null)} />}
    </div>
  );
}

const halfOf = (c: GridCol): Half => (c.key.endsWith('vm') ? 'vm' : 'nm');

/** Buchung nach Drag & Drop speichern: Doppelbuchung abweisen, Hinweise (Gast nicht im Haus, Masseurin nicht da) bestätigen lassen */
function useBookingChange() {
  const d = useData();
  const store = useApp();
  return async (b: Booking, next: Booking | null, what: string) => {
    if (!next || (next.starts === b.starts && next.ends === b.ends && next.resourceId === b.resourceId)) return;
    const res = byId(d.hotelResources, next.resourceId);
    const clash = bookingConflicts(d, next);
    if (clash.length) return toast(`${res?.name ?? 'Belegt'}: in diesem Zeitraum schon gebucht (${clash.map(x => stayLabel(byId(d.stays, x.stayId))).join(', ')}).`, 'err');
    const warn = bookingWarnings(d, next);
    if (warn.length && !(await confirmDialog('Trotzdem ändern?', warn))) return;
    store.upsert('bookings', [next], [`${EXTRA_LABEL[next.module]} ${what}`, `${stayLabel(byId(d.stays, b.stayId))}: ${res?.name} ${next.starts.replace('T', ' ')}–${next.ends.replace('T', ' ')}`]);
  };
}

/* ---------- Fahrrad ---------- */
export function BikeView() {
  const d = useData();
  const ui = useUi();
  const [open, setOpen] = useState<{ b: Booking; isNew: boolean } | null>(null);
  const rows = resourcesOf(d, 'fahrrad');
  const cols = bikeCols(ui.date, 7);
  const change = useBookingChange();
  const add = (r: HotelResource | undefined, day: string, part: BikePart) =>
    setOpen({ b: blank('fahrrad', { resourceId: r?.id ?? '', part, ...bikeRange(day, part) }), isNew: true });
  return (
    <div className="extras">
      <div className="panel">
        <div className="xhead">
          <DateBar step={7} label={`${fmtDay(ui.date)} – ${fmtDay(addDays(ui.date, 6))}`} />
          <button className="btn primary small" onClick={() => add(freeResources(d, 'fahrrad', bikeRange(ui.date, 'tag'))[0] ?? rows[0], ui.date, 'tag')}><Plus />Buchung</button>
        </div>
        {!rows.length ? <p className="muted pad">Noch keine Fahrräder – in Einstellungen → Module anlegen.</p>
          : <ResourceGrid mod="fahrrad" rows={rows} cols={cols} colW={38} sub={r => [r.art, r.size].filter(Boolean).join(' · ')}
            onEmpty={(r, c) => add(r, c.day, c.key.endsWith('vm') ? 'vm' : 'nm')}
            onOpen={b => setOpen({ b, isNew: false })}
            onMove={(b, r, c) => change(b, movedBike(b, r.id, c.day, halfOf(c)), 'verschoben')}
            onResize={(b, edge, c) => change(b, resizedBike(b, edge, c.day, halfOf(c)), edge === 'start' ? 'Beginn geändert' : 'Ende geändert')}
            barText={b => `${byId(d.stays, b.stayId)?.roomNo ?? '?'}`} />}
        <p className="muted pad" style={{ fontSize: 12 }}>Je Tag Vormittag (8–13 Uhr) und Nachmittag (13–18 Uhr). Buchung ziehen = verschieben, am linken/rechten Rand ziehen = verkürzen oder verlängern.</p>
      </div>
      {open && <BookingDialog initial={open.b} isNew={open.isNew} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------- Massage ---------- */
export function MassageView() {
  const d = useData();
  const ui = useUi();
  const [tab, setTab] = useState<'tag' | 'anwesenheit'>('tag');
  const [open, setOpen] = useState<{ b: Booking; isNew: boolean } | null>(null);
  const rows = resourcesOf(d, 'massage');
  const cols = massageCols(ui.date);
  const therapy = d.therapies.filter(t => t.active).sort((a, b) => a.sort - b.sort)[0];
  const add = (r: HotelResource | undefined, start: string) => setOpen({ b: blank('massage', {
    resourceId: r?.id ?? '', therapyId: therapy?.id ?? null, price: therapy?.price ?? null, ...massageRange(ui.date, start, therapy?.duration ?? 50) }), isNew: true });
  const change = useBookingChange();
  const day = d.bookings.filter(b => b.module === 'massage' && b.starts.startsWith(ui.date)).sort((a, b) => a.starts.localeCompare(b.starts));
  const sum = day.reduce((a, b) => a + (b.price ?? 0), 0);
  return (
    <div className="extras">
      <div className="seg" role="tablist" aria-label="Ansicht">
        <button role="tab" className="btn" aria-selected={tab === 'tag'} aria-pressed={tab === 'tag'} onClick={() => setTab('tag')}>Tagesplan</button>
        <button role="tab" className="btn" aria-selected={tab === 'anwesenheit'} aria-pressed={tab === 'anwesenheit'} onClick={() => setTab('anwesenheit')}>Anwesenheit</button>
      </div>
      {tab === 'tag' ? (
        <div className="panel">
          <div className="xhead">
            <DateBar step={1} label={`${day.length} Behandlungen · ${sum.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`} />
            <button className="btn primary small" onClick={() => add(rows[0], '09:00')}><Plus />Buchung</button>
          </div>
          {!rows.length ? <p className="muted pad">Noch keine Masseurinnen – in Einstellungen → Module anlegen.</p>
            : <ResourceGrid mod="massage" rows={rows} cols={cols} colW={34} rowH={84}
              sub={r => { const p = d.presence.find(x => x.resourceId === r.id && x.date === ui.date); return p ? `${p.start}–${p.end}` : 'nicht da'; }}
              cellClass={(r, c) => (presentFor(d, r.id, c) ? 'on' : 'off')}
              onEmpty={(r, c) => add(r, c.key)} onOpen={b => setOpen({ b, isNew: false })}
              onMove={(b, r, c) => change(b, movedMassage(b, r.id, c.day, c.key), 'verschoben')}
              onResize={(b, edge, c) => change(b, resizedMassage(b, edge, c), edge === 'start' ? 'Beginn geändert' : 'Ende geändert')}
              barText={b => [b.starts.slice(11), `Zi. ${byId(d.stays, b.stayId)?.roomNo ?? '?'}`, byId(d.therapies, b.therapyId)?.name ?? ''].filter(Boolean).join('\n')} />}
          {day.length > 0 && <ul className="xlist">{day.map(b => (
            <li key={b.id}><button className="btn ghost small" onClick={() => setOpen({ b, isNew: false })}>
              <b>{b.starts.slice(11)}–{b.ends.slice(11)}</b> {byId(d.hotelResources, b.resourceId)?.name} · {stayLabel(byId(d.stays, b.stayId))} · {byId(d.therapies, b.therapyId)?.name ?? 'Behandlung'}
              {b.price != null && <span className="muted"> · {b.price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>}</button></li>))}</ul>}
        </div>
      ) : <PresenceWeek />}
      {open && <BookingDialog initial={open.b} isNew={open.isNew} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Anwesenheit der Masseurinnen je Wochentag (von–bis; leer = nicht da) */
function PresenceWeek() {
  const d = useData();
  const ui = useUi();
  const store = useApp();
  const mon = weekMonday(ui.date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const rows = resourcesOf(d, 'massage');
  const save = (r: HotelResource, date: string, p: Presence | undefined, field: 'start' | 'end', v: string) => {
    const next = { id: p?.id ?? newId(), resourceId: r.id, date, start: p?.start ?? '09:00', end: p?.end ?? '17:00', [field]: v };
    if (!v) { if (p) store.remove('presence', [p.id], ['Anwesenheit gelöscht', `${r.name} ${fmtDay(date)}`]); return; }
    if (next.end <= next.start) return;
    store.upsert('presence', [next], ['Anwesenheit', `${r.name} ${fmtDay(date)} ${next.start}–${next.end}`]);
  };
  return (
    <div className="panel">
      <div className="xhead"><DateBar step={7} label={`Woche ab ${fmtDay(mon)}`} /></div>
      <div className="table-scroll">
        <table className="presence">
          <thead><tr><th>Masseurin</th>{days.map(x => <th key={x}>{fmtDay(x)}</th>)}</tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}><th>{r.name}</th>{days.map(x => {
              const p = d.presence.find(y => y.resourceId === r.id && y.date === x);
              return <td key={x} className={p ? 'on' : ''}>
                <input type="time" step={900} aria-label={`${r.name} ${fmtDay(x)} von`} defaultValue={p?.start ?? ''} key={'s' + (p?.start ?? '') + x} onBlur={e => e.target.value !== (p?.start ?? '') && save(r, x, p, 'start', e.target.value)} />
                <input type="time" step={900} aria-label={`${r.name} ${fmtDay(x)} bis`} defaultValue={p?.end ?? ''} key={'e' + (p?.end ?? '') + x} onBlur={e => e.target.value !== (p?.end ?? '') && save(r, x, p, 'end', e.target.value)} />
              </td>;
            })}</tr>))}</tbody>
        </table>
      </div>
      <p className="muted pad" style={{ fontSize: 12 }}>Uhrzeit von–bis je Tag eintragen; „von“ leeren = an diesem Tag nicht da. Buchungen außerhalb der Anwesenheit sind möglich, es kommt aber ein Hinweis.</p>
    </div>
  );
}

/* ---------- Buchung ---------- */
function BookingDialog({ initial, isNew, onClose }: { initial: Booking; isNew: boolean; onClose: () => void }) {
  const d = useData();
  const store = useApp();
  const user = useApp(s => s.user!);
  const mod = initial.module;
  const [b, setB] = useState<Booking>(initial);
  const [err, setErr] = useState('');
  // Eingabefelder je Modul (daraus ergeben sich starts/ends)
  const g = garageDays(initial);
  const [from, setFrom] = useState(g.from);
  const [to, setTo] = useState(mod === 'garage' ? g.to : g.from);
  const [start, setStart] = useState(initial.starts.slice(11));
  // Fahrrad: von (Tag, Halbtag) bis (Tag, Halbtag)
  const h0 = bikeHalves(initial);
  const [fromHalf, setFromHalf] = useState<Half>(h0.fromHalf);
  const [bikeTo, setBikeTo] = useState(h0.toDay);
  const [toHalf, setToHalf] = useState<Half>(h0.toHalf);
  const therapy = byId(d.therapies, b.therapyId);
  const range = mod === 'garage' ? garageRange(from, to < from ? from : to) : mod === 'fahrrad' ? bikeSpan(from, fromHalf, bikeTo < from ? from : bikeTo, toHalf) : massageRange(from, start, therapy?.duration ?? 50);
  const cur: Booking = { ...b, ...range };
  const conflicts = cur.resourceId ? bookingConflicts(d, cur) : [];
  const stays = staysBetween(d, from, mod === 'garage' ? to : mod === 'fahrrad' ? bikeTo : from);
  const resources = resourcesOf(d, mod, true).filter(r => r.active || r.id === b.resourceId);
  const busy = (r: HotelResource) => bookingConflicts(d, { ...cur, resourceId: r.id }).length > 0;
  const set = (x: Partial<Booking>) => { setB(v => ({ ...v, ...x })); setErr(''); };
  const label = stayLabel(byId(d.stays, cur.stayId));

  const save = async () => {
    if (!cur.stayId) return setErr('Bitte einen Hotelgast wählen.');
    if (!cur.resourceId) return setErr('Bitte auswählen, was gebucht wird.');
    if (mod === 'garage' && to < from) return setErr('„Bis“ liegt vor „Von“.');
    if (conflicts.length) return setErr(`Bereits gebucht: ${conflicts.map(x => stayLabel(byId(d.stays, x.stayId))).join(', ')}.`);
    const warn = bookingWarnings(d, cur);
    if (warn.length && !(await confirmDialog('Trotzdem speichern?', warn))) return;
    const row = { ...cur, createdBy: cur.createdBy || user.name };
    if (await store.upsert('bookings', [row], [isNew ? `${EXTRA_LABEL[mod]} gebucht` : `${EXTRA_LABEL[mod]}-Buchung geändert`, `${label} · ${byId(d.hotelResources, row.resourceId)?.name}`])) onClose();
  };
  const del = async () => {
    if (!(await confirmDialog('Buchung löschen?', [label, byId(d.hotelResources, b.resourceId)?.name ?? ''], 'Löschen', true))) return;
    if (await store.remove('bookings', [b.id], [`${EXTRA_LABEL[mod]}-Buchung gelöscht`, label])) onClose();
  };

  return (
    <Modal title={`${EXTRA_LABEL[mod]} – ${isNew ? 'neue Buchung' : 'Buchung'}`} onClose={onClose} width={520} footer={<>
      {!isNew && <button className="btn danger" onClick={del}><Trash2 />Löschen</button>}
      <span className="spacer" />
      <button className="btn" onClick={onClose}>Abbrechen</button>
      <button className="btn primary" onClick={save}>Speichern</button></>}>
      <div className="xform">
        {mod === 'garage' ? <>
          <label>Von<input type="date" value={from} onChange={e => { const v = e.target.value; if (!v) return; setFrom(v); if (to <= v) setTo(addDays(v, 1)); setErr(''); }} /></label>
          <label>Bis<input type="date" value={to} min={from} onChange={e => { if (e.target.value) { setTo(e.target.value); setErr(''); } }} /></label>
        </> : mod === 'fahrrad' ? <>
          <label>Von<span className="row" style={{ gap: 6 }}><input type="date" value={from} onChange={e => { const v = e.target.value; if (!v) return; setFrom(v); if (bikeTo < v) setBikeTo(v); setErr(''); }} />
            <select aria-label="Von Halbtag" value={fromHalf} onChange={e => { setFromHalf(e.target.value as Half); setErr(''); }}><option value="vm">Vormittag</option><option value="nm">Nachmittag</option></select></span></label>
          <label>Bis<span className="row" style={{ gap: 6 }}><input type="date" value={bikeTo} min={from} onChange={e => { if (e.target.value) { setBikeTo(e.target.value); setErr(''); } }} />
            <select aria-label="Bis Halbtag" value={toHalf} onChange={e => { setToHalf(e.target.value as Half); setErr(''); }}><option value="vm">Vormittag</option><option value="nm">Nachmittag</option></select></span></label>
        </> : <label>Datum<input type="date" value={from} onChange={e => { if (e.target.value) { setFrom(e.target.value); setErr(''); } }} /></label>}
        {mod === 'fahrrad' && <p className="muted wide" style={{ margin: 0, fontSize: 12 }}>{cur.starts.replace('T', ' ')} – {cur.ends.replace('T', ' ')} Uhr{cur.part ? ` · ${BIKE_PARTS[cur.part].label}` : ''}</p>}
        {mod === 'massage' && <>
          <label>Therapie<select value={b.therapyId ?? ''} onChange={e => { const t = byId(d.therapies, e.target.value); set({ therapyId: e.target.value || null, price: t ? t.price : b.price }); }}>
            <option value="">– wählen –</option>
            {d.therapies.filter(t => t.active || t.id === b.therapyId).map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration} min · {t.price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })})</option>)}</select></label>
          <label>Beginn<input type="time" step={300} value={start} onChange={e => { if (e.target.value) { setStart(e.target.value); setErr(''); } }} /></label>
        </>}
        <label className="wide">Hotelgast<select value={b.stayId} onChange={e => set({ stayId: e.target.value })}>
          <option value="">– Zimmer wählen –</option>
          {stays.map(s => <option key={s.id} value={s.id}>{stayLabel(s)}</option>)}
          {b.stayId && !stays.some(s => s.id === b.stayId) && <option value={b.stayId}>{label} (nicht im Haus)</option>}
        </select></label>
        <label className="wide">{mod === 'garage' ? 'Stellplatz' : mod === 'massage' ? 'Masseurin' : 'Fahrrad'}
          <select value={b.resourceId} onChange={e => set({ resourceId: e.target.value })}>
            {!b.resourceId && <option value="">– wählen –</option>}
            {resources.map(r => <option key={r.id} value={r.id}>{r.name}{r.ev ? ' ⚡' : ''}{r.art ? ` (${[r.art, r.size].filter(Boolean).join(', ')})` : ''}{busy(r) ? ' – belegt' : ''}</option>)}
          </select></label>
        {mod === 'garage' && <>
          <label>Kennzeichen<input value={b.plate} maxLength={20} placeholder="z. B. BZ 123 AB" onChange={e => set({ plate: e.target.value.toUpperCase() })} /></label>
          <label className="chk" style={{ alignSelf: 'end' }}><input type="checkbox" checked={b.ev} onChange={e => {
            const ev = e.target.checked, res = byId(d.hotelResources, b.resourceId);
            // E-Auto: freien Ladeplatz vorschlagen
            const pick = ev && !res?.ev ? freeResources(d, 'garage', cur, { ignoreId: b.id, ev: true }).find(r => r.ev) : undefined;
            set({ ev, ...(pick ? { resourceId: pick.id } : {}) });
          }} /> E-Auto</label>
        </>}
        {mod === 'massage' && <label>Preis €<input type="number" min={0} step="0.5" value={b.price ?? ''} onChange={e => set({ price: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
        <label className="wide">Notiz<input value={b.note} maxLength={300} onChange={e => set({ note: e.target.value })} /></label>
      </div>
      {mod === 'massage' && <p className="muted" style={{ fontSize: 12 }}>{cur.starts.slice(11)}–{cur.ends.slice(11)} Uhr</p>}
      {conflicts.length > 0 && !err && <p className="warnbox">Belegt durch {conflicts.map(x => stayLabel(byId(d.stays, x.stayId))).join(', ')} – bitte anders wählen.</p>}
      {err && <p className="warnbox" role="alert">{err}</p>}
    </Modal>
  );
}
