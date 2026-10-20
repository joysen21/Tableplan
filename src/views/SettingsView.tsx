/** Einstellungen (Admin): Betrieb, Services, Benutzer & Rollen, Daten, Protokoll */
import { useEffect, useState, type ReactNode } from 'react';
import { Building2, CalendarClock, CalendarDays, ChevronDown, Database, Download, History, Plus, QrCode, Upload, Users, X, type LucideIcon } from '../ui/icons';
import { MOBILE } from '../ui/media';
import { repo } from '../data';
import { demoVenueData, newId } from '../domain/demo';
import { ROLES } from '../domain/constants';
import { remapIds } from '../domain/remap';
import type { Member, Role, Service, ServiceKind, VenueData } from '../domain/types';
import { t } from '../lib/i18n';
import { downloadBlob } from '../lib/download';
import { today } from '../lib/time';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { confirmDialog, toast } from '../ui/notify';
import { ModulesPanel } from './RosterSettings';
import { BrandingPanel } from '../forms/GuestMenuForms';
import { StatusPanel } from '../forms/StatusSettings';
import { APP_NAME, EDITION } from '../lib/edition';

function Field({ label, value, type = 'text', onCommit, placeholder }: { label: string; value: string | number; type?: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return <label>{label}<input type={type} value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onBlur={() => v !== String(value) && onCommit(v)}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>;
}

function ServiceCard({ s }: { s: Service }) {
  const d = useData();
  const store = useApp();
  const save = (patch: Partial<Service>) => store.upsert('services', [{ ...s, ...patch }], ['Service geändert', s.name]);
  return (
    <div className="panel" style={{ padding: 10, marginBottom: 10, boxShadow: 'none' }}>
      <div className="grid3">
        <Field label="Name" value={s.name} onCommit={v => v.trim() && save({ name: v.trim() })} />
        <label>Typ<select value={s.kind} onChange={e => save({ kind: e.target.value as ServiceKind })}>{(['fruehstueck', 'mittag', 'abend'] as ServiceKind[]).map(k => <option key={k} value={k}>{t(k)}</option>)}</select></label>
        <Field label="Hotel-Standardzeit" type="time" value={s.hotelTime ?? ''} onCommit={v => save({ hotelTime: v || null })} />
        <Field label="Beginn" type="time" value={s.start} onCommit={v => v && save({ start: v })} />
        <Field label="Ende" type="time" value={s.end} onCommit={v => {
          if (!v) return;
          if (v <= s.start) return toast('Ende muss nach dem Beginn liegen', 'err');
          save({ end: v });
        }} />
      </div>
      <label className="chk mt8"><input type="checkbox" checked={s.freeSeating} onChange={e => save({ freeSeating: e.target.checked })} /> Freie Platzwahl (keine Tischzuweisung für Hotelgäste)</label>
      <button className="btn small danger mt8" onClick={async () => {
        if (d.services.length < 2) return toast('Mindestens ein Service nötig', 'err');
        const n = d.reservations.filter(r => r.serviceId === s.id).length;
        if (await confirmDialog('Service löschen?', [`${s.name} – ${n} Reservierungen werden ebenfalls gelöscht.`], 'Löschen', true)) store.remove('services', [s.id], ['Service gelöscht', s.name]);
      }}>Service löschen</button>
    </div>
  );
}

function Members() {
  const d = useData();
  const user = useApp(s => s.user!);
  const memberships = useApp(s => s.memberships);
  const switchVenue = useApp(s => s.switchVenue);
  const [list, setList] = useState<Member[] | null>(null);
  const [nm, setNm] = useState({ email: '', name: '', role: 'service' as Role });
  const load = () => repo.members(d.venue.id).then(setList).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, [d.venue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<void>, ok = 'Gespeichert') => { try { await fn(); toast(ok); } catch (e: any) { toast(e.message, 'err'); } load(); };
  if (!list) return <p className="muted">Lade Benutzer…</p>;
  return (
    <>
      {list.map(m => (
        <div key={m.userId} className="row mb8">
          <div style={{ flex: 2 }}><Field label="" value={m.name} onCommit={v => act(() => repo.updateMember(d.venue.id, m.userId, { name: v }))} /></div>
          <span className="muted" style={{ flex: 2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</span>
          <select style={{ flex: 2, width: 'auto' }} value={m.role} disabled={m.userId === user.id} onChange={e => act(() => repo.updateMember(d.venue.id, m.userId, { role: e.target.value as Role }))}>
            {ROLES.map(r => <option key={r} value={r}>{t(r)}</option>)}</select>
          <button className="btn small icon danger" disabled={m.userId === user.id} aria-label="Benutzer entfernen" title="Benutzer entfernen" onClick={async () => {
            if (await confirmDialog('Benutzer entfernen?', [`${m.name} (${m.email}) verliert den Zugriff auf diesen Betrieb.`], 'Entfernen', true)) act(() => repo.removeMember(d.venue.id, m.userId), 'Entfernt');
          }}><X /></button>
        </div>
      ))}
      <h4 style={{ margin: '14px 0 6px' }}>Benutzer hinzufügen</h4>
      <div className="grid3">
        <label>E-Mail<input type="email" value={nm.email} onChange={e => setNm({ ...nm, email: e.target.value })} /></label>
        <label>Name<input value={nm.name} onChange={e => setNm({ ...nm, name: e.target.value })} /></label>
        <label>Rolle<select value={nm.role} onChange={e => setNm({ ...nm, role: e.target.value as Role })}>{ROLES.map(r => <option key={r} value={r}>{t(r)}</option>)}</select></label>
      </div>
      <button className="btn small primary mt8" onClick={() => act(async () => { await repo.addMember(d.venue.id, nm.email.trim(), nm.role, nm.name.trim()); setNm({ email: '', name: '', role: 'service' }); }, 'Benutzer hinzugefügt')}>Hinzufügen</button>
      {repo.mode === 'cloud' && <p className="muted" style={{ fontSize: 12 }}>Neue Benutzer zuerst in Supabase anlegen oder einladen (<i>Authentication → Users</i>). Mit dem Link in der Einladungsmail legen sie hier ihr Passwort fest.</p>}
      {memberships.length > 1 && <button className="btn small mt8" onClick={switchVenue}>Betrieb wechseln</button>}
      <p className="muted" style={{ fontSize: 12 }}>Angemeldet als {user.email} ({t(user.role)}).</p>
    </>
  );
}

/** Thematische Gruppe: am PC aufgeklappt, am Handy eingeklappt (antippen öffnet) */
function Group({ title, hint, icon: I, children }: { title: string; hint: string; icon: LucideIcon; children: ReactNode }) {
  const [open, setOpen] = useState(() => !window.matchMedia(MOBILE).matches);
  return (
    <details className="panel settings-group" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary><I className="sg-icon" aria-hidden="true" /><span><b>{title}</b><small className="muted">{hint}</small></span><ChevronDown className="sg-chev" aria-hidden="true" /></summary>
      <div className="sg-body">{children}</div>
    </details>
  );
}

export function SettingsView() {
  const d = useData();
  const store = useApp();
  const replace = async (data: VenueData, text: string) => {
    if (await confirmDialog(text + '?', ['Alle aktuellen Daten dieses Betriebs werden ersetzt. Das lässt sich nicht rückgängig machen.'], 'Ersetzen', true))
      if (await store.replaceAll(data, text)) toast('Erledigt');
  };
  // Dienstplan-App: keine Services; Daten ersetzen hieße auch Tischplan-Daten der gemeinsamen DB überschreiben
  const roster = EDITION === 'dienstplan';
  return (
    <div className="settings">
      <div className="settings-col">
      <Group title={roster ? 'Betrieb' : 'Betrieb & Services'} hint={roster ? 'Name des Betriebs' : 'Name, Frühstück/Mittag/Abend mit Beginn und Ende'} icon={Building2}><div className="body">
        <Field label="Name des Betriebs" value={d.venue.name} onCommit={v => v.trim() && store.renameVenue(v.trim())} />
        {!roster && <>
        <p className="muted" style={{ fontSize: 12 }}>Reservierungen beginnen zum Beginn des Service (Hotelgäste zur Hotel-Standardzeit) und enden fest zum Ende – so erscheinen sie in der Zeitleiste, z. B. 18:00–20:00.</p>
        {d.services.map(s => <ServiceCard key={s.id} s={s} />)}
        <button className="btn" onClick={() => store.upsert('services', [{ id: newId(), name: 'Neuer Service', kind: 'abend', start: '17:00', end: '20:00', hotelTime: '18:00', freeSeating: false, pacing: 0,
          turnTimes: [{ maxP: 2, min: 90 }, { maxP: 99, min: 120 }], seatings: [], sort: d.services.length }])}><Plus />Service</button>
        </>}
      </div></Group>
      {!roster && <Group title="Reservierungen" hint="Status umbenennen, eigene Status anlegen" icon={CalendarDays}><StatusPanel /></Group>}
      {!roster && <Group title="Gäste-Speisekarte (QR)" hint="Logo, Titelbild, Farbe, Begrüßung" icon={QrCode}><BrandingPanel /></Group>}
      <Group title={roster ? 'Dienstplan' : 'Module & Dienstplan'} hint="Bereiche mit Icon und Leitung, Prüfregeln" icon={CalendarClock}><ModulesPanel /></Group>
      </div>
      <div className="settings-col">
        <Group title="Benutzer & Rollen" hint="Zugänge und Rechte" icon={Users}><div className="body"><Members /></div></Group>
        <Group title="Daten & Sicherung" hint="Sicherung exportieren/einspielen, Demo-Daten" icon={Database}><div className="body">
          <div className="row">
            <button className="btn" onClick={() => downloadBlob(`${APP_NAME.toLowerCase()}-sicherung-${today()}.json`, new Blob([JSON.stringify({ format: 'tischplan', version: 2, data: d }, null, 1)], { type: 'application/json' }))}><Download />Sicherung exportieren (JSON)</button>
            {!roster && <><label className="btn"><Upload />Sicherung importieren<input type="file" accept=".json" className="hidden" onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
              try {
                const j = JSON.parse(await f.text());
                if (j.format !== 'tischplan' || !j.data?.tables) throw new Error('Keine gültige Tischplan-Sicherung');
                await replace(remapIds({ ...j.data, venue: d.venue }, newId), 'Sicherung einspielen');
              } catch (err: any) { toast(err.message, 'err'); }
            }} /></label>
            <button className="btn" onClick={() => replace(demoVenueData(d.venue.id, d.venue.name), 'Demo-Daten erzeugen')}>Demo-Daten neu erzeugen</button>
            <button className="btn danger" onClick={() => replace({ ...d, stays: [], reservations: [], audit: [] }, 'Alle Reservierungen & Gäste löschen')}>Reservierungen & Gäste löschen</button></>}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>{repo.mode === 'cloud' ? 'Speicherort: Supabase-Datenbank. Geladen werden Reservierungen der letzten 120 Tage und alle künftigen.' : 'Demo-Modus: Daten nur in diesem Browser.'}</p>
        </div></Group>
        <Group title="Protokoll" hint="Letzte Änderungen" icon={History}>
          <div style={{ maxHeight: 420, overflow: 'auto' }}><table className="list"><thead><tr><th>Zeit</th><th>Benutzer</th><th>Aktion</th><th>Details</th></tr></thead>
            <tbody>{d.audit.slice(0, 150).map(a => <tr key={a.id}><td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(a.ts).toLocaleString('de-DE')}</td><td>{a.userName}</td><td>{a.action}</td><td style={{ fontSize: 12 }}>{a.details}</td></tr>)}</tbody>
          </table></div>
        </Group>
      </div>
    </div>
  );
}
