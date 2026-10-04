/** Datums- und Zeit-Hilfsfunktionen (Datum als "YYYY-MM-DD", Uhrzeit als "HH:MM") */
export const pad = (n: number) => String(n).padStart(2, '0');
export const toMin = (s: string | null | undefined): number => {
  const [h, m] = String(s || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fromMin = (m: number): string => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return pad(Math.floor(x / 60)) + ':' + pad(x % 60);
};
export const dstr = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const today = () => dstr(new Date());
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return dstr(d); };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const fmtDate = (s: string) => { const d = new Date(s + 'T12:00:00'); return `${WD[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
export const fmtShort = (s: string) => { const d = new Date(s + 'T12:00:00'); return `${WD[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };
export const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;
export const snap = (v: number, g: number) => Math.round(v / g) * g;
/** "HH:MM:SS" (Postgres) → "HH:MM" */
export const hhmm = (s: string | null | undefined) => (s ? String(s).slice(0, 5) : '');
/** Datum "TT.MM.JJJJ" oder "JJJJ-MM-TT" → "JJJJ-MM-TT" */
export function parseDate(input: string): string | null {
  const s = String(input || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(+m[2]) + '-' + pad(+m[1]);
  return null;
}
