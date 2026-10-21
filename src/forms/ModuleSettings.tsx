/** Einstellungen → Module: weitere Module ein-/ausschalten, Sichtbarkeit je Rolle; Bestellliste: Lieferanten mit Telefonnummer */
import { Plus, Trash2 } from '../ui/icons';
import { newId } from '../domain/demo';
import { DEFAULT_MODULE_ROLES, waNumber } from '../domain/orders';
import type { ModuleKey, Role } from '../domain/types';
import { t } from '../lib/i18n';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { confirmDialog, toast } from '../ui/notify';

/** Rollen, denen ein Modul zugewiesen werden kann (Admin sieht immer alles) */
const ASSIGNABLE: Role[] = ['empfang', 'service', 'kueche'];

/** Modul ein/aus + Rollen, die es sehen */
export function ModuleToggle({ mod, label, hint, children }: { mod: ModuleKey; label: string; hint: string; children?: React.ReactNode }) {
  const d = useData();
  const store = useApp();
  const on = d.venue.modules.includes(mod);
  const roles = d.venue.moduleRoles?.[mod] ?? DEFAULT_MODULE_ROLES[mod] ?? [];
  const setRoles = (r: Role[]) => store.setModuleRoles({ ...(d.venue.moduleRoles ?? {}), [mod]: r });
  return (
    <div className="module-block">
      <label className="chk"><input type="checkbox" checked={on} onChange={e => store.setModules(e.target.checked ? [...d.venue.modules, mod] : d.venue.modules.filter(m => m !== mod))} />
        <b>{label}</b></label>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{hint}</p>
      {on && <div className="chips mt8" role="group" aria-label={`Sichtbar für (${label})`}>
        <small className="muted" style={{ alignSelf: 'center' }}>Sichtbar für: Admin +</small>
        {ASSIGNABLE.map(r => <button key={r} type="button" className="btn small" aria-pressed={roles.includes(r)}
          onClick={() => setRoles(roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r])}>{t(r)}</button>)}
      </div>}
      {on && children}
    </div>
  );
}

/** Bestellliste: Lieferanten mit Telefonnummer (für WhatsApp) */
export function SupplierSettings() {
  const d = useData();
  const store = useApp();
  const list = [...d.suppliers].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));
  return (
    <div className="mt8">
      <h4 style={{ margin: '10px 0 6px' }}>Lieferanten</h4>
      {list.map(s => (
        <div key={s.id} className="row mb8 supplier-row">
          <input aria-label={`Name Lieferant ${s.name}`} defaultValue={s.name} key={'n' + s.name} style={{ flex: 2, minWidth: 140 }}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) store.upsert('suppliers', [{ ...s, name: v }], ['Lieferant umbenannt', v]); }} />
          <input aria-label={`Telefon ${s.name}`} type="tel" defaultValue={s.phone} key={'p' + s.phone} placeholder="+39 …" style={{ flex: 2, minWidth: 140 }}
            onBlur={e => { const v = e.target.value.trim(); if (v !== s.phone) store.upsert('suppliers', [{ ...s, phone: v }], ['Telefon Lieferant', `${s.name}: ${v}`]).then(ok => ok && toast('Telefonnummer gespeichert')); }} />
          <small className="muted" title="So wird die Nummer für WhatsApp verwendet">{s.phone ? `wa.me/${waNumber(s.phone)}` : 'keine Nummer'}</small>
          <button className="btn small icon ghost danger" aria-label={`Lieferant ${s.name} löschen`} title="Löschen" onClick={async () => {
            const n = d.supplierProducts.filter(p => p.supplierId === s.id).length;
            if (await confirmDialog('Lieferant löschen?', [s.name, `${n} Artikel und die Bestell-Historie werden ebenfalls gelöscht.`], 'Löschen', true))
              store.remove('suppliers', [s.id], ['Lieferant gelöscht', s.name]);
          }}><Trash2 /></button>
        </div>
      ))}
      <button className="btn small" onClick={() => store.upsert('suppliers', [{ id: newId(), name: 'Neuer Lieferant', phone: '', sort: list.length }], ['Lieferant angelegt', ''])}><Plus />Lieferant</button>
      <p className="muted" style={{ fontSize: 12 }}>Telefonnummer mit Ländervorwahl (z. B. +39 366 …). Italienische Nummern ohne Vorwahl bekommen automatisch +39.</p>
    </div>
  );
}
