/** Berichte: Tagesübersicht, Küchenvorschau, Allergien, Hotel-Tischliste, Tischplan – druckbar */
import { useState, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { byId, isBlocked, isCancelled, isInHouse, needsTable, persons, resStart, tableNames, tableStatusAt } from '../domain/logic';
import type { Menu, Reservation, VenueData } from '../domain/types';
import { ALLERGENS, allergenNo, COURSES } from '../domain/constants';
import { allergenWarnings, allergyText, dishAllergens, dishPlans, findMenu, hasAllergy, ingredientTotals, itemAllergens, itemName, menuPortions } from '../domain/menu';
import { IngredientTable, WarningList } from '../forms/MenuForms';
import { AllergenNos } from '../ui/AllergenPicker';
import { t } from '../lib/i18n';
import { fmtDate, fmtShort, fromMin, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useServiceId } from '../store/hooks';
import { useUi } from '../store/ui';
import { FloorPlan, Legend } from '../ui/FloorPlan';

const TYPES: [string, string][] = [['tag', 'Tagesübersicht'], ['kueche', 'Küchenvorschau / Briefing'], ['zutaten', 'Zutatenliste'], ['allergene', 'Allergen-Übersicht'], ['allergie', 'Allergie-Liste'], ['hotel', 'Hotel-Tischliste'], ['plan', 'Tischplan drucken']];

function AllergyTable({ d, rs, withSvc }: { d: VenueData; rs: Reservation[]; withSvc?: boolean }) {
  const list = rs.filter(hasAllergy);
  if (!list.length) return <p className="muted">Keine Allergien gemeldet.</p>;
  return (
    <table className="list"><thead><tr>{withSvc && <th>Service</th>}<th>Zeit</th><th>Tisch</th><th>Name</th><th>P</th><th>Allergien</th><th>Notiz</th></tr></thead>
      <tbody>{list.map(r => <tr key={r.id}>{withSvc && <td>{byId(d.services, r.serviceId)?.name}</td>}<td>{r.time}</td><td><b>{tableNames(d, r.tableIds) || '–'}</b></td>
        <td>{r.name}</td><td>{persons(r)}</td><td><b>{allergyText(r)}</b></td><td>{r.notes}</td></tr>)}</tbody></table>
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
  const [zScope, setZScope] = useState<'service' | 'tag'>('service');
  const [zSort, setZSort] = useState<'zutat' | 'gericht'>('zutat');
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
              <td>{tableNames(d, r.tableIds) || '–'}</td><td>{hasAllergy(r) && <>⚠ <b>{allergyText(r)}</b> </>}{r.occasion && `🎉 ${r.occasion} `}{r.highchair && 'Kinderstuhl '}{r.notes}</td>
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
        <div className="kpi"><b>{rs.filter(hasAllergy).length}</b><small>mit Allergien</small></div>
      </div>
      <MenuBrief d={d} menu={findMenu(d, D, svc.id)} />
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
    const rs = d.reservations.filter(r => r.date === D && !isCancelled(r) && hasAllergy(r)).sort((a, b) => a.serviceId.localeCompare(b.serviceId) || resStart(a) - resStart(b));
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
            <td>{fmtShort(s.departure)}</td><td>{[allergyText(s), s.notes].filter(Boolean).join(' · ')}</td></tr>;
        })}</tbody></table>
      {!stays.length && <p className="muted">Keine Hotelgäste im Haus.</p>}</>;
  } else if (type === 'zutaten') {
    const menus = (zScope === 'tag' ? d.services.map(x => findMenu(d, D, x.id)) : [svc && findMenu(d, D, svc.id)]).filter((m): m is Menu => !!m);
    body = <>{head('Zutatenliste', zScope === 'tag' ? 'alle Services' : svc?.name)}
      <div className="row no-print mb8">
        <div className="seg" role="group" aria-label="Umfang"><button className="btn small" aria-pressed={zScope === 'service'} onClick={() => setZScope('service')}>Dieser Service</button>
          <button className="btn small" aria-pressed={zScope === 'tag'} onClick={() => setZScope('tag')}>Ganzer Tag</button></div>
        <div className="seg" role="group" aria-label="Sortierung"><button className="btn small" aria-pressed={zSort === 'zutat'} onClick={() => setZSort('zutat')}>nach Zutat</button>
          <button className="btn small" aria-pressed={zSort === 'gericht'} onClick={() => setZSort('gericht')}>nach Gericht</button></div>
      </div>
      {!menus.length ? <p className="muted">Für {zScope === 'tag' ? 'diesen Tag' : 'diesen Service'} ist kein Menü eingetragen (Ansicht „Menü“).</p> : <>
        <p style={{ margin: '0 0 8px' }}>{menus.map(m => { const p = menuPortions(d, m); return <span key={m.id} className="badge" style={{ fontSize: 13, marginRight: 6 }}>
          {byId(d.services, m.serviceId)?.name}: <b>{p.total} Portionen</b> ({m.portions == null ? `${p.auto} Gäste` : `fest ${p.base}`}{m.bufferPct ? ` + ${m.bufferPct} %` : ''})</span>; })}</p>
        {zSort === 'zutat'
          ? <IngredientTable rows={ingredientTotals(d, menus).map(x => ({ name: x.ingredient.name, qty: x.qty, unit: x.ingredient.unit, note: [...new Set(x.uses.map(u => u.dish))].join(', ') }))} />
          : menus.map(m => dishPlans(d, m).map(p => <div key={m.id + p.item.dishId}>
              <h4>{byId(d.services, m.serviceId)?.name} · {t(p.item.course)}: {p.dish?.name ?? p.item.name} – {p.portions} Portionen</h4>
              <IngredientTable rows={p.lines.map(l => ({ name: l.ingredient.name, qty: l.qty, unit: l.ingredient.unit }))} /></div>))}
      </>}</>;
  } else if (type === 'allergene') {
    const menus = d.services.map(x => findMenu(d, D, x.id)).filter((m): m is Menu => !!m);
    const ids = [...new Set(menus.flatMap(m => m.items.map(i => i.dishId)))];
    const dishes = (ids.length ? ids.map(id => byId(d.dishes, id)).filter(x => !!x) : d.dishes)
      .sort((a, b) => COURSES.indexOf(a!.course) - COURSES.indexOf(b!.course) || a!.name.localeCompare(b!.name, 'de'));
    body = <>{head('Allergen-Übersicht', ids.length ? 'Gerichte der Menüs dieses Tages' : 'alle Gerichte')}
      {!dishes.length ? <p className="muted">Noch keine Gerichte angelegt.</p> : <>
        <table className="list allergen-matrix"><thead><tr><th>Gericht</th>{ALLERGENS.map(a => <th key={a} title={t(a)}>{allergenNo(a)}</th>)}</tr></thead>
          <tbody>{dishes.map(x => { const a = dishAllergens(d, x!); return <tr key={x!.id}><td><b>{x!.name}</b><div className="muted" style={{ fontSize: 11 }}>{t(x!.course)}</div></td>
            {ALLERGENS.map(v => <td key={v} className={a.allergens.includes(v) ? 'has' : a.traces.includes(v) ? 'trace' : ''}>{a.allergens.includes(v) ? '●' : a.traces.includes(v) ? '○' : ''}</td>)}</tr>; })}</tbody></table>
        <p className="muted" style={{ fontSize: 12 }}>● enthalten · ○ kann Spuren enthalten · {ALLERGENS.map(a => `${allergenNo(a)} ${t(a)}`).join(' · ')}</p>
        <p className="muted" style={{ fontSize: 12 }}>Angaben nach VO (EU) 1169/2011, abgeleitet aus den hinterlegten Zutaten.</p></>}</>;
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

/** Menü des Service in der Küchenvorschau: Gänge mit Portionen und Allergen-Warnungen der Gäste */
function MenuBrief({ d, menu }: { d: VenueData; menu?: Menu }) {
  if (!menu) return <><h4>Menü</h4><p className="muted">Kein Menü eingetragen.</p></>;
  const por = menuPortions(d, menu), plans = dishPlans(d, menu), warn = allergenWarnings(d, menu);
  return <>
    <h4>Menü – {por.total} Portionen{menu.portions == null ? ` (${por.auto} Gäste + ${menu.bufferPct} %)` : ' (fest)'}</h4>
    <table className="list"><tbody>{plans.map((p, i) => <tr key={i}><td style={{ width: 120 }} className="muted">{t(p.item.course)}</td>
      <td><b>{itemName(d, p.item)}</b> <AllergenNos list={itemAllergens(d, p.item)} /></td><td style={{ textAlign: 'right' }}>{p.portions} Port.</td></tr>)}</tbody></table>
    {menu.notes && <p><b>Notiz:</b> {menu.notes}</p>}
    <h4>Allergen-Warnungen</h4>
    {warn.length ? <WarningList d={d} warnings={warn} withTable /> : <p className="muted">Keine Konflikte mit den gemeldeten Allergenen.</p>}
  </>;
}
