/** Dialoge der Menüverwaltung: Tagesmenü, Gericht (Rezept), Zutat */
import { useMemo, useState } from 'react';
import { ListChecks, Plus, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { newId } from '../domain/demo';
import { COURSES, DIETS, UNITS, canEditMenu } from '../domain/constants';
import { byId, tableNames } from '../domain/logic';
import {
  allergenWarnings, type AllergenWarning, dishAllergens, dishPlans, dishUsage, findMenu, fmtQty, ingredientUsage, itemAllergens, itemName, itemShares, menuPortions, snapshotItems
} from '../domain/menu';
import type { Course, Diet, Dish, Ingredient, Menu, Unit, VenueData } from '../domain/types';
import { t } from '../lib/i18n';
import { PATHS } from '../lib/paths';
import { fmtDate, fmtShort } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useRole } from '../store/hooks';
import { useUi } from '../store/ui';
import { closeDialog, openDialog } from '../store/dialogs';
import { AllergenNos, AllergenPicker } from '../ui/AllergenPicker';
import { Modal } from '../ui/Modal';
import { confirmDialog, toast } from '../ui/notify';

const pct = (x: number) => Math.round(x * 100);

/* ---------------------------------------------------------------- Tagesmenü */
export function MenuEditor({ date, serviceId }: { date: string; serviceId: string }) {
  const d = useData();
  const store = useApp();
  const ui = useUi();
  const navigate = useNavigate();
  const ro = !canEditMenu(useRole());
  const existing = findMenu(d, date, serviceId);
  const svc = byId(d.services, serviceId);
  const [m, setM] = useState<Menu>(() => existing ? structuredClone(existing)
    : { id: newId(), date, serviceId, portions: null, bufferPct: 10, notes: '', items: [] });
  const [busy, setBusy] = useState(false);
  const upd = (p: Partial<Menu>) => setM(prev => ({ ...prev, ...p }));
  /** Anteil setzen; bei genau zwei Gerichten im Gang bekommt das andere den Rest auf 100 % */
  const setShare = (i: number, share: number | null) => {
    const same = m.items.map((x, j) => (x.course === m.items[i].course ? j : -1)).filter(j => j >= 0);
    const other = same.length === 2 ? same.find(j => j !== i)! : -1;
    upd({ items: m.items.map((x, j) => (j === i ? { ...x, share } : j === other ? { ...x, share: share == null ? null : 100 - share } : x)) });
  };
  const por = menuPortions(d, m);
  const shares = itemShares(m.items);
  const plans = dishPlans(d, m, por.total);
  const warnings = allergenWarnings(d, m);
  const used = new Set(m.items.map(i => i.dishId));
  const courses = COURSES.filter(c => m.items.some(i => i.course === c));

  function addDish(id: string) {
    const dish = byId(d.dishes, id); if (!dish) return;
    upd({ items: snapshotItems(d, [...m.items, { course: dish.course, dishId: dish.id, share: null, name: dish.name, allergens: [] }]) });
  }
  async function save() {
    if (!m.items.length) return toast('Bitte mindestens ein Gericht wählen', 'err');
    setBusy(true);
    const ok = await store.upsert('menus', [{ ...m, items: snapshotItems(d, m.items) }], [existing ? 'Menü geändert' : 'Menü angelegt', `${fmtShort(date)} ${svc?.name}`]);
    setBusy(false);
    if (ok) { toast('Menü gespeichert'); closeDialog(); }
  }
  async function remove() {
    if (!existing || !(await confirmDialog('Menü löschen?', [`${fmtDate(date)} · ${svc?.name}`], 'Löschen', true))) return;
    if (await store.remove('menus', [existing.id], ['Menü gelöscht', `${fmtShort(date)} ${svc?.name}`])) { toast('Gelöscht'); closeDialog(); }
  }
  const toList = () => { ui.set({ report: 'zutaten', date, serviceId }); closeDialog(); navigate(PATHS.berichte); };

  return (
    <Modal title={`Menü · ${svc?.name ?? ''} · ${fmtDate(date)}`} onClose={closeDialog} width={760}
      footer={ro ? <button className="btn" onClick={closeDialog}>Schließen</button> : <>
        {existing && <button className="btn danger" onClick={remove}><Trash2 />Löschen</button>}<span className="spacer" />
        <button className="btn" onClick={closeDialog}>Abbrechen</button><button className="btn primary" onClick={save} disabled={busy}>Speichern</button></>}>
      <fieldset className="plain" disabled={ro}>
        <div className="menu-portions">
          <div className="kpi"><b>{por.auto}</b><small>Gäste laut Reservierungen</small></div>
          <label className="chk"><input type="checkbox" checked={m.portions != null} onChange={e => upd({ portions: e.target.checked ? por.auto : null })} /> Portionen von Hand</label>
          {m.portions != null && <label>Portionen<input type="number" min={0} value={m.portions} onChange={e => upd({ portions: Math.max(0, +e.target.value || 0) })} /></label>}
          <label>Puffer %<input type="number" min={0} max={100} value={m.bufferPct} onChange={e => upd({ bufferPct: Math.min(100, Math.max(0, +e.target.value || 0)) })} /></label>
          <div className="kpi"><b>{por.total}</b><small>Portionen gesamt</small></div>
        </div>

        {!m.items.length && <p className="muted">Noch keine Gerichte. Unten ein Gericht hinzufügen.</p>}
        {courses.map(c => {
          const idx = m.items.map((it, i) => (it.course === c ? i : -1)).filter(i => i >= 0);
          return (
            <div key={c} className="menu-course">
              <h4>{t(c)}{idx.length > 1 && <span className="muted"> · Wahl</span>}</h4>
              {idx.map(i => {
                const it = m.items[i];
                return (
                  <div key={it.dishId + i} className="menu-item-row">
                    <span className="name">{itemName(d, it)} <AllergenNos list={itemAllergens(d, it)} />
                      {!byId(d.dishes, it.dishId) && <span className="badge">Gericht gelöscht</span>}</span>
                    {idx.length > 1 && <label className="share">Anteil %
                      <input type="number" min={0} max={100} placeholder={String(pct(shares[i]))} value={it.share ?? ''}
                        onChange={e => setShare(i, e.target.value === '' ? null : Math.min(100, Math.max(0, +e.target.value)))} /></label>}
                    <span className="muted portions">{plans[i]?.portions ?? 0} Port.</span>
                    {!ro && <button className="btn small icon ghost" aria-label="Gericht entfernen" title="Entfernen" onClick={() => upd({ items: m.items.filter((_, j) => j !== i) })}><X /></button>}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!ro && <div className="row mt12">
          <select aria-label="Gericht hinzufügen" value="" onChange={e => e.target.value && addDish(e.target.value)} style={{ flex: 1 }}>
            <option value="">＋ Gericht hinzufügen…</option>
            {COURSES.map(c => { const list = d.dishes.filter(x => x.course === c && !used.has(x.id)); return list.length ? <optgroup key={c} label={t(c)}>{list.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup> : null; })}
          </select>
        </div>}
        {!ro && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Fehlt ein Gericht? Im Reiter „Gerichte“ anlegen.</p>}
        <label className="mt8">Notiz für die Küche<textarea value={m.notes} onChange={e => upd({ notes: e.target.value })} /></label>
      </fieldset>

      <h4 style={{ margin: '14px 0 6px' }}>Allergene der Gäste</h4>
      {warnings.length ? <WarningList d={d} warnings={warnings} /> : <p className="muted">Keine Konflikte mit den Allergenen der Gäste.</p>}
      {m.items.length > 0 && <button className="btn mt8" onClick={toList}><ListChecks />Zutatenliste anzeigen</button>}
    </Modal>
  );
}

/* ---------------------------------------------------------------- Gericht */
export function DishForm({ dish }: { dish?: Dish }) {
  const d = useData();
  const store = useApp();
  const ro = !canEditMenu(useRole());
  const isNew = !dish;
  const [x, setX] = useState<Dish>(() => dish ? structuredClone(dish)
    : { id: newId(), name: '', nameIt: '', nameEn: '', course: 'hauptgang', diet: [], notes: '', ingredients: [] });
  const [busy, setBusy] = useState(false);
  const upd = (p: Partial<Dish>) => setX(prev => ({ ...prev, ...p }));
  const al = dishAllergens(d, x);
  const ingSorted = useMemo(() => [...d.ingredients].sort((a, b) => a.name.localeCompare(b.name, 'de')), [d.ingredients]);

  async function save() {
    const name = x.name.trim();
    if (!name) return toast('Bitte einen Namen eingeben', 'err');
    if (d.dishes.some(o => o.id !== x.id && o.name.trim().toLowerCase() === name.toLowerCase())) return toast('Ein Gericht mit diesem Namen gibt es schon', 'err');
    if (x.ingredients.some(l => !(l.qty > 0))) return toast('Bitte bei jeder Zutat eine Menge pro Portion angeben', 'err');
    setBusy(true);
    const ok = await store.upsert('dishes', [{ ...x, name }], [isNew ? 'Gericht angelegt' : 'Gericht geändert', name]);
    setBusy(false);
    if (ok) { toast('Gespeichert'); closeDialog(); }
  }
  async function remove() {
    if (!dish) return;
    const future = dishUsage(d, dish.id);
    if (future.length) return toast(`Wird noch in Menüs verwendet: ${future.slice(0, 4).map(m => fmtShort(m.date)).join(', ')}${future.length > 4 ? ' …' : ''}`, 'err');
    if (!(await confirmDialog('Gericht löschen?', [dish.name, 'Vergangene Menüs behalten Name und Allergene.'], 'Löschen', true))) return;
    if (await store.remove('dishes', [dish.id], ['Gericht gelöscht', dish.name])) { toast('Gelöscht'); closeDialog(); }
  }

  return (
    <Modal title={isNew ? 'Neues Gericht' : x.name || 'Gericht'} onClose={closeDialog} width={720}
      footer={ro ? <button className="btn" onClick={closeDialog}>Schließen</button> : <>
        {!isNew && <button className="btn danger" onClick={remove}><Trash2 />Löschen</button>}<span className="spacer" />
        <button className="btn" onClick={closeDialog}>Abbrechen</button><button className="btn primary" onClick={save} disabled={busy}>Speichern</button></>}>
      <fieldset className="plain" disabled={ro}>
        <div className="grid2">
          <label>Name *<input value={x.name} autoFocus={isNew} onChange={e => upd({ name: e.target.value })} /></label>
          <label>Gang<select value={x.course} onChange={e => upd({ course: e.target.value as Course })}>{COURSES.map(c => <option key={c} value={c}>{t(c)}</option>)}</select></label>
          <label>Name italienisch<input value={x.nameIt} onChange={e => upd({ nameIt: e.target.value })} /></label>
          <label>Name englisch<input value={x.nameEn} onChange={e => upd({ nameEn: e.target.value })} /></label>
        </div>
        <div className="row mt8">{DIETS.map(k => <label key={k} className="chk"><input type="checkbox" checked={x.diet.includes(k)}
          onChange={e => upd({ diet: e.target.checked ? [...x.diet, k] : x.diet.filter(v => v !== k) as Diet[] })} /> {t(k)}</label>)}</div>

        <h4 style={{ margin: '14px 0 6px' }}>Zutaten pro Portion</h4>
        {x.ingredients.map((l, i) => {
          const ing = byId(d.ingredients, l.ingredientId);
          return (
            <div key={l.ingredientId} className="dish-line">
              <span className="name">{ing?.name ?? '(gelöschte Zutat)'} <AllergenNos list={ing?.allergens ?? []} /></span>
              <input type="number" min={0} step="any" aria-label={`Menge ${ing?.name ?? ''}`} value={l.qty || ''}
                onChange={e => upd({ ingredients: x.ingredients.map((y, j) => (j === i ? { ...y, qty: Math.max(0, +e.target.value || 0) } : y)) })} />
              <span className="unit">{ing ? t(ing.unit) : ''}</span>
              {!ro && <button className="btn small icon ghost" aria-label="Zutat entfernen" title="Entfernen" onClick={() => upd({ ingredients: x.ingredients.filter((_, j) => j !== i) })}><X /></button>}
            </div>
          );
        })}
        {!ro && <div className="row mt8">
          <select aria-label="Zutat hinzufügen" value="" style={{ flex: 1 }} onChange={e => e.target.value && upd({ ingredients: [...x.ingredients, { ingredientId: e.target.value, qty: 0 }] })}>
            <option value="">＋ Zutat hinzufügen…</option>
            {ingSorted.filter(i => !x.ingredients.some(l => l.ingredientId === i.id)).map(i => <option key={i.id} value={i.id}>{i.name} ({t(i.unit)})</option>)}
          </select>
          <button className="btn" onClick={() => openDialog({ type: 'ingredient', back: { type: 'dish', dish: x } })}><Plus />Neue Zutat</button>
        </div>}
        <div className="infobox mt12">
          <b>Allergene:</b> {al.allergens.length ? al.allergens.map(a => t(a)).join(', ') : 'keine'}
          {al.traces.length > 0 && <><br /><b>Kann Spuren enthalten:</b> {al.traces.map(a => t(a)).join(', ')}</>}
          <div className="muted" style={{ fontSize: 12 }}>Ergibt sich automatisch aus den Zutaten.</div>
        </div>
        <label className="mt8">Notiz / Zubereitung<textarea value={x.notes} onChange={e => upd({ notes: e.target.value })} /></label>
      </fieldset>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Zutat */
export function IngredientForm({ ing, back }: { ing?: Ingredient; back?: { type: 'dish'; dish: Dish } }) {
  const d = useData();
  const store = useApp();
  const ro = !canEditMenu(useRole());
  const isNew = !ing;
  const [x, setX] = useState<Ingredient>(() => ing ? structuredClone(ing) : { id: newId(), name: '', unit: 'g', allergens: [], traces: [] });
  const [busy, setBusy] = useState(false);
  const upd = (p: Partial<Ingredient>) => setX(prev => ({ ...prev, ...p }));
  const usage = ing ? ingredientUsage(d, ing.id) : [];
  // aus dem Gericht-Dialog geöffnet: danach dorthin zurück, neue Zutat gleich eingetragen
  const done = (saved?: Ingredient) => {
    if (back) openDialog({ type: 'dish', dish: saved ? { ...back.dish, ingredients: [...back.dish.ingredients, { ingredientId: saved.id, qty: 0 }] } : back.dish });
    else closeDialog();
  };

  async function save() {
    const name = x.name.trim();
    if (!name) return toast('Bitte einen Namen eingeben', 'err');
    if (d.ingredients.some(o => o.id !== x.id && o.name.trim().toLowerCase() === name.toLowerCase())) return toast('Diese Zutat gibt es schon', 'err');
    setBusy(true);
    const row = { ...x, name, traces: x.traces.filter(a => !x.allergens.includes(a)) };
    const ok = await store.upsert('ingredients', [row], [isNew ? 'Zutat angelegt' : 'Zutat geändert', name]);
    setBusy(false);
    if (ok) { toast('Gespeichert'); done(isNew ? row : undefined); }
  }
  async function remove() {
    if (!ing) return;
    if (usage.length) return toast(`Wird noch verwendet in: ${usage.slice(0, 4).join(', ')}${usage.length > 4 ? ' …' : ''}`, 'err');
    if (!(await confirmDialog('Zutat löschen?', [ing.name], 'Löschen', true))) return;
    if (await store.remove('ingredients', [ing.id], ['Zutat gelöscht', ing.name])) { toast('Gelöscht'); closeDialog(); }
  }

  return (
    <Modal title={isNew ? 'Neue Zutat' : x.name || 'Zutat'} onClose={() => done()}
      footer={ro ? <button className="btn" onClick={closeDialog}>Schließen</button> : <>
        {!isNew && <button className="btn danger" onClick={remove}><Trash2 />Löschen</button>}<span className="spacer" />
        <button className="btn" onClick={() => done()}>Abbrechen</button><button className="btn primary" onClick={save} disabled={busy}>Speichern</button></>}>
      <fieldset className="plain" disabled={ro}>
        <div className="grid2">
          <label>Name *<input value={x.name} autoFocus={isNew} onChange={e => upd({ name: e.target.value })} /></label>
          <label>Einheit (Mengen im Rezept)<select value={x.unit} onChange={e => upd({ unit: e.target.value as Unit })}>{UNITS.map(u => <option key={u} value={u}>{t(u)}</option>)}</select></label>
        </div>
        <div className="mt12"><AllergenPicker value={x.allergens} onChange={allergens => upd({ allergens })} label="Enthält Allergene" /></div>
        <div className="mt12"><AllergenPicker value={x.traces} onChange={traces => upd({ traces })} label="Kann Spuren enthalten" /></div>
      </fieldset>
      {usage.length > 0 && <p className="muted mt12" style={{ fontSize: 13 }}>Verwendet in: {usage.join(', ')}</p>}
    </Modal>
  );
}

/** Zutatenliste eines Menüs als Tabelle (für Dialog und Bericht) */
export function IngredientTable({ rows }: { rows: { name: string; qty: number; unit: Unit; note?: string }[] }) {
  if (!rows.length) return <p className="muted">Keine Zutaten – bei den Gerichten sind noch keine Rezepte hinterlegt.</p>;
  return <table className="list"><thead><tr><th>Zutat</th><th style={{ textAlign: 'right' }}>Menge</th><th>Verwendung</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.name}><td>{r.name}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b>{fmtQty(r.qty, r.unit)}</b></td><td className="muted" style={{ fontSize: 12 }}>{r.note}</td></tr>)}</tbody></table>;
}

/** Allergen-Warnungen je Gast und Allergen zusammengefasst: Gang, betroffene Gerichte → Alternative */
export function WarningList({ d, warnings, withTable }: { d: VenueData; warnings: AllergenWarning[]; withTable?: boolean }) {
  const groups = new Map<string, AllergenWarning[]>();
  for (const w of warnings) { const k = w.r.id + w.allergen; groups.set(k, [...(groups.get(k) ?? []), w]); }
  return (
    <div className="warnbox allergen-warnings">{[...groups.entries()].map(([k, g]) => {
      const w = g[0], bad = g.some(x => !x.alternatives.length);
      return (
        <div key={k} className={bad ? 'bad' : undefined}>{bad ? '⛔' : '⚠'} <b>{w.r.time} {w.r.name}</b>{withTable && (w.r.tableIds.length ? ` · Tisch ${tableNames(d, w.r.tableIds)}` : ' · ohne Tisch')} – <b>{t(w.allergen)}</b>:{' '}
          {g.map((x, i) => <span key={x.course}>{i > 0 && ' · '}{t(x.course)} {x.dishes.join(' / ')}{x.traces ? ' (Spuren)' : ''} → {x.alternatives.length ? <b>{x.alternatives.join(' / ')}</b> : <b>keine Alternative</b>}</span>)}
        </div>
      );
    })}</div>
  );
}
