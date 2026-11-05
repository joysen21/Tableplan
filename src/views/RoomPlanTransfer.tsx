/** Raumplan exportieren / importieren (Raumplan-Editor und Einstellungen → Daten & Sicherung) */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Upload } from '../ui/icons';
import { newId } from '../domain/demo';
import { newQrToken } from '../domain/guestMenu';
import { buildImport, exportRoomPlan, importRows, parseRoomPlan, type ImportChoice, type RoomPlanFile } from '../domain/roomPlan';
import { downloadBlob } from '../lib/download';
import { today } from '../lib/time';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { useUi } from '../store/ui';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/notify';

export function RoomPlanExport({ className = 'btn' }: { className?: string }) {
  const d = useData();
  return <button className={className} disabled={!d.rooms.length} onClick={() => {
    const f = exportRoomPlan(d);
    const slug = d.venue.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'betrieb';
    downloadBlob(`raumplan-${slug}-${today()}.json`, new Blob([JSON.stringify(f, null, 1)], { type: 'application/json' }));
    toast(`Raumplan exportiert (${f.rooms.length} ${f.rooms.length === 1 ? 'Raum' : 'Räume'}, ${f.tables.length} Tische)`);
  }}><Download />Raumplan exportieren</button>;
}

export function RoomPlanImport({ className = 'btn' }: { className?: string }) {
  const [plan, setPlan] = useState<RoomPlanFile | null>(null);
  return <>
    <label className={className}><Upload />Raumplan importieren<input type="file" accept=".json,application/json" className="hidden" aria-label="Raumplan-Datei wählen" onChange={async e => {
      const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
      try { setPlan(parseRoomPlan(await f.text())); } catch (err: any) { toast(err.message, 'err'); }
    }} /></label>
    {plan && createPortal(<ImportDialog plan={plan} onClose={() => setPlan(null)} />, document.body)}
  </>;
}

function ImportDialog({ plan, onClose }: { plan: RoomPlanFile; onClose: () => void }) {
  const d = useData();
  const store = useApp();
  const ui = useUi();
  const day = today();
  const rows = importRows(d, plan, day);
  const [choice, setChoice] = useState<Record<string, ImportChoice>>({});
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const r = buildImport(d, plan, choice, day, newId, newQrToken);
    const what = [...r.summary.added.map(n => `${n} (neu)`), ...r.summary.replaced.map(n => `${n} (ersetzt)`)].join(', ');
    const steps: (() => Promise<boolean>)[] = [];
    const up = <K extends 'stations' | 'rooms' | 'tables' | 'decor' | 'layouts' | 'combos'>(k: K, log?: [string, string]) => {
      if (r.upsert[k].length) steps.push(() => store.upsert(k, r.upsert[k] as any, log));
    };
    const rm = (k: 'tables' | 'decor' | 'layouts' | 'combos') => { if (r.remove[k].length) steps.push(() => store.remove(k, r.remove[k])); };
    rm('combos'); rm('layouts'); rm('decor'); rm('tables');
    up('stations'); up('rooms', ['Raumplan importiert', `aus ${plan.venueName || 'Datei'}: ${what}`]); up('tables'); up('decor'); up('layouts'); up('combos');
    for (const s of steps) if (!(await s())) { setBusy(false); return; }
    toast(`Raumplan importiert: ${what}`);
    ui.set({ editRoomId: r.upsert.rooms[0]?.id ?? null, editSel: null });
    onClose();
  }

  return (
    <Modal title="Raumplan importieren" onClose={onClose} width={620} footer={<>
      <button className="btn" onClick={onClose}>Abbrechen</button>
      <span className="spacer" />
      <button className="btn primary" disabled={busy} onClick={run}><Upload />Importieren</button>
    </>}>
      <p className="muted" style={{ marginTop: 0 }}>
        {plan.rooms.length} {plan.rooms.length === 1 ? 'Raum' : 'Räume'} aus „{plan.venueName || 'unbekannt'}“
        {plan.exportedAt ? `, exportiert am ${new Date(plan.exportedAt).toLocaleDateString('de-DE')}` : ''}. Reservierungen und Gäste werden nicht übertragen.
      </p>
      <div className="rp-import" role="list" aria-label="Räume in der Datei">
        {rows.map(row => {
          const locked = !!row.existing && row.future > 0;
          const c = locked ? 'neu' : choice[row.room.id] ?? 'neu';
          return (
            <div key={row.room.id} role="listitem" className="rp-import-row" aria-label={row.room.name}>
              <div><b>{row.room.name}</b><span className="muted"> · {row.tables} Tische</span>
                {!row.existing && <div className="muted rp-note">neu</div>}
                {row.existing && !locked && <div className="muted rp-note">existiert schon</div>}
                {locked && <div className="rp-note rp-warn">existiert schon · ⚠ {row.future} {row.future === 1 ? 'Reservierung' : 'Reservierungen'} ab heute, daher nur „Neu anlegen“</div>}
              </div>
              {row.existing && <div className="seg" role="group" aria-label={`Vorgehen ${row.room.name}`}>
                <button className="btn small" aria-pressed={c === 'neu'} onClick={() => setChoice({ ...choice, [row.room.id]: 'neu' })}>Neu anlegen</button>
                <button className="btn small" aria-pressed={c === 'ersetzen'} disabled={locked} onClick={() => setChoice({ ...choice, [row.room.id]: 'ersetzen' })}>Ersetzen</button>
              </div>}
            </div>
          );
        })}
      </div>
      {rows.some(r => r.existing && (choice[r.room.id] ?? 'neu') === 'ersetzen' && !r.future) &&
        <p className="infobox mt8">Beim Ersetzen bleiben gleichnamige Tische erhalten (mit QR-Code und bisherigen Reservierungen); Tische, die in der Datei fehlen, werden gelöscht.</p>}
    </Modal>
  );
}
