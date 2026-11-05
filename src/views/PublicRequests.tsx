/** Mitarbeiter-Link: Anfragen stellen (Frei-Wunsch, Urlaub, Krankmeldung), Dienst zum Tausch anbieten,
 *  Tauschangebote der Kolleg:innen übernehmen, „Meine Anfragen“ mit Status – Deutsch/Italienisch. */
import { useEffect, useState } from 'react';
import { ArrowRightLeft, X } from '../ui/icons';
import { repo } from '../data';
import { REQUEST_ERROR_TEXT, requestErrors } from '../domain/requests';
import type { PublicRoster as Data, PubRequest, RequestKind, RequestStatus } from '../domain/types';
import { today } from '../lib/time';

export type Lang = 'de' | 'it';
type Shift = Data['shifts'][number];

export const REQ_TXT = {
  de: {
    request: 'Anfrage stellen', kinds: { frei: 'Frei-Wunsch', urlaub: 'Urlaub', krank: 'Krankmeldung', tausch: 'Dienst-Tausch' } as Record<RequestKind, string>,
    kind: 'Art der Anfrage', from: 'Von', to: 'Bis', note: 'Notiz (optional)', send: 'Senden', cancel: 'Abbrechen', close: 'Schließen',
    sent: 'Anfrage gesendet – die Bereichsleitung entscheidet.', sick: 'Krankmeldung eingetragen – gute Besserung!',
    sickHint: 'Die Krankmeldung wird sofort eingetragen, deine Dienste in diesem Zeitraum werden freigegeben. Die Bereichsleitung wird informiert.',
    askHint: 'Die Bereichsleitung entscheidet über deine Anfrage. Den Stand siehst du unter „Meine Anfragen“.',
    mine: 'Meine Anfragen', none: 'Noch keine Anfragen.', withdraw: 'Zurücknehmen', answer: 'Antwort', isNew: 'Neu',
    status: { offen: 'Offen', uebernommen: 'Übernommen – wartet auf Bestätigung', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt' } as Record<RequestStatus, string>,
    sickOpen: 'Eingetragen', sickSeen: 'Von der Leitung gesehen', offerOpen: 'Angeboten – noch niemand übernommen',
    swap: 'Tauschen', swapTitle: 'Dienst zum Tausch anbieten', swapHint: 'Kolleg:innen deines Bereichs sehen das Angebot auf ihrem Link und können es übernehmen. Danach bestätigt die Bereichsleitung den Tausch.',
    offer: 'Anbieten', offered: 'angeboten', takes: 'übernimmt',
    offers: 'Tauschangebote von Kolleg:innen', take: 'Übernehmen', giveBack: 'Zurückgeben', waitLead: 'Von dir übernommen – wartet auf Bestätigung der Leitung',
    taken: 'Übernommen – die Leitung bestätigt noch.', given: 'Zurückgegeben.', offerSent: 'Dienst zum Tausch angeboten.', withdrawn: 'Zurückgenommen.',
    days: 'Tage', error: 'Das hat nicht geklappt'
  },
  it: {
    request: 'Nuova richiesta', kinds: { frei: 'Giorno libero', urlaub: 'Ferie', krank: 'Malattia', tausch: 'Scambio turno' } as Record<RequestKind, string>,
    kind: 'Tipo di richiesta', from: 'Dal', to: 'Al', note: 'Nota (facoltativa)', send: 'Invia', cancel: 'Annulla', close: 'Chiudi',
    sent: 'Richiesta inviata – decide il responsabile.', sick: 'Malattia registrata – buona guarigione!',
    sickHint: 'La malattia viene registrata subito, i tuoi turni in questo periodo vengono liberati. Il responsabile viene informato.',
    askHint: 'Il responsabile decide sulla tua richiesta. Lo stato lo trovi sotto „Le mie richieste“.',
    mine: 'Le mie richieste', none: 'Nessuna richiesta.', withdraw: 'Ritira', answer: 'Risposta', isNew: 'Nuovo',
    status: { offen: 'In attesa', uebernommen: 'Preso – in attesa di conferma', genehmigt: 'Approvata', abgelehnt: 'Rifiutata' } as Record<RequestStatus, string>,
    sickOpen: 'Registrata', sickSeen: 'Vista dal responsabile', offerOpen: 'Offerto – nessuno l’ha ancora preso',
    swap: 'Scambia', swapTitle: 'Offri il turno in scambio', swapHint: 'I colleghi del tuo reparto vedono l’offerta sul loro link e possono prenderla. Poi il responsabile conferma lo scambio.',
    offer: 'Offri', offered: 'offerto', takes: 'lo prende',
    offers: 'Turni offerti dai colleghi', take: 'Lo prendo io', giveBack: 'Restituisci', waitLead: 'Preso da te – in attesa di conferma del responsabile',
    taken: 'Preso – il responsabile deve ancora confermare.', given: 'Restituito.', offerSent: 'Turno offerto in scambio.', withdrawn: 'Ritirato.',
    days: 'giorni', error: 'Non è riuscito'
  }
};

const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
const shiftTime = (s: { start: string; end: string; start2: string | null; end2: string | null }) => `${s.start}–${s.end}${s.start2 ? ` · ${s.start2}–${s.end2}` : ''}`;
const period = (r: { from: string; to: string }) => (r.from === r.to ? dm(r.from) : `${dm(r.from)} – ${dm(r.to)}`);

/** Entscheidungen, die auf diesem Gerät noch nicht angesehen wurden, sind als „Neu“ markiert */
const seenKey = (token: string) => `dienstplan.gesehen.${token}`;
function useSeen(token: string, list: PubRequest[]) {
  const [seen] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(seenKey(token)) || '[]')); } catch { return new Set(); } });
  const decided = list.filter(r => r.decidedAt).map(r => r.id + r.decidedAt);
  useEffect(() => { try { localStorage.setItem(seenKey(token), JSON.stringify(decided.slice(0, 200))); } catch { /* egal */ } }, [token, decided.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return (r: PubRequest) => !!r.decidedAt && !seen.has(r.id + r.decidedAt);
}

function Modal({ title, onClose, children, lang }: { title: string; onClose: () => void; children: React.ReactNode; lang: Lang }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="pub-modal no-print" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pub-modal-box" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row pub-modal-h"><h3>{title}</h3><button className="btn icon ghost" aria-label={REQ_TXT[lang].close} onClick={onClose}><X /></button></div>
        {children}
      </div>
    </div>
  );
}

