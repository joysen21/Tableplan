/** Ausgabe der App: dieselbe Codebasis wird als „Tischplan“ (alles) oder als eigenständiger „Dienstplan“ gebaut.
 *  Gesteuert über VITE_APP=dienstplan (lokal: npm run dev:dienstplan, in Vercel als Umgebungsvariable). */
export type Edition = 'tischplan' | 'dienstplan';
export const EDITION: Edition = import.meta.env.VITE_APP === 'dienstplan' ? 'dienstplan' : 'tischplan';
export const APP_NAME = EDITION === 'dienstplan' ? 'Dienstplan' : 'Tischplan';
