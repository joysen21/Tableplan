/** Gäste-Speisekarte (QR) – Personalseite: Erscheinungsbild, QR-Codes drucken, Gäste-Auswahl im Menü */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Upload, X } from '../ui/icons';
import { repo } from '../data';
import { brandingOf, choiceSummary, DEFAULT_QR_WINDOW, guestUrl, menuState, newQrToken, orderingOf } from '../domain/guestMenu';
import { byId } from '../domain/logic';
import type { Branding, Menu, MenuOrdering } from '../domain/types';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { closeDialog, openDialog } from '../store/dialogs';
import { Modal } from '../ui/Modal';
import { confirmDialog, toast } from '../ui/notify';

/** Adresse im QR-Code des Betriebs – ein Code für alle Tische */
const venueLink = (token: string | undefined) => guestUrl(location.origin, token ?? '', repo.mode === 'demo');

/** QR-Code als SVG (wird im Browser erzeugt, keine externen Dienste) */
export function QrSvg({ text, size = 160 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setSvg).catch(() => setSvg('')); }, [text]);
  return <span className="qr-svg" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* ---------------------------------------------------------------- Einstellungen: Erscheinungsbild */
export function BrandingPanel() {
  const d = useData();
  const store = useApp();
  const cur = brandingOf(d.venue);
  const [b, setB] = useState<Branding>(cur);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(b) !== JSON.stringify(cur);
  const upd = (p: Partial<Branding>) => setB(prev => ({ ...prev, ...p }));
  async function upload(f: File, key: 'logoUrl' | 'coverUrl') {
    setBusy(true);
    try { upd({ [key]: await repo.uploadBackground(d.venue.id, f) }); } catch (e: any) { toast(e.message, 'err'); }
    setBusy(false);
  }
  return (
    <div className="panel mt12"><h3>Gäste-Speisekarte (QR)</h3><div className="body">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Ein QR-Code für alle Tische: Gäste scannen ihn, wählen ihr Zimmer bzw. ihren Tisch und je Gang ihr Gericht – die Küche sieht die Portionen sofort.
        So sieht die Seite für Ihre Gäste aus:</p>
      <div className="grid2">
        <label>Titel<input value={b.title} placeholder={d.venue.name} onChange={e => upd({ title: e.target.value })} /></label>
        <label>Akzentfarbe<input type="color" value={b.color} onChange={e => upd({ color: e.target.value })} /></label>
      </div>
      <label className="mt8">Begrüßung<textarea value={b.welcome} placeholder="z. B. Herzlich willkommen! Wählen Sie hier Ihr Abendmenü." onChange={e => upd({ welcome: e.target.value })} /></label>
      <div className="grid2">
        <label className="mt8">Begrüßung italienisch<textarea value={b.welcomeIt ?? ''} placeholder="Benvenuti! …" onChange={e => upd({ welcomeIt: e.target.value })} /></label>
        <label className="mt8">Begrüßung englisch<textarea value={b.welcomeEn ?? ''} placeholder="Welcome! …" onChange={e => upd({ welcomeEn: e.target.value })} /></label>
      </div>
      <div className="brand-images mt8">
        <div><span className="muted">Logo</span>{b.logoUrl ? <img src={b.logoUrl} alt="Logo" /> : <span className="muted">–</span>}
          <div className="row"><label className="btn small"><Upload />Hochladen<input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f, 'logoUrl'); }} /></label>
            {b.logoUrl && <button className="btn small icon" aria-label="Logo entfernen" title="Entfernen" onClick={() => upd({ logoUrl: null })}><X /></button>}</div></div>
        <div><span className="muted">Titelbild</span>{b.coverUrl ? <img src={b.coverUrl} alt="Titelbild" /> : <span className="muted">–</span>}
          <div className="row"><label className="btn small"><Upload />Hochladen<input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f, 'coverUrl'); }} /></label>
            {b.coverUrl && <button className="btn small icon" aria-label="Titelbild entfernen" title="Entfernen" onClick={() => upd({ coverUrl: null })}><X /></button>}</div></div>
      </div>
      <div className="row mt12">
        <button className="btn primary" disabled={!dirty || busy} onClick={async () => { if (await store.setBranding(b)) toast('Gespeichert'); }}>Speichern</button>
        <button className="btn" onClick={() => openDialog({ type: 'qrprint' })}><Printer />QR-Code drucken</button>
        {d.venue.qrToken && <a className="btn" href={venueLink(d.venue.qrToken)} target="_blank" rel="noreferrer">Vorschau für Gäste</a>}
      </div>
      <QrWindowFields />
      <p className="muted" style={{ fontSize: 12 }}>Abendmenüs öffnen und schließen automatisch in diesem Zeitfenster. Die Küche kann jedes Menü von Hand übersteuern (Menü → „Gäste-Auswahl“).</p>
    </div></div>
  );
}

/** Zeitfenster der automatischen QR-Menüwahl (Standard 21 Uhr am Vorabend bis 10 Uhr) */
function QrWindowFields() {
  const d = useData();
  const store = useApp();
  const cur = { ...DEFAULT_QR_WINDOW, ...d.venue.qrWindow };
  const save = async (p: Partial<typeof cur>) => {
    const next = { ...cur, ...p };
    if (next.open === cur.open && next.close === cur.close) return;
    if (await store.setQrWindow(next)) toast('Zeitfenster gespeichert');
  };
  return (
    <div className="row mt8 qr-window" role="group" aria-label="QR-Zeitfenster">
      <span>Menüwahl automatisch ab</span>
      <input type="time" aria-label="Öffnet am Vorabend um" defaultValue={cur.open} key={'o' + cur.open} onBlur={e => e.target.value && save({ open: e.target.value })} style={{ width: 'auto' }} />
      <span>Uhr am Vorabend bis</span>
      <input type="time" aria-label="Schließt am Tag um" defaultValue={cur.close} key={'c' + cur.close} onBlur={e => e.target.value && save({ close: e.target.value })} style={{ width: 'auto' }} />
      <span>Uhr am Tag selbst</span>
    </div>
  );
}

