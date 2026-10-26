/** Einstellungen (Admin): Module (je Modul eine Gruppe), Bereiche & Bereichsleitungen des Dienstplans */
import { useEffect, useState } from 'react';
import { Bike, CalendarCheck, ConciergeBell, HandHeart, Plus, ShoppingCart, SquareParking, Trash2, type LucideIcon } from '../ui/icons';
import { ModuleToggle, ResourceSettings, SupplierSettings, TherapySettings } from '../forms/ModuleSettings';
import { repo } from '../data';
import { newId } from '../domain/demo';
import { ROSTER_COLORS } from '../domain/constants';
import { departmentUsage, sortDepartments } from '../domain/roster';
import type { Department, Member, ModuleKey, RosterSettings } from '../domain/types';
import { DEFAULT_ROSTER_SETTINGS, rosterSettings } from '../domain/rosterPlan';
import { useApp } from '../store/app';
import { EDITION } from '../lib/edition';
import { useData } from '../store/hooks';
import { confirmDialog, toast } from '../ui/notify';
import { DeptIcon, DeptIconPicker } from '../ui/DeptIcon';
import { DueGroupSettings } from './DueView';

/** Eigenständige Dienstplan-App: Modul ist immer an, nur Bereiche & Leitungen und Prüfregeln */
export function ModulesPanel() {
  // eigenständige Dienstplan-App: Modul ist immer an, nur Bereiche & Leitungen
  if (EDITION === 'dienstplan') return <>
    <div className="panel mt12"><h3>Bereiche & Leitungen</h3><div className="body"><DepartmentsAdmin heading={false} /></div></div>
    <div className="panel mt12"><h3>Prüfregeln</h3><div className="body"><RulesForm /></div></div>
  </>;
  return null;
}

/** Modul Dienstplan (Tischplan): ein/aus, Bereiche & Leitungen, Prüfregeln */
export function DienstplanModule() {
  const d = useData();
  const setModules = useApp(s => s.setModules);
  const on = d.venue.modules.includes('dienstplan');
  return (
    <div className="body">
      <label className="chk"><input type="checkbox" checked={on} onChange={e => setModules(e.target.checked ? [...d.venue.modules, 'dienstplan'] : d.venue.modules.filter(m => m !== 'dienstplan'))} />
        <b>Dienstplan</b></label>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Personalplanung je Bereich (Küche, Service …). Sichtbar für Admins und die Bereichsleitungen; ausschalten blendet das Modul nur aus, die Daten bleiben erhalten.</p>
      {on && <DepartmentsAdmin />}
      {on && <><h4 style={{ margin: '14px 0 6px' }}>Prüfregeln</h4><RulesForm /></>}
    </div>
  );
}

/** Weitere Module: je Modul ein/aus, Sichtbarkeit je Rolle und die zugehörigen Einstellungen */
export const MODULE_GROUPS: { mod: ModuleKey; title: string; icon: LucideIcon; hint: string; body: () => JSX.Element }[] = [
  { mod: 'pass', title: 'Pass + Chef', icon: ConciergeBell, hint: 'Gänge abrufen, Küche meldet fertig',
    body: () => <ModuleToggle mod="pass" label="Pass + Chef" hint="Service ruft Gänge ab (Pass-Plan nach Gang-Stand eingefärbt), Küche meldet fertig, Service serviert. Chef-Ansicht mit Abrufen je Kellner, demnächst kommenden Gängen und Mengen je Gericht." /> },
  { mod: 'garage', title: 'Garage', icon: SquareParking, hint: 'Stellplätze, Ladeplätze',
    body: () => <ModuleToggle mod="garage" label="Garage" hint="Stellplätze einzeln (mit Ladeplatz für E-Autos); Buchung je Hotelgast von–bis mit Kennzeichen, Belegungsplan über 14 Nächte."><ResourceSettings mod="garage" /></ModuleToggle> },
  { mod: 'massage', title: 'Massage', icon: HandHeart, hint: 'Masseurinnen, Therapien',
    body: () => <ModuleToggle mod="massage" label="Massage" hint="Masseurinnen mit Anwesenheit, Therapien mit Dauer und Preis; Tages-Zeitleiste je Masseurin, Buchung nur für Hotelgäste."><ResourceSettings mod="massage" /><TherapySettings /></ModuleToggle> },
  { mod: 'fahrrad', title: 'Fahrrad', icon: Bike, hint: 'Räder mit Art und Größe',
    body: () => <ModuleToggle mod="fahrrad" label="Fahrrad" hint="Räder einzeln mit Art und Größe; Buchung ganzer Tag, Vormittag oder Nachmittag, Wochenplan."><ResourceSettings mod="fahrrad" /></ModuleToggle> },
  { mod: 'faelligkeiten', title: 'Fälligkeiten', icon: CalendarCheck, hint: 'Termine mit Erinnerung, Gruppen',
    body: () => <ModuleToggle mod="faelligkeiten" label="Fälligkeiten" hint="Wiederkehrende und einmalige Termine (Wartung, Prüfungen, Verträge …) mit Gruppe, Verantwortlichem, Intervall und Erinnerung; Dashboard mit überfälligen, heute und demnächst fälligen."><DueGroupSettings /></ModuleToggle> },
  { mod: 'bestellliste', title: 'Bestellliste', icon: ShoppingCart, hint: 'Lieferanten, Bestellung per WhatsApp',
    body: () => <ModuleToggle mod="bestellliste" label="Bestellliste" hint="Artikellisten je Lieferant, Bestellung per WhatsApp, Historie und Auswertung je Monat."><SupplierSettings /></ModuleToggle> }
];

