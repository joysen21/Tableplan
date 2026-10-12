// Kalender-Abo (iCal) für den Lesezugang der Mitarbeitenden: /api/ical/<token>
// Vercel-Funktion; liest über die Datenbankfunktion public_roster() nur veröffentlichte Dienste.
// Nutzt dieselben Umgebungsvariablen wie die App (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** "2026-10-12" + "22:00" (+ Tage) → "20261012T220000" (Ortszeit Europe/Rome) */
function stamp(date, time, plusDays = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + plusDays));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${time.replace(':', '')}00`;
}
const blocks = s => [[s.start, s.end], ...(s.start2 && s.end2 ? [[s.start2, s.end2]] : [])];

// Mitteleuropäische Zeit mit Sommerzeit-Regel, damit alle Kalender die Zeiten richtig zeigen
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];

export default async function handler(req, res) {
  const token = String(req.query?.token ?? '').replace(/\.ics$/, '');
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!/^[0-9a-f-]{36}$/i.test(token)) { res.status(404).send('Unbekannter Link'); return; }
  if (!url || !key) { res.status(500).send('Datenbank nicht konfiguriert'); return; }
  const r = await fetch(`${url}/rest/v1/rpc/public_roster`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: token })
  });
  const data = r.ok ? await r.json() : null;
  if (!data) { res.status(404).send('Link ungültig oder erneuert'); return; }

  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JoKe Smart Solutions//Dienstplan//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc('Dienstplan ' + data.venueName)}`, 'X-WR-TIMEZONE:Europe/Rome', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', ...VTIMEZONE];
  for (const s of data.shifts.filter(x => x.mine)) {
    blocks(s).forEach(([a, b], i) => {
      lines.push('BEGIN:VEVENT', `UID:${s.id}-${i}@dienstplan`, `DTSTAMP:${now}`,
        `DTSTART;TZID=Europe/Rome:${stamp(s.date, a)}`, `DTEND;TZID=Europe/Rome:${stamp(s.date, b, b <= a ? 1 : 0)}`,
        `SUMMARY:${esc(`Dienst ${s.departmentName}`)}`, `DESCRIPTION:${esc([s.note, s.breakMin ? `Pause ${s.breakMin} Min.` : ''].filter(Boolean).join(' · '))}`,
        `LOCATION:${esc(data.venueName)}`, 'END:VEVENT');
    });
  }
  for (const a of data.absences) {
    const kind = { urlaub: 'Urlaub', krank: 'Krank', frei: 'Frei', sonstiges: 'Abwesend' }[a.kind] ?? 'Abwesend';
    lines.push('BEGIN:VEVENT', `UID:${a.id}@dienstplan`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${a.from.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${stamp(a.to, '00:00', 1).slice(0, 8)}`, `SUMMARY:${esc(kind)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="dienstplan.ics"');
  res.setHeader('Cache-Control', 'public, max-age=900');
  res.status(200).send(lines.join('\r\n') + '\r\n');
}
