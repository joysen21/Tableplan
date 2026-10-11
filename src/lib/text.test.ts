import { describe, expect, it } from 'vitest';
import { decodeText } from './text';

const line = 'Zi;Müller;Straße;ÄÖÜäöü';

describe('CSV-Zeichensatz', () => {
  it('liest UTF-8 mit und ohne BOM', () => {
    const utf8 = new TextEncoder().encode(line);
    expect(decodeText(utf8)).toBe(line);
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe(line);
  });
  it('liest Windows-1252 (Excel-CSV unter Windows)', () => {
    const ansi = new Uint8Array([...line].map(c => c.charCodeAt(0)));
    expect(decodeText(ansi)).toBe(line);
  });
  it('liest UTF-16 mit BOM (Excel „Unicode-Text“)', () => {
    const u16 = new Uint8Array(2 + line.length * 2);
    u16.set([0xff, 0xfe]);
    [...line].forEach((c, i) => { u16[2 + i * 2] = c.charCodeAt(0); });
    expect(decodeText(u16)).toBe(line);
  });
});
