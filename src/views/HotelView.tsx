/** Hotelgäste: Anreise/Abreise, Gäste ohne Tisch, feste Tische per Ziehen */
import { ChevronLeft, ChevronRight, Plus, Upload } from 'lucide-react';
import { byId, isBlocked, isInHouse, needsTable, occupies, tableNames, type TableStatus } from '../domain/logic';
import type { DiningTable, Stay } from '../domain/types';
import { addDays, fmtShort, today } from '../lib/time';
import { useData, useRoomId } from '../store/hooks';
import { useUi } from '../store/ui';
import { openDialog } from '../store/dialogs';
import { dropTableId, startDrag } from '../ui/drag';
import { toast } from '../ui/notify';
import { FloorPlan } from '../ui/FloorPlan';
import { assignStayTable } from '../forms/HotelForms';

export function HotelView() {
  const d = useData();
  const ui = useUi();
  const D = ui.hotelDate;
  const roomId = useRoomId();
  const room = byId(d.rooms, roomId);
  const inHouse = d.stays.filter(s => isInHouse(s, D)).sort((a, b) => a.roomNo.localeCompare(b.roomNo, 'de', { numeric: true }));
  const arrivals = d.stays.filter(s => s.arrival === D), departures = d.stays.filter(s => s.departure === D);
  const open = inHouse.filter(s => needsTable(d, s) && !s.tableIds.length);
  const dinner = d.services.find(s => s.kind === 'abend') ?? d.services[0];
  const status = (tb: DiningTable): TableStatus => {
    const st = inHouse.find(s => s.tableIds.includes(tb.id));
    if (st) return { st: 'reserviert', r: { id: st.id, name: st.name, time: 'Zi.' + st.roomNo, adults: st.adults, children: st.children, stayId: st.id, allergies: st.allergies, vip: st.vip, tableIds: st.tableIds } as any };
    const ext = d.reservations.find(r => r.date === D && r.serviceId === dinner?.id && occupies(r) && !r.stayId && r.tableIds.includes(tb.id));
    if (ext) return { st: 'bald', r: ext };
    if (dinner && isBlocked(d, tb.id, D, dinner.id)) return { st: 'gesperrt' };
    return { st: 'frei' };
  };
  const StayTable = ({ list, empty }: { list: Stay[]; empty: string }) => list.length ? (
    <div className="table-scroll"><table className="list"><thead><tr><th>Zi.</th><th>Name</th><th>P</th><th>VP</th><th>Aufenthalt</th><th>Tisch</th><th>Hinweis</th></tr></thead>
      <tbody>{list.map(s => (
        <tr key={s.id} className="clickable" onClick={() => openDialog({ type: 'stay', stay: s })}>
          <td><b>{s.roomNo}</b></td><td>{s.vip ? '★ ' : ''}{s.name}</td><td>{s.adults}{s.children ? '+' + s.children : ''}</td>
          <td><span className="badge">{s.board}</span></td><td style={{ fontSize: 12 }}>{fmtShort(s.arrival)} – {fmtShort(s.departure)}</td>
          <td>{s.tableIds.length ? tableNames(d, s.tableIds) : needsTable(d, s) ? <b style={{ color: 'var(--danger)' }}>fehlt</b> : <span className="muted">frei</span>}</td>
          <td style={{ fontSize: 12 }}>{s.allergies && '⚠ ' + s.allergies}</td>
        </tr>))}</tbody></table></div>
  ) : <p className="muted" style={{ padding: '0 14px' }}>{empty}</p>;

  return (
    <div className="hotel">
      <div className="panel">
        <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
          <button className="btn small icon" aria-label="Vortag" title="Vortag" onClick={() => ui.set({ hotelDate: addDays(D, -1) })}><ChevronLeft /></button>
          <input type="date" value={D} style={{ width: 'auto' }} onChange={e => e.target.value && ui.set({ hotelDate: e.target.value })} />
          <button className="btn small icon" aria-label="Folgetag" title="Folgetag" onClick={() => ui.set({ hotelDate: addDays(D, 1) })}><ChevronRight /></button>
          <button className="btn small" onClick={() => ui.set({ hotelDate: today() })}>Heute</button>
          <span className="spacer" />
          <button className="btn" onClick={() => openDialog({ type: 'stayimport' })}><Upload />CSV-Import</button>
          <button className="btn primary" onClick={() => openDialog({ type: 'stay' })}><Plus />Aufenthalt</button>
        </div>
        <div className="kpis">
          <div className="kpi"><b>{inHouse.length}</b><small>Zimmer belegt</small></div>
          <div className="kpi"><b>{inHouse.reduce((a, s) => a + s.adults + s.children, 0)}</b><small>Gäste im Haus</small></div>
          <div className="kpi"><b>{inHouse.filter(s => s.board === 'HP').length}/{inHouse.filter(s => s.board === 'VP' || s.board === 'AI').length}</b><small>HP / VP+AI</small></div>
          <div className="kpi"><b>{arrivals.length}</b><small>Anreisen</small></div>
          <div className="kpi"><b>{departures.length}</b><small>Abreisen</small></div>
          <div className="kpi" style={open.length ? { color: 'var(--danger)' } : undefined}><b>{open.length}</b><small>ohne Tisch</small></div>
        </div>
        <div className="body">
          <h4 style={{ margin: '0 0 6px' }}>Ohne festen Tisch – auf den Plan ziehen</h4>
          <div>{open.length ? open.map(s => (
            <span key={s.id} className="stay-chip" data-chip={s.id} onPointerDown={e => startDrag(e, {
              label: `Zi. ${s.roomNo} ${s.name}`, onClick: () => openDialog({ type: 'stay', stay: s }),
              onDrop: el => { const tid = dropTableId(el); if (tid) assignStayTable(d, s, [tid]); }
            })}>Zi. {s.roomNo} · {s.name} · {s.adults + s.children}P · {s.board}</span>
          )) : <span className="muted">Alle Gäste mit Verpflegung haben einen Tisch. ✓</span>}</div>
        </div>
        <h3 style={{ borderTop: '1px solid var(--line)' }}>Anreisen {fmtShort(D)}</h3><StayTable list={arrivals} empty="Keine Anreisen." />
        <h3 style={{ borderTop: '1px solid var(--line)' }}>Abreisen {fmtShort(D)}</h3><StayTable list={departures} empty="Keine Abreisen." />
        <h3 style={{ borderTop: '1px solid var(--line)' }}>Im Haus</h3><StayTable list={inHouse} empty="Keine Gäste im Haus." />
      </div>
      <div className="panel">
        <h3>Feste Tische · {dinner?.name} {fmtShort(D)}</h3>
        <div className="roomtabs">{d.rooms.map(r => <button key={r.id} className="btn small" aria-pressed={r.id === roomId} onClick={() => ui.set({ roomId: r.id })}>{r.name}</button>)}</div>
        <div className="plan-wrap">{room && <FloorPlan data={d} room={room} mode="assign" status={status} onTableDown={(e, tb) => {
          const s = status(tb);
          const st = s.r?.stayId ? byId(d.stays, s.r.stayId) : undefined;
          startDrag(e, {
            label: st ? `Zi. ${st.roomNo} → ?` : tb.name,
            onClick: () => st ? openDialog({ type: 'stay', stay: st }) : s.r ? openDialog({ type: 'reservation', r: s.r }) : toast(`${tb.name}: frei am ${fmtShort(D)}`),
            onDrop: el => { const to = dropTableId(el); if (st && to && to !== tb.id) assignStayTable(d, st, st.tableIds.map(x => (x === tb.id ? to : x))); }
          });
        }} />}</div>
        <div className="legend"><span><i style={{ background: 'var(--st-reserviert)' }} />Hotelgast (fester Tisch)</span><span><i style={{ background: 'var(--st-bald)' }} />Externe Reservierung</span>
          <span><i style={{ background: 'var(--st-frei)' }} />frei</span><span>Ziehen: Gast-Chip → Tisch, oder Tisch → anderer Tisch</span></div>
      </div>
    </div>
  );
}
