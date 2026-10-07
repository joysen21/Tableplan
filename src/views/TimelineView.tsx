/** Zeitleiste (Gantt): Tische × Uhrzeit, Balken verschieben / Dauer ändern */
import { useRef, type PointerEvent as RPE } from 'react';
import { Plus } from 'lucide-react';
import { canEdit, RES_STATUS_COLOR } from '../domain/constants';
import { byId, checkReservation, isBlocked, occupies, persons, resEnd, resStart } from '../domain/logic';
import type { Reservation } from '../domain/types';
import { fmtDate, fromMin, nowMin, overlaps as overlapsRange, snap, today, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useServiceId, useTick } from '../store/hooks';
import { useUi } from '../store/ui';
import { openDialog } from '../store/dialogs';
import { dragState, startDragOrTap } from '../ui/drag';
import { saveChecked } from '../forms/actions';

const PX = 2.2; // Pixel pro Minute

export function TimelineView() {
  const d = useData();
  const role = useApp(s => s.user!.role);
  const ui = useUi();
  const serviceId = useServiceId();
  const svc = byId(d.services, serviceId);
  const scroller = useRef<HTMLDivElement>(null);
  useTick(60000);
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
    // Touch: Wischen scrollt die Zeitleiste, Antippen öffnet die Reservierung (Ändern dann im Dialog)
    if (e.pointerType === 'touch') return startDragOrTap(e, { label: r.name, onClick: () => openDialog(edit ? { type: 'reservation', r } : { type: 'resinfo', id: r.id }) });
    const el = e.currentTarget;
    if (!edit) { const up = () => { window.removeEventListener('pointerup', up); openDialog({ type: 'resinfo', id: r.id }); }; window.addEventListener('pointerup', up); return; }
    e.preventDefault();
    const resize = (e.target as HTMLElement).classList.contains('rs');
    const sx = e.clientX, sy = e.clientY, w0 = el.offsetWidth; let moved = false;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true; dragState.active = true;
      if (resize) el.style.width = Math.max(20, w0 + dx) + 'px';
      else { el.style.transform = `translate(${snap(dx, 15 * PX)}px, ${dy}px)`; el.classList.add('dragging'); }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      setTimeout(() => { dragState.active = false; }, 0);
      const reset = () => { el.style.transform = ''; el.style.width = ''; el.classList.remove('dragging'); };
      if (!moved) return openDialog({ type: 'reservation', r });
      const dx = ev.clientX - sx;
      if (resize) {
        const duration = Math.max(15, snap((w0 + dx) / PX, 15));
        return void saveChecked({ ...r, duration }, r, ['Dauer geändert', `${r.name}: ${duration} Min.`]).then(reset);
      }
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.g-row') as HTMLElement | null;
      const dMin = snap(dx / PX, 15);
      let tableIds = r.tableIds;
      if (row?.dataset.tableId && row.dataset.tableId !== fromTable) tableIds = fromTable ? r.tableIds.map(q => (q === fromTable ? row.dataset.tableId! : q)) : [row.dataset.tableId];
      else if (row?.dataset.unassigned) tableIds = [];
      saveChecked({ ...r, time: fromMin(resStart(r) + dMin), tableIds }, r, ['In Zeitleiste verschoben', `${r.name} → ${fromMin(resStart(r) + dMin)}`]).then(reset);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  const Bar = ({ r, tid }: { r: Reservation; tid: string }) => {
    const issues = checkReservation(d, r).filter(i => i.level === 'error' || i.text.includes('gesperrt') || i.text.includes('zu klein'));
    return (
      <div className={'g-bar' + (issues.length ? ' conflict' : '')} data-res={r.id} onPointerDown={e => onBarDown(e, r, tid)}
        title={`${r.name} · ${persons(r)}P · ${r.time}–${fromMin(resEnd(r))}${issues.length ? '\n' + issues.map(i => i.text).join('\n') : ''}`}
        style={{ left: x(resStart(r)), width: Math.max(18, r.duration * PX - 2), background: RES_STATUS_COLOR[r.status] }}>
        {r.stayId ? '⌂ ' : ''}{r.vip ? '★ ' : ''}{r.name} · {persons(r)}P{r.allergies ? ' ⚠' : ''}{edit && <span className="rs" />}
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
        <span className="muted" style={{ fontSize: 13 }}>{edit ? <><span className="tip-desktop">Balken ziehen = Uhrzeit/Tisch ändern · rechten Rand ziehen = Dauer · Klick = bearbeiten</span><span className="tip-touch">Balken antippen = bearbeiten</span></> : 'Klick auf Balken = Details'}</span>
        <span className="spacer" />{edit && <button className="btn primary" onClick={() => openDialog({ type: 'reservation', preset: {} })}><Plus />Reservierung</button>}
      </div>
      <div className="gantt" ref={scroller}>
        <div className="g-head"><div className="g-label muted">Tisch</div><div className="g-track" style={{ width: W }}><Ticks labels /></div></div>
        <div className="g-row group"><div className="g-label" style={{ color: 'var(--danger)' }}>Ohne Tisch ({unassigned.length})</div><div className="g-track" style={{ width: W }} /></div>
        {(lanes.length ? lanes : [[]]).map((l, i) => (
          <div key={'u' + i} className="g-row" data-unassigned="1"><div className="g-label muted">—</div>
            <div className="g-track" style={{ width: W }}><Ticks />{nowLine}{l.map(r => <Bar key={r.id} r={r} tid="" />)}</div></div>
        ))}
        {d.rooms.map(room => (
          <div key={room.id}>
            <div className="g-row group"><div className="g-label">{room.name}</div><div className="g-track" style={{ width: W }} /></div>
            {d.tables.filter(tb => tb.roomId === room.id).map(tb => {
              const bl = isBlocked(d, tb.id, ui.date, serviceId);
              const st = byId(d.stations, tb.stationId);
              return (
                <div key={tb.id} className="g-row" data-table-id={tb.id}>
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