/** Formular „Anfrage stellen“ */
export function RequestDialog({ token, data, lang, onClose, onDone }: { token: string; data: Data; lang: Lang; onClose: () => void; onDone: (msg: string) => void }) {
  const T = REQ_TXT[lang];
  const t0 = today();
  const [kind, setKind] = useState<Exclude<RequestKind, 'tausch'>>('frei');
  const [from, setFrom] = useState(t0);
  const [to, setTo] = useState(t0);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const check = requestErrors({ kind, from, to }, t0, data.seasons, data.absences, data.requests ?? []);
  async function send() {
    if (check.length) { setErr(REQUEST_ERROR_TEXT[lang][check[0]]); return; }
    setBusy(true); setErr('');
    try { await repo.requestCreate(token, kind, from, to, note); onDone(kind === 'krank' ? T.sick : T.sent); }
    catch (e: any) { setErr(e?.message || T.error); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={T.request} onClose={onClose} lang={lang}>
      <div className="seg pub-kinds" role="group" aria-label={T.kind}>
        {(['frei', 'urlaub', 'krank'] as const).map(k => <button key={k} className="btn" aria-pressed={kind === k} onClick={() => { setKind(k); setErr(''); }}>{T.kinds[k]}</button>)}
      </div>
      <div className="row pub-dates">
        <label>{T.from}<input type="date" value={from} onChange={e => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); setErr(''); }} /></label>
        <label>{T.to}<input type="date" value={to} min={from} onChange={e => { setTo(e.target.value); setErr(''); }} /></label>
      </div>
      <label>{T.note}<textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
      <p className="muted pub-hint">{kind === 'krank' ? T.sickHint : T.askHint}</p>
      {err && <p className="pub-err" role="alert">{err}</p>}
      <div className="row pub-modal-actions">
        <button className="btn" onClick={onClose}>{T.cancel}</button>
        <button className="btn primary" disabled={busy} onClick={send}>{T.send}</button>
      </div>
    </Modal>
  );
}

/** Eigenen Dienst zum Tausch anbieten */
export function OfferDialog({ token, shift, lang, onClose, onDone, wdName }: { token: string; shift: Shift; lang: Lang; onClose: () => void; onDone: (msg: string) => void; wdName: (d: string) => string }) {
  const T = REQ_TXT[lang];
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setErr('');
    try { await repo.swapOffer(token, shift.id, note); onDone(T.offerSent); }
    catch (e: any) { setErr(e?.message || T.error); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={T.swapTitle} onClose={onClose} lang={lang}>
      <p className="pub-offer-shift"><b>{wdName(shift.date)} {dm(shift.date)}</b> <span className="pub-shift" style={{ borderColor: shift.color, display: 'inline-block' }}>{shiftTime(shift)}</span> <span className="muted">{shift.departmentName}</span></p>
      <label>{T.note}<textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
      <p className="muted pub-hint">{T.swapHint}</p>
      {err && <p className="pub-err" role="alert">{err}</p>}
      <div className="row pub-modal-actions">
        <button className="btn" onClick={onClose}>{T.cancel}</button>
        <button className="btn primary" disabled={busy} onClick={send}><ArrowRightLeft />{T.offer}</button>
      </div>
    </Modal>
  );
}

