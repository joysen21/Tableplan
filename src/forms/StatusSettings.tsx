/** Einstellungen → Reservierungs-Status: Standard-Status umbenennen, umfärben, ausblenden und eigene Status anlegen */
import { useState } from 'react';
import { Plus, Trash2 } from '../ui/icons';
import { newId } from '../domain/demo';
import { ALL_STATUS, RES_STATUS_COLOR } from '../domain/constants';
import { statusConfigErrors } from '../domain/statuses';
import type { CustomStatus, ResStatus, StatusConfig } from '../domain/types';
import { t } from '../lib/i18n';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { toast } from '../ui/notify';

export function StatusPanel() {
  const d = useData();
  const store = useApp();
  const [cfg, setCfg] = useState<StatusConfig>(() => structuredClone(d.venue.statusConfig ?? {}));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(d.venue.statusConfig ?? {});
  const setBuiltIn = (s: ResStatus, p: { label?: string; color?: string; hidden?: boolean }) =>
    setCfg(c => ({ ...c, builtIn: { ...c.builtIn, [s]: { ...c.builtIn?.[s], ...p } } }));
  const setCustom = (id: string, p: Partial<CustomStatus>) => setCfg(c => ({ ...c, custom: (c.custom ?? []).map(x => (x.id === id ? { ...x, ...p } : x)) }));
  const inUse = (id: string) => d.reservations.filter(r => r.subStatus === id).length;

  async function save() {
    const errs = statusConfigErrors(cfg);
    if (errs.length) return toast(errs[0], 'err');
    setBusy(true);
    if (await store.setStatusConfig(cfg)) toast('Status gespeichert');
    setBusy(false);
  }

  return (
    <div className="panel mt12"><h3>Reservierungs-Status</h3><div className="body">
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Standard-Status umbenennen, Farbe ändern oder ausblenden. Eigene Status verhalten sich wie ihr Grundstatus
        (z. B. „Aperitif“ wie Platziert) – Live-Plan und Konfliktprüfung richten sich danach.</p>
      <table className="list status-table"><thead><tr><th>Status</th><th>Bezeichnung</th><th>Farbe</th><th>Ausblenden</th></tr></thead>
        <tbody>{ALL_STATUS.map(s => {
          const b = cfg.builtIn?.[s] ?? {};
          return (
            <tr key={s}>
              <td className="muted">{t(s)}</td>
              <td><input aria-label={`Bezeichnung ${t(s)}`} value={b.label ?? ''} placeholder={t(s)} onChange={e => setBuiltIn(s, { label: e.target.value })} /></td>
              <td><input type="color" aria-label={`Farbe ${t(s)}`} value={b.color || RES_STATUS_COLOR[s]} onChange={e => setBuiltIn(s, { color: e.target.value })} /></td>
              <td><input type="checkbox" aria-label={`${t(s)} ausblenden`} checked={!!b.hidden} disabled={s === 'bestaetigt'} onChange={e => setBuiltIn(s, { hidden: e.target.checked })} /></td>
            </tr>
          );
        })}</tbody></table>
      <h4 style={{ margin: '14px 0 6px' }}>Eigene Status</h4>
      {(cfg.custom ?? []).length ? (cfg.custom ?? []).map(c => (
        <div key={c.id} className="row mb8">
          <input style={{ flex: 2 }} aria-label="Bezeichnung eigener Status" value={c.label} placeholder="z. B. Aperitif" onChange={e => setCustom(c.id, { label: e.target.value })} />
          <input type="color" aria-label={`Farbe ${c.label}`} value={c.color} onChange={e => setCustom(c.id, { color: e.target.value })} />
          <label style={{ flex: 2 }}>verhält sich wie<select value={c.base} onChange={e => setCustom(c.id, { base: e.target.value as ResStatus })}>
            {ALL_STATUS.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>
          <button className="btn small icon danger" aria-label={`${c.label || 'Status'} löschen`} title="Löschen" onClick={() => {
            const n = inUse(c.id);
            if (n) toast(`${n} Reservierung(en) zeigen danach wieder „${t(c.base)}“`);
            setCfg(x => ({ ...x, custom: (x.custom ?? []).filter(y => y.id !== c.id) }));
          }}><Trash2 /></button>
        </div>
      )) : <p className="muted">Noch keine eigenen Status.</p>}
      <div className="row mt8">
        <button className="btn small" onClick={() => setCfg(c => ({ ...c, custom: [...(c.custom ?? []), { id: newId(), label: '', color: '#4F7BD1', base: 'platziert' }] }))}><Plus />Eigener Status</button>
        <span className="spacer" />
        <button className="btn primary" disabled={!dirty || busy} onClick={save}>Status speichern</button>
      </div>
    </div></div>
  );
}
