/** Live-Tischplan: Raumplan mit Status, Reservierungsliste, Walk-ins */
import { useMemo } from 'react';
import { Clock, Plus, PersonStanding } from 'lucide-react';
import { canEdit, SEATED_STATES } from '../domain/constants';
import { byId, isCancelled, occupies, persons, resStart, tableStatusAt } from '../domain/logic';
import { fromMin, nowMin, today, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useRoomId, useServiceId } from '../store/hooks';
import { useUi } from '../store/ui';
import { openDialog } from '../store/dialogs';
import { dropTableId, startDrag } from '../ui/drag';
import { FloorPlan, Legend } from '../ui/FloorPlan';
import { saveChecked } from '../forms/actions';
import { ResItem } from './ResItem';

export function LiveView() {
  const d = useData();
  const role = useApp(s => s.user!.role);
  const ui = useUi();
  const serviceId = useServiceId();
  const roomId = useRoomId();
  const room = byId(d.rooms, roomId);
  const svc = byId(d.services, serviceId);
  const tm = ui.time;
  const edit = canEdit(role);

  const list = useMemo(() => d.reservations.filter(r => r.date === ui.date && r.serviceId === serviceId)
    .sort((a, b) => resStart(a) - resStart(b) || a.name.localeCompare(b.name)), [d.reservations, ui.date, serviceId]);
  const act = list.filter(r => !isCancelled(r));
  const covers = act.reduce((a, r) => a + persons(r), 0);
  const seated = act.filter(r => SEATED_STATES.includes(r.status)).reduce((a, r) => a + persons(r), 0);
  const unassigned = act.filter(r => !r.tableIds.length && r.status !== 'abgeschlossen').length;
  const freeNow = d.tables.filter(x => tableStatusAt(d, x, ui.date, serviceId, tm).st === 'frei').length;
  const shown = ui.liveActiveOnly ? list.filter(occupies) : list;
  const status = (tb: (typeof d.tables)[number]) => tableStatusAt(d, tb, ui.date, serviceId, tm);

  return (
    <div className="live">
      <div className="panel">
        <div className="roomtabs">
          {d.rooms.map(r => <button key={r.id} className="btn small" aria-pressed={r.id === roomId} onClick={() => ui.set({ roomId: r.id })}>{r.name}</button>)}
          <span className="spacer" />
          <label className="chk"><input type="checkbox" checked={ui.showStations} onChange={e => ui.set({ showStations: e.target.checked })} /> Reviere</label>
          <input type="time" value={fromMin(tm)} step={300} style={{ width: 'auto' }} aria-label="Uhrzeit" onChange={e => e.target.value && ui.set({ time: toMin(e.target.value), follow: false })} />
          <button className="btn small" aria-pressed={ui.follow} onClick={() => ui.set({ follow: true, date: today(), time: nowMin(), serviceId: null })}><Clock />Jetzt</button>
        </div>
        <div className="plan-wrap">
          {room ? <FloorPlan data={d} room={room} mode="live" showStations={ui.showStations} status={status}
            onTableDown={(e, tb) => {
              const s = status(tb);
              startDrag(e, {
                label: s.r ? `${s.r.name} → ?` : tb.name,
                onClick: () => openDialog({ type: 'table', tableId: tb.id }),
                onDrop: el => {
                  const to = dropTableId(el);
                  if (!s.r || !edit || !to || to === tb.id) return;
                  saveChecked({ ...s.r, tableIds: s.r.tableIds.map(x => (x === tb.id ? to : x)) }, s.r, ['Tisch gewechselt', `${s.r.name} → ${byId(d.tables, to)?.name}`]);
                }
              });
            }} /> : <p className="muted">Kein Raum angelegt.</p>}
        </div>
        <Legend />
      </div>
      <div className="panel">
        <div className="kpis">
          <div className="kpi"><b>{act.length}</b><small>Reserv.</small></div>
          <div className="kpi"><b>{covers}</b><small>Gäste</small></div>
          <div className="kpi"><b>{seated}</b><small>im Haus</small></div>
          <div className="kpi"><b>{freeNow}</b><small>Tische frei</small></div>
          <div className="kpi" style={unassigned ? { color: 'var(--danger)' } : undefined}><b>{unassigned}</b><small>ohne Tisch</small></div>
        </div>
        <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
          {edit && <><button className="btn primary" onClick={() => openDialog({ type: 'reservation', preset: {} })}><Plus />Reservierung</button>
            <button className="btn" onClick={() => openDialog({ type: 'walkin' })}><PersonStanding />Walk-in</button></>}
          <label className="chk"><input type="checkbox" checked={ui.liveActiveOnly} onChange={e => ui.set({ liveActiveOnly: e.target.checked })} /> nur aktive</label>
        </div>
        <div className="reslist">
          {shown.length ? shown.map(r => (
            <ResItem key={r.id} d={d} r={r} onPointerDown={e => startDrag(e, {
              label: `${r.name} (${persons(r)}P)`,
              onClick: () => openDialog(edit ? { type: 'reservation', r } : { type: 'resinfo', id: r.id }),
              onDrop: el => { const to = dropTableId(el); if (to && edit) saveChecked({ ...r, tableIds: [to] }, r, ['Tisch zugewiesen', `${r.name} → ${byId(d.tables, to)?.name}`]); }
            })} />
          )) : <p className="muted" style={{ padding: 12 }}>Keine Reservierungen für {svc?.name}.</p>}
        </div>
        {edit && <p className="muted" style={{ fontSize: 12, padding: '8px 12px', margin: 0 }}>Tipp: Reservierung aus der Liste auf einen Tisch ziehen.</p>}
      </div>
    </div>
  );
}