/** Tauschangebote der Kolleg:innen (gleicher Bereich) */
export function Offers({ token, data, lang, onDone, wdName }: { token: string; data: Data; lang: Lang; onDone: (msg: string) => void; wdName: (d: string) => string }) {
  const T = REQ_TXT[lang];
  const [err, setErr] = useState('');
  const list = data.offers ?? [];
  if (!list.length) return null;
  const act = async (id: string, take: boolean) => {
    setErr('');
    try { await repo.swapTake(token, id, take); onDone(take ? T.taken : T.given); } catch (e: any) { setErr(e?.message || T.error); }
  };
  return (
    <section className="panel mt12 pub-offers no-print" aria-label={T.offers}>
      <h3><ArrowRightLeft aria-hidden="true" />{T.offers}</h3>
      <ul className="pub-req-list">{list.map(o => (
        <li key={o.id} className={o.takenByMe ? 'mine' : ''}>
          <div className="pub-req-main">
            <b>{wdName(o.date)} {dm(o.date)}</b> <span className="pub-shift" style={{ borderColor: o.color, display: 'inline-block' }}>{shiftTime(o)}</span>
            <div className="muted">{o.staffName} · {o.departmentName}{o.note ? ` · „${o.note}“` : ''}</div>
            {o.takenByMe && <div className="pub-req-status uebernommen">{T.waitLead}</div>}
          </div>
          {o.takenByMe ? <button className="btn small" onClick={() => act(o.id, false)}>{T.giveBack}</button>
            : <button className="btn small primary" onClick={() => act(o.id, true)}>{T.take}</button>}
        </li>
      ))}</ul>
      {err && <p className="pub-err" role="alert" style={{ margin: '0 12px 12px' }}>{err}</p>}
    </section>
  );
}

/** „Meine Anfragen“ mit Status, Antwort der Leitung und Zurücknehmen */
export function MyRequests({ token, data, lang, onDone }: { token: string; data: Data; lang: Lang; onDone: (msg: string) => void }) {
  const T = REQ_TXT[lang];
  const list = data.requests ?? [];
  const isNew = useSeen(token, list);
  const [err, setErr] = useState('');
  const shiftOf = (id: string | null) => data.shifts.find(s => s.id === id);
  const withdraw = async (id: string) => {
    setErr('');
    try { await repo.requestCancel(token, id); onDone(T.withdrawn); } catch (e: any) { setErr(e?.message || T.error); }
  };
  const statusText = (r: PubRequest) => r.kind === 'krank' ? (r.status === 'genehmigt' ? T.sickSeen : T.sickOpen)
    : r.kind === 'tausch' && r.status === 'offen' ? T.offerOpen
    : r.kind === 'tausch' && r.status === 'uebernommen' ? `${r.takerName ?? ''} ${T.takes} – ${T.status.offen}` : T.status[r.status];
  return (
    <section className="panel mt12 pub-myreq no-print" aria-label={T.mine}>
      <h3>{T.mine}</h3>
      {!list.length ? <p className="muted" style={{ padding: '0 12px' }}>{T.none}</p> : <ul className="pub-req-list">{list.map(r => {
        const s = shiftOf(r.shiftId);
        return (
          <li key={r.id} className={isNew(r) ? 'new' : ''}>
            <div className="pub-req-main">
              <span className={'pub-req-kind ' + r.kind}>{T.kinds[r.kind]}</span> <b>{period(r)}</b>{s && <span className="muted"> · {shiftTime(s)}</span>}
              {isNew(r) && <span className="badge warn" style={{ marginLeft: 6 }}>{T.isNew}</span>}
              {r.note && <div className="muted">„{r.note}“</div>}
              <div className={'pub-req-status ' + r.status}>{statusText(r)}</div>
              {r.answer && <div className="pub-req-answer">{T.answer}: {r.answer}</div>}
            </div>
            {r.kind !== 'krank' && (r.status === 'offen' || r.status === 'uebernommen') && <button className="btn small" onClick={() => withdraw(r.id)}>{T.withdraw}</button>}
          </li>
        );
      })}</ul>}
      {err && <p className="pub-err" role="alert" style={{ margin: '0 12px 12px' }}>{err}</p>}
    </section>
  );
}
