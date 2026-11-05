/** Masken vor der eigentlichen App: Anmeldung, Passwort, Betriebswahl, Einrichtung, Fehler */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { repo } from '../data';
import { DEMO_USERS } from '../data/demoRepo';
import { APP_NAME, EDITION } from '../lib/edition';
import { t } from '../lib/i18n';
import { useApp } from '../store/app';
import { toast } from '../ui/notify';
import { isCodeEmail } from '../domain/logins';

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login">
      <img className="login-logo" src="/joke-logo-horizontal.svg" alt="JoKe Smart Solutions" />
      <img className="login-logo neg" src="/joke-logo-horizontal-negativ.svg" alt="JoKe Smart Solutions" />
      <div className="panel"><h3>{title}</h3><div className="body">{children}</div></div>
    </div>
  );
}

/** Angemeldet, aber in dieser Ausgabe keine Ansicht (Dienstplan-App ohne Bereichsleitung) */
export function NoAccess() {
  const s = useApp();
  return (
    <Box title={APP_NAME}>
      <p style={{ marginTop: 0 }}>{EDITION === 'dienstplan'
        ? <>Sie sind im Betrieb <b>{s.data?.venue.name}</b> keiner Bereichsleitung zugeordnet. Bitten Sie den Admin, Sie unter <i>Einstellungen → Bereiche & Leitungen</i> einzutragen.</>
        : 'Für Ihren Benutzer ist keine Ansicht freigegeben.'}</p>
      <div className="row mt12">
        {s.memberships.length > 1 && <button className="btn small" onClick={() => s.switchVenue()}>Betrieb wechseln</button>}
        <button className="btn small" onClick={() => s.logout()}>Abmelden</button>
      </div>
    </Box>
  );
}

/** gemerkte Firma für die Anmeldung mit Benutzercode */
type Firm = { id: string; name: string; code: string };
const FIRM_KEY = 'tischplan.firma';
function loadFirm(): Firm | null { try { const j = JSON.parse(localStorage.getItem(FIRM_KEY) ?? 'null'); return j?.id ? j : null; } catch { return null; } }
function saveFirm(f: Firm | null) { try { if (f) localStorage.setItem(FIRM_KEY, JSON.stringify(f)); else localStorage.removeItem(FIRM_KEY); } catch { /* egal */ } }
/** Anmeldelink /login/<firmenkürzel> */
const LINK_FIRM = /^\/login\/([a-z0-9-]{3,32})\/?$/i.exec(location.pathname)?.[1]?.toLowerCase() ?? null;

/** Anmeldung mit Firma + Benutzercode + Passwort */
function CodeLogin({ onEmail }: { onEmail?: () => void }) {
  const s = useApp();
  const [firm, setFirm] = useState<Firm | null>(loadFirm);
  const [firmCode, setFirmCode] = useState(LINK_FIRM ?? '');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!LINK_FIRM) return;
    history.replaceState(null, '', '/');
    repo.venueByLoginCode(LINK_FIRM).then(v => { if (v) { const f = { ...v, code: LINK_FIRM }; saveFirm(f); setFirm(f); } else toast(`Firma „${LINK_FIRM}“ nicht gefunden`, 'err'); }).catch(e => toast(e.message, 'err'));
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      let f = firm;
      if (!f) {
        const c = firmCode.trim().toLowerCase();
        const v = await repo.venueByLoginCode(c);
        if (!v) { toast(`Firma „${c}“ nicht gefunden – Kürzel steht auf dem Zugangszettel`, 'err'); return; }
        f = { ...v, code: c }; saveFirm(f); setFirm(f);
      }
      await s.loginCode(f.id, code.trim().toLowerCase(), pw);
    } catch (err: any) { toast(err.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} aria-label="Anmeldung mit Benutzercode">
      {firm
        ? <p className="firm-line" style={{ marginTop: 0 }}>Firma: <b>{firm.name}</b> <button type="button" className="link" onClick={() => { saveFirm(null); setFirm(null); setFirmCode(''); }}>Firma ändern</button></p>
        : <label>Firma (Kürzel)<input autoComplete="organization" required value={firmCode} placeholder="z. B. sonnenhof" onChange={e => setFirmCode(e.target.value)} /></label>}
      <label className={firm ? '' : 'mt8'}>Benutzercode<input autoComplete="username" autoCapitalize="none" spellCheck={false} required value={code} onChange={e => setCode(e.target.value)} /></label>
      <label className="mt8">Passwort<input type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} /></label>
      <button className="btn primary mt12" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>Anmelden</button>
      <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>Passwort vergessen? Bitte beim Admin melden.
        {onEmail && <> · <button type="button" className="link" onClick={onEmail}>Mit E-Mail anmelden</button></>}</p>
    </form>
  );
}

