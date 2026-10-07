import { closeDialog, useDialogs, type Dialog } from '../store/dialogs';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { StayForm, StayImport, StayTablePicker } from './HotelForms';
import { ReservationForm } from './ReservationForm';
import { DishForm, IngredientForm, MenuEditor } from './MenuForms';
import { BlockDialog, ResInfo, TablePopup, WalkIn } from './TableDialogs';

/** Rendert den jeweils offenen Dialog */
export function Dialogs() {
  const dlg = useDialogs(s => s.dialog);
  const seq = useDialogs(s => s.seq);
  if (!dlg) return null;
  return <ErrorBoundary area="dialog" resetKey={String(seq)} onClose={closeDialog}><OpenDialog dlg={dlg} /></ErrorBoundary>;
}

function OpenDialog({ dlg }: { dlg: Dialog }) {
  switch (dlg.type) {
    case 'reservation': return <ReservationForm key={dlg.r?.id ?? 'new'} r={dlg.r} preset={dlg.preset} />;
    case 'resinfo': return <ResInfo id={dlg.id} />;
    case 'table': return <TablePopup tableId={dlg.tableId} />;
    case 'walkin': return <WalkIn tableId={dlg.tableId} />;
    case 'block': return <BlockDialog tableId={dlg.tableId} />;
    case 'stay': return <StayForm key={dlg.stay?.id ?? 'new'} stay={dlg.stay} />;
    case 'stayimport': return <StayImport />;
    case 'staytable': return <StayTablePicker tableId={dlg.tableId} />;
    case 'menu': return <MenuEditor key={dlg.date + dlg.serviceId} date={dlg.date} serviceId={dlg.serviceId} />;
    case 'dish': return <DishForm key={(dlg.dish?.id ?? 'new') + (dlg.dish?.ingredients.length ?? 0)} dish={dlg.dish} />;
    case 'ingredient': return <IngredientForm key={dlg.ing?.id ?? 'new'} ing={dlg.ing} back={dlg.back} />;
  }
}
