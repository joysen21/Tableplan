import type { PointerEvent as RPE } from 'react';
import { allergyText, hasAllergy } from '../domain/menu';
import { chosenDishes, chosenText, menuChoiceFor } from '../domain/guestMenu';
import { GripVertical } from '../ui/icons';
import { statusInfo } from '../domain/statuses';
import { StatusIcon } from '../ui/StatusIcon';
import { checkReservation, occupies, persons, tableNames } from '../domain/logic';
import type { Reservation, VenueData } from '../domain/types';
import { fmtShort } from '../lib/time';

/** Eine Reservierung in Listen; mit `draggable` erscheint ein Griff (am Handy wird nur daran gezogen) */
export function ResItem({ d, r, showDate, draggable, onPointerDown, onClick }: {
  d: VenueData; r: Reservation; showDate?: boolean; draggable?: boolean; onPointerDown?: (e: RPE) => void; onClick?: () => void;
}) {
  const unassigned = occupies(r) && !r.tableIds.length;
  const issues = checkReservation(d, r);
  const menu = chosenText(chosenDishes(d, r));
  const note = menuChoiceFor(d, r).choice?.note;
  const st = statusInfo(d.venue, r);
  return (
    <div className={'ritem' + (unassigned ? ' unassigned' : '') + (occupies(r) || r.status === 'abgeschlossen' ? '' : ' cancel') + (onClick ? ' clickable' : '')} data-res={r.id} onPointerDown={onPointerDown} onClick={onClick}>
      {draggable && <span className="grip" data-drag-handle title="Auf einen Tisch ziehen" aria-hidden="true"><GripVertical /></span>}
      <div className="time">{showDate && <>{fmtShort(r.date)}<br /></>}{r.time}</div>
      <div className="main">
        <div className="name">{r.vip ? '★ ' : ''}{r.name}</div>
        <div className="sub">{persons(r)} P · {r.tableIds.length ? 'Tisch ' + tableNames(d, r.tableIds) : <b style={{ color: 'var(--danger)' }}>ohne Tisch</b>}
          {hasAllergy(r) ? ' · ⚠ ' + allergyText(r) : ''}{r.occasion ? ' · 🎉 ' + r.occasion : ''}</div>
        {(menu || note) && <div className="sub menu-choice" title="Per QR gewähltes Menü">{menu && <>🍽 {menu}</>}{note && <> · 📝 {note}</>}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        {r.stayId && <><span className="badge hotel">Hotel</span><br /></>}
        <span className="badge st" style={{ background: st.color }}><StatusIcon icon={st.icon} />{st.label}</span>
        {issues.length > 0 && <><br /><span className="badge warn" title={issues.map(i => i.text).join('\n')}>⚠ {issues.length}</span></>}
      </div>
    </div>
  );
}
