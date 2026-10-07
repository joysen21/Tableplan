import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLE_VIEWS } from './domain/constants';
import { PATHS } from './lib/paths';
import { useApp } from './store/app';
import { useTheme } from './ui/theme';
import { Feedback } from './ui/Feedback';
import { Gate } from './views/Gate';
import { Shell } from './views/Shell';
import { LiveView } from './views/LiveView';
import { TimelineView } from './views/TimelineView';
import { ReservationsView } from './views/ReservationsView';
import { HotelView } from './views/HotelView';
import { ReportsView } from './views/ReportsView';
import { EditorView } from './views/EditorView';
import { SettingsView } from './views/SettingsView';
import { MenuView } from './views/MenuView';


export function App() {
  const phase = useApp(s => s.phase);
  const role = useApp(s => s.user?.role);
  const init = useApp(s => s.init);
  useTheme();
  useEffect(() => { init(); }, [init]);

  if (phase !== 'ready' || !role) return <><Gate /><Feedback /></>;
  const views = ROLE_VIEWS[role];
  const el = { live: <LiveView />, zeit: <TimelineView />, res: <ReservationsView />, hotel: <HotelView />, menue: <MenuView />, berichte: <ReportsView />, editor: <EditorView />, settings: <SettingsView /> };
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
