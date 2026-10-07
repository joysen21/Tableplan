/** Menüverwaltung: Wochenplan (Tage × Services), Gerichte, Zutaten */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Search } from 'lucide-react';
import { newId } from '../domain/demo';
import { COURSES, canEditMenu } from '../domain/constants';
import { dishAllergens, allergenWarnings, copyPreviousWeek, findMenu, ingredientUsage, itemAllergens, itemName, menuPortions, weekDates } from '../domain/menu';
import type { Menu, Service } from '../domain/types';
import { t } from '../lib/i18n';
import { addDays, fmtShort, today } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useRole } from '../store/hooks';
import { useUi } from '../store/ui';
import { openDialog } from '../store/dialogs';
import { AllergenNos } from '../ui/AllergenPicker';
import { MOBILE } from '../ui/media';
import { toast } from '../ui/notify';

/** Kalenderwoche nach ISO 8601 */
function isoWeek(date: string) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

export function MenuView() {
  const d = useData();
  const ui = useUi();
  const tab = ui.menuTab;
  const edit = canEditMenu(useRole());
  return (
    <div className="panel menu-view">
      <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <div className="seg" role="group" aria-label="Bereich">
          <button className="btn" aria-pressed={tab === 'plan'} onClick={() => ui.set({ menuTab: 'plan' })}>Wochenplan</button>
          <button className="btn" aria-pressed={tab === 'gerichte'} onClick={() => ui.set({ menuTab: 'gerichte' })}>Gerichte <span className="count">{d.dishes.length}</span></button>
          <button className="btn" aria-pressed={tab === 'zutaten'} onClick={() => ui.set({ menuTab: 'zutaten' })}>Zutaten <span className="count">{d.ingredients.length}</span></button>
        </div>
        <span className="spacer" />
        {edit && tab === 'gerichte' && <button className="btn primary" onClick={() => openDialog({ type: 'dish' })}><Plus />Gericht</button>}
        {edit && tab === 'zutaten' && <button className="btn primary" onClick={() => openDialog({ type: 'ingredient' })}><Plus />Zutat</button>}
      </div>
      {tab === 'plan' ? <WeekPlan edit={edit} /> : tab === 'gerichte' ? <DishList /> : <IngredientList />}
    </div>
  );
}

function WeekPlan({ edit }: { edit: boolean }) {
  const d = useData();
  const ui = useUi();
  const store = useApp();
  const days = weekDates(ui.menuWeek);
  const t0 = today();
  // Frühstück meist als Buffet ohne Menü – nur anzeigen, wenn dort schon Menüs geplant sind
  const services = d.services.filter(s => s.kind !== 'fruehstueck' || d.menus.some(m => m.serviceId === s.id));
  // am Handy (Tage untereinander) gleich zum heutigen Tag springen
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia(MOBILE).matches) grid.current?.querySelector('.mw-row.today')?.scrollIntoView({ block: 'start' });
  }, [ui.menuWeek]);
  async function copyWeek() {
    const list = copyPreviousWeek(d, ui.menuWeek, newId);
    if (!list.length) return toast('Nichts zu übernehmen – die Vorwoche ist leer oder diese Woche schon geplant', 'err');
    if (await store.upsert('menus', list, ['Menüs aus Vorwoche übernommen', `KW ${isoWeek(days[0])}: ${list.length} Menüs`])) toast(`${list.length} Menüs übernommen`);
  }
  return (
    <>
      <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <button className="btn small icon" aria-label="Vorwoche" title="Vorwoche" onClick={() => ui.set({ menuWeek: addDays(ui.menuWeek, -7) })}><ChevronLeft /></button>
        <b className="menu-week-title">KW {isoWeek(days[0])} · {fmtShort(days[0])} – {fmtShort(days[6])}</b>
        <button className="btn small icon" aria-label="Folgewoche" title="Folgewoche" onClick={() => ui.set({ menuWeek: addDays(ui.menuWeek, 7) })}><ChevronRight /></button>
        <button className="btn small" onClick={() => ui.set({ menuWeek: t0 })}>Heute</button>
        <span className="spacer" />
        {edit && <button className="btn" onClick={copyWeek}><Copy />Vorwoche übernehmen</button>}
      </div>
      {!services.length ? <p className="body muted">Keine Services angelegt.</p> : (
        <div className="menu-week" ref={grid} style={{ '--svc': services.length } as React.CSSProperties}>
          <div className="mw-head mw-day" />
          {services.map(s => <div key={s.id} className="mw-head">{s.name}</div>)}
          {days.map(day => (
            <div key={day} className={'mw-row' + (day === t0 ? ' today' : '')}>
              <div className="mw-day"><b>{fmtShort(day)}</b>{day === t0 && <span className="badge">heute</span>}</div>
              {services.map(s => <MenuCell key={s.id} date={day} svc={s} menu={findMenu(d, day, s.id)} edit={edit} />)}
            </div>
          ))}
        </div>
      )}
      {!d.dishes.length && edit && <p className="body muted">Tipp: Zuerst im Reiter „Zutaten“ die Zutaten und unter „Gerichte“ die Rezepte anlegen.</p>}
    </>
  );
}

