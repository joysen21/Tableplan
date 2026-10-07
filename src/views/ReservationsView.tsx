/** Reservierungsliste mit Filtern und CSV-Export – am Handy als Karten nach Datum, Filter aufklappbar */
import { useState } from 'react';
import { Download, Plus, SlidersHorizontal } from 'lucide-react';
import { canEdit, RES_STATUS_COLOR, ALL_STATUS } from '../domain/constants';
import { byId, checkReservation, occupies, persons, resEnd, resStart, tableNames } from '../domain/logic';
import type { Reservation } from '../domain/types';
import { t } from '../lib/i18n';
import { addDays, fmtDate, fmtShort, fromMin } from '../lib/time';
import { downloadCSV } from '../lib/download';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { useUi, type ResFilter } from '../store/ui';
import { openDialog } from '../store/dialogs';
import { MOBILE, useMedia } from '../ui/media';
import { ResItem } from './ResItem';

export function ReservationsView() {
  const d = useData();
  const role = useApp(s => s.user!.role);
  const ui = useUi();
  const mobile = useMedia(MOBILE);
  const [showFilters, setShowFilters] = useState(false);
  const F: ResFilter = ui.resFilter ?? { from: ui.date, to: addDays(ui.date, 6), serviceId: '', status: 'aktiv', q: '', hotel: false, unassigned: false };
  const setF = (p: Partial<ResFilter>) => ui.set({ resFilter: { ...F, ...p } });
  const q = F.q.toLowerCase();
  const rows = d.reservations.filter(r => r.date >= F.from && r.date <= F.to && (!F.serviceId || r.serviceId === F.serviceId) &&
    (F.status === 'alle' || (F.status === 'aktiv' ? occupies(r) : r.status === F.status)) && (!F.hotel || r.stayId) && (!F.unassigned || !r.tableIds.length) &&
    (!q || [r.name, r.phone, r.email, r.notes, r.allergies].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => a.date.localeCompare(b.date) || resStart(a) - resStart(b));
  const exportCsv = () => downloadCSV('reservierungen.csv', [
    ['Datum', 'Zeit', 'Ende', 'Service', 'Name', 'Erw', 'Kinder', 'Tisch', 'Status', 'Quelle', 'Telefon', 'E-Mail', 'Allergien', 'Anlass', 'Notizen', 'Zimmer'],
    ...rows.map(r => [r.date, r.time, fromMin(resEnd(r)), byId(d.services, r.serviceId)?.name ?? '', r.name, r.adults, r.children, tableNames(d, r.tableIds),
      t(r.status), r.source, r.phone, r.email, r.allergies, r.occasion, r.notes, byId(d.stays, r.stayId)?.roomNo ?? ''])
  ]);
  const open = (r: Reservation) => openDialog(canEdit(role) ? { type: 'reservation', r } : { type: 'resinfo', id: r.id });
  const activeFilters = [F.serviceId, F.status !== 'aktiv', F.hotel, F.unassigned].filter(Boolean).length;

  const search = <label>Suche<input value={F.q} placeholder="Name, Telefon, Notiz…" onChange={e => setF({ q: e.target.value })} /></label>;
  const fields = <>
    <label>Von<input type="date" value={F.from} onChange={e => setF({ from: e.target.value })} /></label>
    <label>Bis<input type="date" value={F.to} onChange={e => setF({ to: e.target.value })} /></label>
    <label>Service<select value={F.serviceId} onChange={e => setF({ serviceId: e.target.value })}><option value="">alle</option>{d.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Status<select value={F.status} onChange={e => setF({ status: e.target.value })}>
      <option value="aktiv">aktive</option><option value="alle">alle</option>{ALL_STATUS.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>
  </>;
  const checks = <>
    <label className="chk" style={{ alignSelf: 'flex-end' }}><input type="checkbox" checked={F.hotel} onChange={e => setF({ hotel: e.target.checked })} /> nur Hotelgäste</label>
    <label className="chk" style={{ alignSelf: 'flex-end' }}><input type="checkbox" checked={F.unassigned} onChange={e => setF({ unassigned: e.target.checked })} /> nur ohne Tisch</label>
  </>;
  const actions = <>
    <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={exportCsv}><Download />CSV-Export</button>
    {canEdit(role) && <button className="btn primary" style={{ alignSelf: 'flex-end' }} onClick={() => openDialog({ type: 'reservation', preset: {} })}><Plus />Reservierung</button>}
  </>;
  const summary = <p className="muted" style={{ padding: '8px 14px', fontSize: 12 }}>{rows.length} Reservierungen · {rows.reduce((a, r) => a + persons(r), 0)} Gäste</p>;

  if (mobile) {
    const days = [...new Set(rows.map(r => r.date))];
    return (
      <div className="panel">
        <div className="filters filters-mobile">
          <div className="searchrow">
            {search}
            <button className="btn" aria-expanded={showFilters} aria-pressed={showFilters} onClick={() => setShowFilters(v => !v)}>
              <SlidersHorizontal />Filter{activeFilters > 0 && <span className="count">{activeFilters}</span>}</button>
          </div>
          {showFilters && <div className="filter-more">{fields}{checks}</div>}
          <div className="muted range">{fmtShort(F.from)} – {fmtShort(F.to)} · {rows.length} Reservierungen · {rows.reduce((a, r) => a + persons(r), 0)} Gäste</div>
          <div className="row">{actions}</div>
        </div>
        {days.map(day => (
          <section key={day} className="day-group">
            <h4 className="day-head">{fmtDate(day)}</h4>
            {rows.filter(r => r.date === day).map(r => <ResItem key={r.id} d={d} r={r} onClick={() => open(r)} />)}
          </section>
        ))}
        {!rows.length && <p className="muted" style={{ padding: 14 }}>Keine Treffer.</p>}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="filters">
        {fields}{search}{checks}
        <span className="spacer" />
        {actions}
      </div>
      <div style={{ overflow: 'auto' }}>
        <table className="list">
          <thead><tr><th>Datum</th><th>Zeit</th><th>Name</th><th>P</th><th>Tisch</th><th>Service</th><th>Status</th><th>Quelle</th><th>Hinweise</th></tr></thead>
          <tbody>{rows.map(r => {
            const issues = checkReservation(d, r);
            return (
              <tr key={r.id} className="clickable" onClick={() => open(r)}>
                <td>{fmtShort(r.date)}</td><td>{r.time}</td>
                <td>{r.vip ? '★ ' : ''}{r.name} {r.stayId && <span className="badge hotel">Hotel</span>}</td>
                <td>{persons(r)}</td>
                <td>{r.tableIds.length ? tableNames(d, r.tableIds) : <b style={{ color: 'var(--danger)' }}>–</b>}</td>
                <td>{byId(d.services, r.serviceId)?.name}</td>
                <td><span className="badge st" style={{ background: RES_STATUS_COLOR[r.status] }}>{t(r.status)}</span></td>
                <td>{r.source}</td>
                <td style={{ fontSize: 12 }}>{r.allergies && `⚠ ${r.allergies} `}{r.occasion && `🎉 ${r.occasion} `}{r.notes}
                  {issues.length > 0 && <div style={{ color: 'var(--danger)' }}>{issues.map(i => <div key={i.text}>{i.text}</div>)}</div>}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {!rows.length && <p className="muted" style={{ padding: 14 }}>Keine Treffer.</p>}
        {summary}
      </div>
    </div>
  );
}
