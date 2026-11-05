/** Lesezugang für Mitarbeitende ohne Login: /p/<token>
 *  Umschalter Woche (Teamplan, groß; am Handy als Tagesliste) / Monat (Kalender mit eigenen Diensten und Abwesenheiten),
 *  Kalender-Abo, Link kopieren, Drucken – Deutsch/Italienisch. */
import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Printer } from '../ui/icons';
import { repo } from '../data';
import { isoWeek, monthGrid, shiftMonth, weekDays, weekStart } from '../domain/rosterPlan';
import type { PublicRoster as Data } from '../domain/types';
import { addDays, today } from '../lib/time';

type Lang = 'de' | 'it';
type Mode = 'woche' | 'monat';
const TXT = {
  de: {
    title: 'Dienstplan', hello: 'Hallo', team: 'Team', week: 'KW', weekView: 'Woche', monthView: 'Monat', today: 'Heute', none: 'Keine veröffentlichten Dienste in diesem Zeitraum.',
    free: 'frei', changed: 'geändert', subscribe: 'Kalender abonnieren', print: 'Drucken', stand: 'Stand', invalid: 'Dieser Link ist ungültig oder wurde erneuert. Bitte bei der Bereichsleitung nachfragen.',
    loading: 'Wird geladen…', open: 'Offene Schicht', abs: { urlaub: 'Urlaub', krank: 'Krank', frei: 'Frei', sonstiges: 'Abwesend' },
    days: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], hint: 'Kalender-Abo: Link in Google Kalender („Per URL hinzufügen“) oder auf dem iPhone (Einstellungen → Kalender → Accounts → Abonnierter Kalender) eintragen.',
    copy: 'Link kopieren', copied: 'Kopiert', help: 'Hilfe zum Kalender-Abo', me: 'Meine Dienste im', nothing: 'Kein Dienst', outside: 'Noch nicht veröffentlicht', prev: 'Zurück', next: 'Weiter'
  },
  it: {
    title: 'Turni', hello: 'Ciao', team: 'Squadra', week: 'Sett.', weekView: 'Settimana', monthView: 'Mese', today: 'Oggi', none: 'Nessun turno pubblicato in questo periodo.',
    free: 'libero', changed: 'modificato', subscribe: 'Abbonarsi al calendario', print: 'Stampa', stand: 'Aggiornato', invalid: 'Questo link non è valido o è stato rinnovato. Chiedi al tuo responsabile.',
    loading: 'Caricamento…', open: 'Turno libero', abs: { urlaub: 'Ferie', krank: 'Malattia', frei: 'Libero', sonstiges: 'Assente' },
    days: ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'], hint: 'Abbonamento: inserire il link in Google Calendar („Da URL“) o su iPhone (Impostazioni → Calendario → Account → Calendario sottoscritto).',
    copy: 'Copia link', copied: 'Copiato', help: 'Aiuto abbonamento', me: 'I miei turni –', nothing: 'Nessun turno', outside: 'Non ancora pubblicato', prev: 'Indietro', next: 'Avanti'
  }
};
const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
const MODE_KEY = 'dienstplan.ansicht';

