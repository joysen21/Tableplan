/** Rückmeldungen: Toasts und Bestätigungsdialog (Promise-basiert) */
import { create } from 'zustand';

export interface Toast { id: number; text: string; kind: 'ok' | 'err' }
export interface ConfirmState { title: string; lines: string[]; okLabel: string; danger?: boolean; resolve: (v: boolean) => void }

interface FeedbackState { toasts: Toast[]; confirm: ConfirmState | null }
export const useFeedback = create<FeedbackState>(() => ({ toasts: [], confirm: null }));

let seq = 0;
export function toast(text: string, kind: 'ok' | 'err' = 'ok') {
  const id = ++seq;
  useFeedback.setState({ toasts: [{ id, text, kind }] });
  setTimeout(() => useFeedback.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), kind === 'err' ? 5500 : 2600);
}
export function confirmDialog(title: string, lines: string[], okLabel = 'Trotzdem speichern', danger = false): Promise<boolean> {
  return new Promise(resolve => useFeedback.setState({ confirm: { title, lines, okLabel, danger, resolve } }));
}
export function closeConfirm(v: boolean) {
  const c = useFeedback.getState().confirm;
  useFeedback.setState({ confirm: null });
  c?.resolve(v);
}
