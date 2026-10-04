import { DemoRepo } from './demoRepo';
import type { Repo } from './repo';
import { SupabaseRepo } from './supabaseRepo';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
function demoForced(): boolean {
  try {
    if (new URLSearchParams(location.search).has('demo')) sessionStorage.setItem('tischplan.forceDemo', '1');
    return sessionStorage.getItem('tischplan.forceDemo') === '1';
  } catch { return false; }
}
const forceDemo = demoForced();

/** Supabase, wenn konfiguriert – sonst Demo-Modus (Daten im Browser). Mit ?demo in der URL erzwingbar. */
export const repo: Repo = url && key && !forceDemo ? new SupabaseRepo(url, key) : new DemoRepo();
export const HISTORY_DAYS = Number(import.meta.env.VITE_HISTORY_DAYS) || 120;