export function PublicRoster({ token }: { token: string }) {
  const [lang, setLang] = useState<Lang>(() => { try { return (localStorage.getItem('dienstplan.lang') as Lang) || (navigator.language.startsWith('it') ? 'it' : 'de'); } catch { return 'de'; } });
  const [mode, setMode] = useState<Mode>(() => { try { return localStorage.getItem(MODE_KEY) === 'monat' ? 'monat' : 'woche'; } catch { return 'woche'; } });
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [wk, setWk] = useState(weekStart(today()));
  const [mon, setMon] = useState(today().slice(0, 7));
  const [copied, setCopied] = useState(false);
  const T = TXT[lang];
  useEffect(() => { document.title = TXT[lang].title; try { localStorage.setItem('dienstplan.lang', lang); } catch { /* egal */ } }, [lang]);
  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* egal */ } }, [mode]);
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
  const locale = lang === 'it' ? 'it-IT' : 'de-DE';
  const ical = `${location.origin}/api/ical/${token}`;
  const webcal = ical.replace(/^https?:/, 'webcal:');
  type S = Data['shifts'][number];
  const time = (s: S) => `${s.start}–${s.end}${s.start2 ? ` · ${s.start2}–${s.end2}` : ''}`;
  const wdName = (day: string) => T.days[(new Date(day + 'T12:00:00').getDay() + 6) % 7];
  const absOn = (day: string) => data.absences.find(a => day >= a.from && day <= a.to);
  const inRange = (day: string) => day >= data.from && day <= data.to;
  const nameOf = (n: string) => (n === 'Offene Schicht' ? T.open : n);

  /* ---------- Woche ---------- */
  const days = weekDays(wk);
  const team = data.shifts.filter(s => s.date >= days[0] && s.date <= days[6]);
  const names = [...new Set([data.staffName, ...team.map(s => s.staffName)])]
    .filter(n => n === data.staffName || team.some(s => s.staffName === n))
    .sort((a, b) => (a === data.staffName ? -1 : b === data.staffName ? 1 : a === 'Offene Schicht' ? 1 : b === 'Offene Schicht' ? -1 : a.localeCompare(b)));
  const chip = (s: S, big = false) => (
    <span key={s.id} className={'pub-shift' + (big ? ' big' : '') + (s.changed ? ' changed' : '')} style={{ borderColor: s.color }}
      title={s.changed ? T.changed : undefined}>
      <b>{time(s)}</b>{s.changed && <span className="badge warn">{T.changed}</span>}
      {(big || s.note) && <small>{big ? s.departmentName : ''}{big && s.note ? ' · ' : ''}{s.note}</small>}
    </span>
  );
  const weekView = (
    <div className="panel print-area pub-week">
      <div className="row pub-weekbar">
        <button className="btn icon no-print" aria-label={T.prev} onClick={() => setWk(addDays(wk, -7))} disabled={wk <= data.from}><ChevronLeft /></button>
        <h3>{T.team} · {T.week} {isoWeek(wk)} <span className="muted">({dm(days[0])} – {dm(days[6])})</span></h3>
        <button className="btn icon no-print" aria-label={T.next} onClick={() => setWk(addDays(wk, 7))} disabled={addDays(wk, 7) > data.to}><ChevronRight /></button>
      </div>
      {/* PC / Druck: Tabelle */}
      <div className="table-scroll pub-team-wrap"><table className="list pub-team">
        <thead><tr><th />{days.map(day => <th key={day} className={day === t0 ? 'today' : ''}><b>{wdName(day)}</b> {dm(day)}</th>)}</tr></thead>
        <tbody>{names.map(n => (
          <tr key={n} className={n === data.staffName ? 'me' : n === 'Offene Schicht' ? 'open' : ''}><td className="nm">{n === data.staffName ? <b>{n}</b> : nameOf(n)}</td>
            {days.map(day => {
              const list = team.filter(s => s.staffName === n && s.date === day);
              const ab = n === data.staffName ? absOn(day) : undefined;
              return <td key={day} className={day === t0 ? 'today' : ''}>{ab && <span className={'pub-abs ' + ab.kind}>{T.abs[ab.kind]}</span>}
                {list.map(s => chip(s))}</td>;
            })}</tr>
        ))}</tbody>
      </table></div>
      {/* Handy: Tagesliste */}
      <ol className="pub-days">{days.map(day => {
        const list = team.filter(s => s.date === day);
        const mine = list.filter(s => s.mine), others = list.filter(s => !s.mine);
        const ab = absOn(day);
        return (
          <li key={day} className={day === t0 ? 'today' : ''}>
            <div className="pub-day-h"><b>{wdName(day)} {dm(day)}</b>{day === t0 && <span className="badge">{T.today}</span>}</div>
            <div className="pub-day-me">{ab && <span className={'pub-abs ' + ab.kind}>{T.abs[ab.kind]}</span>}
              {mine.map(s => chip(s, true))}{!ab && !mine.length && <span className="muted">{T.nothing}</span>}</div>
            {!!others.length && <ul className="pub-day-team">{others.map(s => (
              <li key={s.id}><span className="nm">{nameOf(s.staffName)}</span><span className="pub-shift" style={{ borderColor: s.color }}>{time(s)}</span></li>))}</ul>}
          </li>
        );
      })}</ol>
      {names.length <= 1 && !team.length && <p className="muted" style={{ padding: '0 12px' }}>{T.none}</p>}
    </div>
  );

  /* ---------- Monat ---------- */
  const grid = monthGrid(mon);
  const monTitle = new Date(mon + '-15T12:00:00').toLocaleString(locale, { month: 'long', year: 'numeric' });
  const mineM = data.shifts.filter(s => s.mine && s.date.startsWith(mon));
  const monthView = (
    <div className="panel print-area pub-month">
      <div className="row pub-weekbar">
        <button className="btn icon no-print" aria-label={T.prev} onClick={() => setMon(shiftMonth(mon, -1))} disabled={`${mon}-01` <= data.from}><ChevronLeft /></button>
        <h3>{T.me} {monTitle}</h3>
        <button className="btn icon no-print" aria-label={T.next} onClick={() => setMon(shiftMonth(mon, 1))} disabled={`${shiftMonth(mon, 1)}-01` > data.to}><ChevronRight /></button>
      </div>
      <div className="pub-cal" role="grid" aria-label={monTitle}>
        {T.days.map(n => <div key={n} className="pub-cal-h" role="columnheader">{n}</div>)}
        {grid.map(day => {
          const list = data.shifts.filter(s => s.mine && s.date === day);
          const ab = absOn(day);
          const cls = ['pub-cal-d', day.startsWith(mon) ? '' : 'other', day === t0 ? 'today' : '', inRange(day) ? '' : 'out'].filter(Boolean).join(' ');
          return (
            <div key={day} className={cls} role="gridcell" aria-label={`${wdName(day)} ${dm(day)}`} title={inRange(day) ? undefined : T.outside}>
              <span className="n">{+day.slice(8, 10)}</span>
              {ab && <span className={'pub-abs ' + ab.kind}>{T.abs[ab.kind]}</span>}
              {list.map(s => <span key={s.id} className={'pub-cal-s' + (s.changed ? ' changed' : '')} style={{ borderColor: s.color }} title={`${s.departmentName}${s.note ? ` · ${s.note}` : ''}`}>
                {s.start}–{s.end}{s.start2 && <><br />{s.start2}–{s.end2}</>}{s.changed && ' *'}</span>)}
            </div>
          );
        })}
      </div>
      {!mineM.length && !data.absences.some(a => a.from.slice(0, 7) <= mon && a.to.slice(0, 7) >= mon) && <p className="muted" style={{ padding: '0 12px' }}>{T.none}</p>}
    </div>
  );

  return (
    <div className="pub-page">
      {head}
      <div className="pub-top">
        <div>
          <h1 className="pub-title">{T.title} · {data.venueName}</h1>
          <p className="muted no-print" style={{ margin: 0 }}>{T.hello} {data.staffName.split(' ')[0]}!{data.publishedAt && ` ${T.stand}: ${new Date(data.publishedAt).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}</p>
        </div>
        <div className="pub-actions no-print">
          <a className="btn small primary" href={webcal}><CalendarDays />{T.subscribe}</a>
          <button className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(ical); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* egal */ } }}>{copied ? T.copied : T.copy}</button>
          <button className="btn small" onClick={() => window.print()}><Printer />{T.print}</button>
          <details className="pub-help"><summary aria-label={T.help}>?</summary><p className="muted">{T.hint}</p></details>
        </div>
      </div>
      <div className="seg pub-mode no-print" role="group" aria-label="Ansicht">
        <button className="btn" aria-pressed={mode === 'woche'} onClick={() => setMode('woche')}>{T.weekView}</button>
        <button className="btn" aria-pressed={mode === 'monat'} onClick={() => setMode('monat')}>{T.monthView}</button>
      </div>
      {mode === 'woche' ? weekView : monthView}
    </div>
  );
}
