/** Benutzer mit Benutzercode: Firmenkürzel, Code-Vorschlag, Passwort-Generator, interne Anmelde-Adresse */

/** Firmenkürzel: 3–32 Zeichen a–z, 0–9, Bindestrich (nicht am Rand) */
export const FIRM_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
/** Benutzercode: 3–32 Zeichen a–z, 0–9, Punkt, Binde- und Unterstrich (nicht am Rand) */
export const CODE_RE = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;
export const PW_MIN = 8;

const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Vorschlag Firmenkürzel aus dem Namen: „Hotel Sonnenhof – Restaurant“ → „hotel-sonnenhof-restaurant“ */
export function firmSlug(name: string) {
  return fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '');
}

/** Vorschlag Benutzercode: „Max Kofler“ → „max.k“, bei Kollision „max.ko“, dann „max.k2“ … */
export function suggestCode(name: string, taken: string[]) {
  const parts = fold(name).replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const set = new Set(taken.map(x => x.toLowerCase()));
  const first = parts[0].slice(0, 20); const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const cands = last ? [1, 2, 3].map(n => `${first}.${last.slice(0, n)}`) : [first.length >= 3 ? first : first.padEnd(3, '1')];
  for (const c of cands) if (CODE_RE.test(c) && !set.has(c)) return c;
  for (let i = 2; i < 100; i++) { const c = `${cands[0]}${i}`; if (!set.has(c)) return c; }
  return cands[0];
}

export function codeError(code: string): string | null {
  if (!code) return 'Benutzercode fehlt';
  if (!CODE_RE.test(code)) return 'Benutzercode: 3–32 Zeichen, nur a–z, 0–9, Punkt, Binde- und Unterstrich';
  return null;
}
export function firmError(code: string): string | null {
  if (!FIRM_RE.test(code)) return 'Firmenkürzel: 3–32 Zeichen, nur a–z, 0–9 und Bindestrich';
  return null;
}
export function passwordError(pw: string): string | null {
  if (pw.length < PW_MIN) return `Passwort: mindestens ${PW_MIN} Zeichen`;
  if (pw.length > 72) return 'Passwort: höchstens 72 Zeichen';
  return null;
}

/** Interne Anmelde-Adresse eines Code-Benutzers (wird nie angeschrieben) */
export const loginEmail = (code: string, venueId: string) => `${code.trim().toLowerCase()}@${venueId}.nutzer.joke-solutions.eu`;
export const isCodeEmail = (email: string) => /@[0-9a-f-]{36}\.nutzer\.joke-solutions\.eu$/i.test(email);

const WORDS = ['Alm', 'Apfel', 'Bach', 'Berg', 'Birke', 'Blume', 'Brot', 'Buche', 'Dach', 'Eiche', 'Ente', 'Fels', 'Fisch', 'Garten', 'Gipfel', 'Hafen',
  'Heu', 'Hirsch', 'Honig', 'Hut', 'Insel', 'Kiwi', 'Klee', 'Koch', 'Krone', 'Lampe', 'Linde', 'Luchs', 'Mond', 'Moos', 'Nuss', 'Ofen', 'Pfad',
  'Quelle', 'Rabe', 'Rose', 'Salz', 'Sonne', 'Stern', 'Tal', 'Tanne', 'Teich', 'Tisch', 'Turm', 'Wald', 'Wiese', 'Wolke', 'Zimt'];

/** Leicht diktierbares Passwort, z. B. „Tal-Kiwi-4827“ */
export function wordPassword(rand: (n: number) => number = cryptoRand) {
  const w = () => WORDS[rand(WORDS.length)];
  let a = w(), b = w(); while (b === a) b = w();
  return `${a}-${b}-${String(rand(9000) + 1000)}`;
}
function cryptoRand(n: number) {
  const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n;
}
