import { describe, expect, it } from 'vitest';
import { newId } from './demo';
import { moduleAllowed, monthlyTotals, orderLines, orderText, productGroups, seedSuppliers, waLink, waNumber } from './orders';
import { SUPPLIER_SEED } from './orderSeed';
import type { SupplierOrder } from './types';

describe('Bestellliste', () => {
  it('Telefonnummer für WhatsApp: Ländervorwahl ergänzen bzw. übernehmen', () => {
    expect(waNumber('3661595025')).toBe('393661595025');
    expect(waNumber('+39 366 159 5025')).toBe('393661595025');
    expect(waNumber('0039 366 159 5025')).toBe('393661595025');
    expect(waNumber('0471 123456')).toBe('390471123456');
    expect(waNumber('+43 664 1234567')).toBe('436641234567');
    expect(waLink('3661595025', 'a b')).toBe('https://wa.me/393661595025?text=a%20b');
  });
  it('Startdaten: Agostini und Vinothek Mairhofer mit allen Artikeln nach Gruppen', () => {
    const { suppliers, products } = seedSuppliers(newId);
    expect(suppliers.map(s => s.name)).toEqual(['Agostini', 'Vinothek Mairhofer']);
    const total = SUPPLIER_SEED.reduce((a, s) => a + s.groups.reduce((b, g) => b + g[1].length, 0), 0);
    expect(products).toHaveLength(total);
    const mair = products.filter(p => p.supplierId === suppliers[1].id);
    expect(productGroups(mair).map(g => g[0])).toEqual(['Weißwein & Rosé', 'Rotwein', 'Spirituosen', 'Schaumwein & weitere Weine', 'Sonstiges', 'Grappa / Rum']);
  });
  it('Bestelltext nur mit Mengen > 0, in Artikel-Reihenfolge', () => {
    const { suppliers, products } = seedSuppliers(newId);
    const ag = products.filter(p => p.supplierId === suppliers[0].id);
    const lines = orderLines(ag, { [ag[2].id]: 6, [ag[0].id]: 2, [ag[1].id]: 0 });
    expect(lines.map(l => [l.qty, l.name])).toEqual([[2, 'Orangensaft'], [6, 'Wasser ohne / mit Sprudel 0,75']]);
    const text = orderText('Hotel Sonnenhof', suppliers[0], lines, 'Lieferung bitte bis Freitag', new Date('2026-10-22T10:00:00'));
    expect(text).toBe('Bestellung Hotel Sonnenhof – 22.10.2026\nan Agostini\n\n2 × Orangensaft\n6 × Wasser ohne / mit Sprudel 0,75\n\nLieferung bitte bis Freitag\n\nVielen Dank!');
  });
  it('Auswertung: Mengen je Artikel und Monat', () => {
    const o = (createdAt: string, items: [string, number][]): SupplierOrder => ({ id: newId(), supplierId: 's1', createdAt, createdBy: 'X', note: '',
      items: items.map(([name, qty]) => ({ productId: name, name, unit: '', qty })) });
    const orders = [o('2026-10-02T09:00:00Z', [['Cola', 4], ['Wasser', 10]]), o('2026-10-20T09:00:00Z', [['Cola', 2]]), o('2026-09-15T09:00:00Z', [['Cola', 5]]),
      { ...o('2026-10-05T09:00:00Z', [['Cola', 99]]), supplierId: 'anderer' }];
    const r = monthlyTotals(orders, 's1', 2, new Date('2026-10-22'));
    expect(r.months).toEqual(['2026-10', '2026-09']);
    expect(r.rows).toEqual([{ name: 'Cola', perMonth: [6, 5], total: 11 }, { name: 'Wasser', perMonth: [10, 0], total: 10 }]);
  });
  it('Modul-Sichtbarkeit je Rolle (Admin immer)', () => {
    const v = { modules: ['bestellliste' as const], moduleRoles: { bestellliste: ['service' as const] } };
    expect(moduleAllowed(v, 'bestellliste', 'admin')).toBe(true);
    expect(moduleAllowed(v, 'bestellliste', 'service')).toBe(true);
    expect(moduleAllowed(v, 'bestellliste', 'kueche')).toBe(false);
    expect(moduleAllowed({ modules: ['bestellliste'] }, 'bestellliste', 'kueche')).toBe(true); // Standard: Küche
    expect(moduleAllowed({ modules: [] }, 'bestellliste', 'admin')).toBe(false); // Modul aus
  });
});
