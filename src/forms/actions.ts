/** Gemeinsame Aktionen mit Prüfung (Fehler blockieren, Warnungen nach Rückfrage) */
import { checkReservation } from '../domain/logic';
import type { Reservation } from '../domain/types';
import { useApp } from '../store/app';
import { confirmDialog, toast } from '../ui/feedback';

export async function saveChecked(draft: Reservation, original: Reservation | undefined, logText: [string, string], okLabel = 'Trotzdem speichern'): Promise<boolean> {
  const st = useApp.getState();
  const d = st.data!;
  const issues = checkReservation(d, draft);
  const err = issues.find(i => i.level === 'error');
  if (err) { toast(err.text, 'err'); return false; }
  const warns = issues.filter(i => i.level === 'warn').map(i => i.text);
  if (warns.length && !(await confirmDialog('Bitte prüfen', warns, okLabel))) return false;
  const next = { ...draft };
  if (original?.stayId && JSON.stringify(original.tableIds) !== JSON.stringify(next.tableIds)) next.manualTable = true;
  const ok = await st.saveReservations([next], [], logText);
  if (ok) toast('Gespeichert');
  return ok;
}
