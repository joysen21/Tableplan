import type { PointerEvent as RPE } from 'react';
import { GripVertical } from 'lucide-react';
import { RES_STATUS_COLOR } from '../domain/constants';
import { checkReservation, occupies, persons, tableNames } from '../domain/logic';
import type { Reservation, VenueData } from '../domain/types';
import { t } from '../lib/i18n';
import { fmtShort } from '../lib/time';

/** Eine Reservierung in Listen; mit `draggable` erscheint ein Griff (am Handy wird nur daran gezogen) */
export function ResItem({ d, r, showDate, draggable, onPointerDown }: { d: VenueData; r: Reservation; showDate?: boolean; draggable?: boolean; onPointerDown?: (e: RPE) => void }) {
  const unassigned = occupies(r) && !r.tableIds.length;
  const issues = checkReservation(d, r);
  return (
    <div className={'ritem' + (unassigned ? ' unassigned' : '') + (occupies(r) || r.status === 'abgeschlossen' ? '' : ' cancel')} data-res={r.id} onPointerDown={onPointerDown}>
      {draggable && <span className="grip" data-drag-handle title="Auf einen Tisch ziehen" aria-hidden="true"><GripVertical /></span>}
      <div className="time">{showDate && <>{fmtShort(r.date)}<br /></>}{r.time}</div>
      <div className="main">
        <div className="name">{r.vip ? '★ ' : ''}{r.name}</div>
        <div className="sub">{persons(r)} P{r.children ? ` (${r.children} Ki.)` : ''} · {r.tableIds.length ? 'Tisch ' + tableNames(d, r.tableIds) : <b style={{ color: 'var(--danger)' }}>ohne Tisch</b>}
          {r.allergies ? ' · ⚠ ' + r.allergies : ''}{r.occasion ? ' · 🎉 ' + r.occasion : ''}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {r.stayId && <><span className="badge hotel">Hotel</span><br /></>}
        <span className="badge st" style={{ background: RES_STATUS_COLOR[r.status] }}>{t(r.status)}</span>
        {issues.length > 0 && <><br /><span className="badge warn" title={issues.map(i => i.text).join('\n')}>⚠ {issues.length}</span></>}
      </div>
    </div>
  );
}
