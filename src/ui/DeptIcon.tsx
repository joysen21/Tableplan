/** Icons für Bereiche (statt Farbpunkt) – feste Auswahl, damit der Plan einheitlich bleibt */
import type { LucideIcon } from 'lucide-react';
import {
  Baby, BedDouble, Beer, Bike, Briefcase, CakeSlice, Calculator, Car, ChefHat, Coffee, ConciergeBell, Dumbbell, Fish, Flower2, Hotel, Leaf,
  Martini, Music, Pizza, Shirt, ShoppingCart, Sparkles, SprayCan, Truck, Users, Utensils, WashingMachine, Waves, Wine, Wrench
} from './icons';
import type { Department } from '../domain/types';

export const DEPARTMENT_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'kueche', label: 'Küche', Icon: ChefHat }, { key: 'service', label: 'Service', Icon: Utensils },
  { key: 'rezeption', label: 'Rezeption', Icon: ConciergeBell }, { key: 'hotel', label: 'Hotel', Icon: Hotel },
  { key: 'bar', label: 'Bar', Icon: Martini }, { key: 'wein', label: 'Wein', Icon: Wine }, { key: 'bier', label: 'Bier', Icon: Beer },
  { key: 'kaffee', label: 'Kaffee', Icon: Coffee }, { key: 'pizza', label: 'Pizzeria', Icon: Pizza }, { key: 'patisserie', label: 'Patisserie', Icon: CakeSlice },
  { key: 'fisch', label: 'Fisch', Icon: Fish }, { key: 'etage', label: 'Etage', Icon: BedDouble }, { key: 'reinigung', label: 'Reinigung', Icon: SprayCan },
  { key: 'waesche', label: 'Wäsche', Icon: WashingMachine }, { key: 'kleidung', label: 'Garderobe', Icon: Shirt }, { key: 'spa', label: 'Spa', Icon: Sparkles },
  { key: 'pool', label: 'Pool', Icon: Waves }, { key: 'fitness', label: 'Fitness', Icon: Dumbbell }, { key: 'garten', label: 'Garten', Icon: Leaf },
  { key: 'blumen', label: 'Deko', Icon: Flower2 }, { key: 'technik', label: 'Technik', Icon: Wrench }, { key: 'verwaltung', label: 'Verwaltung', Icon: Briefcase },
  { key: 'buchhaltung', label: 'Buchhaltung', Icon: Calculator }, { key: 'einkauf', label: 'Einkauf', Icon: ShoppingCart }, { key: 'lager', label: 'Lager', Icon: Truck },
  { key: 'fahrer', label: 'Fahrer', Icon: Car }, { key: 'rad', label: 'Radverleih', Icon: Bike }, { key: 'kinder', label: 'Kinder', Icon: Baby },
  { key: 'unterhaltung', label: 'Unterhaltung', Icon: Music }, { key: 'team', label: 'Team', Icon: Users }
];

const byKey = (key: string | null | undefined) => DEPARTMENT_ICONS.find(x => x.key === key);

/** Icon des Bereichs in seiner Farbe; ohne Icon der bisherige Farbpunkt */
export function DeptIcon({ dep, size = 15 }: { dep: Pick<Department, 'icon' | 'color' | 'name'> | undefined; size?: number }) {
  const entry = byKey(dep?.icon);
  if (!entry) return <span className="dot" style={{ background: dep?.color ?? 'var(--muted)' }} aria-hidden="true" />;
  return <entry.Icon className="dept-icon" size={size} style={{ color: dep?.color }} aria-label={dep?.name} role="img" />;
}

/** Auswahl aus der festen Icon-Palette */
export function DeptIconPicker({ value, color, onChange }: { value: string | null | undefined; color: string; onChange: (key: string | null) => void }) {
  return (
    <div className="icon-palette" role="radiogroup" aria-label="Icon wählen">
      <button type="button" role="radio" aria-checked={!value} className="icon-opt" title="Kein Icon (Farbpunkt)" onClick={() => onChange(null)}>
        <span className="dot" style={{ background: color }} /></button>
      {DEPARTMENT_ICONS.map(({ key, label, Icon }) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} className="icon-opt" title={label} aria-label={label} onClick={() => onChange(key)}>
          <Icon size={18} style={{ color }} /></button>
      ))}
    </div>
  );
}

/** Vor Mitarbeiternamen: Icon des Stammbereichs; hat der Bereich (noch) kein Icon, die eigene Farbe der Person */
export const StaffMark = ({ dep, color }: { dep: Pick<Department, 'icon' | 'color' | 'name'> | undefined; color: string }) =>
  byKey(dep?.icon) ? <DeptIcon dep={dep} /> : <span className="dot" style={{ background: color }} aria-hidden="true" />;
