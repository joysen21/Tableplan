/** Modul Fälligkeiten: Dashboard (überfällig, heute fällig, demnächst fällig) und Liste aller Fälligkeiten.
 *  Flag = erledigt (mit Intervall: nächster Termin), Formular mit Gruppe (erweiterbar), Verantwortlichem, Intervall und Erinnerung. */
import { useEffect, useState } from 'react';
import { AlarmClock, CalendarCheck, Flag, Plus, Trash2, TriangleAlert } from '../ui/icons';
import { DUE_LABEL, completeDue, dueDashboard, dueRelative, dueState, intervalText, reminderDate, reopenDue } from '../domain/due';
import { newId } from '../domain/demo';
import { byId } from '../domain/logic';
import type { DueItem } from '../domain/types';
import { repo } from '../data';
import { addDays, fmtShort, today } from '../lib/time';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { Modal } from '../ui/Modal';
import { confirmDialog, toast } from '../ui/notify';

type Tab = 'dashboard' | 'liste';

export function DueView() {
  const d = useData();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [edit, setEdit] = useState<{ x: DueItem; isNew: boolean } | null>(null);
  const t0 = today();
  const blank = (): DueItem => ({ id: newId(), title: '', groupId: d.dueGroups[0]?.id ?? null, dueDate: addDays(t0, 30), intervalMonths: 12, staffId: null, staffName: '',
    reminderDays: 14, done: false, doneAt: null, lastDone: null, note: '' });
  const dash = dueDashboard(d.dueItems, t0);
  return (
    <div className="due">
      <div className="row due-head">
        <div className="seg" role="tablist" aria-label="Fälligkeiten">
          <button role="tab" className="btn" aria-selected={tab === 'dashboard'} aria-pressed={tab === 'dashboard'} onClick={() => setTab('dashboard')}>Dashboard
            {dash.ueberfaellig.length + dash.faellig.length + dash.bald.length > 0 && <span className="count warn">{dash.ueberfaellig.length + dash.faellig.length + dash.bald.length}</span>}</button>
          <button role="tab" className="btn" aria-selected={tab === 'liste'} aria-pressed={tab === 'liste'} onClick={() => setTab('liste')}>Alle Fälligkeiten <span className="count">{d.dueItems.length}</span></button>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEdit({ x: blank(), isNew: true })}><Plus />Neue Fälligkeit</button>
      </div>
      {tab === 'dashboard' ? (
        <div className="due-dash">
          <DueSection title="Überfällig" cls="ueberfaellig" icon={<TriangleAlert />} items={dash.ueberfaellig} onOpen={x => setEdit({ x, isNew: false })} empty="Nichts überfällig." />
          <DueSection title="Heute fällig" cls="faellig" icon={<AlarmClock />} items={dash.faellig} onOpen={x => setEdit({ x, isNew: false })} empty="Heute ist nichts fällig." />
          <DueSection title="Demnächst fällig" cls="bald" icon={<CalendarCheck />} items={dash.bald} onOpen={x => setEdit({ x, isNew: false })} empty="In der Erinnerungszeit liegt nichts." />
        </div>
      ) : <DueList onOpen={x => setEdit({ x, isNew: false })} />}
      {edit && <DueForm initial={edit.x} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Flag: erledigen (bzw. bei einmaligen zurücknehmen) */
function DueFlag({ x }: { x: DueItem }) {
  const store = useApp();
  const t0 = today();
  const toggle = async () => {
    if (x.done) { store.upsert('dueItems', [reopenDue(x)], ['Fälligkeit wieder offen', x.title]); return; }
    const next = completeDue(x, t0);
    if (await store.upsert('dueItems', [next], ['Fälligkeit erledigt', x.title]))
      toast(next.done ? 'Erledigt' : `Erledigt – nächster Termin ${fmtShort(next.dueDate)}`);
  };
  return <button type="button" className={'btn small icon ghost due-flag' + (x.done ? ' on' : '')} aria-pressed={x.done}
    aria-label={x.done ? `${x.title} wieder öffnen` : `${x.title} erledigt`} title={x.done ? 'Wieder öffnen' : x.intervalMonths ? 'Erledigt – nächster Termin wird gesetzt' : 'Erledigt'} onClick={toggle}><Flag /></button>;
}

function DueRow({ x, onOpen }: { x: DueItem; onOpen: (x: DueItem) => void }) {
  const d = useData();
  const t0 = today(), st = dueState(x, t0);
  return (
    <li className={'due-row st-' + st}>
      <DueFlag x={x} />
      <button type="button" className="due-main" onClick={() => onOpen(x)}>
        <b>{x.title}</b>
        <small className="muted">{[byId(d.dueGroups, x.groupId)?.name, x.staffName, intervalText(x.intervalMonths)].filter(Boolean).join(' · ')}</small>
      </button>
      <span className="due-date"><b>{fmtShort(x.dueDate)}</b><small>{x.done ? `erledigt ${x.doneAt ? fmtShort(x.doneAt) : ''}` : dueRelative(x.dueDate, t0)}</small></span>
    </li>
  );
}

function DueSection({ title, cls, icon, items, onOpen, empty }: { title: string; cls: string; icon: React.ReactNode; items: DueItem[]; onOpen: (x: DueItem) => void; empty: string }) {
  return (
    <section className={'panel due-sec ' + cls} aria-label={title}>
      <h3>{icon}{title} <span className="count">{items.length}</span></h3>
      {!items.length ? <p className="muted pad">{empty}</p> : <ul className="due-rows">{items.map(x => <DueRow key={x.id} x={x} onOpen={onOpen} />)}</ul>}
    </section>
  );
}

function DueList({ onOpen }: { onOpen: (x: DueItem) => void }) {
  const d = useData();
  const [group, setGroup] = useState('');
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const list = d.dueItems
    .filter(x => (!group || x.groupId === group) && (showDone || !x.done) && (!q || `${x.title} ${x.staffName} ${x.note}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate));
  return (
    <section className="panel">
      <div className="row pad due-filter">
        <input type="search" placeholder="Suchen…" aria-label="Fälligkeiten suchen" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <select aria-label="Gruppe filtern" value={group} onChange={e => setGroup(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Alle Gruppen</option>{d.dueGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <label className="chk"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Erledigte zeigen</label>
      </div>
      {!list.length ? <p className="muted pad">Keine Fälligkeiten.</p> : <ul className="due-rows">{list.map(x => <DueRow key={x.id} x={x} onOpen={onOpen} />)}</ul>}
    </section>
  );
}

function DueForm({ initial, isNew, onClose }: { initial: DueItem; isNew: boolean; onClose: () => void }) {
  const d = useData();
  const store = useApp();
  const [x, setX] = useState<DueItem>(initial);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [newGroup, setNewGroup] = useState<string | null>(null);
  useEffect(() => { repo.dueStaff(d.venue.id).then(setStaff).catch(() => setStaff([])); }, [d.venue.id]);
  const upd = (p: Partial<DueItem>) => setX(v => ({ ...v, ...p }));
  const groups = [...d.dueGroups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));

  const addGroup = async () => {
    const name = (newGroup ?? '').trim();
    if (!name) return setNewGroup(null);
    const ex = groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (ex) { upd({ groupId: ex.id }); setNewGroup(null); return; }
    const g = { id: newId(), name, sort: groups.length };
    if (await store.upsert('dueGroups', [g], ['Gruppe angelegt', name])) { upd({ groupId: g.id }); setNewGroup(null); }
  };
  const save = async () => {
    if (!x.title.trim()) return toast('Bitte eine Beschreibung eingeben', 'err');
    if (!x.dueDate) return toast('Bitte das Fälligkeitsdatum eingeben', 'err');
    if (await store.upsert('dueItems', [{ ...x, title: x.title.trim(), note: x.note.trim() }], [isNew ? 'Fälligkeit angelegt' : 'Fälligkeit geändert', `${x.title.trim()} · ${fmtShort(x.dueDate)}`])) onClose();
  };
  const del = async () => {
    if (!(await confirmDialog('Fälligkeit löschen?', [x.title], 'Löschen', true))) return;
    if (await store.remove('dueItems', [x.id], ['Fälligkeit gelöscht', x.title])) onClose();
  };
  return (
    <Modal title={isNew ? 'Neue Fälligkeit' : 'Fälligkeit'} onClose={onClose} width={560} footer={<>
      {!isNew && <button className="btn danger" onClick={del}><Trash2 />Löschen</button>}
      <span className="spacer" />
      <button className="btn" onClick={onClose}>Abbrechen</button>
      <button className="btn primary" onClick={save}>Speichern</button></>}>
      <div className="xform">
        <label className="wide">Beschreibung *<input value={x.title} autoFocus={isNew} maxLength={200} placeholder="z. B. Feuerlöscher prüfen" onChange={e => upd({ title: e.target.value })} /></label>
        <label className="wide">Gruppe
          {newGroup === null ? (
            <select value={x.groupId ?? ''} onChange={e => e.target.value === '__neu' ? setNewGroup('') : upd({ groupId: e.target.value || null })}>
              <option value="">– keine –</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__neu">＋ Neue Gruppe…</option>
            </select>
          ) : (
            <span className="row" style={{ gap: 6 }}>
              <input aria-label="Neue Gruppe" autoFocus value={newGroup} placeholder="Name der Gruppe" onChange={e => setNewGroup(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }} />
              <button type="button" className="btn small primary" onClick={addGroup}>Anlegen</button>
              <button type="button" className="btn small" onClick={() => setNewGroup(null)}>Abbrechen</button>
            </span>
          )}</label>
        <label>Fälligkeit *<input type="date" value={x.dueDate} onChange={e => e.target.value && upd({ dueDate: e.target.value, done: false, doneAt: null })} /></label>
        <label>Intervall (Monate)<input type="number" min={0} max={240} value={x.intervalMonths} onChange={e => upd({ intervalMonths: Math.max(0, Math.min(240, Math.round(+e.target.value || 0))) })} />
          <small className="muted">{intervalText(x.intervalMonths)}</small></label>
        <label>Verantwortlich<select value={x.staffId ?? ''} onChange={e => { const s = staff.find(y => y.id === e.target.value); upd({ staffId: s?.id ?? null, staffName: s?.name ?? '' }); }}>
          <option value="">– niemand –</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          {x.staffId && !staff.some(s => s.id === x.staffId) && <option value={x.staffId}>{x.staffName}</option>}
        </select>{!staff.length && <small className="muted">Mitarbeitende kommen aus dem Dienstplan.</small>}</label>
        <label>Erinnerung (Tage vorher)<input type="number" min={0} max={365} value={x.reminderDays} onChange={e => upd({ reminderDays: Math.max(0, Math.min(365, Math.round(+e.target.value || 0))) })} />
          <small className="muted">Meldung ab {fmtShort(reminderDate(x))}</small></label>
        <label className="wide">Notiz<input value={x.note} maxLength={500} onChange={e => upd({ note: e.target.value })} /></label>
      </div>
      {!isNew && <p className="muted" style={{ fontSize: 12 }}>Stand: <b>{DUE_LABEL[dueState(x, today())]}</b>{x.lastDone ? ` · zuletzt erledigt ${fmtShort(x.lastDone)}` : ''}</p>}
    </Modal>
  );
}

/** Gruppen der Fälligkeiten verwalten (Einstellungen → Module → Fälligkeiten) */
export function DueGroupSettings() {
  const d = useData();
  const store = useApp();
  const groups = [...d.dueGroups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));
  return (
    <div className="mt8">
      <h4 style={{ margin: '10px 0 6px' }}>Gruppen</h4>
      {groups.map(g => (
        <div key={g.id} className="row mb8 supplier-row">
          <input aria-label={`Name Gruppe ${g.name}`} defaultValue={g.name} key={g.name} style={{ flex: 1, minWidth: 160 }}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== g.name) store.upsert('dueGroups', [{ ...g, name: v }], ['Gruppe umbenannt', v]); }} />
          <button className="btn small icon ghost danger" aria-label={`Gruppe ${g.name} löschen`} title="Löschen" onClick={async () => {
            const n = d.dueItems.filter(x => x.groupId === g.id).length;
            if (await confirmDialog('Gruppe löschen?', [g.name, ...(n ? [`${n} Fälligkeiten bleiben erhalten, nur ohne Gruppe.`] : [])], 'Löschen', true))
              store.remove('dueGroups', [g.id], ['Gruppe gelöscht', g.name]);
          }}><Trash2 /></button>
        </div>
      ))}
      <button className="btn small" onClick={() => store.upsert('dueGroups', [{ id: newId(), name: 'Neue Gruppe', sort: groups.length }], ['Gruppe angelegt', ''])}><Plus />Gruppe</button>
    </div>
  );
}
