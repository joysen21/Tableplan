/** Modul Bestellliste: Mengen je Lieferant eingeben → WhatsApp mit fertigem Text öffnen; Historie, Auswertung je Monat, Artikel pflegen */
import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Send, Trash2 } from '../ui/icons';
import { newId } from '../domain/demo';
import { monthlyTotals, orderLines, orderText, productFrequency, sortedProducts, sortProducts, waLink, waNumber, type ProductSort } from '../domain/orders';
import type { SupplierProduct } from '../domain/types';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { confirmDialog, toast } from '../ui/notify';

type Tab = 'bestellen' | 'historie' | 'auswertung' | 'artikel';
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const draftKey = (venueId: string, supplierId: string) => `tischplan.bestellung.${venueId}.${supplierId}`;
const loadDraft = (k: string): Record<string, number> => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
const SORT_KEY = 'tischplan.bestellung.sort';
const saveDraft = (k: string, v: Record<string, number>) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } };

export function OrdersView() {
  const d = useData();
  const suppliers = [...d.suppliers].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));
  const [tab, setTab] = useState<Tab>('bestellen');
  const [sid, setSid] = useState(suppliers[0]?.id ?? '');
  const supplier = suppliers.find(s => s.id === sid) ?? suppliers[0];
  if (!supplier) return <div className="panel body"><p className="muted">Noch keine Lieferanten – in Einstellungen → Module → Bestellliste anlegen.</p></div>;
  return (
    <div className="panel orders-view">
      <div className="row orders-head">
        <div className="seg" role="tablist" aria-label="Bestellliste">
          {(['bestellen', 'historie', 'auswertung', 'artikel'] as Tab[]).map(k => <button key={k} role="tab" className="btn" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {{ bestellen: 'Bestellen', historie: 'Historie', auswertung: 'Auswertung', artikel: 'Artikel' }[k]}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Lieferant">
          {suppliers.map(s => <button key={s.id} className="btn" aria-pressed={s.id === supplier.id} onClick={() => setSid(s.id)}>{s.name}</button>)}
        </div>
      </div>
      {tab === 'bestellen' && <OrderForm key={supplier.id} supplierId={supplier.id} />}
      {tab === 'historie' && <History supplierId={supplier.id} onReuse={() => setTab('bestellen')} />}
      {tab === 'auswertung' && <Stats supplierId={supplier.id} />}
      {tab === 'artikel' && <Products key={supplier.id} supplierId={supplier.id} />}
    </div>
  );
}

/* ---------------------------------------------------------------- Bestellen */
function OrderForm({ supplierId }: { supplierId: string }) {
  const d = useData();
  const store = useApp();
  const user = useApp(s => s.user)!;
  const supplier = d.suppliers.find(s => s.id === supplierId)!;
  const products = d.supplierProducts.filter(p => p.supplierId === supplierId && p.active);
  const key = draftKey(d.venue.id, supplierId);
  const [qty, setQty] = useState<Record<string, number>>(() => loadDraft(key));
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<ProductSort>(() => { try { return (localStorage.getItem(SORT_KEY) as ProductSort) || 'haeufig'; } catch { return 'haeufig'; } });
  useEffect(() => saveDraft(key, qty), [key, qty]);
  useEffect(() => { try { localStorage.setItem(SORT_KEY, sort); } catch { /* egal */ } }, [sort]);
  const freq = useMemo(() => productFrequency(d.supplierOrders, supplierId), [d.supplierOrders, supplierId]);
  const lines = orderLines(products, qty);
  const set = (id: string, n: number) => setQty(prev => { const next = { ...prev }; if (n > 0) next[id] = Math.min(999, n); else delete next[id]; return next; });
  const shown = sortedProducts(products.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())), sort, freq);
  const phoneOk = waNumber(supplier.phone).length >= 8;
  const step = (p: SupplierProduct, label: string) => {
    const n = qty[p.id] ?? 0;
    return (
      <span className="order-step">
        <button type="button" className="btn small icon" aria-label={`weniger ${label}`} disabled={!n} onClick={() => set(p.id, n - 1)}><Minus /></button>
        <input type="number" min={0} inputMode="numeric" aria-label={`Menge ${label}`} value={n || ''} placeholder="0" onChange={e => set(p.id, Math.max(0, Math.round(+e.target.value || 0)))} />
        <button type="button" className="btn small icon" aria-label={`mehr ${label}`} onClick={() => set(p.id, n + 1)}><Plus /></button>
      </span>
    );
  };

  async function send() {
    if (!lines.length) return;
    const text = orderText(d.venue.name, supplier, lines, note);
    // WhatsApp sofort öffnen (sonst blockiert der Browser das neue Fenster), danach in der Historie speichern
    window.open(waLink(supplier.phone, text), '_blank', 'noopener');
    const ok = await store.upsert('supplierOrders', [{ id: newId(), supplierId, createdAt: new Date().toISOString(), createdBy: user.name, items: lines, note: note.trim() }],
      ['Bestellung gesendet', `${supplier.name}: ${lines.length} Artikel`]);
    if (ok) { setQty({}); setNote(''); toast('Bestellung in der Historie gespeichert'); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(orderText(d.venue.name, supplier, lines, note)); toast('Text kopiert'); } catch { toast('Kopieren nicht möglich', 'err'); }
  }
  return (
    <div className="body order-split">
      {/* links: alle Artikel */}
      <section className="order-catalog" aria-label="Artikel">
        <div className="row mb8">
          <input type="search" placeholder="Artikel suchen…" aria-label="Artikel suchen" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <div className="seg" role="group" aria-label="Sortierung">
            <button className="btn small" aria-pressed={sort === 'haeufig'} onClick={() => setSort('haeufig')}>Häufigkeit</button>
            <button className="btn small" aria-pressed={sort === 'name'} onClick={() => setSort('name')}>A–Z</button>
          </div>
        </div>
        {!products.length && <p className="muted">Keine Artikel – im Reiter „Artikel“ anlegen.</p>}
        {q && products.length > 0 && !shown.length && <p className="muted">Kein Artikel gefunden.</p>}
        <div className="order-list">
          {shown.map(p => {
            const n = qty[p.id] ?? 0, f = freq.get(p.id) ?? 0;
            return (
              <div key={p.id} className={'order-row' + (n ? ' has' : '')}>
                <span className="order-name">{p.name}{p.unit && <small className="muted"> · {p.unit}</small>}
                  <small className="muted order-meta">{[p.group, f ? `${f}× bestellt` : ''].filter(Boolean).join(' · ')}</small></span>
                {step(p, p.name)}
              </div>
            );
          })}
        </div>
      </section>

      {/* rechts: Warenkorb mit Notiz und Versand */}
      <aside className="order-cart" aria-label="Warenkorb">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0 }}>Warenkorb · {supplier.name}</h4>
          {lines.length > 0 && <button className="btn small ghost" onClick={async () => { if (await confirmDialog('Warenkorb leeren?', ['Alle eingegebenen Mengen dieses Lieferanten werden gelöscht.'], 'Leeren', true)) setQty({}); }}>Leeren</button>}
        </div>
        {!lines.length ? <p className="muted">Noch leer – links Mengen eingeben.</p> : (
          <ul className="cart-lines">
            {lines.map(l => {
              const p = products.find(x => x.id === l.productId)!;
              return (
                <li key={l.productId}>
                  <span className="order-name">{l.name}{l.unit && <small className="muted"> · {l.unit}</small>}</span>
                  {step(p, `Warenkorb ${l.name}`)}
                  <button className="btn small icon ghost danger" aria-label={`${l.name} entfernen`} title="Entfernen" onClick={() => set(l.productId, 0)}><Trash2 /></button>
                </li>
              );
            })}
          </ul>
        )}
        <label className="mt8">Notiz an den Lieferanten<input value={note} placeholder="z. B. Lieferung bitte bis Freitag" onChange={e => setNote(e.target.value)} /></label>
        <div className="order-send">
          <span><b>{lines.length}</b> Artikel · <b>{lines.reduce((a, l) => a + l.qty, 0)}</b> Stück</span>
          <span className="spacer" />
          <button className="btn small" disabled={!lines.length} onClick={copy}>Text kopieren</button>
          <button className="btn primary" disabled={!lines.length || !phoneOk} onClick={send} title={phoneOk ? `WhatsApp an ${supplier.phone}` : 'Telefonnummer fehlt (Einstellungen → Module → Bestellliste)'}>
            <Send />Per WhatsApp senden</button>
        </div>
        {!phoneOk && <p className="warnbox">Für {supplier.name} ist keine Telefonnummer hinterlegt (Einstellungen → Module → Bestellliste).</p>}
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- Historie */
function History({ supplierId, onReuse }: { supplierId: string; onReuse: () => void }) {
  const d = useData();
  const orders = d.supplierOrders.filter(o => o.supplierId === supplierId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [open, setOpen] = useState<string | null>(orders[0]?.id ?? null);
  function reuse(items: { productId: string; qty: number }[]) {
    saveDraft(draftKey(d.venue.id, supplierId), Object.fromEntries(items.filter(i => d.supplierProducts.some(p => p.id === i.productId)).map(i => [i.productId, i.qty])));
    toast('Mengen übernommen');
    onReuse();
  }
  if (!orders.length) return <div className="body"><p className="muted">Noch keine Bestellungen an diesen Lieferanten.</p></div>;
  return (
    <div className="body">
      {orders.map(o => (
        <div key={o.id} className="order-hist">
          <button className="order-hist-head" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>
            <b>{new Date(o.createdAt).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b>
            <span className="muted">{o.items.length} Artikel · {o.items.reduce((a, l) => a + l.qty, 0)} Stück · {o.createdBy}</span>
          </button>
          {open === o.id && <div className="order-hist-body">
            {o.items.map(l => <div key={l.productId} className="ml-dish"><b>{l.qty}×</b><span>{l.name}{l.unit ? ` (${l.unit})` : ''}</span></div>)}
            {o.note && <p className="muted" style={{ margin: '6px 0 0' }}>📝 {o.note}</p>}
            <button className="btn small mt8" onClick={() => reuse(o.items)}>Als neue Bestellung übernehmen</button>
          </div>}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Auswertung */
function Stats({ supplierId }: { supplierId: string }) {
  const d = useData();
  const [months, setMonths] = useState(6);
  const r = useMemo(() => monthlyTotals(d.supplierOrders, supplierId, months), [d.supplierOrders, supplierId, months]);
  const label = (k: string) => `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
  return (
    <div className="body">
      <div className="row mb8"><label className="row" style={{ gap: 6 }}>Zeitraum<select value={months} onChange={e => setMonths(+e.target.value)} style={{ width: 'auto' }} aria-label="Zeitraum">
        {[3, 6, 12].map(n => <option key={n} value={n}>letzte {n} Monate</option>)}</select></label></div>
      {!r.rows.length ? <p className="muted">Im Zeitraum keine Bestellungen.</p> :
        <div className="table-scroll"><table className="list order-stats">
          <thead><tr><th>Artikel</th>{r.months.map(m => <th key={m} className="num">{label(m)}</th>)}<th className="num">Gesamt</th></tr></thead>
          <tbody>{r.rows.map(x => <tr key={x.name}><td>{x.name}</td>{x.perMonth.map((n, i) => <td key={i} className="num">{n || ''}</td>)}<td className="num"><b>{x.total}</b></td></tr>)}</tbody>
        </table></div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Artikel pflegen */
function Products({ supplierId }: { supplierId: string }) {
  const d = useData();
  const store = useApp();
  const list = sortProducts(d.supplierProducts.filter(p => p.supplierId === supplierId));
  const groups = [...new Set(list.map(p => p.group).filter(Boolean))];
  const [nw, setNw] = useState({ name: '', group: groups[0] ?? '', unit: '' });
  const save = (p: SupplierProduct, patch: Partial<SupplierProduct>, text: string) => store.upsert('supplierProducts', [{ ...p, ...patch }], ['Artikel geändert', `${p.name}: ${text}`]);
  async function add() {
    if (!nw.name.trim()) return toast('Bitte Artikelname eingeben', 'err');
    const sort = Math.max(-1, ...list.filter(p => p.group === nw.group).map(p => p.sort)) + 1;
    if (await store.upsert('supplierProducts', [{ id: newId(), supplierId, name: nw.name.trim(), unit: nw.unit.trim(), group: nw.group.trim(), sort, active: true }], ['Artikel angelegt', nw.name.trim()]))
      setNw({ ...nw, name: '', unit: '' });
  }
  return (
    <div className="body">
      <datalist id="order-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
      <div className="table-scroll"><table className="list order-products">
        <thead><tr><th>Artikel</th><th>Einheit</th><th>Gruppe</th><th>Aktiv</th><th /></tr></thead>
        <tbody>{list.map(p => (
          <tr key={p.id} className={p.active ? '' : 'inactive'}>
            <td><input aria-label={`Name ${p.name}`} defaultValue={p.name} key={'n' + p.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.name) save(p, { name: v }, 'umbenannt'); }} /></td>
            <td><input aria-label={`Einheit ${p.name}`} defaultValue={p.unit} key={'u' + p.unit} placeholder="z. B. Kiste" onBlur={e => { const v = e.target.value.trim(); if (v !== p.unit) save(p, { unit: v }, 'Einheit'); }} /></td>
            <td><input aria-label={`Gruppe ${p.name}`} list="order-groups" defaultValue={p.group} key={'g' + p.group} onBlur={e => { const v = e.target.value.trim(); if (v !== p.group) save(p, { group: v }, 'Gruppe'); }} /></td>
            <td><input type="checkbox" aria-label={`${p.name} aktiv`} checked={p.active} onChange={e => save(p, { active: e.target.checked }, e.target.checked ? 'aktiv' : 'ausgeblendet')} /></td>
            <td><button className="btn small icon ghost danger" aria-label={`${p.name} löschen`} title="Löschen" onClick={async () => {
              if (await confirmDialog('Artikel löschen?', [p.name, 'Bisherige Bestellungen in der Historie bleiben erhalten.'], 'Löschen', true)) store.remove('supplierProducts', [p.id], ['Artikel gelöscht', p.name]);
            }}><Trash2 /></button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <h4 style={{ margin: '14px 0 6px' }}>Neuer Artikel</h4>
      <div className="row">
        <input aria-label="Neuer Artikel" placeholder="Artikelname" value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') add(); }} style={{ flex: 2, minWidth: 160 }} />
        <input aria-label="Einheit neuer Artikel" placeholder="Einheit" value={nw.unit} onChange={e => setNw({ ...nw, unit: e.target.value })} style={{ flex: 1, minWidth: 90 }} />
        <input aria-label="Gruppe neuer Artikel" list="order-groups" placeholder="Gruppe" value={nw.group} onChange={e => setNw({ ...nw, group: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <button className="btn primary" onClick={add}><Plus />Hinzufügen</button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Ausgeblendete Artikel erscheinen nicht in der Bestellliste, bleiben aber in der Auswertung.</p>
    </div>
  );
}
