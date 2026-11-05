/** Einstellungen → Benutzer & Rollen: Firmenkürzel, Benutzer mit Benutzercode anlegen, Passwort neu setzen, Zugangszettel */
import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Dices, Eye, EyeOff, Printer, UserPlus } from '../ui/icons';
import { repo } from '../data';
import { ROLES } from '../domain/constants';
import { codeError, firmError, firmSlug, passwordError, suggestCode, wordPassword } from '../domain/logins';
import type { Member, Role } from '../domain/types';
import { t } from '../lib/i18n';
import { APP_NAME } from '../lib/edition';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/notify';

export interface Credentials { firm: string; firmName: string; code: string; password: string; name: string }
export const loginLink = (firm: string) => `${location.origin}/login/${firm}`;

/** Passwortfeld mit Anzeigen/Verbergen und „Generieren“ */
export function PasswordInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(true);
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <span className="pw-input">
        <input id={id} type={show ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" className="btn small icon ghost" aria-label={show ? 'Passwort verbergen' : 'Passwort anzeigen'} title={show ? 'Verbergen' : 'Anzeigen'} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</button>
        <button type="button" className="btn small" onClick={() => { onChange(wordPassword()); setShow(true); }}><Dices />Generieren</button>
      </span>
    </div>
  );
}

/** Firmenkürzel (für alle Code-Benutzer dieses Betriebs) */
export function FirmCode() {
  const d = useData();
  const reload = useApp(s => s.reload);
  const cur = d.venue.loginCode ?? '';
  const [v, setV] = useState(cur || firmSlug(d.venue.name));
  async function save() {
    const c = v.trim().toLowerCase();
    const err = firmError(c); if (err) return toast(err, 'err');
    try { await repo.setVenueLoginCode(d.venue.id, c); toast('Firmenkürzel gespeichert'); await reload(); } catch (e: any) { toast(e.message, 'err'); }
  }
  return (
    <div className="firm-code">
      <div className="row">
        <label style={{ flex: 1, minWidth: 200 }}>Firmenkürzel für die Anmeldung mit Benutzercode
          <input value={v} spellCheck={false} autoCapitalize="none" onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} /></label>
        <button className="btn small primary" style={{ alignSelf: 'flex-end' }} disabled={v.trim().toLowerCase() === cur} onClick={save}>{cur ? 'Ändern' : 'Festlegen'}</button>
      </div>
      {cur
        ? <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Anmeldelink: <a href={loginLink(cur)}>{loginLink(cur)}</a>{v.trim().toLowerCase() !== cur && ' · Achtung: Nach dem Ändern gilt nur noch das neue Kürzel.'}</p>
        : <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Noch nicht festgelegt – nötig, bevor Benutzer mit Benutzercode angelegt werden.</p>}
    </div>
  );
}

