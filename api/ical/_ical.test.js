import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './[token].js';

const token = '11111111-2222-3333-4444-555555555555';
function call(data, ok = true) {
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.co'; process.env.VITE_SUPABASE_ANON_KEY = 'anon';
  globalThis.fetch = vi.fn(async () => ({ ok, json: async () => data }));
  const res = { code: 0, body: '', headers: {}, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  return handler({ query: { token } }, res).then(() => res);
}
afterEach(() => vi.restoreAllMocks());

describe('Kalender-Abo', () => {
  it('eigene Dienste (Nachtschicht, Teildienst) und Abwesenheiten als iCal', async () => {
    const res = await call({
      venueName: 'Hotel Test', staffName: 'Anna', shifts: [
        { id: 's1', date: '2026-10-12', start: '22:00', end: '06:00', start2: null, end2: null, breakMin: 30, note: 'Bankett', departmentName: 'Küche', mine: true },
        { id: 's2', date: '2026-10-13', start: '10:00', end: '14:00', start2: '18:00', end2: '22:00', breakMin: 0, note: '', departmentName: 'Küche', mine: true },
        { id: 's3', date: '2026-10-13', start: '08:00', end: '16:00', start2: null, end2: null, breakMin: 0, note: '', departmentName: 'Service', mine: false }
      ], absences: [{ id: 'a1', from: '2026-10-20', to: '2026-10-21', kind: 'urlaub' }]
    });
    expect(res.code).toBe(200);
    expect(res.headers['Content-Type']).toMatch(/text\/calendar/);
    const ics = res.body;
    expect(ics).toContain('DTSTART;TZID=Europe/Rome:20261012T220000');
    expect(ics).toContain('DTEND;TZID=Europe/Rome:20261013T060000'); // Folgetag
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4); // 1 + 2 Blöcke + Urlaub, fremder Dienst nicht
    expect(ics).toContain('UID:s2-1@dienstplan');
    expect(ics).toContain('DTEND;VALUE=DATE:20261022');
    expect(ics).toContain('DESCRIPTION:Bankett · Pause 30 Min.');
    expect(ics).not.toContain('Service');
  });
  it('ungültiger oder erneuerter Link', async () => {
    expect((await call(null)).code).toBe(404);
  });
});
