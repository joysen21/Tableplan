/** Raumplan als SVG – gemeinsam für Live-Plan, Hotel-Zuweisung, Editor und Druck */
import type { PointerEvent as RPE, Ref } from 'react';
import { hasAllergy } from '../domain/menu';
import { TABLE_STATE_ICON, TABLE_STATES } from '../domain/constants';
import { byId, persons, type TableStatus } from '../domain/logic';
import type { Decor, DiningTable, Room, VenueData } from '../domain/types';
import { t } from '../lib/i18n';

interface Props {
  data: VenueData; room: Room; mode: 'live' | 'edit' | 'assign';
  status?: (tb: DiningTable) => TableStatus;
  sel?: string | null; highlight?: Set<string>; showStations?: boolean;
  onTableDown?: (e: RPE, tb: DiningTable) => void;
  onDecorDown?: (e: RPE, d: Decor) => void;
  onBackgroundDown?: (e: RPE) => void;
  onResizeDown?: (e: RPE, tb: DiningTable) => void;
  svgRef?: Ref<SVGSVGElement>;
}

function Chairs({ tb }: { tb: DiningTable }) {
  const n = tb.maxPersons, w = tb.width, h = tb.height, pts: [number, number][] = [];
  let bench: JSX.Element | null = null;
  if (tb.shape === 'round') {
    const rx = w / 2 + 10, ry = h / 2 + 10;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; pts.push([Math.cos(a) * rx, Math.sin(a) * ry]); }
  } else if (tb.shape === 'square' && n > 2 && n <= 4) {
    pts.push(...([[0, -h / 2 - 10], [w / 2 + 10, 0], [0, h / 2 + 10], [-w / 2 - 10, 0]] as [number, number][]).slice(0, n));
  } else {
    const horiz = w >= h, len = horiz ? w : h, other = (horiz ? h : w) / 2 + 10;
    const sides = tb.shape === 'bench' ? [n, 0] : [Math.ceil(n / 2), Math.floor(n / 2)];
    sides.forEach((k, s) => { for (let i = 0; i < k; i++) { const pos = -len / 2 + (len * (i + 0.5)) / k, off = s ? other : -other; pts.push(horiz ? [pos, off] : [off, pos]); } });
    if (tb.shape === 'bench') bench = horiz ? <rect x={-w / 2} y={h / 2 + 2} width={w} height={12} rx={4} className="benchseat" />
      : <rect x={w / 2 + 2} y={-h / 2} width={12} height={h} rx={4} className="benchseat" />;
  }
  return <g className="chairs">{pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={7} className="chair" />)}{bench}</g>;
}

function DecorShape({ d, sel, onDown }: { d: Decor; sel: boolean; onDown?: (e: RPE) => void }) {
  const w = d.width, h = d.height;
  const body: Record<string, JSX.Element | null> = {
    wall: <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="var(--decor)" />,
    door: <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke="var(--hl)" strokeWidth={3} strokeDasharray="6 4" />,
    bar: <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={8} fill="var(--decor)" />,
    buffet: <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6} fill="var(--decor)" opacity={0.7} />,
    column: <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="var(--decor)" />,
    plant: <circle r={w / 2} fill="#2da44e" opacity={0.35} />,
    label: <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
  };
  return (
    <g data-decor-id={d.id} transform={`translate(${d.x} ${d.y}) rotate(${d.rotation || 0})`} onPointerDown={onDown} style={onDown ? { cursor: 'move' } : undefined}>
      {body[d.kind]}
      {d.label && <text textAnchor="middle" dy={4} fontSize={13} fill="var(--muted)" pointerEvents="none">{d.label}</text>}
      {sel && <rect x={-w / 2 - 4} y={-h / 2 - 4} width={w + 8} height={h + 8} fill="none" stroke="var(--hl)" strokeDasharray="4 3" />}
    </g>
  );
}

