/** Raumplan-Editor (Admin): Räume, Tische, Deko, Reviere, Kombinationen, Layout-Varianten */
import { useRef, useState, type PointerEvent as RPE } from 'react';
import { repo } from '../data';
import { newId } from '../domain/demo';
import { FEATURES } from '../domain/constants';
import { byId, capacity, occupies, tableNames } from '../domain/logic';
import type { Decor, DecorKind, DiningTable, Layout, Room, TableShape } from '../domain/types';
import { t } from '../lib/i18n';
import { snap, today } from '../lib/time';
import { useApp } from '../store/app';
import { useData } from '../store/hooks';
import { useUi } from '../store/ui';
import { svgPoint } from '../ui/drag';
import { confirmDialog, toast } from '../ui/feedback';
import { FloorPlan } from '../ui/FloorPlan';

const SHAPES: TableShape[] = ['round', 'square', 'rect', 'bench'];
const DECOR: DecorKind[] = ['wall', 'door', 'bar', 'buffet', 'column', 'plant', 'label'];

/** Eingabefeld, das erst beim Verlassen (oder Enter) speichert */
function Field({ label, value, type = 'text', onCommit, step }: { label: string; value: string | number; type?: string; step?: number; onCommit: (v: string) => void }) {
  const [v, setV] = useState(String(value));
  const [last, setLast] = useState(String(value));
  if (String(value) !== last) { setLast(String(value)); setV(String(value)); }
  return <label>{label}<input type={type} step={step} value={v} onChange={e => setV(e.target.value)} onBlur={() => v !== String(value) && onCommit(v)}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>;
}

