import { describe, expect, it } from 'vitest';
import { demoVenueData, emptyVenueData, newId, normalizeVenueData } from './demo';
import {
  allergenWarnings, allergyText, copyPreviousWeek, dishAllergens, dishPlans, dishUsage, expectedPortions, fmtQty, guessAllergens,
  ingredientTotals, ingredientUsage, itemShares, menuPortions, snapshotItems, weekDates
} from './menu';
import type { Dish, Ingredient, Menu, MenuItem, Reservation, VenueData } from './types';

function kitchen() {
  const d = emptyVenueData('v1', 'Test');
  const svc = d.services.find(s => s.kind === 'abend')!.id;
  const ing = (name: string, unit: Ingredient['unit'], allergens: Ingredient['allergens'] = [], traces: Ingredient['traces'] = []): Ingredient =>
    ({ id: newId(), name, unit, allergens, traces });
  const mehl = ing('Mehl', 'g', ['gluten']), ei = ing('Ei', 'stk', ['eier']), hasel = ing('Haselnüsse', 'g', ['schalenfruechte']),
    brösel = ing('Brösel', 'g', ['gluten'], ['sesam']), kalb = ing('Kalb', 'g'), beeren = ing('Beeren', 'g'), sahne = ing('Sahne', 'ml', ['milch']);
  d.ingredients.push(mehl, ei, hasel, brösel, kalb, beeren, sahne);
  const dish = (name: string, course: Dish['course'], lines: [Ingredient, number][]): Dish =>
    ({ id: newId(), name, nameIt: '', nameEn: '', course, diet: [], notes: '', ingredients: lines.map(([i, qty]) => ({ ingredientId: i.id, qty })) });
  const schnitzel = dish('Schnitzel', 'hauptgang', [[kalb, 160], [mehl, 20], [ei, 0.5], [brösel, 40]]);
  const strudel = dish('Strudel', 'dessert', [[mehl, 40], [hasel, 10], [sahne, 30]]);
  const sorbet = dish('Sorbet', 'dessert', [[beeren, 100]]);
  d.dishes.push(schnitzel, strudel, sorbet);
  const item = (x: Dish, share: number | null = null): MenuItem => ({ course: x.course, dishId: x.id, share, name: '', allergens: [] });
  const menu: Menu = { id: newId(), date: '2026-10-10', serviceId: svc, portions: null, bufferPct: 10, notes: '', items: snapshotItems(d, [item(strudel), item(schnitzel), item(sorbet)]) };
  d.menus.push(menu);
  return { d, svc, menu, mehl, ei, hasel, schnitzel, strudel, sorbet, item };
}
const res = (d: VenueData, p: Partial<Reservation> & { serviceId: string }): Reservation => {
  const r: Reservation = {
    id: newId(), date: '2026-10-10', time: '19:00', duration: 120, adults: 2, children: 0, name: 'Gast', phone: '', email: '', occasion: '',
    allergies: '', allergens: [], notes: '', highchair: false, vip: false, source: 'Telefon', status: 'bestaetigt', wishes: [], stayId: null,
    manualTable: false, seriesId: null, seatedAt: null, finishedAt: null, tableIds: [], ...p
  };
  d.reservations.push(r); return r;
};

describe('Allergene', () => {
  it('leitet Allergene und Spuren eines Gerichts aus den Zutaten ab', () => {
    const { d, schnitzel } = kitchen();
    expect(dishAllergens(d, schnitzel)).toEqual({ allergens: ['gluten', 'eier'], traces: ['sesam'] });
  });
  it('hält Name und Allergene als Momentaufnahme fest und sortiert nach Gang', () => {
    const { menu } = kitchen();
    expect(menu.items.map(i => i.name)).toEqual(['Schnitzel', 'Strudel', 'Sorbet']);
    expect(menu.items[1].allergens).toEqual(['gluten', 'milch', 'schalenfruechte']);
  });
  it('schlägt Allergene aus dem Freitext vor (Erdnüsse sind keine Schalenfrüchte)', () => {
    expect(guessAllergens('Nüsse, Laktose')).toEqual(['milch', 'schalenfruechte']);
    expect(guessAllergens('Erdnussallergie')).toEqual(['erdnuesse']);
    expect(guessAllergens('glutenfrei, keine Eier')).toEqual(['gluten', 'eier']);
    expect(guessAllergens('Schalentiere')).toEqual(['krebstiere', 'weichtiere']);
    expect(guessAllergens('vegetarisch')).toEqual([]);
    expect(guessAllergens('celiachia, lattosio')).toEqual(['gluten', 'milch']);
  });
  it('zeigt Auswahl und Notiz gemeinsam an', () => {
    expect(allergyText({ allergens: ['gluten', 'milch'], allergies: 'keine Zwiebeln' })).toBe('Gluten, Milch/Laktose · keine Zwiebeln');
    expect(allergyText({ allergens: ['schalenfruechte'], allergies: 'Nüsse, vegetarisch' })).toBe('Schalenfrüchte (Nüsse) · vegetarisch');
    expect(allergyText({ allergens: [], allergies: 'Laktose' })).toBe('Laktose');
  });
});

