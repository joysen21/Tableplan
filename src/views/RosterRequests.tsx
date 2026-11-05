/** Dienstplan → Reiter „Anfragen“: Frei-Wünsche, Urlaub, Krankmeldungen und Dienst-Tausch vom Mitarbeiter-Link.
 *  Bereichsleitung (bzw. Admin) genehmigt oder lehnt ab, optional mit Begründung; Krankmeldungen werden zur Kenntnis genommen. */
import { useState } from 'react';
import { ArrowRightLeft, Check, X } from '../ui/icons';
import { canPlanDept, templateTimes } from '../domain/roster';
import { REQUEST_LABEL, REQUEST_STATUS_LABEL, requestList } from '../domain/requests';
import { holidayName, vacationUsed } from '../domain/rosterPlan';
import type { RosterRequest } from '../domain/types';
import { addDays, fmtShort, today } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useRole, useUserId } from '../store/hooks';
import { StaffMark } from '../ui/DeptIcon';
import { toast } from '../ui/notify';

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
const when = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
/** Urlaubstage wie im Urlaubskonto (ohne Sonntage und Feiertage) */
const vacDays = (from: string, to: string) => { let n = 0; for (let x = from; x <= to; x = addDays(x, 1)) if (new Date(x + 'T12:00:00').getDay() !== 0 && !holidayName(x)) n++; return n; };

export function RequestList({ dept }: { dept: string }) {
  const d = useData();
  const role = useRole(), userId = useUserId();
  const t0 = today();
  // nur Anfragen der Bereiche, die man leitet (Admin: alle)
  const all = (d.requests ?? []).filter(r => (!dept || r.departmentId === dept) && canPlanDept(role, d.departments, userId, r.departmentId));
  const { wait, offered, done } = requestList(all, t0);
  return (
    <div className="body req-view">
      <section aria-label="Warten auf Entscheidung">
        <h4 className="req-h">Warten auf Entscheidung <span className="count">{wait.length}</span></h4>
        {wait.length ? <div className="req-cards">{wait.map(r => <RequestCard key={r.id} r={r} />)}</div>
          : <p className="muted">Keine offenen Anfragen. Mitarbeitende stellen Anfragen über ihren persönlichen Link.</p>}
      </section>
      {offered.length > 0 && <section aria-label="Tauschangebote">
        <h4 className="req-h">Tauschangebote – noch niemand hat übernommen <span className="count">{offered.length}</span></h4>
        <div className="req-cards">{offered.map(r => <RequestCard key={r.id} r={r} />)}</div>
      </section>}
      {done.length > 0 && <section aria-label="Erledigt">
        <h4 className="req-h">Erledigt (letzte 60 Tage)</h4>
        <div className="req-cards done">{done.map(r => <RequestCard key={r.id} r={r} />)}</div>
      </section>}
    </div>
  );
}

function RequestCard({ r }: { r: RosterRequest }) {
  const d = useData();
  const decide = useApp(s => s.decideRequest);
  const edit = canPlanDept(useRole(), d.departments, useUserId(), r.departmentId);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const st = d.staff.find(x => x.id === r.staffId);
  const taker = d.staff.find(x => x.id === r.takerId);
  const dep = d.departments.find(x => x.id === r.departmentId);
  const shift = d.shifts.find(x => x.id === r.shiftId);
  const name = st?.name ?? 'Unbekannt';
  const open = r.status === 'offen' || r.status === 'uebernommen';
  const period = r.from === r.to ? fmtShort(r.from) : `${fmtShort(r.from)} – ${fmtShort(r.to)} (${days(r.from, r.to)} Tage)`;
  // Dienste der Person im gewünschten Zeitraum (bleiben bei Genehmigung bestehen → Hinweis)
  const clash = (r.kind === 'frei' || r.kind === 'urlaub') && open ? d.shifts.filter(s => s.staffId === r.staffId && s.date >= r.from && s.date <= r.to).length : 0;
  const year = +r.from.slice(0, 4);
  const go = async (approve: boolean) => {
    setBusy(true);
    const verb = r.kind === 'krank' ? 'zur Kenntnis genommen' : approve ? 'genehmigt' : 'abgelehnt';
    if (await decide(r.id, approve, answer, [`Anfrage ${verb}`, `${name}: ${REQUEST_LABEL[r.kind]} ${period}${taker ? ` → ${taker.name}` : ''}`]))
      toast(`${REQUEST_LABEL[r.kind]} ${name} ${verb}`);
    setBusy(false);
  };
  return (
    <article className={'req-card ' + r.kind + (open ? '' : ' closed')} aria-label={`${REQUEST_LABEL[r.kind]} ${name}`}>
      <div className="req-top">
        <span className={'req-kind ' + r.kind}>{r.kind === 'tausch' && <ArrowRightLeft aria-hidden="true" />}{REQUEST_LABEL[r.kind]}</span>
        <span className={'req-status ' + r.status}>{r.kind === 'krank' && r.status === 'genehmigt' ? 'Zur Kenntnis genommen' : r.kind === 'krank' && r.status === 'offen' ? 'Eingetragen' : REQUEST_STATUS_LABEL[r.status]}</span>
      </div>
      <div className="req-who"><StaffMark dep={dep} color={st?.color ?? '#999'} /><b>{name}</b>{dep && <span className="muted"> · {dep.name}</span>}</div>
      {r.kind === 'tausch' ? <div className="req-when">
        <b>{fmtShort(r.from)}</b> {shift ? templateTimes(shift) : <span className="muted">Dienst gelöscht</span>}
        <div className={taker ? 'req-taker' : 'muted'}>{taker ? <>→ <b>{taker.name}</b> übernimmt</> : 'Noch niemand hat übernommen'}</div>
      </div> : <div className="req-when"><b>{period}</b>
        {r.kind === 'urlaub' && st && open && <div className="muted">Urlaubskonto {year}: {vacationUsed(d, st.id, year)} + {vacDays(r.from, r.to)} von {st.vacationDays} Tagen</div>}
        {r.kind === 'krank' && open && <div className="muted">Abwesenheit ist eingetragen, Dienste ab heute sind offene Schichten.</div>}
      </div>}
      {r.note && <p className="req-note">„{r.note}“</p>}
      {clash > 0 && <p className="req-warn">Achtung: {clash} {clash === 1 ? 'Dienst' : 'Dienste'} in diesem Zeitraum eingeplant – bei Genehmigung bitte umplanen.</p>}
      <div className="req-meta muted">Eingegangen {when(r.createdAt)}{r.decidedAt && ` · ${r.kind === 'krank' ? 'gesehen' : 'entschieden'} ${when(r.decidedAt)}${r.decidedBy ? ` von ${r.decidedBy}` : ''}`}</div>
      {r.answer && <p className="req-answer">Antwort: {r.answer}</p>}
      {edit && open && (r.kind === 'krank'
        ? <div className="req-actions"><button className="btn primary" disabled={busy} onClick={() => go(true)}><Check />Zur Kenntnis genommen</button></div>
        : <div className="req-actions">
          <input aria-label={`Begründung an ${name}`} placeholder="Begründung (optional)" value={answer} onChange={e => setAnswer(e.target.value)} maxLength={500} />
          {(r.kind !== 'tausch' || r.status === 'uebernommen') && <button className="btn primary" disabled={busy} onClick={() => go(true)}><Check />Genehmigen</button>}
          <button className="btn danger" disabled={busy} onClick={() => go(false)}><X />{r.kind === 'tausch' && r.status === 'offen' ? 'Angebot ablehnen' : 'Ablehnen'}</button>
        </div>)}
    </article>
  );
}
