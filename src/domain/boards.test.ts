import { describe, expect, it } from 'vitest';
import { DEFAULT_BOARDS, boardError, boardLabel, boardMeals, boardTables, mealMode, withMealMode } from './boards';
import { stayEats } from './guestMenu';
import { parseBoard } from './hotelImport';
import { emptyVenueData } from './demo';
import { stayServices } from './logic';

describe('Verpflegungsarten', () => {
  it('Standard wie bisher, eigene Arten je Betrieb', () => {
    expect(boardTables({}, 'HP')).toEqual(['abend']);
    expect(boardMeals({}, 'UF')).toEqual(['fruehstueck']);
    const v = { boardConfig: [...DEFAULT_BOARDS, { key: 'HPP', label: 'Halbpension plus', meals: ['fruehstueck', 'mittag', 'abend'] as const, tables: ['abend'] as const }].map(b => ({ ...b, meals: [...b.meals], tables: [...b.tables] })) };
    expect(boardLabel(v, 'HPP')).toBe('Halbpension plus');
    expect(boardLabel(v, 'XX')).toBe('XX');
    const s = { board: 'HPP', arrival: '2026-10-10', departure: '2026-10-12' };
    expect(stayEats(v, s, 'mittag', '2026-10-11')).toBe(true);
    expect(stayEats({}, s, 'mittag', '2026-10-11')).toBe(false); // ohne Eintrag: unbekannt → keine Mahlzeit
    const d = emptyVenueData('v', 'H'); d.venue.boardConfig = v.boardConfig;
    expect(stayServices(d, s).map(x => x.kind)).toEqual(['abend']);
    expect(parseBoard('hpp', ['UF', 'HP', 'HPP'])).toBe('HPP');
    expect(parseBoard('Halbpension')).toBe('HP');
  });

  it('Mahlzeit umschalten und prüfen', () => {
    const hp = DEFAULT_BOARDS[1];
    expect(mealMode(hp, 'abend')).toBe('tisch');
    expect(mealMode(hp, 'fruehstueck')).toBe('ja');
    const x = withMealMode(hp, 'mittag', 'tisch');
    expect([x.meals, x.tables]).toEqual([['fruehstueck', 'mittag', 'abend'], ['mittag', 'abend']]);
    expect(withMealMode(x, 'abend', 'nein').tables).toEqual(['mittag']);
    expect(boardError([hp, { ...hp }])).toMatch(/nur einmal/);
    expect(boardError([{ ...hp, key: '' }])).toMatch(/1–10/);
    expect(boardError([])).toMatch(/Mindestens/);
    expect(boardError(DEFAULT_BOARDS)).toBeNull();
  });
});
