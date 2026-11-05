import { describe, expect, it } from 'vitest';
import { codeError, firmError, firmSlug, isCodeEmail, loginEmail, passwordError, suggestCode, wordPassword } from './logins';

describe('Benutzercode', () => {
  it('Vorschläge', () => {
    expect(firmSlug('Hotel Sonnenhof – Restaurant')).toBe('hotel-sonnenhof-restaurant');
    expect(firmSlug('Gasthof Über­wasser')).toMatch(/^gasthof-ueber/);
    expect(suggestCode('Max Kofler', [])).toBe('max.k');
    expect(suggestCode('Max Kofler', ['max.k'])).toBe('max.ko');
    expect(suggestCode('Max Kofler', ['max.k', 'max.ko', 'max.kof'])).toBe('max.k2');
    expect(suggestCode('Jürgen Öhler', [])).toBe('juergen.o');
    expect(suggestCode('Bo', [])).toBe('bo1');
    expect(suggestCode('', [])).toBe('');
  });
  it('Prüfungen', () => {
    expect(codeError('max.k')).toBeNull();
    expect(codeError('Max')).not.toBeNull();
    expect(codeError('a')).not.toBeNull();
    expect(firmError('sonnenhof')).toBeNull();
    expect(firmError('-x-')).not.toBeNull();
    expect(passwordError('1234567')).not.toBeNull();
    expect(passwordError('12345678')).toBeNull();
  });
  it('Anmelde-Adresse und Passwort-Generator', () => {
    const v = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(loginEmail(' Max.K ', v)).toBe(`max.k@${v}.nutzer.joke-solutions.eu`);
    expect(isCodeEmail(loginEmail('max.k', v))).toBe(true);
    expect(isCodeEmail('anna@hotel.it')).toBe(false);
    for (let i = 0; i < 50; i++) {
      const p = wordPassword();
      expect(p).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/);
      expect(p.length).toBeGreaterThanOrEqual(10);
    }
  });
});
