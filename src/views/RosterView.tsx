/** Dienstplan (Etappe 1): Stammdaten – Mitarbeitende, Positionen, Schichtvorlagen je Bereich.
 *  Admin pflegt alles, Bereichsleitungen ihre eigenen Bereiche; die anderen Bereiche sehen sie nur. */
import { useEffect, useState } from 'react';
import { Plus, Search, Trash2 } from '../ui/icons';
import { newId } from '../domain/demo';
import { canPlanDept, contractActive, fmtHours, plannableDepartments, positionUsage, sortDepartments, sortStaff, templateTimes, workMin } from '../domain/roster';
import type { Department, Staff } from '../domain/types';
import { t } from '../lib/i18n';
import { today } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useRole, useUserId } from '../store/hooks';
import { useUi } from '../store/ui';
import { openDialog } from '../store/dialogs';
import { confirmDialog, toast } from '../ui/notify';

/** "JJJJ-MM-TT" → "TT.MM.JJJJ" */
const dmy = (s: string) => s.split('-').reverse().join('.');

/** Farbpunkt für Bereiche, Mitarbeitende, Vorlagen */
export const Dot = ({ color }: { color: string }) => <span className="dot" style={{ background: color }} aria-hidden="true" />;

export function RosterView() {
  const d = useData();
  const ui = useUi();
  const role = useRole(), userId = useUserId();
  const tab = ui.rosterTab;
  const depts = sortDepartments(d.departments);
  const mine = plannableDepartments(role, d.departments, userId);
  // Filter auf einen gelöschten Bereich zurücksetzen
  const dept = depts.some(x => x.id === ui.rosterDept) ? ui.rosterDept : '';
  const preset = mine.some(x => x.id === dept) ? dept : mine[0]?.id;
  return (
    <div className="panel roster-view">
      <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <div className="seg" role="group" aria-label="Bereich">
          <button className="btn" aria-pressed={tab === 'staff'} onClick={() => ui.set({ rosterTab: 'staff' })}>Mitarbeitende <span className="count">{d.staff.filter(x => x.active).length}</span></button>
          <button className="btn" aria-pressed={tab === 'positions'} onClick={() => ui.set({ rosterTab: 'positions' })}>Positionen</button>
          <button className="btn" aria-pressed={tab === 'templates'} onClick={() => ui.set({ rosterTab: 'templates' })}>Schichtvorlagen</button>
        </div>
        <select aria-label="Bereichsfilter" value={dept} onChange={e => ui.set({ rosterDept: e.target.value })} style={{ width: 'auto' }}>
          <option value="">Alle Bereiche</option>
          {depts.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <span className="spacer" />
        {preset && tab === 'staff' && <button className="btn primary" onClick={() => openDialog({ type: 'staff', departmentId: preset })}><Plus />Mitarbeiter/in</button>}
        {preset && tab === 'templates' && <button className="btn primary" onClick={() => openDialog({ type: 'shifttemplate', departmentId: preset })}><Plus />Vorlage</button>}
      </div>
      {!depts.length ? <NoDepartments admin={role === 'admin'} />
        : tab === 'staff' ? <StaffList dept={dept} />
        : tab === 'positions' ? <PositionList depts={dept ? depts.filter(x => x.id === dept) : depts} />
        : <TemplateList depts={dept ? depts.filter(x => x.id === dept) : depts} />}
      {depts.length > 0 && !mine.length && <p className="body muted" style={{ fontSize: 12 }}>Sie leiten keinen Bereich und können hier nur ansehen.</p>}
    </div>
  );
}

function NoDepartments({ admin }: { admin: boolean }) {
  return <p className="body muted">{admin ? 'Noch keine Bereiche angelegt. Bitte zuerst unter Einstellungen → „Bereiche & Leitungen“ die Bereiche (z. B. Küche, Service) anlegen und die Bereichsleitungen zuweisen.' : 'Noch keine Bereiche angelegt.'}</p>;
}

function StaffList({ dept }: { dept: string }) {
  const d = useData();
  const [q, setQ] = useState('');
  const [old, setOld] = useState(false);
  const t0 = today();
  const deptName = (id: string | null) => d.departments.find(x => x.id === id)?.name ?? '–';
  const posIn = (s: Staff, depId: string) => s.positionIds.some(p => d.positions.find(x => x.id === p)?.departmentId === depId);
  const ql = q.trim().toLowerCase();
  // im Bereichsfilter auch Mitarbeitende anderer Bereiche zeigen, die dort einsetzbar sind
  const list = sortStaff(d.staff).filter(s => (old || s.active) && (!dept || s.departmentId === dept || posIn(s, dept))
    && (!ql || [s.name, s.short].join(' ').toLowerCase().includes(ql)));
  const hidden = d.staff.filter(s => !s.active).length;
  return (
    <div className="body">
      <div className="row mb8">
        <label className="searchbox" style={{ flex: 1 }}><Search /><input type="search" placeholder="Suchen…" value={q} onChange={e => setQ(e.target.value)} aria-label="Suchen" /></label>
        {hidden > 0 && <label className="chk"><input type="checkbox" checked={old} onChange={e => setOld(e.target.checked)} /> Ausgeschiedene anzeigen ({hidden})</label>}
      </div>
      {list.length ? <div className="table-scroll"><table className="list staff-table"><thead><tr><th>Name</th><th>Bereich</th><th>Positionen</th><th>Vertrag</th><th>Std./Woche</th></tr></thead>
        <tbody>{list.map(s => {
          const guest = dept && s.departmentId !== dept;
          const expired = s.active && !contractActive(s, t0);
          return (
            <tr key={s.id} className={'clickable' + (s.active ? '' : ' inactive')} onClick={() => openDialog({ type: 'staff', staff: s })}>
              <td><Dot color={s.color} /><b>{s.name}</b> {s.short && <span className="badge">{s.short}</span>}{!s.active && <span className="badge">ausgeschieden</span>}</td>
              <td>{deptName(s.departmentId)}{guest && <span className="badge" title="Stammbereich ist ein anderer, aber einsetzbar">einsetzbar</span>}</td>
              <td style={{ fontSize: 13 }}>{s.positionIds.map(p => d.positions.find(x => x.id === p)?.name).filter(Boolean).join(', ') || <span className="muted">–</span>}</td>
              <td style={{ fontSize: 13 }}>{t(s.contract)}
                {(s.contractFrom || s.contractTo) && <div className={expired ? '' : 'muted'} style={{ fontSize: 12, color: expired ? 'var(--danger)' : undefined }}>
                  {s.contractFrom ? dmy(s.contractFrom) : '…'} – {s.contractTo ? dmy(s.contractTo) : '…'}{expired && ' · nicht im Vertrag'}</div>}</td>
              <td>{s.weeklyHours.toLocaleString('de-DE')}</td>
            </tr>
          );
        })}</tbody></table></div>
        : <p className="muted">{ql ? 'Nichts gefunden.' : 'Noch keine Mitarbeitenden in diesem Bereich.'}</p>}
    </div>
  );
}

function PositionList({ depts }: { depts: Department[] }) {
  return <div className="body roster-depts">{depts.map(x => <PositionCard key={x.id} dep={x} />)}</div>;
}

function PositionCard({ dep }: { dep: Department }) {
  const d = useData();
  const store = useApp();
  const edit = canPlanDept(useRole(), d.departments, useUserId(), dep.id);
  const [name, setName] = useState('');
  const list = d.positions.filter(x => x.departmentId === dep.id).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));
  const exists = (n: string, id?: string) => list.some(x => x.id !== id && x.name.trim().toLowerCase() === n.toLowerCase());
  async function add() {
    const n = name.trim(); if (!n) return;
    if (exists(n)) return toast('Diese Position gibt es in diesem Bereich schon', 'err');
    if (await store.upsert('positions', [{ id: newId(), departmentId: dep.id, name: n, sort: Math.max(-1, ...list.map(x => x.sort)) + 1 }], ['Position angelegt', `${dep.name}: ${n}`])) setName('');
  }
  return (
    <div className="panel roster-dept">
      <h3><Dot color={dep.color} />{dep.name}</h3>
      <div className="body">
        {!list.length && <p className="muted" style={{ margin: 0 }}>Noch keine Positionen.</p>}
        {list.map(p => <PositionRow key={p.id} id={p.id} name={p.name} edit={edit} dep={dep} exists={exists} />)}
        {edit && <div className="row mt8">
          <input aria-label={`Neue Position ${dep.name}`} placeholder="Neue Position, z. B. Commis" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }} style={{ flex: 1 }} />
          <button className="btn" onClick={add} disabled={!name.trim()}><Plus />Position</button>
        </div>}
      </div>
    </div>
  );
}

