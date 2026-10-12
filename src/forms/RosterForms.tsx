/** Dialoge des Dienstplans: Mitarbeiter/in, Schichtvorlage */
import { useState } from 'react';
import { Trash2 } from '../ui/icons';
import { newId } from '../domain/demo';
import { CONTRACTS, ROSTER_COLORS } from '../domain/constants';
import {
  canPlanDept, fmtHours, initials, plannableDepartments, presenceMin, sortDepartments, staffErrors, templateErrors, workMin
} from '../domain/roster';
import type { ContractType, ShiftTemplate, Staff } from '../domain/types';
import { t } from '../lib/i18n';
import { useApp } from '../store/app';
import { useData, useRole, useUserId } from '../store/hooks';
import { closeDialog } from '../store/dialogs';
import { Modal } from '../ui/Modal';
import { confirmDialog, toast } from '../ui/notify';

/** Farbauswahl: Vorschläge + freie Farbe */
function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-pick" role="group" aria-label="Farbe">
      {ROSTER_COLORS.map(c => <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`Farbe ${c}`} aria-pressed={value.toLowerCase() === c.toLowerCase()} onClick={() => onChange(c)} />)}
      <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label="Eigene Farbe" />
    </div>
  );
}

/* ---------------------------------------------------------------- Mitarbeiter/in */
export function StaffForm({ staff, departmentId }: { staff?: Staff; departmentId?: string }) {
  const d = useData();
  const store = useApp();
  const role = useRole(), userId = useUserId();
  const isNew = !staff;
  const ro = !isNew && !canPlanDept(role, d.departments, userId, staff.departmentId);
  const mine = plannableDepartments(role, d.departments, userId);
  const [x, setX] = useState<Staff>(() => staff ? structuredClone(staff) : {
    id: newId(), name: '', short: '', departmentId: departmentId ?? mine[0]?.id ?? null, positionIds: [], contract: 'unbefristet', weeklyHours: 40,
    contractFrom: null, contractTo: null, phone: '', email: '', color: ROSTER_COLORS[d.staff.length % ROSTER_COLORS.length], notes: '', active: true
  });
  const [busy, setBusy] = useState(false);
  const upd = (p: Partial<Staff>) => setX(prev => ({ ...prev, ...p }));
  // Stammbereich: nur Bereiche, die man plant (der aktuelle bleibt sichtbar); „ohne“ nur für Admin
  const deptOptions = sortDepartments(d.departments).filter(o => mine.some(m => m.id === o.id) || o.id === x.departmentId);
  const errors = staffErrors({ ...x, short: x.short || initials(x.name) }, d.staff);

  async function save() {
    const row = { ...x, name: x.name.trim(), short: (x.short.trim() || initials(x.name)), email: x.email.trim(), phone: x.phone.trim() };
    if (errors.length) return toast(errors[0], 'err');
    setBusy(true);
    const ok = await store.upsert('staff', [row], [isNew ? 'Mitarbeiter/in angelegt' : 'Mitarbeiter/in geändert', row.name]);
    setBusy(false);
    if (ok) { toast('Gespeichert'); closeDialog(); }
  }
  async function remove() {
    if (!staff) return;
    if (!(await confirmDialog('Mitarbeiter/in löschen?', [staff.name, 'Tipp: Wer den Betrieb verlässt, besser auf „ausgeschieden“ setzen – dann bleiben alte Dienstpläne vollständig.'], 'Löschen', true))) return;
    if (await store.remove('staff', [staff.id], ['Mitarbeiter/in gelöscht', staff.name])) { toast('Gelöscht'); closeDialog(); }
  }

  return (
    <Modal title={isNew ? 'Neue/r Mitarbeiter/in' : x.name || 'Mitarbeiter/in'} onClose={closeDialog} width={720}
      footer={ro ? <button className="btn" onClick={closeDialog}>Schließen</button> : <>
        {!isNew && <button className="btn danger" onClick={remove}><Trash2 />Löschen</button>}<span className="spacer" />
        <button className="btn" onClick={closeDialog}>Abbrechen</button><button className="btn primary" onClick={save} disabled={busy}>Speichern</button></>}>
      {ro && <div className="infobox">Gehört zu einem Bereich, den Sie nicht leiten – nur Ansicht.</div>}
      <fieldset className="plain" disabled={ro}>
        <div className="grid3">
          <label style={{ gridColumn: 'span 2' }}>Name *<input value={x.name} autoFocus={isNew} onChange={e => upd({ name: e.target.value })} /></label>
          <label>Kürzel<input value={x.short} maxLength={4} placeholder={initials(x.name)} onChange={e => upd({ short: e.target.value })} /></label>
          <label>Stammbereich<select value={x.departmentId ?? ''} onChange={e => upd({ departmentId: e.target.value || null })}>
            {(role === 'admin' || !x.departmentId) && <option value="">– ohne –</option>}
            {deptOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label>Vertrag<select value={x.contract} onChange={e => upd({ contract: e.target.value as ContractType })}>{CONTRACTS.map(c => <option key={c} value={c}>{t(c)}</option>)}</select></label>
          <label>Wochenstunden<input type="number" min={0} max={60} step={0.5} value={x.weeklyHours} onChange={e => upd({ weeklyHours: +e.target.value })} /></label>
          <label>Vertrag ab<input type="date" value={x.contractFrom ?? ''} onChange={e => upd({ contractFrom: e.target.value || null })} /></label>
          <label>Vertrag bis<input type="date" value={x.contractTo ?? ''} onChange={e => upd({ contractTo: e.target.value || null })} /></label>
          <label className="chk" style={{ alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" checked={!x.active} onChange={e => upd({ active: !e.target.checked })} /> Ausgeschieden</label>
          <label>Telefon<input type="tel" value={x.phone} onChange={e => upd({ phone: e.target.value })} /></label>
          <label style={{ gridColumn: 'span 2' }}>E-Mail<input type="email" value={x.email} onChange={e => upd({ email: e.target.value })} /></label>
        </div>
        {(x.contract === 'saison' || x.contract === 'befristet') && !x.contractTo && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Tipp: Vertragsende eintragen – dann warnt der Dienstplan bei Diensten außerhalb der Vertragszeit.</p>}

        <h4 style={{ margin: '14px 0 6px' }}>Positionen (Qualifikationen)</h4>
        {sortDepartments(d.departments).map(dep => {
          const list = d.positions.filter(p => p.departmentId === dep.id).sort((a, b) => a.sort - b.sort);
          if (!list.length) return null;
          return (
            <div key={dep.id} className="pos-group">
              <small className="muted">{dep.name}</small>
              <div className="chips" role="group" aria-label={`Positionen ${dep.name}`}>{list.map(p => (
                <button key={p.id} type="button" className="btn small" aria-pressed={x.positionIds.includes(p.id)}
                  onClick={() => upd({ positionIds: x.positionIds.includes(p.id) ? x.positionIds.filter(v => v !== p.id) : [...x.positionIds, p.id] })}>{p.name}</button>
              ))}</div>
            </div>
          );
        })}
        {!d.positions.length && <p className="muted">Noch keine Positionen angelegt (Reiter „Positionen“).</p>}

        <h4 style={{ margin: '14px 0 6px' }}>Farbe im Dienstplan</h4>
        <ColorPick value={x.color} onChange={color => upd({ color })} />
        <label className="mt8">Notizen<textarea value={x.notes} onChange={e => upd({ notes: e.target.value })} /></label>
      </fieldset>
      {!ro && errors.length > 0 && x.name.trim() && <div className="warnbox">{errors.map(e => <div key={e}>{e}</div>)}</div>}
    </Modal>
  );
}

/* ---------------------------------------------------------------- Schichtvorlage */
export function ShiftTemplateForm({ tpl, departmentId }: { tpl?: ShiftTemplate; departmentId?: string }) {
  const d = useData();
  const store = useApp();
  const role = useRole(), userId = useUserId();
  const isNew = !tpl;
  const ro = !isNew && !canPlanDept(role, d.departments, userId, tpl.departmentId);
  const mine = plannableDepartments(role, d.departments, userId);
  const [x, setX] = useState<ShiftTemplate>(() => tpl ? structuredClone(tpl) : {
    id: newId(), departmentId: departmentId ?? mine[0]?.id ?? '', positionId: null, name: '', short: '', start: '08:00', end: '16:00',
    start2: null, end2: null, breakMin: 30, color: ROSTER_COLORS[d.shiftTemplates.length % ROSTER_COLORS.length],
    sort: Math.max(-1, ...d.shiftTemplates.map(o => o.sort)) + 1
  });
  const [busy, setBusy] = useState(false);
  const upd = (p: Partial<ShiftTemplate>) => setX(prev => ({ ...prev, ...p }));
  const split = x.start2 !== null || x.end2 !== null;
  const errors = templateErrors(x, d.shiftTemplates);
  // „Name fehlt“ erst beim Speichern melden, nicht schon beim Öffnen
  const shown = x.name.trim() ? errors : errors.slice(1);
  const deptOptions = sortDepartments(d.departments).filter(o => mine.some(m => m.id === o.id) || o.id === x.departmentId);
  const positions = d.positions.filter(p => p.departmentId === x.departmentId).sort((a, b) => a.sort - b.sort);

  async function save() {
    if (!x.departmentId) return toast('Bitte einen Bereich wählen', 'err');
    if (errors.length) return toast(errors[0], 'err');
    setBusy(true);
    const row = { ...x, name: x.name.trim(), short: x.short.trim() };
    const ok = await store.upsert('shiftTemplates', [row], [isNew ? 'Schichtvorlage angelegt' : 'Schichtvorlage geändert', row.name]);
    setBusy(false);
    if (ok) { toast('Gespeichert'); closeDialog(); }
  }
  async function remove() {
    if (!tpl || !(await confirmDialog('Schichtvorlage löschen?', [tpl.name, 'Bereits geplante Dienste bleiben erhalten.'], 'Löschen', true))) return;
    if (await store.remove('shiftTemplates', [tpl.id], ['Schichtvorlage gelöscht', tpl.name])) { toast('Gelöscht'); closeDialog(); }
  }

  return (
    <Modal title={isNew ? 'Neue Schichtvorlage' : x.name || 'Schichtvorlage'} onClose={closeDialog} width={620}
      footer={ro ? <button className="btn" onClick={closeDialog}>Schließen</button> : <>
        {!isNew && <button className="btn danger" onClick={remove}><Trash2 />Löschen</button>}<span className="spacer" />
        <button className="btn" onClick={closeDialog}>Abbrechen</button><button className="btn primary" onClick={save} disabled={busy}>Speichern</button></>}>
      {ro && <div className="infobox">Gehört zu einem Bereich, den Sie nicht leiten – nur Ansicht.</div>}
      <fieldset className="plain" disabled={ro}>
        <div className="grid3">
          <label style={{ gridColumn: 'span 2' }}>Name *<input value={x.name} autoFocus={isNew} placeholder="z. B. Frühdienst" onChange={e => upd({ name: e.target.value })} /></label>
          <label>Kürzel<input value={x.short} maxLength={3} placeholder="F" onChange={e => upd({ short: e.target.value })} /></label>
          <label>Bereich<select value={x.departmentId} onChange={e => upd({ departmentId: e.target.value, positionId: null })}>
            {deptOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label style={{ gridColumn: 'span 2' }}>Position<select value={x.positionId ?? ''} onChange={e => upd({ positionId: e.target.value || null })}>
            <option value="">– alle Positionen des Bereichs –</option>
            {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Beginn<input type="time" value={x.start} onChange={e => upd({ start: e.target.value })} /></label>
          <label>Ende<input type="time" value={x.end} onChange={e => upd({ end: e.target.value })} /></label>
          <label>Pause (Min.)<input type="number" min={0} step={5} value={x.breakMin} onChange={e => upd({ breakMin: Math.max(0, Math.round(+e.target.value || 0)) })} /></label>
        </div>
        <label className="chk mt8"><input type="checkbox" checked={split} onChange={e => upd(e.target.checked ? { start2: '18:00', end2: '22:00' } : { start2: null, end2: null })} /> Teildienst (zweiter Block am selben Tag)</label>
        {split && <div className="grid3 mt8">
          <label>Beginn 2. Block<input type="time" value={x.start2 ?? ''} onChange={e => upd({ start2: e.target.value || null })} /></label>
          <label>Ende 2. Block<input type="time" value={x.end2 ?? ''} onChange={e => upd({ end2: e.target.value || null })} /></label>
        </div>}
        <h4 style={{ margin: '14px 0 6px' }}>Farbe</h4>
        <ColorPick value={x.color} onChange={color => upd({ color })} />
      </fieldset>
      {shown.length > 0 && !ro ? <div className="warnbox">{shown.map(e => <div key={e}>{e}</div>)}</div>
        : <div className="infobox mt12"><b>Arbeitszeit: {fmtHours(workMin(x))}</b> (Anwesenheit {fmtHours(presenceMin(x))}{x.breakMin ? `, ${x.breakMin} Min. Pause` : ''})
          {x.end < x.start && <div className="muted" style={{ fontSize: 12 }}>Die Schicht endet am Folgetag.</div>}</div>}
    </Modal>
  );
}
