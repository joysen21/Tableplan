/** Bestellliste (Modul): Artikel je Lieferant, Bestellung als WhatsApp-Nachricht, Historie und Auswertung je Monat */
import { SEED_PHONE, SUPPLIER_SEED } from './orderSeed';
import type { ModuleKey, OrderLine, Role, Supplier, SupplierOrder, SupplierProduct, Venue } from './types';

/** Standard-Rollen je Modul, solange in den Einstellungen nichts zugewiesen ist (Admin sieht immer alles) */
export const DEFAULT_MODULE_ROLES: Partial<Record<ModuleKey, Role[]>> = { bestellliste: ['kueche'] };

/** Darf diese Rolle das Modul sehen? (Modul eingeschaltet + Admin oder zugewiesene Rolle) – gleiche Regel wie module_allowed() in der DB */
export function moduleAllowed(venue: Pick<Venue, 'modules' | 'moduleRoles'>, mod: ModuleKey, role: Role): boolean {
  if (!venue.modules.includes(mod)) return false;
  return role === 'admin' || (venue.moduleRoles?.[mod] ?? DEFAULT_MODULE_ROLES[mod] ?? []).includes(role);
}

/** Telefonnummer für wa.me: nur Ziffern mit Ländervorwahl; italienische Nummern ohne Vorwahl bekommen +39 */
export function waNumber(phone: string): string {
  let n = (phone || '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) return n.slice(1).replace(/\D/g, '');
  n = n.replace(/\D/g, '');
  if (n.startsWith('00')) return n.slice(2);
  // Handy (3…) oder Festnetz (0…) in Italien, 9–11 Stellen ohne Ländervorwahl
  if (/^[03]\d{8,10}$/.test(n)) return '39' + n;
  return n;
}

/** Bestellzeilen aus den eingegebenen Mengen (nur > 0), in Reihenfolge der Artikel */
export function orderLines(products: SupplierProduct[], qty: Record<string, number>): OrderLine[] {
  return sortProducts(products).filter(p => (qty[p.id] ?? 0) > 0).map(p => ({ productId: p.id, name: p.name, unit: p.unit, qty: qty[p.id] }));
}

export const sortProducts = (list: SupplierProduct[]) => [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));

/** Gruppen in Reihenfolge ihres ersten Artikels */
export function productGroups(products: SupplierProduct[]): [string, SupplierProduct[]][] {
  const out = new Map<string, SupplierProduct[]>();
  for (const p of sortProducts(products)) out.set(p.group || 'Artikel', [...(out.get(p.group || 'Artikel') ?? []), p]);
  return [...out.entries()];
}

/** Nachricht an den Lieferanten */
export function orderText(venueName: string, supplier: Supplier, lines: OrderLine[], note: string, date = new Date()): string {
  const d = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return [`Bestellung ${venueName} – ${d}`, `an ${supplier.name}`, '', ...lines.map(l => `${l.qty}${l.unit ? ' ' + l.unit : ' ×'} ${l.name}`),
    ...(note.trim() ? ['', note.trim()] : []), '', 'Vielen Dank!'].join('\n');
}

export const waLink = (phone: string, text: string) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

/** Auswertung: Mengen je Artikel und Monat (JJJJ-MM) für einen Lieferanten, neueste Monate zuerst */
export function monthlyTotals(orders: SupplierOrder[], supplierId: string, months: number, today = new Date()): { months: string[]; rows: { name: string; perMonth: number[]; total: number }[] } {
  const keys: string[] = [];
  for (let i = 0; i < months; i++) { const d = new Date(today.getFullYear(), today.getMonth() - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const map = new Map<string, number[]>();
  for (const o of orders.filter(x => x.supplierId === supplierId)) {
    const k = keys.indexOf(o.createdAt.slice(0, 7));
    if (k < 0) continue;
    for (const l of o.items) { const row = map.get(l.name) ?? keys.map(() => 0); row[k] += l.qty; map.set(l.name, row); }
  }
  const rows = [...map.entries()].map(([name, perMonth]) => ({ name, perMonth, total: perMonth.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'de'));
  return { months: keys, rows };
}

/** Startdaten (Agostini, Vinothek Mairhofer) mit neuen IDs – für die Demo; in der Datenbank legt sie die Migration an */
export function seedSuppliers(newId: () => string): { suppliers: Supplier[]; products: SupplierProduct[] } {
  const suppliers: Supplier[] = [], products: SupplierProduct[] = [];
  SUPPLIER_SEED.forEach((s, i) => {
    const id = newId(); suppliers.push({ id, name: s.name, phone: SEED_PHONE, sort: i });
    let n = 0;
    for (const [group, names] of s.groups) for (const name of names) products.push({ id: newId(), supplierId: id, name, unit: '', group, sort: n++, active: true });
  });
  return { suppliers, products };
}
