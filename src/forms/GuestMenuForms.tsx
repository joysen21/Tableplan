/** Gäste-Speisekarte (QR) – Personalseite: Erscheinungsbild, QR-Codes drucken, Gäste-Auswahl im Menü */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Upload, X } from '../ui/icons';
import { repo } from '../data';
import { brandingOf, choiceSummary, guestUrl, newQrToken, orderingOf } from '../domain/guestMenu';
import type { Branding, DiningTable, Menu, MenuOrdering } from '../domain/types';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { closeDialog, openDialog } from '../store/dialogs';
import { Modal } from '../ui/Modal';
import { confirmDialog, toast } from '../ui/notify';

const linkFor = (tb: DiningTable) => guestUrl(location.origin, tb.qrToken ?? '', repo.mode === 'demo');

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
  const first = d.tables.find(x => x.qrToken);
  return (
    <div className="panel mt12"><h3>Gäste-Speisekarte (QR)</h3><div className="body">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Hotelgäste scannen den QR-Code auf ihrem Tisch und wählen je Gang ihr Gericht – die Küche sieht die Portionen sofort.
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
        <button className="btn" onClick={() => openDialog({ type: 'qrprint' })}><Printer />QR-Codes drucken</button>
        {first && <a className="btn" href={linkFor(first)} target="_blank" rel="noreferrer">Vorschau (Tisch {first.name})</a>}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Ob Gäste ein Menü sehen und wählen dürfen, legt die Küche je Menü fest (Menü → „Gäste-Auswahl“).</p>
    </div></div>
  );
}

/* ---------------------------------------------------------------- QR-Codes drucken */
export function QrPrint() {
  const d = useData();
  const [roomId, setRoomId] = useState<string>('');
  const b = brandingOf(d.venue);
  const tables = d.tables.filter(x => x.qrToken && (!roomId || x.roomId === roomId))
    .sort((a, c) => a.name.localeCompare(c.name, 'de', { numeric: true }));
  return (
    <Modal title="QR-Codes für die Tische" onClose={closeDialog} width={900}
      footer={<><span className="spacer" /><button className="btn" onClick={closeDialog}>Schließen</button><button className="btn primary" onClick={() => window.print()}><Printer />Drucken / PDF</button></>}>
      <div className="row no-print mb8">
        <label>Raum<select value={roomId} onChange={e => setRoomId(e.target.value)} style={{ width: 'auto' }}>
          <option value="">alle Räume</option>{d.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <span className="muted" style={{ fontSize: 12 }}>{tables.length} Karten · auf A4 drucken, ausschneiden und als Tischaufsteller verwenden.</span>
      </div>
      <div className="qr-cards print-area" style={{ '--brand': b.color } as React.CSSProperties}>
        {tables.map(tb => (
          <div key={tb.id} className="qr-card">
            <div className="qr-card-head">{b.logoUrl ? <img src={b.logoUrl} alt="" /> : <b>{b.title}</b>}</div>
            <QrSvg text={linkFor(tb)} size={150} />
            <div className="qr-card-text"><b>Menü wählen</b><span>Scegli il menù · Choose your menu</span></div>
            <div className="qr-card-table">Tisch {tb.name}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Raumplan-Editor: QR-Code eines Tisches anzeigen / erneuern (z. B. wenn eine Karte verloren ging) */
export function TableQr({ tb, onRenew }: { tb: DiningTable; onRenew: (token: string) => void }) {
  if (!tb.qrToken) return null;
  return (
    <div className="table-qr mt8">
      <QrSvg text={linkFor(tb)} size={72} />
      <div>
        <a href={linkFor(tb)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Gäste-Speisekarte öffnen</a>
        <button className="btn small mt8" onClick={async () => {
          if (await confirmDialog('QR-Code erneuern?', ['Der bisherige QR-Code dieses Tisches funktioniert danach nicht mehr – die Karte muss neu gedruckt werden.'], 'Erneuern'))
            onRenew(newQrToken());
        }}>QR-Code erneuern</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Menü: Gäste-Auswahl */
const ORDERING: { v: MenuOrdering; label: string }[] = [
  { v: 'aus', label: 'Aus – Gäste sehen das Menü nicht' },
  { v: 'offen', label: 'Offen – Gäste wählen per QR-Code' },
  { v: 'geschlossen', label: 'Geschlossen – nur anzeigen, keine Änderungen' }
];
export function GuestChoicePanel({ m, ro, onOrdering }: { m: Menu; ro: boolean; onOrdering: (o: MenuOrdering) => void }) {
  const d = useData();
  const s = choiceSummary(d, m);
  const ord = orderingOf(m);
  return (
    <div className="guest-choice mt12">
      <h4 style={{ margin: '0 0 6px' }}>Gäste-Auswahl (QR)</h4>
      <div className="row">
        <select value={ord} disabled={ro} onChange={e => onOrdering(e.target.value as MenuOrdering)} style={{ width: 'auto' }} aria-label="Gäste-Auswahl">
          {ORDERING.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
        {s.rooms > 0 && <span className={'badge' + (s.chosenRooms < s.rooms ? ' warn' : '')}>{s.chosenRooms} von {s.rooms} Zimmern gewählt · {s.chosenPersons}/{s.persons} Pers.</span>}
      </div>
      {s.open.length > 0 && ord !== 'aus' && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Noch ohne Auswahl: {s.open.map(o => `Zi. ${o.roomNo} (${o.persons}P, ${o.tables.join('+') || 'ohne Tisch'})`).join(' · ')}</p>}
      {ord === 'aus' && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Gewählte Gerichte zählen fest, nur der Rest wird nach den Anteilen geschätzt. Nur Menüs von heute und morgen erscheinen bei den Gästen.</p>}
    </div>
  );
}