/** Neuen Benutzer mit Benutzercode + Passwort anlegen */
export function CodeUserForm({ members, onCreated }: { members: Member[]; onCreated: (c: Credentials) => void }) {
  const d = useData();
  const firm = d.venue.loginCode ?? '';
  const taken = members.map(m => m.loginCode ?? '').filter(Boolean);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('service');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [pw, setPw] = useState(() => wordPassword());
  const [busy, setBusy] = useState(false);
  const shown = codeTouched ? code : suggestCode(name, taken);
  async function create() {
    const c = shown.trim().toLowerCase();
    const err = (!name.trim() ? 'Name fehlt' : null) ?? codeError(c) ?? (taken.includes(c) ? `Der Benutzercode „${c}“ ist schon vergeben` : null) ?? passwordError(pw);
    if (err) return toast(err, 'err');
    setBusy(true);
    try {
      await repo.createCodeUser(d.venue.id, { code: c, name: name.trim(), role, password: pw });
      onCreated({ firm, firmName: d.venue.name, code: c, password: pw, name: name.trim() });
      setName(''); setCode(''); setCodeTouched(false); setPw(wordPassword());
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  }
  if (!firm) return <p className="muted">Bitte zuerst oben ein Firmenkürzel festlegen.</p>;
  return (
    <div className="code-user-form" role="group" aria-label="Benutzer mit Benutzercode anlegen">
      <div className="grid3">
        <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Max Kofler" /></label>
        <label>Benutzercode<input value={shown} spellCheck={false} autoCapitalize="none" onChange={e => { setCode(e.target.value.toLowerCase()); setCodeTouched(true); }} /></label>
        <label>Rolle<select value={role} onChange={e => setRole(e.target.value as Role)}>{ROLES.map(r => <option key={r} value={r}>{t(r)}</option>)}</select></label>
      </div>
      <div className="mt8"><PasswordInput label="Passwort (mind. 8 Zeichen)" value={pw} onChange={setPw} /></div>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Beim ersten Anmelden wählt der Benutzer ein eigenes Passwort.</p>
      <button className="btn small primary mt8" disabled={busy} onClick={create}><UserPlus />Anlegen</button>
    </div>
  );
}

/** Einmalige Anzeige der Zugangsdaten mit Kopieren und Zettel drucken */
export function CredentialSlip({ c, title = 'Angelegt – bitte jetzt weitergeben', onClose }: { c: Credentials; title?: string; onClose: () => void }) {
  const text = `${APP_NAME} – Zugang für ${c.name}\nFirma: ${c.firm}\nBenutzercode: ${c.code}\nPasswort: ${c.password}\nAnmelden: ${loginLink(c.firm)}\nBeim ersten Anmelden bitte ein eigenes Passwort wählen.`;
  async function copy() {
    try { await navigator.clipboard.writeText(text); toast('Zugangsdaten kopiert'); } catch { toast('Kopieren nicht möglich – bitte abschreiben', 'err'); }
  }
  function print() {
    const w = window.open('', '_blank', 'width=480,height=600');
    if (!w) return toast('Druckfenster wurde blockiert', 'err');
    const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Zugang ${esc(c.name)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:32px;color:#0F2347}.slip{border:2px dashed #0F2347;border-radius:12px;padding:20px 24px;max-width:360px}
h1{font-size:18px;margin:0 0 4px}p{margin:4px 0}.k{color:#4A5B7D;font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-top:12px}.v{font:600 20px/1.3 ui-monospace,monospace}.s{font-size:12px;color:#4A5B7D;margin-top:16px}</style>
<div class="slip"><h1>${esc(APP_NAME)} – Zugang</h1><p>${esc(c.name)} · ${esc(c.firmName)}</p>
<p class="k">Firma</p><p class="v">${esc(c.firm)}</p><p class="k">Benutzercode</p><p class="v">${esc(c.code)}</p><p class="k">Passwort</p><p class="v">${esc(c.password)}</p>
<p class="k">Anmelden</p><p>${esc(loginLink(c.firm))}</p><p class="s">Beim ersten Anmelden bitte ein eigenes Passwort wählen.</p></div>
<script>window.onload=()=>{window.print()}</script>`);
    w.document.close();
  }
  return (
    <div className="cred-slip" role="region" aria-label="Zugangsdaten">
      <b>✔ {title}</b>
      <dl>
        <dt>Name</dt><dd>{c.name}</dd>
        <dt>Firma</dt><dd><code>{c.firm}</code></dd>
        <dt>Benutzercode</dt><dd><code>{c.code}</code></dd>
        <dt>Passwort</dt><dd><code>{c.password}</code></dd>
      </dl>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Das Passwort wird nach dem Schließen nicht mehr angezeigt.</p>
      <div className="row">
        <button className="btn small" onClick={copy}><Copy />Kopieren</button>
        <button className="btn small" onClick={print}><Printer />Zettel drucken</button>
        <span className="spacer" />
        <button className="btn small ghost" onClick={onClose}>Fertig</button>
      </div>
    </div>
  );
}

/** Admin setzt das Passwort eines Code-Benutzers neu */
export function ResetPassword({ m, onDone, onClose }: { m: Member; onDone: (c: Credentials) => void; onClose: () => void }) {
  const d = useData();
  const [pw, setPw] = useState(() => wordPassword());
  const [busy, setBusy] = useState(false);
  async function save() {
    const err = passwordError(pw); if (err) return toast(err, 'err');
    setBusy(true);
    try { await repo.setCodeUserPassword(d.venue.id, m.userId, pw); onDone({ firm: d.venue.loginCode ?? '', firmName: d.venue.name, code: m.loginCode ?? '', password: pw, name: m.name }); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  }
  return createPortal(
    <Modal title={`Passwort neu setzen – ${m.name}`} onClose={onClose} width={480} footer={<>
      <button className="btn" onClick={onClose}>Abbrechen</button><span className="spacer" />
      <button className="btn primary" disabled={busy} onClick={save}>Speichern</button></>}>
      <PasswordInput label="Neues Passwort (mind. 8 Zeichen)" value={pw} onChange={setPw} />
      <p className="muted" style={{ fontSize: 12 }}>{m.name} muss nach der nächsten Anmeldung wieder ein eigenes Passwort wählen.</p>
    </Modal>, document.body);
}
