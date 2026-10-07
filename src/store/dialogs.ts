/** Globale Dialoge (Formulare, Popups) – damit jede Ansicht sie öffnen kann */
import { create } from 'zustand';
import type { Dish, Ingredient, Reservation, Stay } from '../domain/types';

export type Dialog =
  | { type: 'reservation'; r?: Reservation; preset?: Partial<Reservation> }
  | { type: 'resinfo'; id: string }
  | { type: 'table'; tableId: string }
  | { type: 'walkin'; tableId?: string }
  | { type: 'block'; tableId: string }
  | { type: 'stay'; stay?: Stay }
  | { type: 'stayimport' }
  | { type: 'staytable'; tableId: string }
  | { type: 'menu'; date: string; serviceId: string }
  | { type: 'dish'; dish?: Dish }
  | { type: 'ingredient'; ing?: Ingredient; back?: { type: 'dish'; dish: Dish } };

/** seq zählt jedes Öffnen – damit startet ein neuer Dialog auch nach einem Anzeigefehler sauber */
interface DialogState { dialog: Dialog | null; seq: number; open: (d: Dialog) => void; close: () => void }
export const useDialogs = create<DialogState>(set => ({ dialog: null, seq: 0, open: dialog => set(s => ({ dialog, seq: s.seq + 1 })), close: () => set({ dialog: null }) }));
export const openDialog = (d: Dialog) => useDialogs.getState().open(d);
export const closeDialog = () => useDialogs.getState().close();
