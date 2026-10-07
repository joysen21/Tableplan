/** Berichte: Tagesübersicht, Küchenvorschau, Allergien, Hotel-Tischliste, Tischplan – druckbar */
import type { ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { byId, isBlocked, isCancelled, isInHouse, needsTable, persons, resStart, tableNames, tableStatusAt } from '../domain/logic';
import type { Reservation, VenueData } from '../domain/types';
import { t } from '../lib/i18n';
import { fmtDate, fmtShort, fromMin, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useServiceId } from '../store/hooks';
import { useUi } from '../store/ui';
import { FloorPlan, Legend } from '../ui/FloorPlan';

const TYPES: [string, string][] = [['tag', 'Tagesübersicht'], ['kueche', 'Küchenvorschau / Briefing'], ['allergie', 'Allergie-Liste'], ['hotel', 'Hotel-Tischliste'], ['plan', 'Tischplan drucken']];

function AllergyTable({ d, rs, withSvc }: { d: VenueData; rs: Reservation[]; withSvc?: boolean }) {
  const list = rs.filter(r => r.allergies);
  if (!list.length) return <p className="muted">Keine Allergien gemeldet.</p>;
  return (
    <table className="list"><thead><tr>{withSvc && <th>Service</th>}<th>Zeit</th><th>Tisch</th><th>Name</th><th>P</th><th>Allergien</th><th>Notiz</th></tr></thead>
      <tbody>{list.map(r => <tr key={r.id}>{withSvc && <td>{byId(d.services, r.serviceId)?.name}</td>}<td>{r.time}</td><td><b>{tableNames(d, r.tableIds) || '–'}</b></td>
        <td>{r.name}</td><td>{persons(r)}</td><td><b>{r.allergies}</b></td><td>{r.notes}</td></tr>)}</tbody></table>
  );
}

export function ReportsView() {
  const d = useData();
  const role = useApp(s => s.user!.role);
  const ui = useUi();
  const serviceId = useServiceId();
  const type = ui.report || (role === 'kueche' ? 'kueche' : 'tag');
  const svc = byId(d.services, serviceId);
  const D = ui.date;
  const head = (title: string, sub?: string) => <><h2>{title}</h2><p className="muted" style={{ margin: '0 0 10px' }}>{d.venue.name} · {fmtDate(D)}{sub ? ' · ' + sub : ''} · erstellt {new Date().toLocaleString('de-DE')}</p></>;
  let body: ReactNode = null;

  if (type === 'tag') {
    body = <>{head('Tagesübersicht')}{d.services.map(s => {
      const rs = d.reservations.filter(r => r.date === D && r.serviceId === s.id && !isCancelled(r)).sort((a, b) => resStart(a) - resStart(b));
      if (!rs.length) return <div key={s.id}><h4>{s.name}</h4><p className="muted">Keine Reservierungen.</p></div>;
      return (
        <div key={s.id}><h4>{s.name} – {rs.length} Reservierungen, {rs.reduce((a, r) => a + persons(r), 0)} Gäste</h4>
          <table className="list"><thead><tr><th>Zeit</th><th>Name</th><th>P</th><th>Tisch</th><th>Hinweise</th><th>Status</th></tr></thead>
            <tbody>{rs.map(r => <tr key={r.id}><td>{r.time}</td><td>{r.vip ? '★ ' : ''}{r.name}</td><td>{r.adults}{r.children ? `+${r.children} Ki.` : ''}</td>
              <td>{tableNames(d, r.tableIds) || '–'}</td><td>{r.allergies && <>⚠ <b>{r.allergies}</b> </>}{r.occasion && `🎉 ${r.occasion} `}{r.highchair && 'Kinderstuhl '}{r.notes}</td>
              <td>{t(r.status)}</td></tr>)}</tbody></table></div>
      );
    })}</>;
  } else if (type === 'kueche' && svc) {
    const rs = d.reservations.filter(r => r.date === D && r.serviceId === svc.id && !isCancelled(r)).sort((a, b) => resStart(a) - resStart(b));
    const slots: { m: number; c: number }[] = [];
    for (let m = toMin(svc.start); m <= toMin(svc.end); m += 15) slots.push({ m, c: rs.filter(r => Math.floor(resStart(r) / 15) * 15 === m).reduce((a, r) => a + persons(r), 0) });
    const max = Math.max(1, ...slots.map(s => s.c));
    const tot = rs.reduce((a, r) => a + persons(r), 0), kids = rs.reduce((a, r) => a + r.children, 0), hotel = rs.filter(r => r.stayId).reduce((a, r) => a + persons(r), 0);
    const big = rs.filter(r => persons(r) >= 6), unas = rs.filter(r => !r.tableIds.length), blocked = d.tables.filter(x => isBlocked(d, x.id, D, svc.id));
    const peak = slots.reduce((a, s) => (s.c > a.c ? s : a), slots[0] ?? { m: 0, c: 0 });
    body = <>{head('Küchenvorschau & Briefing', svc.name)}
      <div className="kpis" style={{ padding: 0, border: 0 }}>
        <div className="kpi"><b>{tot}</b><small>Gäste gesamt</small></div><div className="kpi"><b>{hotel}</b><small>Hotelgäste</small></div>
        <div className="kpi"><b>{tot - hotel}</b><small>Extern</small></div><div className="kpi"><b>{kids}</b><small>Kinder</small></div>
        <div className="kpi"><b>{rs.filter(r => r.allergies).length}</b><small>mit Allergien</small></div>
      </div>
      <h4>Ankünfte pro 15 Minuten{svc.pacing ? ` (Pacing-Limit ${svc.pacing})` : ''}</h4>
      <div className="slotbar">{slots.map(s => <div key={s.m} style={{ height: `${(s.c / max) * 100}%`, background: svc.pacing && s.c > svc.pacing ? 'var(--danger)' : undefined }}><span>{s.c || ''}</span></div>)}</div>
      <div className="slotlbl">{slots.map(s => <span key={s.m}>{s.m % 60 ? '' : fromMin(s.m)}</span>)}</div>
      <h4>Allergien & Unverträglichkeiten</h4><AllergyTable d={d} rs={rs} />
      <h4>Anlässe & VIPs</h4>{rs.filter(r => r.occasion || r.vip).map(r => <div key={r.id}>{r.time} · {r.name} · Tisch {tableNames(d, r.tableIds) || '–'} · {r.vip ? '★ VIP ' : ''}{r.occasion}</div>)}
      {!rs.some(r => r.occasion || r.vip) && <p className="muted">Keine.</p>}
      <h4>Briefing</h4><ul>
        {big.length > 0 && <li>Große Gruppen: {big.map(r => `${r.name} (${persons(r)}P, ${r.time})`).join(', ')}</li>}
        {unas.length > 0 && <li><b>{unas.length} Reservierungen noch ohne Tisch</b></li>}
        {blocked.length > 0 && <li>Gesperrte Tische: {blocked.map(x => x.name).join(', ')}</li>}
        <li>Kinderstühle: {rs.filter(r => r.highchair).length}</li>
        <li>Größter Ankunfts-Slot: {fromMin(peak.m)} ({peak.c} Gäste)</li></ul></>;
  } else if (type === 'allergie') {
    const rs = d.reservations.filter(r => r.date === D && !isCancelled(r) && r.allergies).sort((a, b) => a.serviceId.localeCompare(b.serviceId) || resStart(a) - resStart(b));
    body = <>{head('Allergie-Liste')}<AllergyTable d={d} rs={rs} withSvc /></>;
  } else if (type === 'hotel') {
    const stays = d.stays.filter(s => isInHouse(s, D)).sort((a, b) => a.roomNo.localeCompare(b.roomNo, 'de', { numeric: true }));
    const dinner = d.services.find(s => s.kind === 'abend');
    body = <>{head('Hotel-Tischliste', 'Zimmer ↔ Tisch')}
      <table className="list"><thead><tr><th>Zimmer</th><th>Name</th><th>Pers.</th><th>Verpfl.</th><th>Tisch</th><th>Uhrzeit</th><th>Abreise</th><th>Allergien / Notiz</th></tr></thead>
        <tbody>{stays.map(s => {
          const r = d.reservations.find(z => z.stayId === s.id && z.date === D && z.serviceId === dinner?.id);
          return <tr key={s.id}><td><b>{s.roomNo}</b></td><td>{s.vip ? '★ ' : ''}{s.name}{s.arrival === D && <span className="badge hotel"> Anreise</span>}</td>
            <td>{s.adults}{s.children ? '+' + s.children : ''}</td><td>{s.board}</td>
            <td><b>{tableNames(d, r ? r.tableIds : s.tableIds) || (needsTable(d, s) ? '— fehlt —' : 'frei')}</b></td><td>{r?.time}</td>
            <td>{fmtShort(s.departure)}</td><td>{[s.allergies, s.notes].filter(Boolean).join(' · ')}</td></tr>;
        })}</tbody></table>
      {!stays.length && <p className="muted">Keine Hotelgäste im Haus.</p>}</>;
  } else if (type === 'plan' && svc) {
    body = <>{head('Tischplan', `${svc.name}, Stand ${fromMin(ui.time)}`)}
      {d.rooms.map(room => <div key={room.id}><h4>{room.name}</h4><FloorPlan data={d} room={room} mode="live" status={tb => tableStatusAt(d, tb, D, svc.id, ui.time)} /></div>)}
      <Legend /></>;
  }

  return (
    <div className="panel">
      <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        {TYPES.map(([k, l]) => <button key={k} className="btn small" aria-pressed={type === k} onClick={() => ui.set({ report: k })}>{l}</button>)}
        <span className="spacer" /><button className="btn primary" onClick={() => window.print()}><Printer />Drucken / PDF</button>
      </div>
      <div className="body report print-area">{body}</div>
    </div>
  );
}
