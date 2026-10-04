import { useEffect } from 'react';
import { create } from 'zustand';

const read = () => { try { return localStorage.getItem('tischplan.theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } };
export const useThemeStore = create<{ theme: 'light' | 'dark'; toggle: () => void }>((set, get) => ({
  theme: read(),
  toggle: () => { const theme = get().theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('tischplan.theme', theme); } catch { /* egal */ } set({ theme }); }
}));
/** Hell/Dunkel ist eine Geräte-Einstellung */
export function useTheme() {
  const theme = useThemeStore(s => s.theme);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
}
