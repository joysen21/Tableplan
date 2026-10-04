import { useEffect, useState } from 'react';
import { serviceForTime } from '../domain/logic';
import type { VenueData } from '../domain/types';
import { useApp } from './app';
import { useUi } from './ui';

/** Datenstand des Betriebs (nur innerhalb der angemeldeten Oberfläche verwenden) */
export const useData = (): VenueData => useApp(s => s.data)!;
export const useRole = () => useApp(s => s.user?.role ?? null);

/** Aktueller Service: gewählt oder passend zur Uhrzeit */
export function useServiceId(): string {
  const data = useData();
  const { serviceId, time } = useUi();
  if (serviceId && data.services.some(s => s.id === serviceId)) return serviceId;
  return serviceForTime(data.services, time) ?? '';
}

/** Aktueller Raum (gewählt oder erster) */
export function useRoomId(): string | null {
  const data = useData();
  const roomId = useUi(s => s.roomId);
  return roomId && data.rooms.some(r => r.id === roomId) ? roomId : data.rooms[0]?.id ?? null;
}

/** Erzwingt regelmäßiges Neuzeichnen (z. B. für „Jetzt“-Anzeigen) */
export function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, [ms]);
}
