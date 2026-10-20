/** Menüauswahl eines Hotelzimmers im Reservierungsformular – dieselben Daten wie die Auswahl per QR-Code */
import { byId, persons } from '../domain/logic';
import { menuChoiceFor, menuCourses } from '../domain/guestMenu';
import type { Reservation, VenueData } from '../domain/types';
import { t } from '../lib/i18n';

export interface ChoiceDraft { counts: Record<string, number>; note: string }

/** value = null → unverändert (gespeicherte Auswahl wird angezeigt) */
export function MenuChoiceEditor({ d, r, value, onChange, readOnly }: { d: VenueData; r: Reservation; value: ChoiceDraft | null; onChange: (v: ChoiceDraft) => void; readOnly?: boolean }) {
  const { menu, choice } = menuChoiceFor(d, r);
  if (!r.stayId) return null;
  if (!menu) return <p className="muted" style={{ fontSize: 12 }}>🍽 Für diesen Tag und Service ist kein Menü angelegt.</p>;
  const cur: ChoiceDraft = value ?? { counts: choice?.counts ?? {}, note: choice?.note ?? '' };
  const p = persons(r);
  const sumOf = (course: string) => menu.items.filter(i => i.course === course).reduce((a, i) => a + (cur.counts[i.dishId] ?? 0), 0);
  const step = (dishId: string, course: string, delta: number) => {
    const n = (cur.counts[dishId] ?? 0) + delta;
    if (n < 0 || (delta > 0 && sumOf(course) >= p)) return;
    onChange({ ...cur, counts: { ...cur.counts, [dishId]: n } });
  };
  return (
    <div className="menu-choice-edit" role="group" aria-label="Menüauswahl">
      {menuCourses(menu.items).map(course => (
        <div key={course} className="mce-course">
          <div className="mce-head"><b>{t(course)}</b><span className={'muted' + (sumOf(course) === p ? ' ok' : '')}>{sumOf(course)}/{p}</span></div>
          {menu.items.filter(i => i.course === course).map(it => (
            <div key={it.dishId} className="mce-dish">
              <span>{byId(d.dishes, it.dishId)?.name ?? it.name}</span>
              <span className="mce-step">
                <button type="button" className="btn small icon" aria-label={`weniger ${byId(d.dishes, it.dishId)?.name ?? it.name}`} disabled={readOnly || !(cur.counts[it.dishId] ?? 0)} onClick={() => step(it.dishId, course, -1)}>−</button>
                <b>{cur.counts[it.dishId] ?? 0}</b>
                <button type="button" className="btn small icon" aria-label={`mehr ${byId(d.dishes, it.dishId)?.name ?? it.name}`} disabled={readOnly || sumOf(course) >= p} onClick={() => step(it.dishId, course, 1)}>+</button>
              </span>
            </div>
          ))}
        </div>
      ))}
      <label className="mt8">Notiz zum Menü<input value={cur.note} maxLength={500} disabled={readOnly} placeholder="z. B. Fleisch medium, Dessert später" onChange={e => onChange({ ...cur, note: e.target.value })} /></label>
      {!choice && !value && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Noch keine Auswahl – per QR-Code oder hier eintragen.</p>}
    </div>
  );
}
