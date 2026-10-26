/** Modul Pass + Chef.
 *  Pass (Service): Raumplan nach Gang-Stand eingefärbt; Tisch antippen → Gang oder einzelne Gerichte abrufen, servieren, Portionen stornieren,
 *  Menüauswahl für Gäste ohne Auswahl eintragen.
 *  Chef (Küche): Abrufe je Kellner mit „Fertig“, fertige Gänge, demnächst kommende Gänge, Mengen je Gericht – alles live. */
import { useMemo, useState } from 'react';
import { BellRing, Check, ChefHat, Clock, CookingPot, Undo2 } from '../ui/icons';
import { cleanCounts } from '../domain/guestMenu';
import { allergyText, hasAllergy } from '../domain/menu';
import { byId, persons, tableStatusAt } from '../domain/logic';
import { newId } from '../domain/demo';
import {
  PASS_LOOK, byWaiter, callNet, cancelPortion, chefOverview, minutesSince, netCount, newCall, partyLabel, passProgress, tablePass,
  type CallView, type CourseProgress, type CourseState, type DishProgress, type PassLook
} from '../domain/pass';
import type { TableLook } from '../domain/statuses';
import type { DiningTable, MenuChoice, PassCall, Reservation } from '../domain/types';
import { t } from '../lib/i18n';
import { useApp } from '../store/app';
import { useData, useRoomId, useServiceId, useTick } from '../store/hooks';
import { useUi } from '../store/ui';
import { FloorPlan } from '../ui/FloorPlan';
import { Modal } from '../ui/Modal';
import { confirmDialog } from '../ui/notify';
import { MenuChoiceEditor, type ChoiceDraft } from '../forms/MenuChoiceEditor';

const STATE_LABEL: Record<CourseState, string> = { leer: '–', wartet: 'offen', abgerufen: 'abgerufen', fertig: 'fertig', serviert: 'serviert' };

