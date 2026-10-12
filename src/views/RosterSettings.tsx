/** Einstellungen (Admin): Zusatzmodule ein-/ausschalten, Bereiche & Bereichsleitungen des Dienstplans */
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from '../ui/icons';
import { repo } from '../data';
import { newId } from '../domain/demo';
import { ROSTER_COLORS } from '../domain/constants';
import { departmentUsage, sortDepartments } from '../domain/roster';
import type { Department, Member } from '../domain/types';
import { useApp } from '../store/app';
import { EDITION } from '../lib/edition';
import { useData } from '../store/hooks';
import { confirmDialog, toast } from '../ui/notify';
import { Dot } from './RosterView';

export function ModulesPanel() {
  const d = useData();
  // eigenständige Dienstplan-App: Modul ist immer an, nur Bereiche & Leitungen
  if (EDITION === 'dienstplan') return <div className="panel mt12"><h3>Bereiche & Leitungen</h3><div className="body"><DepartmentsAdmin heading={false} /></div></div>;
  const setModules = useApp(s => s.setModules);
  const on = d.venue.modules.includes('dienstplan');
  return (
    <div className="panel mt12"><h3>Module</h3><div className="body">
      <label className="chk"><input type="checkbox" checked={on} onChange={e => setModules(e.target.checked ? [...d.venue.modules, 'dienstplan'] : d.venue.modules.filter(m => m !== 'dienstplan'))} />
        <b>Dienstplan</b></label>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Personalplanung je Bereich (Küche, Service …). Sichtbar für Admins und die Bereichsleitungen; ausschalten blendet das Modul nur aus, die Daten bleiben erhalten.</p>
      {on && <DepartmentsAdmin />}
    </div></div>
  );
}

function DepartmentsAdmin({ heading = true }: { heading?: boolean }) {
  const d = useData();
  const store = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState('');
  useEffect(() => { repo.members(d.venue.id).then(setMembers).catch(e => toast(e.message, 'err')); }, [d.venue.id]);
  const list = sortDepartments(d.departments);
  async function add() {
    const n = name.trim(); if (!n) return;
    if (list.some(x => x.name.trim().toLowerCase() === n.toLowerCase())) return toast('Diesen Bereich gibt es schon', 'err');
    const dep: Department = { id: newId(), name: n, color: ROSTER_COLORS[list.length % ROSTER_COLORS.length], sort: Math.max(-1, ...list.map(x => x.sort)) + 1, leadIds: [] };
    if (await store.upsert('departments', [dep], ['Bereich angelegt', n])) setName('');
  }
  return (
    <>
      {heading && <h4 style={{ margin: '14px 0 6px' }}>Bereiche & Leitungen</h4>}
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Bereichsleitungen planen ihren Bereich (Mitarbeitende, Positionen, Schichtvorlagen) – unabhängig von ihrer Rolle. Ein Bereich kann mehrere Leitungen haben.</p>
      {list.map(dep => <DepartmentRow key={dep.id} dep={dep} members={members} />)}
      <div className="row mt8">
        <input aria-label="Neuer Bereich" placeholder="Neuer Bereich, z. B. Housekeeping" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} style={{ flex: 1 }} />
        <button className="btn" onClick={add} disabled={!name.trim()}><Plus />Bereich</button>
      </div>
    </>
  );
}

function DepartmentRow({ dep, members }: { dep: Department; members: Member[] }) {
  const d = useData();
  const store = useApp();
  const [nm, setNm] = useState(dep.name);
  useEffect(() => setNm(dep.name), [dep.name]);
  const save = (p: Partial<Department>, text: string) => store.upsert('departments', [{ ...dep, ...p }], ['Bereich geändert', `${dep.name}: ${text}`]);
  const toggleLead = (m: Member) => {
    const on = dep.leadIds.includes(m.userId);
    save({ leadIds: on ? dep.leadIds.filter(x => x !== m.userId) : [...dep.leadIds, m.userId] }, `${on ? 'Leitung entfernt' : 'Leitung'} ${m.name}`);
  };
  // Leitungen, die nicht mehr Mitglied des Betriebs sind
  const gone = dep.leadIds.filter(id => members.length && !members.some(m => m.userId === id));
  async function remove() {
    const u = departmentUsage(d, dep.id);
    const lines = [dep.name];
    if (u.positions || u.templates) lines.push(`${u.positions} Positionen und ${u.templates} Schichtvorlagen werden ebenfalls gelöscht.`);
    if (u.staff) lines.push(`${u.staff} Mitarbeitende verlieren ihren Stammbereich (nur Admins können sie dann bearbeiten).`);
    if (await confirmDialog('Bereich löschen?', lines, 'Löschen', true)) store.remove('departments', [dep.id], ['Bereich gelöscht', dep.name]);
  }
  return (
    <div className="panel dept-card">
      <div className="row">
        <Dot color={dep.color} />
        <input aria-label={`Name Bereich ${dep.name}`} value={nm} onChange={e => setNm(e.target.value)} style={{ flex: 1 }}
          onBlur={() => { const n = nm.trim(); if (n && n !== dep.name) save({ name: n }, `umbenannt in ${n}`); else setNm(dep.name); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <input type="color" aria-label={`Farbe Bereich ${dep.name}`} value={dep.color} onChange={e => save({ color: e.target.value }, 'Farbe')} className="color-input" />
        <button className="btn small icon ghost danger" aria-label={`Bereich ${dep.name} löschen`} title="Bereich löschen" onClick={remove}><Trash2 /></button>
      </div>
      <div className="chips mt8" role="group" aria-label={`Leitung ${dep.name}`}>
        <small className="muted" style={{ alignSelf: 'center' }}>Leitung:</small>
        {members.map(m => <button key={m.userId} type="button" className="btn small" aria-pressed={dep.leadIds.includes(m.userId)} onClick={() => toggleLead(m)}>{m.name}</button>)}
        {gone.length > 0 && <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>+ {gone.length} ehemalige/r Benutzer/in</span>}
      </div>
    </div>
  );
}
