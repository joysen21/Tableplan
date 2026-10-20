/** Einstellungen → Reservierungs-Status: jeden Status (Standard und eigene) umbenennen, Symbol und Farbe wählen;
 *  Standard-Status ausblenden, eigene Status anlegen und löschen */
import { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from '../ui/icons';
import { newId } from '../domain/demo';
import { ALL_STATUS, RES_STATUS_COLOR } from '../domain/constants';
import { DEFAULT_STATUS_ICON, statusConfigErrors } from '../domain/statuses';
import type { CustomStatus, ResStatus, StatusConfig } from '../domain/types';
import { t } from '../lib/i18n';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { toast } from '../ui/notify';
import { StatusIconPicker } from '../ui/StatusIcon';

type BuiltInPatch = { label?: string; color?: string; hidden?: boolean; icon?: string };

export function StatusPanel() {
  const d = useData();
  const store = useApp();
  const [cfg, setCfg] = useState<StatusConfig>(() => structuredClone(d.venue.statusConfig ?? {}));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(d.venue.statusConfig ?? {});
  const setBuiltIn = (s: ResStatus, p: BuiltInPatch) =>
    setCfg(c => ({ ...c, builtIn: { ...c.builtIn, [s]: { ...c.builtIn?.[s], ...p } } }));
  const setCustom = (id: string, p: Partial<CustomStatus>) => setCfg(c => ({ ...c, custom: (c.custom ?? []).map(x => (x.id === id ? { ...x, ...p } : x)) }));
  const inUse = (id: string) => d.reservations.filter(r => r.subStatus === id).length;

  async function save() {
    // leere Bezeichnung bei Standard-Status = Standardname
    const clean: StatusConfig = { ...cfg, builtIn: Object.fromEntries(Object.entries(cfg.builtIn ?? {}).map(([s, b]) =>
      [s, { ...b, label: b?.label?.trim() && b.label.trim() !== t(s) ? b.label.trim() : undefined }])) };
    const errs = statusConfigErrors(clean);
    if (errs.length) return toast(errs[0], 'err');
    setBusy(true);
    if (await store.setStatusConfig(clean)) { setCfg(clean); toast('Status gespeichert'); }
    setBusy(false);
  }

  const customOf = (s: ResStatus) => (cfg.custom ?? []).filter(c => c.base === s);
  return (
    <div className="panel mt12"><h3>Reservierungs-Status</h3><div className="body">
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Bezeichnung, Symbol und Farbe jedes Status ändern. Eigene Status verhalten sich wie ihr Grundstatus
        (z. B. „Aperitif“ wie Platziert) – Live-Plan und Konfliktprüfung richten sich danach.</p>
      <div className="status-list">
        {ALL_STATUS.map(s => {
          const b = cfg.builtIn?.[s] ?? {};
          const label = b.label ?? t(s), color = b.color || RES_STATUS_COLOR[s];
          return (
            <div key={s} className="status-group">
              <div className={'status-row' + (b.hidden ? ' is-hidden' : '')}>
                <StatusIconPicker value={b.icon || DEFAULT_STATUS_ICON[s]} color={color} label={label} onChange={icon => setBuiltIn(s, { icon })} />
                <input aria-label={`Bezeichnung ${t(s)}`} value={label} onChange={e => setBuiltIn(s, { label: e.target.value })} />
                <input type="color" aria-label={`Farbe ${t(s)}`} value={color} onChange={e => setBuiltIn(s, { color: e.target.value })} />
                <label className="chk" title={s === 'bestaetigt' ? 'Standard für neue Reservierungen – nicht ausblendbar' : undefined}>
                  <input type="checkbox" aria-label={`${t(s)} ausblenden`} checked={!!b.hidden} disabled={s === 'bestaetigt'} onChange={e => setBuiltIn(s, { hidden: e.target.checked })} /> aus</label>
                <button type="button" className="btn small icon ghost" aria-label={`${t(s)} zurücksetzen`} title="Standard wiederherstellen"
                  disabled={!b.label && !b.color && !b.icon && !b.hidden} onClick={() => setBuiltIn(s, { label: undefined, color: undefined, icon: undefined, hidden: false })}><RotateCcw /></button>
              </div>
              {customOf(s).map(c => (
                <div key={c.id} className="status-row custom">
                  <StatusIconPicker value={c.icon || DEFAULT_STATUS_ICON[c.base]} color={c.color} label={c.label || 'eigener Status'} onChange={icon => setCustom(c.id, { icon })} />
                  <input aria-label="Bezeichnung eigener Status" value={c.label} placeholder="z. B. Aperitif" onChange={e => setCustom(c.id, { label: e.target.value })} />
                  <input type="color" aria-label={`Farbe ${c.label}`} value={c.color} onChange={e => setCustom(c.id, { color: e.target.value })} />
                  <select aria-label={`Grundstatus ${c.label}`} title="verhält sich wie" value={c.base} onChange={e => setCustom(c.id, { base: e.target.value as ResStatus })}>
                    {ALL_STATUS.map(x => <option key={x} value={x}>wie {t(x)}</option>)}</select>
                  <button type="button" className="btn small icon ghost danger" aria-label={`${c.label || 'Status'} löschen`} title="Löschen" onClick={() => {
                    const n = inUse(c.id);
                    if (n) toast(`${n} Reservierung(en) zeigen danach wieder „${t(c.base)}“`);
                    setCfg(x => ({ ...x, custom: (x.custom ?? []).filter(y => y.id !== c.id) }));
                  }}><Trash2 /></button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="row mt8">
        <button className="btn small" onClick={() => setCfg(c => ({ ...c, custom: [...(c.custom ?? []), { id: newId(), label: '', color: '#4F7BD1', base: 'platziert', icon: 'aperitif' }] }))}><Plus />Eigener Status</button>
        <span className="spacer" />
        {dirty && <span className="muted" style={{ fontSize: 12 }}>Ungespeicherte Änderungen</span>}
        <button className="btn primary" disabled={!dirty || busy} onClick={save}>Status speichern</button>
      </div>
    </div></div>
  );
}