/* ---------- Pass (Service) ---------- */
export function PassView() {
  const d = useData();
  const ui = useUi();
  const serviceId = useServiceId();
  const roomId = useRoomId();
  const room = byId(d.rooms, roomId);
  const [sel, setSel] = useState<string | null>(null);
  const pass = useMemo(() => new Map(d.tables.map(tb => [tb.id, tablePass(d, tb.id, ui.date, serviceId)])), [d, ui.date, serviceId]);
  const chef = useMemo(() => chefOverview(d, ui.date, serviceId), [d, ui.date, serviceId]);
  const look = (tb: DiningTable): TableLook => {
    const l = pass.get(tb.id)?.look ?? 'frei', x = PASS_LOOK[l];
    return { fill: x.color, label: x.label, faded: false, alert: '', mark: l === 'fertig' ? '●' : '' };
  };
  const counts = (l: PassLook) => [...pass.values()].filter(x => x.look === l).length;

  return (
    <div className="pass">
      <div className="roomtabs">
        {d.rooms.map(r => <button key={r.id} className="btn small" aria-pressed={r.id === roomId} onClick={() => ui.set({ roomId: r.id })}>{r.name}</button>)}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{byId(d.services, serviceId)?.name}{!chef.menu && ' · kein Menü angelegt'}</span>
      </div>
      {chef.ready.length > 0 && (
        <div className="pass-ready" role="list" aria-label="Fertig zum Abholen">
          <b><BellRing />Abholen:</b>
          {chef.ready.map(c => <button key={c.call.id} role="listitem" className="btn small" onClick={() => setSel(c.res.tableIds[0])}>
            {c.tables} · {t(c.call.course)} <small className="muted">{c.label}</small></button>)}
        </div>
      )}
      <div className="panel">
        <div className="plan-wrap">
          {room ? <FloorPlan data={d} room={room} mode="live" look={look} nameOnly status={tb => tableStatusAt(d, tb, ui.date, serviceId, ui.time)}
            onTableDown={(_e, tb) => setSel(tb.id)} /> : <p className="muted">Kein Raum angelegt.</p>}
        </div>
        <div className="legend">
          {(Object.keys(PASS_LOOK) as PassLook[]).map(l => <span key={l}><i style={{ background: PASS_LOOK[l].color }} />{PASS_LOOK[l].label}{l !== 'frei' && counts(l) ? ` (${counts(l)})` : ''}</span>)}
        </div>
      </div>
      {sel && <PassTable tableId={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function PassTable({ tableId, onClose }: { tableId: string; onClose: () => void }) {
  const d = useData();
  const ui = useUi();
  const serviceId = useServiceId();
  const tb = byId(d.tables, tableId);
  const { reservations } = tablePass(d, tableId, ui.date, serviceId);
  return (
    <Modal title={'Pass · Tisch ' + (tb?.name ?? '')} onClose={onClose} width={900} footer={<><span className="spacer" /><button className="btn" onClick={onClose}>Schließen</button></>}>
      {!reservations.length && <p className="muted">An diesem Tisch ist in diesem Service niemand.</p>}
      {reservations.map(r => <PassParty key={r.id} r={r} />)}
    </Modal>
  );
}

function PassParty({ r }: { r: Reservation }) {
  const d = useData();
  const store = useApp();
  const user = useApp(s => s.user!);
  const p = passProgress(d, r);
  const [edit, setEdit] = useState<ChoiceDraft | null>(null);
  const label = partyLabel(d, r);
  const saveChoice = async (counts: Record<string, number>, note: string, log: string) => {
    if (!p.menu) return false;
    const res = cleanCounts(p.menu.items, persons(r), counts);
    if ('error' in res) { await confirmDialog('Auswahl nicht gespeichert', [res.error], 'OK'); return false; }
    const row: MenuChoice = { id: p.choice?.id ?? newId(), menuId: p.menu.id, stayId: r.stayId ?? null, reservationId: r.stayId ? null : r.id, counts: res.counts, note: note.trim() };
    return store.upsert('menuChoices', [row], [log, label]);
  };
  // ganzen Gang abrufen – ohne Rückfrage
  const call = () => {
    const c = newCall(p, r, user, newId);
    if (!c) return;
    const lines = Object.entries(c.counts).map(([k, n]) => `${n}× ${p.current!.dishes.find(x => x.dishId === k)?.name}`);
    store.upsert('passCalls', [c], ['Gang abgerufen', `${label}: ${t(c.course)} – ${lines.join(', ')}`]);
  };
  const setState = (c: PassCall, state: PassCall['state']) => {
    const now = new Date().toISOString();
    store.upsert('passCalls', [{ ...c, state, ...(state === 'serviert' ? { servedAt: now } : state === 'fertig' ? { readyAt: now } : {}) }],
      [state === 'serviert' ? 'Gang serviert' : 'Gang zurückgesetzt', `${label}: ${t(c.course)}`]);
  };
  const cancelOpen = async (dishId: string, name: string) => {
    if (!p.choice || !(await confirmDialog('Portion stornieren?', [`1× ${name}`, label], 'Stornieren', true))) return;
    saveChoice({ ...p.choice.counts, [dishId]: Math.max(0, (p.choice.counts[dishId] ?? 0) - 1) }, p.choice.note ?? '', 'Portion storniert');
  };
  const cancelCalled = async (c: PassCall, dishId: string, name: string) => {
    const next = cancelPortion(c, dishId);
    if (!next || !(await confirmDialog('Abgerufene Portion stornieren?', [`1× ${name}`, label, 'Die Küche sieht sie als storniert.'], 'Stornieren', true))) return;
    store.upsert('passCalls', [next], ['Portion storniert', `${label}: 1× ${name}`]);
  };
  // −1: zuerst eine offene Portion, sonst eine bereits abgerufene (Küche sieht sie als storniert)
  const minusOne = (c: CourseProgress, x: DishProgress) => {
    if (x.open > 0) return cancelOpen(x.dishId, x.name);
    const call = c.calls.find(k => k.state !== 'serviert' && netCount(k, x.dishId) > 0);
    if (call) cancelCalled(call, x.dishId, x.name);
  };
  const active = (c: CourseProgress) => c.calls.filter(k => k.state !== 'serviert' && callNet(k) > 0);

  return (
    <section className="pass-party" aria-label={label}>
      <h3>{label}</h3>
      {hasAllergy(r) && <p className="warnbox">⚠ {allergyText(r)}</p>}
      {p.choice?.note && <p className="muted" style={{ margin: '4px 0' }}>📝 {p.choice.note}</p>}
      {!p.menu ? <p className="muted">Für diesen Service ist kein Menü angelegt.</p>
        : (!p.hasChoice || edit) ? (
          <div className="pass-choice">
            {!p.hasChoice && <p className="muted" style={{ marginTop: 0 }}>Noch keine Menüauswahl – hier eintragen:</p>}
            <MenuChoiceEditor d={d} r={r} value={edit} onChange={setEdit} />
            <div className="row mt8">
              <button className="btn primary" disabled={!edit} onClick={async () => { if (edit && await saveChoice(edit.counts, edit.note, 'Menüauswahl eingetragen')) setEdit(null); }}>Auswahl speichern</button>
              {p.hasChoice && <button className="btn" onClick={() => setEdit(null)}>Abbrechen</button>}
            </div>
          </div>
        ) : (
          <>
            <ol className="pass-courses">
              {p.courses.filter(c => c.state !== 'leer').map(c => {
                const act = active(c), ready = act.some(k => k.state === 'fertig');
                const oldest = act.map(k => k.calledAt).sort()[0];
                const badge = c.state === 'abgerufen' ? `in der Küche · ${minutesSince(oldest ?? new Date().toISOString())} min` : c.state === 'fertig' ? 'fertig – abholen' : STATE_LABEL[c.state];
                return (
                  <li key={c.course} className={'st-' + c.state + (c === p.current ? ' current' : '')}>
                    <div className="pc-head"><b>{t(c.course)}</b><span className={'pass-badge st-' + c.state}>{badge}</span></div>
                    <ul>
                      {c.dishes.map(x => {
                        const canMinus = x.open > 0 || c.calls.some(k => k.state !== 'serviert' && netCount(k, x.dishId) > 0);
                        return (
                          <li key={x.dishId}>
                            <span><b>{x.chosen - x.cancelled}×</b> {x.name}{x.cancelled ? <small className="danger"> ({x.cancelled} storniert)</small> : null}
                              {x.open > 0 && x.called > 0 && <small className="muted"> · {x.open} offen</small>}</span>
                            {canMinus && c.state !== 'serviert' && <button className="btn small ghost pass-minus" aria-label={`Storno ${x.name}`} title="Eine Portion stornieren" onClick={() => minusOne(c, x)}>−1</button>}
                          </li>
                        );
                      })}
                    </ul>
                    {c === p.current && c.dishes.some(x => x.open) && <button className="btn primary pass-call-btn" onClick={call}><BellRing />{t(c.course)} abrufen</button>}
                    {act.length > 0 && <div className="row pass-served">
                      <button className={'btn pass-call-btn' + (ready ? ' primary' : '')} onClick={() => act.forEach(k => setState(k, 'serviert'))}><Check />Serviert</button>
                      <small className="muted">abgerufen von {[...new Set(act.map(k => k.calledByName || 'Service'))].join(', ')}</small>
                    </div>}
                  </li>
                );
              })}
            </ol>
            {p.done && <p className="ok-text"><Check /> Alle Gänge serviert.</p>}
            <button className="btn small ghost mt8" onClick={() => setEdit({ counts: p.choice?.counts ?? {}, note: p.choice?.note ?? '' })}>Auswahl ändern</button>
          </>
        )}
    </section>
  );
}

/* ---------- Chef (Küche) ---------- */
export function ChefView() {
  const d = useData();
  const ui = useUi();
  const store = useApp();
  const serviceId = useServiceId();
  useTick(30000);
  const o = chefOverview(d, ui.date, serviceId);
  const svc = byId(d.services, serviceId);
  const ready = (c: CallView) => store.upsert('passCalls', [{ ...c.call, state: 'fertig', readyAt: new Date().toISOString() }], ['Gang fertig', `${c.label}: ${t(c.call.course)}`]);
  const back = (c: CallView) => store.upsert('passCalls', [{ ...c.call, state: 'abgerufen', readyAt: null }], ['Gang zurück in Arbeit', `${c.label}: ${t(c.call.course)}`]);

  if (!o.menu) return <div className="panel"><p className="muted">Für {svc?.name ?? 'diesen Service'} ist an diesem Tag kein Menü angelegt.</p></div>;
  return (
    <div className="chef">
      <section className="panel" aria-label="Zubereiten">
        <h3><ChefHat />Abgerufen – zubereiten <span className="count">{o.active.length}</span></h3>
        {!o.active.length && <p className="muted">Gerade ist nichts abgerufen.</p>}
        {byWaiter(o.active).map(([waiter, calls]) => (
          <div key={waiter} className="chef-waiter">
            <h4>{waiter}</h4>
            <div className="chef-cards">
              {calls.map(c => <CallCard key={c.call.id} c={c} action={<button className="btn primary" onClick={() => ready(c)}><Check />Fertig</button>} />)}
            </div>
          </div>
        ))}
      </section>
      <section className="panel" aria-label="Fertig">
        <h3><BellRing />Fertig – wartet auf Service <span className="count">{o.ready.length}</span></h3>
        {!o.ready.length && <p className="muted">Nichts wartet am Pass.</p>}
        <div className="chef-cards">
          {o.ready.map(c => <CallCard key={c.call.id} c={c} action={<button className="btn small ghost" onClick={() => back(c)} title="Doch noch nicht fertig"><Undo2 />Zurück</button>} />)}
        </div>
      </section>
      <section className="panel" aria-label="Gerichte">
        <h3><CookingPot />Gerichte</h3>
        <div className="table-scroll">
          <table className="chef-dishes">
            <thead><tr><th>Gericht</th><th>Gesamt</th><th>Offen</th><th>In Arbeit</th><th>Fertig</th><th>Serviert</th></tr></thead>
            <tbody>{o.dishes.map(x => (
              <tr key={x.dishId}><td>{x.name} <small className="muted">{t(x.course)}</small></td><td><b>{x.total}</b></td><td>{x.open}</td>
                <td className={x.inKitchen ? 'hot' : ''}>{x.inKitchen}</td><td>{x.ready}</td><td>{x.served}</td></tr>))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CallCard({ c, action }: { c: CallView; action: React.ReactNode }) {
  const min = minutesSince(c.call.calledAt);
  return (
    <div className={'chef-card st-' + c.call.state + (min >= 15 && c.call.state === 'abgerufen' ? ' late' : '')} aria-label={`${c.tables} ${t(c.call.course)}`}>
      <div className="pc-head"><b>{c.tables}</b><span className="muted"><Clock /> {min} min</span></div>
      <div className="muted" style={{ fontSize: 12 }}>{c.label} · {t(c.call.course)}</div>
      {hasAllergy(c.res) && <div className="danger" style={{ fontSize: 12 }}>⚠ {allergyText(c.res)}</div>}
      {c.note && <div className="chef-note">📝 {c.note}</div>}
      <ul>
        {c.lines.map(l => <li key={l.dishId}>
          {l.n - l.cancelled > 0 && <span><b>{l.n - l.cancelled}×</b> {l.name}</span>}
          {l.cancelled > 0 && <span className="storno"><s>{l.cancelled}× {l.name}</s> storniert</span>}
        </li>)}
      </ul>
      {action}
    </div>
  );
}