export function EditorView() {
  const d = useData();
  const store = useApp();
  const ui = useUi();
  const svgRef = useRef<SVGSVGElement>(null);
  const [preview, setPreview] = useState<{ id: string; x: number; y: number; width: number; height: number } | null>(null);
  const [comboText, setComboText] = useState('');
  const room = byId(d.rooms, ui.editRoomId) ?? d.rooms[0];
  const selT = byId(d.tables, ui.editSel), selD = byId(d.decor, ui.editSel);
  const layouts = d.layouts.filter(l => l.roomId === room?.id);
  // Vorschau während des Ziehens (ohne bei jeder Bewegung zu speichern)
  const view = preview ? {
    ...d,
    tables: d.tables.map(x => (x.id === preview.id ? { ...x, ...preview } : x)),
    decor: d.decor.map(x => (x.id === preview.id ? { ...x, ...preview } : x))
  } : d;

  const saveTable = (tb: DiningTable, patch: Partial<DiningTable>) => {
    const next = { ...tb, ...patch };
    if (next.minPersons > next.maxPersons) next.maxPersons = next.minPersons;
    if (next.shape === 'round' || next.shape === 'square') { if ('width' in patch) next.height = next.width; else if ('height' in patch) next.width = next.height; }
    return store.upsert('tables', [next]);
  };
  const saveDecor = (x: Decor, patch: Partial<Decor>) => store.upsert('decor', [{ ...x, ...patch }]);
  const saveRoom = (r: Room, patch: Partial<Room>) => store.upsert('rooms', [{ ...r, ...patch }]);

  function startMove(e: RPE, id: string, kind: 'table' | 'decor', resize = false) {
    if (!room || !svgRef.current) return;
    ui.set({ editSel: id });
    e.preventDefault(); e.stopPropagation();
    const obj = (kind === 'table' ? byId(d.tables, id) : byId(d.decor, id))!;
    const p0 = svgPoint(svgRef.current, e);
    let cur = { id, x: obj.x, y: obj.y, width: obj.width, height: obj.height }, moved = false;
    const square = kind === 'table' && ((obj as DiningTable).shape === 'round' || (obj as DiningTable).shape === 'square');
    const mv = (ev: PointerEvent) => {
      if (!svgRef.current) return;
      const p = svgPoint(svgRef.current, ev), dx = p.x - p0.x, dy = p.y - p0.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      if (resize) { const w = Math.max(20, snap(obj.width + dx * 2, 2)); cur = { ...cur, width: w, height: square ? w : Math.max(10, snap(obj.height + dy * 2, 2)) }; }
      else cur = { ...cur, x: Math.min(room.width, Math.max(0, snap(obj.x + dx, 10))), y: Math.min(room.height, Math.max(0, snap(obj.y + dy, 10))) };
      setPreview(cur);
    };
    const up = async () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (moved) {
        const { id: _i, ...patch } = cur;
        if (kind === 'table') await saveTable(obj as DiningTable, patch); else await saveDecor(obj as Decor, patch);
      }
      setPreview(null);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  async function addRoom() {
    const r: Room = { id: newId(), name: 'Neuer Raum', width: 900, height: 600, backgroundUrl: null, sort: d.rooms.length };
    if (await store.upsert('rooms', [r], ['Raum angelegt', r.name])) ui.set({ editRoomId: r.id, editSel: null });
  }
  async function deleteRoom(r: Room) {
    const n = d.tables.filter(x => x.roomId === r.id).length;
    if (!(await confirmDialog('Raum löschen?', [`${r.name} mit ${n} Tischen wird gelöscht. Zugewiesene Reservierungen verlieren ihren Tisch.`], 'Löschen', true))) return;
    if (await store.remove('rooms', [r.id], ['Raum gelöscht', r.name])) ui.set({ editRoomId: null, editSel: null });
  }
  async function addTable(shape: TableShape) {
    if (!room) return;
    const dims = { round: [90, 90, 2, 4], square: [70, 70, 2, 4], rect: [160, 80, 4, 8], bench: [60, 160, 3, 5] }[shape];
    let n = d.tables.length + 1; while (d.tables.some(x => x.name === 'T' + n)) n++;
    const tb: DiningTable = { id: newId(), roomId: room.id, name: 'T' + n, shape, x: room.width / 2, y: room.height / 2, width: dims[0], height: dims[1], rotation: 0, minPersons: dims[2], maxPersons: dims[3], stationId: null, features: [] };
    if (await store.upsert('tables', [tb], ['Tisch angelegt', tb.name])) ui.set({ editSel: tb.id });
  }
  async function addDecor(kind: DecorKind) {
    if (!room) return;
    const dims = { wall: [300, 10], door: [80, 14], bar: [200, 50], buffet: [60, 200], column: [26, 26], plant: [40, 40], label: [160, 20] }[kind];
    const x: Decor = { id: newId(), roomId: room.id, kind, x: room.width / 2, y: room.height / 2, width: dims[0], height: dims[1], rotation: 0, label: kind === 'label' ? 'Text' : '' };
    if (await store.upsert('decor', [x])) ui.set({ editSel: x.id });
  }
  async function deleteSelected() {
    if (selT) {
      const refs = d.reservations.filter(r => r.tableIds.includes(selT.id) && r.date >= today() && occupies(r)).length;
      if (refs && !(await confirmDialog('Tisch löschen?', [`${refs} künftige Reservierung(en) verlieren den Tisch ${selT.name}.`], 'Löschen', true))) return;
      if (await store.remove('tables', [selT.id], ['Tisch gelöscht', selT.name])) ui.set({ editSel: null });
    } else if (selD && (await store.remove('decor', [selD.id]))) ui.set({ editSel: null });
  }
  async function duplicate() {
    if (selT) {
      let n = 2; while (d.tables.some(x => x.name === `${selT.name}-${n}`)) n++;
      const c = { ...selT, id: newId(), name: `${selT.name}-${n}`, x: selT.x + 30, y: selT.y + 30 };
      if (await store.upsert('tables', [c])) ui.set({ editSel: c.id });
    } else if (selD) {
      const c = { ...selD, id: newId(), x: selD.x + 30, y: selD.y + 30 };
      if (await store.upsert('decor', [c])) ui.set({ editSel: c.id });
    }
  }
  async function uploadBg(file: File) {
    if (!room) return;
    if (file.size > 5_000_000) return toast('Bild zu groß (max. 5 MB)', 'err');
    try { const url = await repo.uploadBackground(d.venue.id, file); await saveRoom(room, { backgroundUrl: url }); toast('Grundriss gespeichert'); }
    catch (e: any) { toast('Upload fehlgeschlagen: ' + e.message, 'err'); }
  }
  async function saveLayout() {
    if (!room) return;
    const name = prompt('Name der Layout-Variante (z. B. Bankett, Sommer, Hochzeit)');
    if (!name) return;
    const positions: Layout['positions'] = {};
    d.tables.filter(x => x.roomId === room.id).forEach(x => { positions[x.id] = { x: x.x, y: x.y, rotation: x.rotation, width: x.width, height: x.height, shape: x.shape, minPersons: x.minPersons, maxPersons: x.maxPersons }; });
    await store.upsert('layouts', [{ id: newId(), roomId: room.id, name, positions }], ['Layout-Variante gespeichert', name]);
  }
  async function loadLayout(l: Layout) {
    const rows = d.tables.filter(x => l.positions[x.id]).map(x => ({ ...x, ...l.positions[x.id] }));
    if (await store.upsert('tables', rows, ['Layout-Variante geladen', l.name])) toast(`Layout „${l.name}“ aktiv`);
  }
  async function addCombo() {
    const names = comboText.split(/[+,; ]+/).filter(Boolean);
    const ids = names.map(n => d.tables.find(x => x.name.toLowerCase() === n.toLowerCase())?.id);
    if (ids.length < 2 || ids.some(x => !x)) return toast('Mindestens zwei gültige Tischnamen, z. B. T7+T8', 'err');
    if (await store.upsert('combos', [{ id: newId(), name: names.join('+'), tableIds: ids as string[] }], ['Kombination angelegt', names.join('+')])) setComboText('');
  }

  return (
    <div className="editor">
      <div className="panel toolbox">
        <h3>Raum</h3>
        <div className="body">
          <select value={room?.id ?? ''} onChange={e => ui.set({ editRoomId: e.target.value, editSel: null })}>{d.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          {room && <>
            <div className="mt8"><Field label="Name" value={room.name} onCommit={v => v.trim() && saveRoom(room, { name: v.trim() })} /></div>
            <div className="grid2 mt8">
              <Field label="Breite" type="number" step={50} value={room.width} onCommit={v => saveRoom(room, { width: Math.min(5000, Math.max(300, +v || 300)) })} />
              <Field label="Höhe" type="number" step={50} value={room.height} onCommit={v => saveRoom(room, { height: Math.min(5000, Math.max(200, +v || 200)) })} />
            </div>
            <label className="mt8">Grundriss-Bild<input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadBg(f); e.target.value = ''; }} /></label>
            {room.backgroundUrl && <button className="btn small mt8" onClick={() => saveRoom(room, { backgroundUrl: null })}>Bild entfernen</button>}
          </>}
          <button className="btn mt12" onClick={addRoom}>＋ Neuer Raum</button>
          {room && <button className="btn danger" onClick={() => deleteRoom(room)}>Raum löschen</button>}
        </div>
        <h3>Tisch hinzufügen</h3>
        <div className="body">{SHAPES.map(s => <button key={s} className="btn" onClick={() => addTable(s)}>{t(s)}</button>)}</div>
        <h3>Element hinzufügen</h3>
        <div className="body">{DECOR.map(k => <button key={k} className="btn" onClick={() => addDecor(k)}>{t(k)}</button>)}</div>
        <h3>Layout-Varianten</h3>
        <div className="body">
          {layouts.length ? layouts.map(l => (
            <div key={l.id} className="row mb8"><button className="btn small" style={{ flex: 1 }} onClick={() => loadLayout(l)}>{l.name}</button>
              <button className="btn small danger" aria-label="Variante löschen" onClick={() => store.remove('layouts', [l.id])}>✕</button></div>
          )) : <p className="muted" style={{ margin: '0 0 6px', fontSize: 12 }}>Keine Varianten gespeichert.</p>}
          <button className="btn small" onClick={saveLayout}>Aktuelles Layout speichern…</button>
        </div>
      </div>

      <div className="panel">
        <div className="plan-wrap">{room ? <FloorPlan data={view} room={room} mode="edit" sel={ui.editSel} showStations svgRef={svgRef}
          onTableDown={(e, tb) => startMove(e, tb.id, 'table')} onDecorDown={(e, x) => startMove(e, x.id, 'decor')}
          onResizeDown={(e, tb) => startMove(e, tb.id, 'table', true)} onBackgroundDown={() => ui.set({ editSel: null })} />
          : <p className="muted">Bitte Raum anlegen.</p>}</div>
        <p className="muted" style={{ fontSize: 12, padding: '0 12px 10px', margin: 0 }}>Ziehen zum Verschieben (Raster 10) · blaues Quadrat = Größe ändern · Klick auf freie Fläche = Auswahl aufheben</p>
      </div>

      <div className="panel props">
        <h3>{selT ? 'Tisch ' + selT.name : selD ? t(selD.kind) : 'Reviere & Kombinationen'}</h3>
        <div className="body">
          {selT ? <>
            <div className="grid2">
              <Field label="Name/Nr." value={selT.name} onCommit={v => v.trim() && saveTable(selT, { name: v.trim() })} />
              <label>Form<select value={selT.shape} onChange={e => saveTable(selT, { shape: e.target.value as TableShape })}>{SHAPES.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>
              <Field label="Min. Pers." type="number" value={selT.minPersons} onCommit={v => saveTable(selT, { minPersons: Math.max(1, +v || 1) })} />
              <Field label="Max. Pers." type="number" value={selT.maxPersons} onCommit={v => saveTable(selT, { maxPersons: Math.max(1, +v || 1) })} />
              <Field label="Breite" type="number" step={2} value={selT.width} onCommit={v => saveTable(selT, { width: Math.max(20, +v || 20) })} />
              <Field label="Höhe" type="number" step={2} value={selT.height} onCommit={v => saveTable(selT, { height: Math.max(10, +v || 10) })} />
              <Field label="Drehung °" type="number" step={15} value={selT.rotation} onCommit={v => saveTable(selT, { rotation: +v || 0 })} />
              <label>Revier<select value={selT.stationId ?? ''} onChange={e => saveTable(selT, { stationId: e.target.value || null })}><option value="">–</option>{d.stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>Raum<select value={selT.roomId} onChange={e => { saveTable(selT, { roomId: e.target.value }); ui.set({ editRoomId: e.target.value }); }}>{d.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            </div>
            <div style={{ margin: '8px 0' }}>{FEATURES.map(f => <label key={f} className="chk"><input type="checkbox" checked={selT.features.includes(f)}
              onChange={e => saveTable(selT, { features: e.target.checked ? [...selT.features, f] : selT.features.filter(x => x !== f) })} /> {t(f)}</label>)}</div>
            <div className="row"><button className="btn small" onClick={duplicate}>Duplizieren</button><button className="btn small danger" onClick={deleteSelected}>Löschen</button></div>
          </> : selD ? <>
            <div className="grid2">
              <label>Typ<select value={selD.kind} onChange={e => saveDecor(selD, { kind: e.target.value as DecorKind })}>{DECOR.map(k => <option key={k} value={k}>{t(k)}</option>)}</select></label>
              <Field label="Text" value={selD.label} onCommit={v => saveDecor(selD, { label: v })} />
              <Field label="Breite" type="number" value={selD.width} onCommit={v => saveDecor(selD, { width: Math.max(4, +v || 4) })} />
              <Field label="Höhe" type="number" value={selD.height} onCommit={v => saveDecor(selD, { height: Math.max(4, +v || 4) })} />
              <Field label="Drehung °" type="number" step={15} value={selD.rotation} onCommit={v => saveDecor(selD, { rotation: +v || 0 })} />
            </div>
            <div className="row mt8"><button className="btn small" onClick={duplicate}>Duplizieren</button><button className="btn small danger" onClick={deleteSelected}>Löschen</button></div>
          </> : <>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Tisch anklicken, um ihn zu bearbeiten.</p>
            <h4 style={{ margin: '6px 0' }}>Service-Reviere</h4>
            {d.stations.map(s => (
              <div key={s.id} className="row mb8">
                <input type="color" value={s.color} style={{ width: 44, padding: 2 }} onChange={e => store.upsert('stations', [{ ...s, color: e.target.value }])} />
                <div style={{ flex: 1 }}><Field label="" value={s.name} onCommit={v => v.trim() && store.upsert('stations', [{ ...s, name: v.trim() }])} /></div>
                <button className="btn small danger" aria-label="Revier löschen" onClick={() => store.remove('stations', [s.id])}>✕</button>
              </div>
            ))}
            <button className="btn small" onClick={() => store.upsert('stations', [{ id: newId(), name: 'Revier ' + (d.stations.length + 1), color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') }])}>＋ Revier</button>
            <h4 style={{ margin: '14px 0 6px' }}>Feste Tischkombinationen</h4>
            {d.combos.map(c => (
              <div key={c.id} className="row" style={{ marginBottom: 4 }}><span style={{ flex: 1 }}>{tableNames(d, c.tableIds)} ({capacity(d, c.tableIds).max}P)</span>
                <button className="btn small danger" aria-label="Kombination löschen" onClick={() => store.remove('combos', [c.id])}>✕</button></div>
            ))}
            <div className="row"><input value={comboText} placeholder="z. B. T7+T8" style={{ flex: 1, width: 'auto' }} onChange={e => setComboText(e.target.value)} />
              <button className="btn small" onClick={addCombo}>＋</button></div>
          </>}
        </div>
      </div>
    </div>
  );
}