function MenuCell({ date, svc, menu, edit }: { date: string; svc: Service; menu?: Menu; edit: boolean }) {
  const d = useData();
  const open = () => openDialog({ type: 'menu', date, serviceId: svc.id });
  if (!menu) return (
    <div className="mw-cell empty">
      <span className="mw-svc">{svc.name}</span>
      {edit ? <button className="btn small ghost" onClick={open} aria-label={`Menü ${svc.name} ${fmtShort(date)} anlegen`}><Plus />Menü</button> : <span className="muted">–</span>}
    </div>
  );
  const por = menuPortions(d, menu);
  const warn = allergenWarnings(d, menu);
  const guests = new Set(warn.map(w => w.r.id)).size;
  const problems = warn.some(w => !w.alternatives.length);
  return (
    <button className="mw-cell" onClick={open} aria-label={`Menü ${svc.name} ${fmtShort(date)}`}>
      <span className="mw-svc">{svc.name}</span>
      {COURSES.filter(c => menu.items.some(i => i.course === c)).map(c => (
        <span key={c} className="mw-course"><small>{t(c)}</small>
          {menu.items.filter(i => i.course === c).map(i => <span key={i.dishId} className="mw-dish">{itemName(d, i)} <AllergenNos list={itemAllergens(d, i)} /></span>)}
        </span>
      ))}
      <span className="mw-foot">
        <span>{por.total} Port.{menu.portions == null ? '' : ' (fest)'}</span>
        {guests > 0 && <span className={'badge ' + (problems ? 'warn' : '')} title={`${guests} Gäste mit Allergenen in diesem Menü${problems ? ' – teils ohne Alternative' : ''}`}>⚠ {guests}</span>}
      </span>
    </button>
  );
}

function useSearch() {
  const [q, setQ] = useState('');
  const box = (
    <label className="searchbox"><Search /><input type="search" placeholder="Suchen…" value={q} onChange={e => setQ(e.target.value)} aria-label="Suchen" /></label>
  );
  return { q: q.trim().toLowerCase(), box };
}

function DishList() {
  const d = useData();
  const { q, box } = useSearch();
  const list = d.dishes.filter(x => !q || [x.name, x.nameIt, x.nameEn].join(' ').toLowerCase().includes(q))
    .sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || a.name.localeCompare(b.name, 'de'));
  return (
    <div className="body">
      {box}
      {list.length ? <div className="table-scroll"><table className="list"><thead><tr><th>Gericht</th><th>Gang</th><th>Allergene</th><th>Zutaten</th></tr></thead>
        <tbody>{list.map(x => { const a = dishAllergens(d, x); return (
          <tr key={x.id} className="clickable" onClick={() => openDialog({ type: 'dish', dish: x })}>
            <td><b>{x.name}</b>{x.diet.map(k => <span key={k} className="badge diet">{t(k)}</span>)}{x.nameIt && <div className="muted" style={{ fontSize: 12 }}>{x.nameIt}</div>}</td>
            <td>{t(x.course)}</td>
            <td style={{ fontSize: 13 }}>{a.allergens.map(v => t(v)).join(', ') || <span className="muted">keine</span>}{a.traces.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Spuren: {a.traces.map(v => t(v)).join(', ')}</div>}</td>
            <td>{x.ingredients.length}</td>
          </tr>); })}</tbody></table></div>
        : <p className="muted">{q ? 'Nichts gefunden.' : 'Noch keine Gerichte angelegt.'}</p>}
    </div>
  );
}

function IngredientList() {
  const d = useData();
  const { q, box } = useSearch();
  const list = d.ingredients.filter(x => !q || x.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <div className="body">
      {box}
      {list.length ? <div className="table-scroll"><table className="list"><thead><tr><th>Zutat</th><th>Einheit</th><th>Allergene</th><th>Verwendet in</th></tr></thead>
        <tbody>{list.map(x => { const used = ingredientUsage(d, x.id); return (
          <tr key={x.id} className="clickable" onClick={() => openDialog({ type: 'ingredient', ing: x })}>
            <td><b>{x.name}</b></td><td>{t(x.unit)}</td>
            <td style={{ fontSize: 13 }}>{x.allergens.map(v => t(v)).join(', ') || <span className="muted">keine</span>}{x.traces.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Spuren: {x.traces.map(v => t(v)).join(', ')}</div>}</td>
            <td style={{ fontSize: 13 }}>{used.length ? `${used.length} Gericht${used.length > 1 ? 'en' : ''}` : <span className="muted">–</span>}</td>
          </tr>); })}</tbody></table></div>
        : <p className="muted">{q ? 'Nichts gefunden.' : 'Noch keine Zutaten angelegt.'}</p>}
    </div>
  );
}
