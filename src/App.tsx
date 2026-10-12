import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { viewsFor } from './domain/constants';
import { EDITION } from './lib/edition';
import { PATHS } from './lib/paths';
import { useApp } from './store/app';
import { useTheme } from './ui/theme';
import { Feedback } from './ui/Feedback';
import { Gate, NoAccess } from './views/Gate';
import { Shell } from './views/Shell';
import { LiveView } from './views/LiveView';
import { TimelineView } from './views/TimelineView';
import { ReservationsView } from './views/ReservationsView';
import { HotelView } from './views/HotelView';
import { ReportsView } from './views/ReportsView';
import { EditorView } from './views/EditorView';
import { SettingsView } from './views/SettingsView';
import { MenuView } from './views/MenuView';
import { RosterView } from './views/RosterView';


export function App() {
  const phase = useApp(s => s.phase);
  const user = useApp(s => s.user);
  const data = useApp(s => s.data);
  const role = user?.role;
  const init = useApp(s => s.init);
  useTheme();
  useEffect(() => { init(); }, [init]);

  if (phase !== 'ready' || !role || !data) return <><Gate /><Feedback /></>;
  const views = viewsFor(role, data.venue, data.departments, user.id, EDITION);
  if (!views.length) return <><NoAccess /><Feedback /></>;
  const el = { live: <LiveView />, zeit: <TimelineView />, res: <ReservationsView />, hotel: <HotelView />, menue: <MenuView />, dienst: <RosterView />, berichte: <ReportsView />, editor: <EditorView />, settings: <SettingsView /> };
  return (
    <>
      <Routes>
        <Route element={<Shell />}>
          {views.map(v => <Route key={v} path={PATHS[v]} element={el[v]} />)}
          <Route path="*" element={<Navigate to={PATHS[views[0]]} replace />} />
        </Route>
      </Routes>
      <Feedback />
    </>
  );
}
