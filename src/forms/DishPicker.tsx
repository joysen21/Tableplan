/** Gerichtsauswahl im Tagesmenü: Gänge als aufklappbare Untermenüs, Gerichte nach Häufigkeit (in wie vielen Menüs verwendet),
 *  je 20 Einträge (mehr laden), Textsuche über alle Gänge; Flag = Gericht im Menü (antippen setzt/entfernt). */
import { useMemo, useState } from 'react';
import { ChevronDown, Flag, Search } from '../ui/icons';
import { DISH_COURSES } from '../domain/constants';
import { dishFrequency, pickDishes } from '../domain/menu';
import type { Course, VenueData } from '../domain/types';
import { t } from '../lib/i18n';

const PAGE = 20;

export function DishPicker({ d, selected, onToggle }: { d: VenueData; selected: Set<string>; onToggle: (dishId: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<Course>>(new Set());
  const [limit, setLimit] = useState<Partial<Record<Course, number>>>({});
  const freq = useMemo(() => dishFrequency(d.menus), [d.menus]);
  const courses = [...DISH_COURSES, ...[...new Set(d.dishes.map(x => x.course))].filter(c => !DISH_COURSES.includes(c))];
  const search = q.trim();
  const toggleOpen = (c: Course) => setOpen(s => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  return (
    <div className="dish-picker" role="group" aria-label="Gerichte auswählen">
      <label className="dp-search"><Search aria-hidden="true" />
        <input type="search" placeholder="Gericht suchen…" aria-label="Gericht suchen" value={q} onChange={e => setQ(e.target.value)} /></label>
      {courses.map(c => {
        const all = pickDishes(d.dishes, c, search, freq);
        if (search && !all.length) return null;
        const n = limit[c] ?? PAGE, isOpen = !!search || open.has(c);
        const picked = d.dishes.filter(x => x.course === c && selected.has(x.id)).length;
        return (
          <div key={c} className={'dp-course' + (isOpen ? ' open' : '')}>
            <button type="button" className="dp-head" aria-expanded={isOpen} onClick={() => !search && toggleOpen(c)}>
              <ChevronDown className="dp-chev" aria-hidden="true" /><b>{t(c)}</b>
              <span className="muted">{all.length} {all.length === 1 ? 'Gericht' : 'Gerichte'}{picked ? ` · ${picked} gewählt` : ''}</span>
            </button>
            {isOpen && <ul className="dp-list">
              {all.slice(0, n).map(x => {
                const on = selected.has(x.id), f = freq.get(x.id) ?? 0;
                return (
                  <li key={x.id}>
                    <button type="button" className={'dp-item' + (on ? ' on' : '')} aria-pressed={on} aria-label={`${x.name} ${on ? 'aus dem Menü nehmen' : 'ins Menü'}`} onClick={() => onToggle(x.id)}>
                      <Flag className="dp-flag" aria-hidden="true" /><span>{x.name}</span>
                      {f > 0 && <small className="muted">{f}× verwendet</small>}
                    </button>
                  </li>
                );
              })}
              {all.length > n && <li><button type="button" className="btn small ghost" onClick={() => setLimit(l => ({ ...l, [c]: n + PAGE }))}>
                Weitere {Math.min(PAGE, all.length - n)} laden ({all.length - n} übrig)</button></li>}
              {!all.length && <li className="muted" style={{ fontSize: 12 }}>Keine Gerichte in diesem Gang.</li>}
            </ul>}
          </div>
        );
      })}
      {search && !courses.some(c => pickDishes(d.dishes, c, search, freq).length) && <p className="muted">Kein Gericht gefunden.</p>}
    </div>
  );
}