describe('Portionen', () => {
  it('zählt Gäste aus Reservierungen (ohne Storno/No-Show) plus Puffer', () => {
    const { d, svc, menu } = kitchen();
    res(d, { serviceId: svc, adults: 2, children: 1 });
    res(d, { serviceId: svc, adults: 4 });
    res(d, { serviceId: svc, adults: 6, status: 'storniert' });
    res(d, { serviceId: svc, adults: 3, date: '2026-10-11' });
    expect(expectedPortions(d, '2026-10-10', svc)).toBe(7);
    expect(menuPortions(d, menu)).toEqual({ auto: 7, base: 7, total: 8 }); // 7 × 1,1 = 7,7 → 8
    expect(menuPortions(d, { ...menu, portions: 20, bufferPct: 0 }).total).toBe(20);
  });
  it('verteilt Anteile bei einer Wahl', () => {
    const { schnitzel, strudel, sorbet, item } = kitchen();
    expect(itemShares([item(schnitzel), item(strudel), item(sorbet)])).toEqual([1, 0.5, 0.5]);
    expect(itemShares([item(strudel, 70), item(sorbet)])).toEqual([0.7, 0.3]);
    expect(itemShares([item(strudel, 60), item(sorbet, 60)])).toEqual([0.5, 0.5]); // alle gesetzt → auf 100 % umgerechnet
  });
});

describe('Zutatenliste', () => {
  it('rechnet Mengen pro Portion hoch und summiert je Zutat', () => {
    const { d, menu, mehl, ei } = kitchen();
    const m = { ...menu, portions: 10, bufferPct: 0 };
    const plans = dishPlans(d, m);
    expect(plans.map(p => p.portions)).toEqual([10, 5, 5]);
    const tot = ingredientTotals(d, [m]);
    expect(tot.find(x => x.ingredient.id === mehl.id)!.qty).toBe(10 * 20 + 5 * 40);
    expect(tot.find(x => x.ingredient.id === ei.id)!.qty).toBe(5);
    expect(tot.map(x => x.ingredient.name)).toEqual([...tot.map(x => x.ingredient.name)].sort((a, b) => a.localeCompare(b, 'de')));
  });
  it('gibt Mengen lesbar aus', () => {
    expect(fmtQty(2400, 'g')).toBe('2,4 kg');
    expect(fmtQty(750, 'ml')).toBe('750 ml');
    expect(fmtQty(1500, 'ml')).toBe('1,5 l');
    expect(fmtQty(4.5, 'stk')).toBe('5 Stk.');
    expect(fmtQty(2.5, 'g')).toBe('2,5 g');
  });
});

describe('Allergen-Abgleich mit Gästen', () => {
  it('warnt und nennt eine Alternative im selben Gang', () => {
    const { d, svc, menu } = kitchen();
    res(d, { serviceId: svc, name: 'Huber', allergens: ['schalenfruechte'] });
    const w = allergenWarnings(d, menu);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ allergen: 'schalenfruechte', course: 'dessert', dishes: ['Strudel'], alternatives: ['Sorbet'], traces: false });
  });
  it('meldet fehlende Alternative und Spuren', () => {
    const { d, svc, menu } = kitchen();
    res(d, { serviceId: svc, name: 'Mair', allergens: ['gluten', 'sesam'] });
    const w = allergenWarnings(d, menu);
    expect(w.find(x => x.allergen === 'gluten' && x.course === 'hauptgang')!.alternatives).toEqual([]);
    expect(w.find(x => x.allergen === 'sesam')).toMatchObject({ traces: true, dishes: ['Schnitzel'] });
  });
  it('ignoriert stornierte Reservierungen und Gäste ohne Auswahl', () => {
    const { d, svc, menu } = kitchen();
    res(d, { serviceId: svc, allergens: ['gluten'], status: 'noshow' });
    res(d, { serviceId: svc, allergies: 'Gluten' });
    expect(allergenWarnings(d, menu)).toEqual([]);
  });
});

describe('Verwaltung', () => {
  it('erkennt verwendete Zutaten und Gerichte', () => {
    const { d, mehl, strudel } = kitchen();
    expect(ingredientUsage(d, mehl.id)).toEqual(['Schnitzel', 'Strudel']);
    expect(dishUsage(d, strudel.id, '2026-10-01')).toHaveLength(1);
    expect(dishUsage(d, strudel.id, '2026-10-11')).toHaveLength(0); // vergangene Menüs zählen nicht
  });
  it('liefert die Woche ab Montag', () => {
    expect(weekDates('2026-10-07')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(weekDates('2026-10-11')[0]).toBe('2026-10-05');
  });
  it('übernimmt die Vorwoche, ohne vorhandene Menüs zu überschreiben', () => {
    const { d, menu, svc } = kitchen(); // Menü am Sa 10.10.
    d.menus.push({ ...menu, id: newId(), date: '2026-10-09', portions: 30 }); // Fr 09.10.
    d.menus.push({ ...menu, id: newId(), date: '2026-10-16', serviceId: svc }); // Fr der Folgewoche schon geplant
    const out = copyPreviousWeek(d, '2026-10-14', newId);
    expect(out.map(m => m.date)).toEqual(['2026-10-17']);
    expect(out[0].portions).toBeNull();
  });
});

describe('Demo-Daten', () => {
  it('enthalten Zutaten, Gerichte, Menüs und Allergen-Auswahl', () => {
    const d = demoVenueData('v1', 'Demo');
    expect(d.ingredients.length).toBeGreaterThan(20);
    expect(d.dishes.length).toBeGreaterThanOrEqual(10);
    expect(d.menus.length).toBe(18);
    expect(d.reservations.some(r => r.allergens.length)).toBe(true);
    expect(d.menus.every(m => m.items.every(i => d.dishes.some(x => x.id === i.dishId)))).toBe(true);
  });
  it('ergänzt fehlende Listen aus älteren Datenständen', () => {
    const old = { ...emptyVenueData('v1', 'Alt') } as Partial<VenueData>;
    delete old.menus; delete old.dishes;
    const n = normalizeVenueData(old as VenueData);
    expect(n.menus).toEqual([]); expect(n.dishes).toEqual([]);
  });
});
