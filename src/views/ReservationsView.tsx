/** Reservierungsliste mit Filtern und CSV-Export */
import { Download, Plus } from 'lucide-react';
import { canEdit, RES_STATUS_COLOR, ALL_STATUS } from '../domain/constants';
import { byId, checkReservation, occupies, persons, resEnd, resStart, tableNames } from '../domain/logic';
import { t } from '../lib/i18n';
import { addDays, fmtShort, fromMin } from '../lib/time';
import { downloadCSV } from '../lib/download';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { useUi, type ResFilter } from '../store/ui';
import { openDialog } from '../store/dialogs';

export function ReservationsView() {
  const d = useData();
  const role = useApp(s => s.user!.role);
  const ui = useUi();
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
  return (
    <div className="panel">
      <div className="filters">
        <label>Von<input type="date" value={F.from} onChange={e => setF({ from: e.target.value })} /></label>
        <label>Bis<input type="date" value={F.to} onChange={e => setF({ to: e.target.value })} /></label>
        <label>Service<select value={F.serviceId} onChange={e => setF({ serviceId: e.target.value })}><option value="">alle</option>{d.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Status<select value={F.status} onChange={e => setF({ status: e.target.value })}>
          <option value="aktiv">aktive</option><option value="alle">alle</option>{ALL_STATUS.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>
        <label>Suche<input value={F.q} placeholder="Name, Telefon, Notiz…" onChange={e => setF({ q: e.target.value })} /></label>
        <label className="chk" style={{ alignSelf: 'flex-end' }}><input type="checkbox" checked={F.hotel} onChange={e => setF({ hotel: e.target.checked })} /> nur Hotelgäste</label>
        <label className="chk" style={{ alignSelf: 'flex-end' }}><input type="checkbox" checked={F.unassigned} onChange={e => setF({ unassigned: e.target.checked })} /> nur ohne Tisch</label>
        <span className="spacer" />
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={exportCsv}><Download />CSV-Export</button>
        {canEdit(role) && <button className="btn primary" style={{ alignSelf: 'flex-end' }} onClick={() => openDialog({ type: 'reservation', preset: {} })}><Plus />Reservierung</button>}
      </div>
      <div style={{ overflow: 'auto' }}>
        <table className="list">
          <thead><tr><th>Datum</th><th>Zeit</th><th>Name</th><th>P</th><th>Tisch</th><th>Service</th><th>Status</th><th>Quelle</th><th>Hinweise</th></tr></thead>
          <tbody>{rows.map(r => {
            const issues = checkReservation(d, r);
            return (
              <tr key={r.id} className="clickable" onClick={() => openDialog(canEdit(role) ? { type: 'reservation', r } : { type: 'resinfo', id: r.id })}>
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
        <p className="muted" style={{ padding: '8px 14px', fontSize: 12 }}>{rows.length} Reservierungen · {rows.reduce((a, r) => a + persons(r), 0)} Gäste</p>
      </div>
    </div>
  );
}
