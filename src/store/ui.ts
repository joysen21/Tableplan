/** Bedienzustand (welcher Tag, Service, Raum, Uhrzeit …) – nicht gespeichert */
import { create } from 'zustand';
import { nowMin, today } from '../lib/time';

export interface ResFilter { from: string; to: string; serviceId: string; status: string; q: string; hotel: boolean; unassigned: boolean }

interface UiState {
  date: string; serviceId: string | null; roomId: string | null; time: number; follow: boolean;
  showStations: boolean; liveActiveOnly: boolean; hotelDate: string; report: string;
  /** Live-Plan am Handy: Plan oder Liste anzeigen */
  liveTab: 'plan' | 'liste';
  resFilter: ResFilter | null; editRoomId: string | null; editSel: string | null;
  set: (p: Partial<UiState>) => void;
  goToday: () => void;
}

export const useUi = create<UiState>(set => ({
  date: today(), serviceId: null, roomId: null, time: nowMin(), follow: true,
  showStations: false, liveActiveOnly: false, hotelDate: today(), report: '', liveTab: 'plan',
  resFilter: null, editRoomId: null, editSel: null,
  set: p => set(p),
  goToday: () => set({ date: today(), time: nowMin(), follow: true, serviceId: null })
}));