function PositionRow({ id, name, edit, dep, exists }: { id: string; name: string; edit: boolean; dep: Department; exists: (n: string, id?: string) => boolean }) {
  const d = useData();
  const store = useApp();
  const [v, setV] = useState(name);
  useEffect(() => setV(name), [name]);
  const pos = d.positions.find(x => x.id === id)!;
  const use = positionUsage(d, id);
  async function commit() {
    const n = v.trim();
    if (n === name) return;
    if (!n || exists(n, id)) { setV(name); return toast(n ? 'Diese Position gibt es in diesem Bereich schon' : 'Bitte einen Namen eingeben', 'err'); }
    await store.upsert('positions', [{ ...pos, name: n }], ['Position geändert', `${dep.name}: ${name} → ${n}`]);
  }
  async function remove() {
    const lines = [`${dep.name}: ${name}`];
    if (use.staff) lines.push(`${use.staff} Mitarbeitende verlieren diese Qualifikation.`);
    if (use.templates) lines.push(`${use.templates} Schichtvorlagen verlieren die Position.`);
    if (await confirmDialog('Position löschen?', lines, 'Löschen', true)) store.remove('positions', [id], ['Position gelöscht', `${dep.name}: ${name}`]);
  }
  return (
    <div className="row position-row">
      {edit ? <input aria-label={`Position ${name}`} value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ flex: 1 }} />
        : <span style={{ flex: 1 }}>{name}</span>}
      <span className="muted" style={{ fontSize: 12, minWidth: 90 }}>{use.staff ? `${use.staff} Mitarb.` : 'niemand'}</span>
      {edit && <button className="btn small icon ghost danger" aria-label={`Position ${name} löschen`} title="Löschen" onClick={remove}><Trash2 /></button>}
    </div>
  );
}

