/** Einstellungen → Verpflegungsarten: Kürzel, Bezeichnung und je Mahlzeit „nicht inbegriffen / inbegriffen / mit Tischreservierung“ */
import { Plus, Trash2 } from '../ui/icons';
import { MEALS, boardError, boardsOf, mealMode, withMealMode, type MealMode } from '../domain/boards';
import type { BoardDef } from '../domain/types';
import { t } from '../lib/i18n';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { confirmDialog, toast } from '../ui/notify';

const MODE_LABEL: Record<MealMode, string> = { nein: '–', ja: 'inbegriffen', tisch: 'mit Tisch' };

export function BoardSettings() {
  const d = useData();
  const setBoardConfig = useApp(s => s.setBoardConfig);
  const list = boardsOf(d.venue);
  const used = (key: string) => d.stays.filter(s => s.board === key).length;
  const save = async (next: BoardDef[]) => {
    const clean = next.map(b => ({ ...b, key: b.key.trim().toUpperCase(), label: b.label.trim() }));
    const err = boardError(clean);
    if (err) { toast(err, 'err'); return false; }
    return setBoardConfig(clean);
  };
  const upd = (i: number, b: BoardDef) => save(list.map((x, j) => (j === i ? b : x)));
  const add = () => {
    let n = 1; while (list.some(b => b.key === (n === 1 ? 'NEU' : `NEU${n}`))) n++;
    save([...list, { key: n === 1 ? 'NEU' : `NEU${n}`, label: 'Neue Verpflegung', meals: ['fruehstueck'], tables: [] }]);
  };
  const remove = async (i: number) => {
    const b = list[i], n = used(b.key);
    if (!(await confirmDialog('Verpflegungsart löschen?', [`${b.key} – ${b.label}`,
      ...(n ? [`${n} Aufenthalte haben diese Verpflegung. Sie behalten das Kürzel, bekommen aber keine Mahlzeiten und keine Tischreservierung mehr – bitte dort eine andere Verpflegung wählen.`] : [])], 'Löschen', true))) return;
    save(list.filter((_, j) => j !== i));
  };
  return (
    <div className="body">
      <div className="table-scroll">
        <table className="list boards">
          <thead><tr><th>Kürzel</th><th>Bezeichnung</th>{MEALS.map(m => <th key={m}>{t(m)}</th>)}<th /></tr></thead>
          <tbody>{list.map((b, i) => {
            const n = used(b.key);
            return (
              <tr key={b.key + i}>
                <td><input aria-label={`Kürzel ${b.label}`} defaultValue={b.key} maxLength={10} disabled={n > 0} style={{ width: 80 }}
                  title={n ? `${n} Aufenthalte nutzen dieses Kürzel – nicht änderbar` : undefined}
                  onBlur={e => { const v = e.target.value.trim().toUpperCase(); if (v !== b.key) upd(i, { ...b, key: v }); }} /></td>
                <td><input aria-label={`Bezeichnung ${b.key}`} defaultValue={b.label} key={b.label}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== b.label) upd(i, { ...b, label: v }); }} /></td>
                {MEALS.map(m => <td key={m}>
                  <select aria-label={`${b.key} ${t(m)}`} value={mealMode(b, m)} onChange={e => upd(i, withMealMode(b, m, e.target.value as MealMode))}>
                    {(Object.keys(MODE_LABEL) as MealMode[]).map(x => <option key={x} value={x}>{MODE_LABEL[x]}</option>)}
                  </select></td>)}
                <td><button className="btn small icon ghost danger" aria-label={`Verpflegung ${b.key} löschen`} title="Löschen" disabled={list.length < 2} onClick={() => remove(i)}><Trash2 /></button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <button className="btn small mt8" onClick={add}><Plus />Verpflegungsart</button>
      <p className="muted" style={{ fontSize: 12 }}>„inbegriffen“: der Gast hat diese Mahlzeit (z. B. Frühstück mit freier Platzwahl, Menüauswahl per QR). „mit Tisch“: zusätzlich wird für jeden Tag automatisch ein Tisch reserviert (bei Services ohne freie Platzwahl).
        Kürzel, die Aufenthalte schon nutzen, lassen sich nicht umbenennen. Beim Import werden Kürzel und Klartext (Halbpension, Vollpension …) erkannt.</p>
    </div>
  );
}
