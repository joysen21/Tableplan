/** Lesezugang für Mitarbeitende ohne Login: /p/<token>
 *  Eigene Dienste, Teamplan der Woche, Abwesenheiten, Kalender-Abo, Drucken – Deutsch/Italienisch. */
import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Printer } from '../ui/icons';
import { repo } from '../data';
import { isoWeek, weekDays, weekStart } from '../domain/rosterPlan';
import type { PublicRoster as Data } from '../domain/types';
import { addDays, today } from '../lib/time';

type Lang = 'de' | 'it';
const TXT = {
  de: {
    title: 'Dienstplan', hello: 'Hallo', mine: 'Meine Dienste', team: 'Team', week: 'KW', today: 'Heute', none: 'Keine veröffentlichten Dienste in diesem Zeitraum.',
    free: 'frei', changed: 'geändert', subscribe: 'Kalender abonnieren', print: 'Drucken', stand: 'Stand', invalid: 'Dieser Link ist ungültig oder wurde erneuert. Bitte bei der Bereichsleitung nachfragen.',
    loading: 'Wird geladen…', open: 'Offene Schicht', abs: { urlaub: 'Urlaub', krank: 'Krank', frei: 'Frei', sonstiges: 'Abwesend' },
    days: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], hint: 'Kalender-Abo: Link in Google Kalender („Per URL hinzufügen“) oder auf dem iPhone (Einstellungen → Kalender → Accounts → Abonnierter Kalender) eintragen.',
    copy: 'Link kopieren', copied: 'Kopiert'
  },
  it: {
    title: 'Turni', hello: 'Ciao', mine: 'I miei turni', team: 'Squadra', week: 'Sett.', today: 'Oggi', none: 'Nessun turno pubblicato in questo periodo.',
    free: 'libero', changed: 'modificato', subscribe: 'Abbonarsi al calendario', print: 'Stampa', stand: 'Aggiornato', invalid: 'Questo link non è valido o è stato rinnovato. Chiedi al tuo responsabile.',
    loading: 'Caricamento…', open: 'Turno libero', abs: { urlaub: 'Ferie', krank: 'Malattia', frei: 'Libero', sonstiges: 'Assente' },
    days: ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'], hint: 'Abbonamento: inserire il link in Google Calendar („Da URL“) o su iPhone (Impostazioni → Calendario → Account → Calendario sottoscritto).',
    copy: 'Copia link', copied: 'Copiato'
  }
};
const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;