/** Prüfregeln des Dienstplans (Warnungen, keine Sperren) */
function RulesForm() {
  const d = useData();
  const setRosterSettings = useApp(s => s.setRosterSettings);
  const cur = rosterSettings(d.venue);
  const field = (key: keyof RosterSettings, label: string, max: number) => (
    <label>{label}<input type="number" min={0} max={max} step={key === 'minBreakMin' ? 5 : 1} key={key + cur[key]} defaultValue={cur[key]} aria-label={label}
      onBlur={e => { const v = Math.max(0, Math.min(max, +e.target.value || 0)); if (v !== cur[key]) setRosterSettings({ ...(d.venue.rosterSettings ?? {}), [key]: v }); }} /></label>
  );
  const changed = JSON.stringify(cur) !== JSON.stringify(DEFAULT_ROSTER_SETTINGS);
  return (
    <>
      <div className="grid3 rules-grid">
        {field('restHours', 'Ruhezeit (Std.)', 24)}
        {field('maxWeekHours', 'Max. Wochenstunden', 80)}
        {field('freeDaysPerWeek', 'Freie Tage / Woche', 7)}
        {field('breakAfterHours', 'Pause ab (Std.)', 24)}
        {field('minBreakMin', 'Mindestpause (Min.)', 120)}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Standard nach D.Lgs. 66/2003 und CCNL Turismo: 11 h Ruhezeit, max. 48 h, 1 freier Tag, Pause ab 6 h (mind. 10 Min.). Abweichungen erscheinen im Dienstplan als Hinweis.
        {changed && <> <button className="link" onClick={() => setRosterSettings({})}>Standard wiederherstellen</button></>}</p>
    </>
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
    const dep: Department = { id: newId(), name: n, color: ROSTER_COLORS[list.length % ROSTER_COLORS.length], sort: Math.max(-1, ...list.map(x => x.sort)) + 1, leadIds: [], guestsPerStaff: null, minStaff: 0 };
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
        <DeptIcon dep={dep} />
        <input aria-label={`Name Bereich ${dep.name}`} value={nm} onChange={e => setNm(e.target.value)} style={{ flex: 1 }}
          onBlur={() => { const n = nm.trim(); if (n && n !== dep.name) save({ name: n }, `umbenannt in ${n}`); else setNm(dep.name); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <input type="color" aria-label={`Farbe Bereich ${dep.name}`} value={dep.color} onChange={e => save({ color: e.target.value }, 'Farbe')} className="color-input" />
        <button className="btn small icon ghost danger" aria-label={`Bereich ${dep.name} löschen`} title="Bereich löschen" onClick={remove}><Trash2 /></button>
      </div>
      <div className="mt8"><small className="muted">Icon (wird vor Bereich und Mitarbeitenden angezeigt):</small>
        <DeptIconPicker value={dep.icon} color={dep.color} onChange={icon => save({ icon }, icon ? `Icon ${icon}` : 'Icon entfernt')} /></div>
      <div className="row mt8 dept-staffing">
        <label>1 Kraft je … Gäste<input type="number" min={0} placeholder="aus" aria-label={`Besetzungsschlüssel ${dep.name}`} key={'g' + dep.guestsPerStaff} defaultValue={dep.guestsPerStaff ?? ''}
          onBlur={e => { const v = +e.target.value > 0 ? Math.round(+e.target.value) : null; if (v !== dep.guestsPerStaff) save({ guestsPerStaff: v }, 'Besetzungsschlüssel'); }} /></label>
        <label>Mindestbesetzung<input type="number" min={0} aria-label={`Mindestbesetzung ${dep.name}`} key={'m' + dep.minStaff} defaultValue={dep.minStaff}
          onBlur={e => { const v = Math.max(0, Math.round(+e.target.value || 0)); if (v !== dep.minStaff) save({ minStaff: v }, 'Mindestbesetzung'); }} /></label>
      </div>
      <div className="chips mt8" role="group" aria-label={`Leitung ${dep.name}`}>
        <small className="muted" style={{ alignSelf: 'center' }}>Leitung:</small>
        {members.map(m => <button key={m.userId} type="button" className="btn small" aria-pressed={dep.leadIds.includes(m.userId)} onClick={() => toggleLead(m)}>{m.name}</button>)}
        {gone.length > 0 && <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>+ {gone.length} ehemalige/r Benutzer/in</span>}
      </div>
    </div>
  );
}
