/** Einstellungen → Module: weitere Module ein-/ausschalten, Sichtbarkeit je Rolle; Bestellliste: Lieferanten mit Telefonnummer */
import { Plus, Trash2 } from '../ui/icons';
import { newId } from '../domain/demo';
import { DEFAULT_MODULE_ROLES, waNumber } from '../domain/orders';
import type { ExtraModule, HotelResource, ModuleKey, Role, Therapy } from '../domain/types';
import { resourcesOf } from '../domain/extras';
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

const RES_LABEL: Record<ExtraModule, { title: string; one: string }> = {
  garage: { title: 'Stellplätze', one: 'Stellplatz' },
  massage: { title: 'Masseurinnen', one: 'Masseurin' },
  fahrrad: { title: 'Fahrräder', one: 'Fahrrad' }
};
const BIKE_ARTS = ['E-Bike', 'Mountainbike', 'Trekkingrad', 'Rennrad', 'Kinderrad', 'Anhänger'];

/** Garage/Massage/Fahrrad: Ressourcen einzeln anlegen (Garage mit Ladeplatz, Fahrrad mit Art und Größe) */
export function ResourceSettings({ mod }: { mod: ExtraModule }) {
  const d = useData();
  const store = useApp();
  const L = RES_LABEL[mod];
  const list = resourcesOf(d, mod, true);
  const save = (r: HotelResource, x: Partial<HotelResource>, what: string) => store.upsert('hotelResources', [{ ...r, ...x }], [`${L.one} geändert`, `${r.name}: ${what}`]);
  return (
    <div className="mt8">
      <h4 style={{ margin: '10px 0 6px' }}>{L.title}</h4>
      {list.map(r => (
        <div key={r.id} className="row mb8 supplier-row">
          <input aria-label={`Name ${L.one} ${r.name}`} defaultValue={r.name} key={'n' + r.name} style={{ flex: 2, minWidth: 120 }}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.name) save(r, { name: v }, 'Name ' + v); }} />
          {mod === 'garage' && <label className="chk"><input type="checkbox" checked={r.ev} aria-label={`Ladeplatz ${r.name}`} onChange={e => save(r, { ev: e.target.checked }, e.target.checked ? 'Ladeplatz' : 'kein Ladeplatz')} /> ⚡ Ladeplatz</label>}
          {mod === 'fahrrad' && <>
            <input aria-label={`Art ${r.name}`} list="bike-arts" defaultValue={r.art} key={'a' + r.art} placeholder="Art" style={{ flex: 1, minWidth: 110 }}
              onBlur={e => { const v = e.target.value.trim(); if (v !== r.art) save(r, { art: v }, 'Art ' + v); }} />
            <input aria-label={`Größe ${r.name}`} defaultValue={r.size} key={'s' + r.size} placeholder="Größe" style={{ width: 80 }}
              onBlur={e => { const v = e.target.value.trim(); if (v !== r.size) save(r, { size: v }, 'Größe ' + v); }} />
          </>}
          <label className="chk"><input type="checkbox" checked={r.active} aria-label={`${r.name} aktiv`} onChange={e => save(r, { active: e.target.checked }, e.target.checked ? 'aktiv' : 'inaktiv')} /> aktiv</label>
          <button className="btn small icon ghost danger" aria-label={`${L.one} ${r.name} löschen`} title="Löschen" onClick={async () => {
            const n = d.bookings.filter(b => b.resourceId === r.id).length;
            if (await confirmDialog(`${L.one} löschen?`, [r.name, ...(n ? [`${n} Buchungen werden ebenfalls gelöscht – „aktiv“ ausschalten behält sie.`] : [])], 'Löschen', true))
              store.remove('hotelResources', [r.id], [`${L.one} gelöscht`, r.name]);
          }}><Trash2 /></button>
        </div>
      ))}
      {mod === 'fahrrad' && <datalist id="bike-arts">{BIKE_ARTS.map(a => <option key={a} value={a} />)}</datalist>}
      <button className="btn small" onClick={() => store.upsert('hotelResources', [{ id: newId(), module: mod, name: `${L.one} ${list.length + 1}`, sort: list.length, active: true, ev: false, art: '', size: '' }], [`${L.one} angelegt`, ''])}><Plus />{L.one}</button>
    </div>
  );
}

/** Massage: Therapien mit Dauer und Preis */
export function TherapySettings() {
  const d = useData();
  const store = useApp();
  const list = [...d.therapies].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));
  const save = (t: Therapy, x: Partial<Therapy>, what: string) => store.upsert('therapies', [{ ...t, ...x }], ['Therapie geändert', `${t.name}: ${what}`]);
  return (
    <div className="mt8">
      <h4 style={{ margin: '10px 0 6px' }}>Therapien</h4>
      {list.map(t => (
        <div key={t.id} className="row mb8 supplier-row">
          <input aria-label={`Name Therapie ${t.name}`} defaultValue={t.name} key={'n' + t.name} style={{ flex: 2, minWidth: 140 }}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) save(t, { name: v }, 'Name ' + v); }} />
          <label className="inline">Min.<input type="number" min={5} max={480} step={5} aria-label={`Dauer ${t.name}`} defaultValue={t.duration} key={'d' + t.duration} style={{ width: 70 }}
            onBlur={e => { const v = Math.round(Number(e.target.value)); if (v >= 5 && v <= 480 && v !== t.duration) save(t, { duration: v }, `${v} min`); }} /></label>
          <label className="inline">€<input type="number" min={0} step="0.5" aria-label={`Preis ${t.name}`} defaultValue={t.price} key={'p' + t.price} style={{ width: 80 }}
            onBlur={e => { const v = Number(e.target.value); if (v >= 0 && v !== t.price) save(t, { price: v }, `${v} €`); }} /></label>
          <label className="chk"><input type="checkbox" checked={t.active} aria-label={`${t.name} aktiv`} onChange={e => save(t, { active: e.target.checked }, e.target.checked ? 'aktiv' : 'inaktiv')} /> aktiv</label>
          <button className="btn small icon ghost danger" aria-label={`Therapie ${t.name} löschen`} title="Löschen" onClick={async () => {
            if (await confirmDialog('Therapie löschen?', [t.name, 'Bestehende Buchungen bleiben (ohne Therapie-Bezeichnung).'], 'Löschen', true)) store.remove('therapies', [t.id], ['Therapie gelöscht', t.name]);
          }}><Trash2 /></button>
        </div>
      ))}
      <button className="btn small" onClick={() => store.upsert('therapies', [{ id: newId(), name: 'Neue Therapie', duration: 50, price: 0, sort: list.length, active: true }], ['Therapie angelegt', ''])}><Plus />Therapie</button>
    </div>
  );
}