export function FloorPlan(p: Props) {
  const { data, room, mode } = p;
  const tables = data.tables.filter(x => x.roomId === room.id);
  const decor = data.decor.filter(x => x.roomId === room.id);
  const st = (tb: DiningTable): TableStatus => (p.status ? p.status(tb) : { st: 'frei' });
  // Verbindungslinien kombinierter Tische
  const lines: JSX.Element[] = [];
  if (p.status) {
    const seen = new Set<string>();
    for (const tb of tables) {
      const s = st(tb); const r = s.r;
      if (!r || seen.has(r.id) || r.tableIds.length < 2) continue; seen.add(r.id);
      const pts = r.tableIds.map(id => byId(data.tables, id)).filter(x => x && x.roomId === room.id) as DiningTable[];
      for (let i = 1; i < pts.length; i++) lines.push(<line key={r.id + i} x1={pts[i - 1].x} y1={pts[i - 1].y} x2={pts[i].x} y2={pts[i].y} stroke="var(--text)" strokeWidth={3} strokeDasharray="6 5" opacity={0.5} />);
    }
  }
  return (
    <svg className={'plan mode-' + mode} viewBox={`0 0 ${room.width} ${room.height}`} ref={p.svgRef} onPointerDown={e => { if (e.target === e.currentTarget || (e.target as Element).classList.contains('plan-bg')) p.onBackgroundDown?.(e); }}>
      <style>{'.chair{fill:var(--panel);stroke:var(--muted);stroke-width:1.5}.benchseat{fill:var(--decor)}.tbody{stroke:rgba(0,0,0,.25);stroke-width:1.5}'}</style>
      <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--plan-grid)" strokeWidth={1} /></pattern></defs>
      <rect className="plan-bg" width={room.width} height={room.height} fill="url(#grid)" />
      {room.backgroundUrl && <image className="plan-bg" href={room.backgroundUrl} x={0} y={0} width={room.width} height={room.height} preserveAspectRatio="xMidYMid meet" opacity={mode === 'edit' ? 0.55 : 0.35} />}
      {decor.map(d => <DecorShape key={d.id} d={d} sel={mode === 'edit' && p.sel === d.id} onDown={p.onDecorDown ? e => p.onDecorDown!(e, d) : undefined} />)}
      {lines}
      {tables.map(tb => {
        const s = st(tb);
        const fill = `var(--st-${s.st})`, light = s.st === 'frei';
        const station = byId(data.stations, tb.stationId);
        const sel = p.sel === tb.id, hl = p.highlight?.has(tb.id);
        const w = tb.width, h = tb.height, col = light ? 'var(--text)' : '#fff';
        const lineEls: JSX.Element[] = [<tspan key="n" x={0} fontWeight={700} fontSize={14}>{tb.name} {TABLE_STATE_ICON[s.st]}</tspan>];
        const small = Math.min(w, h) < 66, maxLen = small ? 7 : 12;
        const r = s.r || (mode === 'assign' ? s.next : undefined);
        if (mode !== 'edit' && r && s.r) {
          const nm = r.name.split(' · ')[0];
          lineEls.push(<tspan key="a" x={0} dy={14} fontSize={11}>{nm.length > maxLen ? nm.slice(0, maxLen - 1) + '…' : nm}</tspan>);
          lineEls.push(small
            ? <tspan key="b" x={0} dy={13} fontSize={10}>{persons(r)}P{r.stayId ? '⌂' : ''}{hasAllergy(r) ? '⚠' : ''}</tspan>
            : <tspan key="b" x={0} dy={13} fontSize={11}>{r.time} · {persons(r)}P{r.stayId ? ' ⌂' : ''}{hasAllergy(r) ? ' ⚠' : ''}{r.vip ? ' ★' : ''}</tspan>);
        } else if (mode !== 'edit' && s.next) {
          lineEls.push(<tspan key="a" x={0} dy={14} fontSize={11} opacity={0.8}>ab {s.next.time}</tspan>);
        } else lineEls.push(<tspan key="a" x={0} dy={14} fontSize={11} opacity={0.7}>{tb.minPersons}–{tb.maxPersons} P</tspan>);
        const dy = -((lineEls.length - 1) * 13) / 2 + 4;
        const outline = p.showStations && station ? (tb.shape === 'round'
          ? <ellipse rx={w / 2 + 3} ry={h / 2 + 3} fill="none" stroke={station.color} strokeWidth={4} />
          : <rect x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} rx={9} fill="none" stroke={station.color} strokeWidth={4} />) : null;
        return (
          <g key={tb.id} className="tb" data-table-id={tb.id} transform={`translate(${tb.x} ${tb.y}) rotate(${tb.rotation || 0})`}
            style={{ cursor: mode === 'edit' ? 'move' : 'pointer' }} onPointerDown={p.onTableDown ? e => p.onTableDown!(e, tb) : undefined}
            aria-label={`Tisch ${tb.name}, ${t(s.st)}`}>
            {(sel || hl) && <rect x={-w / 2 - 16} y={-h / 2 - 16} width={w + 32} height={h + 32} rx={12} fill="none" stroke={hl ? 'var(--hotel)' : 'var(--hl)'} strokeWidth={3} strokeDasharray="6 4" />}
            <Chairs tb={tb} />
            {outline}
            {tb.shape === 'round' ? <ellipse rx={w / 2} ry={h / 2} fill={fill} className="tbody" /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={7} fill={fill} className="tbody" />}
            <text textAnchor="middle" y={dy} fill={col} transform={`rotate(${-(tb.rotation || 0)})`} pointerEvents="none">{lineEls}</text>
            {mode === 'edit' && sel && p.onResizeDown && <rect x={w / 2 - 6} y={h / 2 - 6} width={14} height={14} fill="var(--hl)" style={{ cursor: 'nwse-resize' }} onPointerDown={e => { e.stopPropagation(); p.onResizeDown!(e, tb); }} />}
          </g>
        );
      })}
    </svg>
  );
}

export function Legend() {
  return (
    <div className="legend">
      {TABLE_STATES.map(s => <span key={s}><i style={{ background: `var(--st-${s})` }} />{TABLE_STATE_ICON[s]} {t(s)}</span>)}
      <span>⌂ Hotelgast</span><span>⚠ Allergie</span><span>★ VIP</span>
    </div>
  );
}
