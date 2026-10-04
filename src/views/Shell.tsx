/** Rahmen der angemeldeten App: Kopfzeile mit Navigation, Datum/Service, Status; Dialoge */
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { repo } from '../data';
import { ROLE_VIEWS } from '../domain/constants';
import { t } from '../lib/i18n';
import { PATHS } from '../lib/paths';
import { addDays, nowMin, today, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useServiceId } from '../store/hooks';
import { useUi } from '../store/ui';
import { useDialogs } from '../store/dialogs';
import { dragState } from '../ui/drag';
import { useThemeStore } from '../ui/theme';
import { Dialogs } from '../forms/Dialogs';

function SyncIndicator() {
  const live = useApp(s => s.live), saving = useApp(s => s.saving);
  const [color, label, title] = saving > 0 ? ['var(--warn)', 'Speichert…', 'Änderungen werden übertragen']
    : live === 'live' ? ['var(--ok)', repo.mode === 'demo' ? 'Demo' : 'Live', repo.mode === 'demo' ? 'Demo-Modus: Daten nur in diesem Browser' : 'Verbunden – Änderungen anderer Geräte erscheinen sofort']
    : live === 'down' ? ['var(--danger)', 'Getrennt', 'Verbindung unterbrochen – wird automatisch wiederhergestellt'] : ['var(--warn)', 'Verbinde…', ''];
  return <span className="sync" title={title}><i style={{ background: color }} />{label}</span>;
}

export function Shell() {
  const data = useData();
  const user = useApp(s => s.user)!;
  const logout = useApp(s => s.logout);
  const ui = useUi();
  const serviceId = useServiceId();
  const loc = useLocation();
  const toggleTheme = useThemeStore(s => s.toggle), theme = useThemeStore(s => s.theme);
  const showCtx = [PATHS.live, PATHS.zeit, PATHS.res, PATHS.berichte].includes(loc.pathname);

  // „Jetzt“-Modus: Uhrzeit alle 30 s nachführen
  useEffect(() => {
    const iv = setInterval(() => {
      const u = useUi.getState();
      if (u.follow && !dragState.active && !useDialogs.getState().dialog) u.set({ time: nowMin(), date: today() });
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      <header>
        <span className="brand">🍽 {data.venue.name}</span>
        <nav>{ROLE_VIEWS[user.role].map(v => <NavLink key={v} to={PATHS[v]} className={({ isActive }) => (isActive ? 'active' : '')}>{t(v)}</NavLink>)}</nav>
        <span className="spacer" />
        {showCtx && (
          <div className="ctx">
            <button className="btn small" aria-label="Vortag" onClick={() => ui.set({ date: addDays(ui.date, -1), follow: false })}>◀</button>
            <input type="date" value={ui.date} onChange={e => e.target.value && ui.set({ date: e.target.value, follow: false })} aria-label="Datum" />
            <button className="btn small" aria-label="Folgetag" onClick={() => ui.set({ date: addDays(ui.date, 1), follow: false })}>▶</button>
            <button className="btn small" onClick={() => ui.goToday()}>Heute</button>
            <select value={serviceId} aria-label="Service" onChange={e => { const s = data.services.find(x => x.id === e.target.value)!; ui.set({ serviceId: s.id, follow: false, time: toMin(s.start) + 60 }); }}>
              {data.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <SyncIndicator />
        <button className="btn small" onClick={toggleTheme} title="Hell/Dunkel" aria-label="Hell/Dunkel umschalten">{theme === 'dark' ? '☀' : '☾'}</button>
        <button className="btn small" onClick={() => logout()} title={`${user.email} – Abmelden`}>{user.name} ⎋</button>
      </header>
      <main id="main"><Outlet /></main>
      <Dialogs />
    </>
  );
}
