/** Globale Dialoge (Formulare, Popups) – damit jede Ansicht sie öffnen kann */
import { create } from 'zustand';
import type { Reservation, Stay } from '../domain/types';

export type Dialog =
  | { type: 'reservation'; r?: Reservation; preset?: Partial<Reservation> }
  | { type: 'resinfo'; id: string }
  | { type: 'table'; tableId: string }
  | { type: 'walkin'; tableId?: string }
  | { type: 'block'; tableId: string }
  | { type: 'stay'; stay?: Stay }
  | { type: 'stayimport' };

interface DialogState { dialog: Dialog | null; open: (d: Dialog) => void; close: () => void }
export const useDialogs = create<DialogState>(set => ({ dialog: null, open: dialog => set({ dialog }), close: () => set({ dialog: null }) }));
export const openDialog = (d: Dialog) => useDialogs.getState().open(d);
export const closeDialog = () => useDialogs.getState().close();
