/** Masken vor der eigentlichen App: Anmeldung, Passwort, Betriebswahl, Einrichtung, Fehler */
import { useState, type FormEvent, type ReactNode } from 'react';
import { repo } from '../data';
import { DEMO_USERS } from '../data/demoRepo';
import { t } from '../lib/i18n';
import { useApp } from '../store/app';
import { toast } from '../ui/feedback';

function Box({ title, children }: { title: string; children: ReactNode }) {
  return <div className="login panel"><h3>{title}</h3><div className="body">{children}</div></div>;
}

export function Gate() {
  const s = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [venueName, setVenueName] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  if (s.phase === 'init' || s.phase === 'loading') return <Box title="Tischplan"><p className="muted">Daten werden geladen…</p></Box>;

  if (s.phase === 'login') {
    if (repo.mode === 'demo') return (
      <Box title="Tischplan – Demo-Modus">
        <p className="muted" style={{ marginTop: 0 }}>Keine Datenbank konfiguriert – die Daten liegen nur in diesem Browser. Rolle wählen:</p>
        <div className="userbtns">{DEMO_USERS.map(u => (
          <button key={u.email} className="btn" disabled={busy} onClick={() => run(() => s.login(u.email, 'demo'))}><b>{u.name}</b><small className="muted">{t(u.role)}</small></button>
        ))}</div>
      </Box>
    );
    const submit = (e: FormEvent) => { e.preventDefault(); run(() => s.login(email.trim(), pw)); };
    return (
      <Box title="Tischplan – Anmeldung">
        <form onSubmit={submit}>
          <label>E-Mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="mt8">Passwort<input type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} /></label>
          <button className="btn primary mt12" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>Anmelden</button>
        </form>
        <p style={{ margin: '12px 0 0', fontSize: 13 }}>
          <button className="link" onClick={async () => {
            if (!email.trim()) return toast('Bitte zuerst die E-Mail-Adresse eintragen', 'err');
            try { await repo.resetPassword(email.trim()); toast('E-Mail zum Zurücksetzen wurde gesendet'); } catch (e: any) { toast(e.message, 'err'); }
          }}>Passwort vergessen?</button>
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
          <p className="muted" style={{ marginTop: 0 }}>{s.authEmail}</p>
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
