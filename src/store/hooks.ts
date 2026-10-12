import { useEffect, useState } from 'react';
import { viewsFor } from '../domain/constants';
import { EDITION } from '../lib/edition';
import { serviceForTime } from '../domain/logic';
import type { VenueData } from '../domain/types';
import { useApp } from './app';
import { useUi } from './ui';

/** Datenstand des Betriebs (nur innerhalb der angemeldeten Oberfläche verwenden) */
export const useData = (): VenueData => useApp(s => s.data)!;
export const useRole = () => useApp(s => s.user?.role ?? null);
export const useUserId = () => useApp(s => s.user?.id ?? null);

/** Ansichten des angemeldeten Benutzers (Rolle, Module, Bereichsleitung) */
export function useViews() {
  const data = useData();
  const user = useApp(s => s.user)!;
  return viewsFor(user.role, data.venue, data.departments, user.id, EDITION);
}

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
