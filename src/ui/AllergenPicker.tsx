/** Auswahl der 14 EU-Allergene als Chips, mit Vorschlag aus dem Freitext */
import { ALLERGENS, allergenNo } from '../domain/constants';
import { guessAllergens } from '../domain/menu';
import type { Allergen } from '../domain/types';
import { t } from '../lib/i18n';

export function AllergenPicker({ value, onChange, text, label = 'Allergene' }: {
  value: Allergen[]; onChange: (v: Allergen[]) => void; text?: string; label?: string;
}) {
  const toggle = (a: Allergen) => onChange(value.includes(a) ? value.filter(x => x !== a) : ALLERGENS.filter(x => x === a || value.includes(x)));
  const guess = text ? guessAllergens(text).filter(a => !value.includes(a)) : [];
  return (
    <div className="allergen-picker" role="group" aria-label={label}>
      <div className="allergen-head"><span>{label}</span>
        {guess.length > 0 && <button type="button" className="link" onClick={() => onChange(ALLERGENS.filter(x => value.includes(x) || guess.includes(x)))}>
          Vorschlag aus Notiz übernehmen: {guess.map(t).join(', ')}</button>}
      </div>
      <div className="chips">{ALLERGENS.map(a => (
        <button key={a} type="button" className="btn small allergen-chip" aria-pressed={value.includes(a)} onClick={() => toggle(a)} title={`Allergen ${allergenNo(a)}`}>
          <span className="allergen-no">{allergenNo(a)}</span>{t(a)}</button>
      ))}</div>
    </div>
  );
}

/** Allergene als kurze Nummern-Kennzeichnung, z. B. „1 3 7“ (wie auf Speisekarten) */
export function AllergenNos({ list }: { list: Allergen[] }) {
  if (!list.length) return null;
  return <span className="allergen-nos" title={list.map(t).join(', ')}>{list.map(allergenNo).join(' ')}</span>;
}
