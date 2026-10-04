import { useDialogs } from '../store/dialogs';
import { StayForm, StayImport } from './HotelForms';
import { ReservationForm } from './ReservationForm';
import { BlockDialog, ResInfo, TablePopup, WalkIn } from './TableDialogs';

/** Rendert den jeweils offenen Dialog */
export function Dialogs() {
  const dlg = useDialogs(s => s.dialog);
  if (!dlg) return null;
  switch (dlg.type) {
    case 'reservation': return <ReservationForm key={dlg.r?.id ?? 'new'} r={dlg.r} preset={dlg.preset} />;
    case 'resinfo': return <ResInfo id={dlg.id} />;
    case 'table': return <TablePopup tableId={dlg.tableId} />;
    case 'walkin': return <WalkIn tableId={dlg.tableId} />;
    case 'block': return <BlockDialog tableId={dlg.tableId} />;
    case 'stay': return <StayForm key={dlg.stay?.id ?? 'new'} stay={dlg.stay} />;
    case 'stayimport': return <StayImport />;
  }
}
