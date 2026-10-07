/** Einstellungen (Admin): Betrieb, Services, Benutzer & Rollen, Daten, Protokoll */
import { useEffect, useState } from 'react';
import { Download, Plus, Upload, X } from 'lucide-react';
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
        <Field label="Letzte Reservierung" type="time" value={s.end} onCommit={v => v && save({ end: v })} />
        <Field label="Pacing" type="number" value={s.pacing} onCommit={v => save({ pacing: Math.max(0, +v || 0) })} />
      </div>
      <div className="grid2 mt8">
        <Field label="Verweildauer" value={s.turnTimes.map(x => `${x.maxP}:${x.min}`).join(', ')} onCommit={v => {
          const rows = v.split(',').map(x => x.split(':').map(Number)).filter(x => x.length === 2 && x[0] > 0 && x[1] > 0).map(([maxP, min]) => ({ maxP, min }));
          if (!rows.length) return toast('Format: 2:90, 4:120, 99:150', 'err');
          save({ turnTimes: rows.sort((a, b) => a.maxP - b.maxP) });
        }} />
        <Field label="Seatings" value={s.seatings.join(', ')} onCommit={v => save({ seatings: v.split(/[,; ]+/).filter(x => /^\d{1,2}:\d{2}$/.test(x)) })} />
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

export function SettingsView() {
  const d = useData();
  const store = useApp();
  const replace = async (data: VenueData, text: string) => {
    if (await confirmDialog(text + '?', ['Alle aktuellen Daten dieses Betriebs werden ersetzt. Das lässt sich nicht rückgängig machen.'], 'Ersetzen', true))
      if (await store.replaceAll(data, text)) toast('Erledigt');
  };
  return (
    <div className="hotel">
      <div className="panel"><h3>Betrieb & Services</h3><div className="body">
        <Field label="Name des Betriebs" value={d.venue.name} onCommit={v => v.trim() && store.renameVenue(v.trim())} />
        <p className="muted" style={{ fontSize: 12 }}>Verweildauer: „bis Personen:Minuten“, z. B. <code>2:105, 4:120, 6:150, 99:180</code>. Pacing = max. ankommende Gäste je 15 Min. (0 = aus). Seatings = feste Zeiten, z. B. 18:30, 20:30.</p>
        {d.services.map(s => <ServiceCard key={s.id} s={s} />)}
        <button className="btn" onClick={() => store.upsert('services', [{ id: newId(), name: 'Neuer Service', kind: 'abend', start: '17:00', end: '20:00', hotelTime: '18:00', freeSeating: false, pacing: 0,
          turnTimes: [{ maxP: 2, min: 90 }, { maxP: 99, min: 120 }], seatings: [], sort: d.services.length }])}><Plus />Service</button>
      </div></div>
      <div>
        <div className="panel"><h3>Benutzer & Rollen</h3><div className="body"><Members /></div></div>
        <div className="panel mt12"><h3>Daten</h3><div className="body">
          <div className="row">
            <button className="btn" onClick={() => downloadBlob(`tischplan-sicherung-${today()}.json`, new Blob([JSON.stringify({ format: 'tischplan', version: 2, data: d }, null, 1)], { type: 'application/json' }))}><Download />Sicherung exportieren (JSON)</button>
            <label className="btn"><Upload />Sicherung importieren<input type="file" accept=".json" className="hidden" onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
              try {
                const j = JSON.parse(await f.text());
                if (j.format !== 'tischplan' || !j.data?.tables) throw new Error('Keine gültige Tischplan-Sicherung');
                await replace(remapIds({ ...j.data, venue: d.venue }, newId), 'Sicherung einspielen');
              } catch (err: any) { toast(err.message, 'err'); }
            }} /></label>
            <button className="btn" onClick={() => replace(demoVenueData(d.venue.id, d.venue.name), 'Demo-Daten erzeugen')}>Demo-Daten neu erzeugen</button>
            <button className="btn danger" onClick={() => replace({ ...d, stays: [], reservations: [], audit: [] }, 'Alle Reservierungen & Gäste löschen')}>Reservierungen & Gäste löschen</button>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>{repo.mode === 'cloud' ? 'Speicherort: Supabase-Datenbank. Geladen werden Reservierungen der letzten 120 Tage und alle künftigen.' : 'Demo-Modus: Daten nur in diesem Browser.'}</p>
        </div></div>
        <div className="panel mt12"><h3>Protokoll (letzte Änderungen)</h3>
          <div style={{ maxHeight: 420, overflow: 'auto' }}><table className="list"><thead><tr><th>Zeit</th><th>Benutzer</th><th>Aktion</th><th>Details</th></tr></thead>
            <tbody>{d.audit.slice(0, 150).map(a => <tr key={a.id}><td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(a.ts).toLocaleString('de-DE')}</td><td>{a.userName}</td><td>{a.action}</td><td style={{ fontSize: 12 }}>{a.details}</td></tr>)}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
