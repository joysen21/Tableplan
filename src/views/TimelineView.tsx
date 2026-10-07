/** Zeitleiste (Gantt): Tische × Uhrzeit, Balken verschieben / Dauer ändern */
import { useEffect, useRef, useState, type MouseEvent as RME, type PointerEvent as RPE } from 'react';
import { hasAllergy } from '../domain/menu';
import { Plus } from 'lucide-react';
import { canEdit, RES_STATUS_COLOR } from '../domain/constants';
import { byId, checkReservation, isBlocked, occupies, persons, resEnd, resStart } from '../domain/logic';
import type { Reservation } from '../domain/types';
import { fmtDate, fromMin, nowMin, overlaps as overlapsRange, snap, today, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useServiceId, useTick } from '../store/hooks';
import { useUi } from '../store/ui';
import { openDialog } from '../store/dialogs';
import { dragState } from '../ui/drag';
import { saveChecked } from '../forms/actions';

const PX = 2.2; // Pixel pro Minute
const LONG_PRESS = 400; // ms – so lange drücken, bis ein Balken am Handy gezogen werden kann

export function TimelineView() {
  const d = useData();
  const role = useApp(s => s.user!.role);
  const ui = useUi();
  const serviceId = useServiceId();
  const svc = byId(d.services, serviceId);
  const scroller = useRef<HTMLDivElement>(null);
  const touchDrag = useRef(false);
  const [mark, setMark] = useState<string | null>(null);
  useTick(60000);
  // Am Handy: solange ein Balken gezogen wird, darf die Geste nicht scrollen. Der Listener muss schon beim
  // Antippen hängen (nicht passiv), sonst entscheidet der Browser vorab fürs Scrollen.
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const block = (ev: TouchEvent) => { if (touchDrag.current && ev.cancelable) ev.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [svc?.id]);
  // Beim Öffnen / Tageswechsel: heute zur aktuellen Uhrzeit scrollen, sonst zum Anfang
  useEffect(() => {
    const el = scroller.current; if (!el || !svc) return;
    const start = toMin(svc.start) - 30, nm = nowMin();
    el.scrollLeft = ui.date === today() && nm > start ? Math.max(0, (nm - 60 - start) * PX) : 0;
  }, [ui.date, svc?.id]);
  if (!svc) return <div className="panel body">Kein Service angelegt.</div>;
  const edit = canEdit(role);
  const from = toMin(svc.start) - 30;
  const to = Math.min(24 * 60, toMin(svc.end) + Math.max(...svc.turnTimes.map(x => x.min), 60) - 30);
  const W = (to - from) * PX, x = (m: number) => (m - from) * PX;
  const dayRes = d.reservations.filter(r => r.date === ui.date && ((occupies(r) && overlapsRange(resStart(r), resEnd(r), from, to)) || (r.status === 'abgeschlossen' && r.serviceId === serviceId)));
  const ticks: number[] = []; for (let m = Math.ceil(from / 30) * 30; m < to; m += 30) ticks.push(m);
  const Ticks = ({ labels }: { labels?: boolean }) => <>{ticks.map(m => <div key={m} className={'g-tick' + (m % 60 ? ' half' : '')} style={{ left: x(m) }}>{labels && !(m % 60) ? fromMin(m) : ''}</div>)}</>;
  const nm = nowMin();
  const nowLine = ui.date === today() && nm > from && nm < to ? <div className="g-now" style={{ left: x(nm) }} /> : null;

  function onBarDown(e: RPE<HTMLDivElement>, r: Reservation, fromTable: string) {
    if (e.button > 0) return;
    const el = e.currentTarget, sx = e.clientX, sy = e.clientY;
    const open = () => openDialog(edit ? { type: 'reservation', r } : { type: 'resinfo', id: r.id });
    if (e.pointerType !== 'touch') e.preventDefault();
    if (!edit) {
      const up = (ev: PointerEvent) => { window.removeEventListener('pointerup', up); if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) open(); };
      return void window.addEventListener('pointerup', up);
    }
    if (e.pointerType !== 'touch') return dragBar(el, r, fromTable, sx, sy, (e.target as HTMLElement).classList.contains('rs'), false);
    // Touch: Wischen scrollt, Antippen öffnet, lange drücken hebt den Balken an – dann ziehen
    let timer = 0;
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cleanup); };
    const mv = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) cleanup(); };
    const up = (ev: PointerEvent) => { cleanup(); if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) open(); };
    timer = window.setTimeout(() => { cleanup(); navigator.vibrate?.(15); dragBar(el, r, fromTable, sx, sy, false, true); }, LONG_PRESS);
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cleanup);
  }

  /** Balken ziehen (Uhrzeit/Tisch) oder am rechten Rand die Dauer ändern. Die Zielzeile wird markiert,
   *  am Rand der Zeitleiste wird automatisch weitergescrollt. */
  function dragBar(el: HTMLDivElement, r: Reservation, fromTable: string, sx: number, sy: number, resize: boolean, touch: boolean) {
    const sc = scroller.current!, sl0 = sc.scrollLeft, st0 = sc.scrollTop, w0 = el.offsetWidth;
    let moved = touch, cx = sx, cy = sy, raf = 0, target: HTMLElement | null = null;
    if (touch) { touchDrag.current = true; dragState.active = true; el.classList.add('dragging', 'lifted'); }
    const offset = () => ({ dx: cx - sx + sc.scrollLeft - sl0, dy: cy - sy + sc.scrollTop - st0 });
    const paint = () => {
      const { dx, dy } = offset();
      if (resize) { el.style.width = Math.max(20, w0 + dx) + 'px'; return; }
      el.style.transform = `translate(${snap(dx, 15 * PX)}px, ${dy}px)`;
      const row = document.elementFromPoint(cx, cy)?.closest('.g-row:not(.group)') as HTMLElement | null;
      if (row !== target) { target?.classList.remove('drop-target'); row?.classList.add('drop-target'); target = row; }
    };
    const edgeScroll = () => {
      const rc = sc.getBoundingClientRect(), lw = (sc.querySelector('.g-label') as HTMLElement | null)?.offsetWidth ?? 0, z = 36;
      const vx = cx < rc.left + lw + z ? -10 : cx > rc.right - z ? 10 : 0;
      const vy = cy < rc.top + 28 + z ? -8 : cy > rc.bottom - z ? 8 : 0;
      const l = sc.scrollLeft, t = sc.scrollTop;
      if (vx || vy) { sc.scrollBy(vx, vy); if (sc.scrollLeft !== l || sc.scrollTop !== t) paint(); }
      raf = requestAnimationFrame(edgeScroll);
    };
    const mv = (ev: PointerEvent) => {
      cx = ev.clientX; cy = ev.clientY;
      if (!moved && Math.hypot(cx - sx, cy - sy) < 6) return;
      if (!moved) { moved = true; dragState.active = true; if (!resize) el.classList.add('dragging'); raf = requestAnimationFrame(edgeScroll); }
      paint();
    };
    if (touch) raf = requestAnimationFrame(edgeScroll);
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      cancelAnimationFrame(raf); touchDrag.current = false; target?.classList.remove('drop-target');
      setTimeout(() => { dragState.active = false; }, 0);
      const reset = () => { el.style.transform = ''; el.style.width = ''; el.classList.remove('dragging', 'lifted'); };
      if (ev.type === 'pointercancel') return reset();
      if (!moved) { reset(); return void openDialog({ type: 'reservation', r }); }
      cx = ev.clientX; cy = ev.clientY;
      const { dx } = offset();
      if (resize) {
        const duration = Math.max(15, snap((w0 + dx) / PX, 15));
        return void saveChecked({ ...r, duration }, r, ['Dauer geändert', `${r.name}: ${duration} Min.`]).then(reset);
      }
      const row = document.elementFromPoint(cx, cy)?.closest('.g-row') as HTMLElement | null;
      const dMin = snap(dx / PX, 15);
      let tableIds = r.tableIds;
      if (row?.dataset.tableId && row.dataset.tableId !== fromTable) tableIds = fromTable ? r.tableIds.map(q => (q === fromTable ? row.dataset.tableId! : q)) : [row.dataset.tableId];
      else if (row?.dataset.unassigned) tableIds = [];
      if (!dMin && tableIds === r.tableIds) return reset();
      saveChecked({ ...r, time: fromMin(resStart(r) + dMin), tableIds }, r, ['In Zeitleiste verschoben', `${r.name} → ${fromMin(resStart(r) + dMin)}`]).then(reset);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  }

  /** Zeile antippen/anklicken (nicht auf einem Balken) = markieren, nochmal = Markierung aufheben */
  const markRow = (key: string) => (e: RME) => { if (!(e.target as Element).closest('.g-bar')) setMark(m => (m === key ? null : key)); };
  const rowCls = (key: string) => 'g-row' + (mark === key ? ' marked' : '');

  const Bar = ({ r, tid }: { r: Reservation; tid: string }) => {
    const issues = checkReservation(d, r).filter(i => i.level === 'error' || i.text.includes('gesperrt') || i.text.includes('zu klein'));
    return (
      <div className={'g-bar' + (issues.length ? ' conflict' : '')} data-res={r.id} onPointerDown={e => onBarDown(e, r, tid)}
        title={`${r.name} · ${persons(r)}P · ${r.time}–${fromMin(resEnd(r))}${issues.length ? '\n' + issues.map(i => i.text).join('\n') : ''}`}
        style={{ left: x(resStart(r)), width: Math.max(18, r.duration * PX - 2), background: RES_STATUS_COLOR[r.status] }}>
        {r.stayId ? '⌂ ' : ''}{r.vip ? '★ ' : ''}{r.name} · {persons(r)}P{hasAllergy(r) ? ' ⚠' : ''}{edit && <span className="rs" />}
      </div>
    );
  };
  const unassigned = dayRes.filter(r => !r.tableIds.length && r.serviceId === serviceId).sort((a, b) => resStart(a) - resStart(b));
  const lanes: Reservation[][] = [];
  for (const r of unassigned) { let l = lanes.find(L => resStart(r) >= resEnd(L[L.length - 1])); if (!l) lanes.push((l = [])); l.push(r); }

  return (
    <div className="panel">
      <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <b>{svc.name} · {fmtDate(ui.date)}</b>
        <span className="muted" style={{ fontSize: 13 }}>{edit ? <><span className="tip-desktop">Balken ziehen = Uhrzeit/Tisch ändern · rechten Rand ziehen = Dauer · Klick = bearbeiten</span><span className="tip-touch">Antippen = bearbeiten · lange drücken und ziehen = Uhrzeit/Tisch ändern</span></> : 'Klick auf Balken = Details'}</span>
        <span className="spacer" />{edit && <button className="btn primary" onClick={() => openDialog({ type: 'reservation', preset: {} })}><Plus />Reservierung</button>}
      </div>
      <div className="gantt" ref={scroller}>
        <div className="g-head"><div className="g-label muted">Tisch</div><div className="g-track" style={{ width: W }}><Ticks labels /></div></div>
        <div className="g-row group"><div className="g-label" style={{ color: 'var(--danger)' }}>Ohne Tisch ({unassigned.length})</div><div className="g-track" style={{ width: W }} /></div>
        {(lanes.length ? lanes : [[]]).map((l, i) => (
          <div key={'u' + i} className={rowCls('u' + i)} data-unassigned="1" onClick={markRow('u' + i)}><div className="g-label muted">—</div>
            <div className="g-track" style={{ width: W }}><Ticks />{nowLine}{l.map(r => <Bar key={r.id} r={r} tid="" />)}</div></div>
        ))}
        {d.rooms.map(room => (
          <div key={room.id}>
            <div className="g-row group"><div className="g-label">{room.name}</div><div className="g-track" style={{ width: W }} /></div>
            {d.tables.filter(tb => tb.roomId === room.id).map(tb => {
              const bl = isBlocked(d, tb.id, ui.date, serviceId);
              const st = byId(d.stations, tb.stationId);
              return (
                <div key={tb.id} className={rowCls(tb.id)} data-table-id={tb.id} onClick={markRow(tb.id)}>
                  <div className="g-label"><i style={{ width: 8, height: 8, borderRadius: '50%', background: st?.color ?? 'transparent', display: 'inline-block' }} />
                    <b>{tb.name}</b><span className="muted">{tb.minPersons}–{tb.maxPersons}P</span>{bl && <span className="badge">gesperrt</span>}</div>
                  <div className="g-track" style={{ width: W, background: bl ? 'repeating-linear-gradient(45deg,transparent 0 8px,var(--panel2) 8px 16px)' : undefined }}>
                    <Ticks />{nowLine}{dayRes.filter(r => r.tableIds.includes(tb.id)).map(r => <Bar key={r.id} r={r} tid={tb.id} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