export function Gate() {
  const s = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [venueName, setVenueName] = useState('');
  const [busy, setBusy] = useState(false);
  const [byCode, setByCode] = useState(() => !!LINK_FIRM || !!loadFirm());
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  if (s.phase === 'init' || s.phase === 'loading') return <Box title={APP_NAME}><p className="muted">Daten werden geladen…</p></Box>;

  if (s.phase === 'login') {
    if (repo.mode === 'demo') return (
      <Box title={`${APP_NAME} – Demo-Modus`}>
        <p className="muted" style={{ marginTop: 0 }}>Keine Datenbank konfiguriert – die Daten liegen nur in diesem Browser. Rolle wählen:</p>
        <div className="userbtns">{DEMO_USERS.map(u => (
          <button key={u.email} className="btn" disabled={busy} onClick={() => run(() => s.login(u.email, 'demo'))}><b>{u.name}</b><small className="muted">{t(u.role)}</small></button>
        ))}</div>
        <details className="mt12" open={byCode}><summary className="muted">Mit Benutzercode anmelden</summary><div className="mt8"><CodeLogin /></div></details>
      </Box>
    );
    if (byCode) return <Box title={`${APP_NAME} – Anmeldung`}><CodeLogin onEmail={() => setByCode(false)} /></Box>;
    const submit = (e: FormEvent) => { e.preventDefault(); run(() => s.login(email.trim(), pw)); };
    return (
      <Box title={`${APP_NAME} – Anmeldung`}>
        <form onSubmit={submit}>
          <label>E-Mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="mt8">Passwort<input type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} /></label>
          <button className="btn primary mt12" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>Anmelden</button>
        </form>
        <p style={{ margin: '12px 0 0', fontSize: 13 }}>
          <button className="link" onClick={async () => {
            if (!email.trim()) return toast('Bitte zuerst die E-Mail-Adresse eintragen', 'err');
            try { await repo.resetPassword(email.trim()); toast('E-Mail zum Zurücksetzen wurde gesendet'); } catch (e: any) { toast(e.message, 'err'); }
          }}>Passwort vergessen?</button> · <button className="link" onClick={() => setByCode(true)}>Mit Benutzercode anmelden</button>
        </p>
      </Box>
    );
  }

  if (s.phase === 'setpw') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (pw.length < 8) return toast('Mindestens 8 Zeichen', 'err');
      if (pw !== pw2) return toast('Passwörter stimmen nicht überein', 'err');
      run(() => s.setPassword(pw));
    };
    return (
      <Box title="Passwort festlegen">
        <form onSubmit={submit}>
          <p className="muted" style={{ marginTop: 0 }}>{isCodeEmail(s.authEmail) ? 'Bitte wählen Sie jetzt ein eigenes Passwort. Das vom Admin vergebene gilt danach nicht mehr.' : s.authEmail}</p>
          <label>Neues Passwort (mind. 8 Zeichen)<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
          <label className="mt8">Wiederholen<input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
          <button className="btn primary mt12" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>Speichern</button>
        </form>
      </Box>
    );
  }

  if (s.phase === 'select') return (
    <Box title="Betrieb wählen">
      <div className="userbtns">{s.memberships.map(m => (
        <button key={m.venueId} className="btn" onClick={() => s.selectVenue(m)}><b>{m.venueName}</b><small className="muted">{t(m.role)}</small></button>
      ))}</div>
      <p className="mt12"><button className="btn small" onClick={() => s.logout()}>Abmelden</button></p>
    </Box>
  );

  if (s.phase === 'novenue') return (
    <Box title="Kein Betrieb zugeordnet">
      <p style={{ marginTop: 0 }}>Ihr Benutzer <b>{s.authEmail}</b> ist noch keinem Betrieb zugeordnet. Bitten Sie den Admin, Sie unter <i>Einstellungen → Benutzer</i> hinzuzufügen.</p>
      <details><summary className="muted">Ersteinrichtung: neuen Betrieb anlegen</summary>
        <label className="mt8">Name des Betriebs<input value={venueName} onChange={e => setVenueName(e.target.value)} placeholder="z. B. Hotel Sonnenhof" /></label>
        <button className="btn primary mt8" disabled={busy} onClick={() => run(() => s.createVenue(venueName))}>Betrieb anlegen (ich werde Admin)</button>
      </details>
      <p className="mt12"><button className="btn small" onClick={() => s.logout()}>Abmelden</button></p>
    </Box>
  );

  if (s.phase === 'empty') {
    const admin = s.user?.role === 'admin';
    return (
      <Box title={`${s.data?.venue.name ?? ''} – Einrichtung`}>
        {admin ? <>
          <p style={{ marginTop: 0 }}>Der Betrieb hat noch keine Daten. Wie möchten Sie starten?</p>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={() => run(() => s.setupVenue('demo'))}>Mit Demo-Daten (zum Ausprobieren)</button>
            <button className="btn" disabled={busy} onClick={() => run(() => s.setupVenue('empty'))}>Leer – nur Grundeinstellungen</button>
          </div>
          {busy && <p className="muted">Wird eingerichtet…</p>}
          <p className="muted" style={{ fontSize: 12 }}>Beides lässt sich später unter Einstellungen → Daten ersetzen.</p>
        </> : <p>Der Betrieb ist noch nicht eingerichtet. Bitte melden Sie sich bei Ihrem Admin.</p>}
        <p className="mt12"><button className="btn small" onClick={() => s.logout()}>Abmelden</button></p>
      </Box>
    );
  }

  return (
    <Box title="Fehler">
      <div className="errorbox">{s.error}</div>
      <p className="muted" style={{ fontSize: 13 }}>Prüfen Sie die Internetverbindung und ob das Datenbank-Schema (supabase/migrations) eingespielt wurde.</p>
      <div className="row"><button className="btn primary" onClick={() => s.init()}>Erneut versuchen</button><button className="btn" onClick={() => s.logout()}>Abmelden</button></div>
    </Box>
  );
}