export function PublicRoster({ token }: { token: string }) {
  const [lang, setLang] = useState<Lang>(() => { try { return (localStorage.getItem('dienstplan.lang') as Lang) || (navigator.language.startsWith('it') ? 'it' : 'de'); } catch { return 'de'; } });
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [wk, setWk] = useState(weekStart(today()));
  const [copied, setCopied] = useState(false);
  const T = TXT[lang];
  useEffect(() => { document.title = TXT[lang].title; try { localStorage.setItem('dienstplan.lang', lang); } catch { /* egal */ } }, [lang]);
  useEffect(() => { repo.publicRoster(token).then(setData).catch(() => setData(null)); }, [token]);

  const head = (
    <div className="pub-head no-print">
      <img className="login-logo" src="/joke-logo-horizontal.svg" alt="JoKe Smart Solutions" />
      <img className="login-logo neg" src="/joke-logo-horizontal-negativ.svg" alt="JoKe Smart Solutions" />
      <div className="seg" role="group" aria-label="Sprache">
        <button className="btn small" aria-pressed={lang === 'de'} onClick={() => setLang('de')}>DE</button>
        <button className="btn small" aria-pressed={lang === 'it'} onClick={() => setLang('it')}>IT</button>
      </div>
    </div>
  );
  if (data === undefined) return <div className="pub-page">{head}<p className="muted">{T.loading}</p></div>;
  if (data === null) return <div className="pub-page">{head}<div className="panel"><div className="body">{T.invalid}</div></div></div>;

  const t0 = today();
  const mine = data.shifts.filter(s => s.mine && s.date >= t0);
  const days = weekDays(wk);
  const team = data.shifts.filter(s => s.date >= days[0] && s.date <= days[6]);
  const names = [...new Set(team.map(s => s.staffName))].sort((a, b) => (a === data.staffName ? -1 : b === data.staffName ? 1 : a.localeCompare(b)));
  const absOn = (day: string) => data.absences.find(a => day >= a.from && day <= a.to);
  const ical = `${location.origin}/api/ical/${token}`;
  const webcal = ical.replace(/^https?:/, 'webcal:');
  const time = (s: Data['shifts'][number]) => `${s.start}–${s.end}${s.start2 ? ` · ${s.start2}–${s.end2}` : ''}`;
  const wdName = (day: string) => T.days[(new Date(day + 'T12:00:00').getDay() + 6) % 7];

  return (
    <div className="pub-page">
      {head}
      <h1 className="pub-title">{T.title} · {data.venueName}</h1>
      <p className="muted no-print" style={{ marginTop: 0 }}>{T.hello} {data.staffName.split(' ')[0]}!{data.publishedAt && ` ${T.stand}: ${new Date(data.publishedAt).toLocaleString(lang === 'it' ? 'it-IT' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}</p>

      <div className="panel no-print"><h3>{T.mine}</h3><div className="body">
        {mine.length ? <ul className="pub-mine">{mine.map(s => (
          <li key={s.id} className={s.date === t0 ? 'today' : ''}>
            <span className="d"><b>{wdName(s.date)}</b> {dm(s.date)}</span>
            <span className="tm" style={{ borderColor: s.color }}>{time(s)}</span>
            <span className="muted">{s.departmentName}{s.note ? ` · ${s.note}` : ''}</span>
            {s.changed && <span className="badge warn">{T.changed}</span>}
          </li>))}</ul> : <p className="muted">{T.none}</p>}
        {data.absences.filter(a => a.to >= t0).map(a => <p key={a.id} className="muted" style={{ margin: '6px 0 0' }}>{T.abs[a.kind]}: {dm(a.from)} – {dm(a.to)}</p>)}
        <div className="row mt12">
          <a className="btn primary" href={webcal}><CalendarDays />{T.subscribe}</a>
          <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(ical); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* egal */ } }}>{copied ? T.copied : T.copy}</button>
          <button className="btn" onClick={() => window.print()}><Printer />{T.print}</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>{T.hint}</p>
      </div></div>

      <div className="panel mt12 print-area"><div className="row pub-weekbar">
        <button className="btn small icon no-print" aria-label="‹" onClick={() => setWk(addDays(wk, -7))} disabled={wk <= data.from}><ChevronLeft /></button>
        <h3 style={{ margin: 0, border: 0, padding: 0 }}>{T.team} · {T.week} {isoWeek(wk)} ({dm(days[0])} – {dm(days[6])})</h3>
        <button className="btn small icon no-print" aria-label="›" onClick={() => setWk(addDays(wk, 7))} disabled={addDays(wk, 7) > data.to}><ChevronRight /></button>
      </div>
        <div className="table-scroll"><table className="list pub-team">
          <thead><tr><th />{days.map(day => <th key={day} className={day === t0 ? 'today' : ''}>{wdName(day)} {dm(day)}</th>)}</tr></thead>
          <tbody>{names.map(n => (
            <tr key={n} className={n === data.staffName ? 'me' : ''}><td className="nm">{n === data.staffName ? <b>{n}</b> : n === 'Offene Schicht' ? T.open : n}</td>
              {days.map(day => {
                const list = team.filter(s => s.staffName === n && s.date === day);
                const ab = n === data.staffName ? absOn(day) : undefined;
                return <td key={day}>{ab && <small className="muted">{T.abs[ab.kind]}</small>}
                  {list.map(s => <span key={s.id} className="pub-shift" style={{ borderColor: s.color }}>{time(s)}{s.changed && ' *'}</span>)}</td>;
              })}</tr>
          ))}</tbody>
        </table></div>
        {!names.length && <p className="muted" style={{ padding: '0 12px' }}>{T.none}</p>}
      </div>
    </div>
  );
}