function TemplateList({ depts }: { depts: Department[] }) {
  const d = useData();
  const role = useRole(), userId = useUserId();
  return (
    <div className="body">
      {depts.map(dep => {
        const list = d.shiftTemplates.filter(x => x.departmentId === dep.id).sort((a, b) => a.sort - b.sort || a.start.localeCompare(b.start));
        const edit = canPlanDept(role, d.departments, userId, dep.id);
        return (
          <section key={dep.id} className="roster-tpl-group">
            <div className="row"><h4><Dot color={dep.color} />{dep.name}</h4><span className="spacer" />
              {edit && <button className="btn small" onClick={() => openDialog({ type: 'shifttemplate', departmentId: dep.id })}><Plus />Vorlage</button>}</div>
            {list.length ? <div className="table-scroll"><table className="list"><thead><tr><th>Vorlage</th><th>Zeiten</th><th>Pause</th><th>Arbeitszeit</th><th>Position</th></tr></thead>
              <tbody>{list.map(x => (
                <tr key={x.id} className="clickable" onClick={() => openDialog({ type: 'shifttemplate', tpl: x })}>
                  <td><span className="tpl-chip" style={{ background: x.color }}>{x.short || x.name.slice(0, 2)}</span><b>{x.name}</b></td>
                  <td>{templateTimes(x)}{x.end < x.start && <span className="badge" title="Endet am Folgetag">über Mitternacht</span>}</td>
                  <td>{x.breakMin ? `${x.breakMin} Min.` : '–'}</td>
                  <td>{fmtHours(workMin(x))}</td>
                  <td>{d.positions.find(p => p.id === x.positionId)?.name ?? <span className="muted">alle</span>}</td>
                </tr>
              ))}</tbody></table></div>
              : <p className="muted">Noch keine Vorlagen.</p>}
          </section>
        );
      })}
    </div>
  );
}