/* ---------------------------------------------------------------- QR-Code drucken (einer für alle Tische) */
export function QrPrint() {
  const d = useData();
  const store = useApp();
  const [copies, setCopies] = useState(6);
  const b = brandingOf(d.venue);
  const link = venueLink(d.venue.qrToken);
  async function renew() {
    if (await confirmDialog('QR-Code erneuern?', ['Der bisherige QR-Code funktioniert danach nicht mehr – alle Karten müssen neu gedruckt werden.'], 'Erneuern', true))
      if (await store.setQrToken(newQrToken())) toast('Neuer QR-Code erstellt');
  }
  return (
    <Modal title="QR-Code der Gäste-Speisekarte" onClose={closeDialog} width={900}
      footer={<><button className="btn danger" onClick={renew}>QR-Code erneuern</button><span className="spacer" /><button className="btn" onClick={closeDialog}>Schließen</button>
        <button className="btn primary" disabled={!d.venue.qrToken} onClick={() => window.print()}><Printer />Drucken / PDF</button></>}>
      <div className="row no-print mb8">
        <label>Anzahl Karten<input type="number" min={1} max={60} value={copies} onChange={e => setCopies(Math.min(60, Math.max(1, +e.target.value || 1)))} style={{ width: 90 }} /></label>
        <span className="muted" style={{ fontSize: 12 }}>Ein Code für alle Tische · auf A4 drucken, ausschneiden und auf die Tische stellen.
          {' '}<a href={link} target="_blank" rel="noreferrer">Gäste-Seite öffnen</a></span>
      </div>
      {!d.venue.qrToken ? <p className="warnbox">Noch kein QR-Code vorhanden – bitte die Datenbank-Migration 20261022000000 ausführen.</p> :
      <div className="qr-cards print-area" style={{ '--brand': b.color } as React.CSSProperties}>
        {Array.from({ length: copies }, (_, i) => (
          <div key={i} className="qr-card">
            <div className="qr-card-head">{b.logoUrl ? <img src={b.logoUrl} alt="" /> : <b>{b.title}</b>}</div>
            <QrSvg text={link} size={150} />
            <div className="qr-card-text"><b>Menü wählen</b><span>Scegli il menù · Choose your menu</span></div>
          </div>
        ))}
      </div>}
    </Modal>
  );
}

/* ---------------------------------------------------------------- Menü: Gäste-Auswahl */
const ORDERING: { v: MenuOrdering; label: string }[] = [
  { v: 'auto', label: 'Automatisch – Vorabend bis Vormittag (Zeiten in den Einstellungen)' },
  { v: 'aus', label: 'Aus – Gäste sehen das Menü nicht' },
  { v: 'offen', label: 'Offen – Gäste wählen per QR-Code' },
  { v: 'geschlossen', label: 'Geschlossen – nur anzeigen, keine Änderungen' }
];
export function GuestChoicePanel({ m, ro, onOrdering }: { m: Menu; ro: boolean; onOrdering: (o: MenuOrdering) => void }) {
  const d = useData();
  const s = choiceSummary(d, m);
  const ord = orderingOf(m);
  const state = menuState(m, d.venue);
  const w = { ...DEFAULT_QR_WINDOW, ...d.venue.qrWindow };
  const free = !!byId(d.services, m.serviceId)?.freeSeating;
  return (
    <div className="guest-choice mt12">
      <h4 style={{ margin: '0 0 6px' }}>Gäste-Auswahl (QR)</h4>
      <div className="row">
        <select value={ord} disabled={ro} onChange={e => onOrdering(e.target.value as MenuOrdering)} style={{ width: 'auto' }} aria-label="Gäste-Auswahl">
          {ORDERING.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
        {ord === 'auto' && <span className="badge" title={`Gäste wählen ab ${w.open} Uhr am Vorabend bis ${w.close} Uhr`}>jetzt: {state === 'offen' ? 'offen' : state === 'aus' ? `öffnet am Vorabend ${w.open}` : 'geschlossen'}</span>}
        {s.rooms > 0 && <span className={'badge' + (s.chosenRooms < s.rooms ? ' warn' : '')}>{s.chosenRooms} von {s.rooms} gewählt · {s.chosenPersons}/{s.persons} Pers.</span>}
      </div>
      {s.open.length > 0 && ord !== 'aus' && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Noch ohne Auswahl: {s.open.map(o => `${o.label} (${o.persons}P)`).join(' · ')}</p>}
      {free && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Freie Platzwahl: Gäste wählen beim QR-Code (jeder Tisch) ihr Zimmer aus allen Zimmern mit dieser Mahlzeit.</p>}
      {s.notes.length > 0 && <div className="infobox" style={{ fontSize: 13, marginTop: 6 }}>{s.notes.map(n => <div key={n.label}>📝 <b>{n.label}:</b> {n.note}</div>)}</div>}
      {ord === 'aus' && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Gewählte Gerichte zählen fest, nur der Rest wird nach den Anteilen geschätzt. Nur Menüs von heute und morgen erscheinen bei den Gästen.</p>}
    </div>
  );
}
