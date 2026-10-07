/** Rahmen der angemeldeten App: Kopfzeile mit Navigation, Datum/Service, Status; Benutzermenü;
 *  am Handy zusätzlich die Navigationsleiste unten (Hauptansichten + „Mehr“); Dialoge */
import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { BedDouble, CalendarDays, ChartColumn, ChartGantt, ChefHat, ChevronDown, ChevronLeft, ChevronRight, Ellipsis, LogOut, Moon, PencilRuler, Settings, Sun, Utensils, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { repo } from '../data';
import { ROLE_VIEWS, type ViewKey } from '../domain/constants';
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
import { ErrorBoundary } from '../ui/ErrorBoundary';

const VIEW_ICON: Record<ViewKey, LucideIcon> = {
  live: Utensils, zeit: ChartGantt, res: CalendarDays, hotel: BedDouble, menue: ChefHat, berichte: ChartColumn, editor: PencilRuler, settings: Settings
};
/** So viele Ansichten passen in die Leiste unten (plus „Mehr“) */
const BOTTOM_MAX = 4;

function SyncIndicator() {
  const live = useApp(s => s.live), saving = useApp(s => s.saving);
  const [color, label, title] = saving > 0 ? ['var(--warn)', 'Speichert…', 'Änderungen werden übertragen']
    : live === 'live' ? ['var(--ok)', repo.mode === 'demo' ? 'Demo' : 'Live', repo.mode === 'demo' ? 'Demo-Modus: Daten nur in diesem Browser' : 'Verbunden – Änderungen anderer Geräte erscheinen sofort']
    : live === 'down' ? ['var(--danger)', 'Getrennt', 'Verbindung unterbrochen – wird automatisch wiederhergestellt'] : ['var(--warn)', 'Verbinde…', ''];
  return <span className="sync" title={title} aria-label={label}><i style={{ background: color }} /><span className="sync-label">{label}</span></span>;
}

/** Benutzermenü: am Desktop als Aufklappmenü oben rechts, am Handy als Blatt von unten („Mehr“) */
type Anchor = { top: number; right: number };

function UserMenu({ more, at, onClose }: { more: ViewKey[]; at: Anchor; onClose: () => void }) {
  const user = useApp(s => s.user)!;
  const logout = useApp(s => s.logout);
  const toggleTheme = useThemeStore(s => s.toggle), theme = useThemeStore(s => s.theme);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="menu-bg" onClick={onClose} />
      <div className="menu" role="menu" aria-label="Menü" style={{ '--menu-top': at.top + 'px', '--menu-right': at.right + 'px' } as CSSProperties}>
        {more.length > 0 && (
          <div className="menu-views">
            {more.map(v => { const I = VIEW_ICON[v]; return <NavLink key={v} to={PATHS[v]} role="menuitem" className="menu-item" onClick={onClose}><I />{t(v)}</NavLink>; })}
          </div>
        )}
        <div className="menu-user"><b>{user.name}</b><small className="muted">{user.email} · {t(user.role)}</small></div>
        <button className="menu-item" role="menuitem" onClick={toggleTheme}>{theme === 'dark' ? <Sun /> : <Moon />}{theme === 'dark' ? 'Heller Modus' : 'Dunkler Modus'}</button>
        <button className="menu-item danger" role="menuitem" onClick={() => { onClose(); logout(); }}><LogOut />Abmelden</button>
      </div>
    </>
  );
}

export function Shell() {
  const data = useData();
  const user = useApp(s => s.user)!;
  const ui = useUi();
  const serviceId = useServiceId();
  const loc = useLocation();
  // geöffnetes Menü: Position direkt unter dem auslösenden Button (am Desktop), sonst null
  const [menu, setMenu] = useState<Anchor | null>(null);
  const toggleMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const at = { top: b.bottom + 6, right: Math.max(14, window.innerWidth - b.right) };
    setMenu(m => (m === null ? at : null));
  };
  const showCtx = [PATHS.live, PATHS.zeit, PATHS.res, PATHS.berichte].includes(loc.pathname);
  const views = ROLE_VIEWS[user.role];
  const current = views.find(v => PATHS[v] === loc.pathname);
  // Leiste unten nur bei mehreren Ansichten; was nicht hineinpasst, steht im „Mehr“-Menü
  const bottom = views.length > 1 ? views.slice(0, BOTTOM_MAX) : [];
  const more = views.slice(bottom.length ? BOTTOM_MAX : views.length);

  // „Jetzt“-Modus: Uhrzeit alle 30 s nachführen
  useEffect(() => {
    const iv = setInterval(() => {
      const u = useUi.getState();
      if (u.follow && !dragState.active && !useDialogs.getState().dialog) u.set({ time: nowMin(), date: today() });
    }, 30000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => setMenu(null), [loc.pathname]);

  return (
    <div className={'shell' + (bottom.length ? ' has-bottomnav' : '')}>
      <header>
        <span className="brand"><img className="logo-light" src="/joke-icon.svg" alt="JoKe" /><img className="logo-dark" src="/joke-icon-weiss.svg" alt="JoKe" /><span className="venue" title={data.venue.name}>{data.venue.name}</span></span>
        <nav className="topnav">{views.map(v => <NavLink key={v} to={PATHS[v]} className={({ isActive }) => (isActive ? 'active' : '')}>{t(v)}</NavLink>)}</nav>
        <span className="spacer" />
        {showCtx ? (
          <div className="ctx">
            <button className="btn small icon" aria-label="Vortag" title="Vortag" onClick={() => ui.set({ date: addDays(ui.date, -1), follow: false })}><ChevronLeft /></button>
            <input type="date" value={ui.date} onChange={e => e.target.value && ui.set({ date: e.target.value, follow: false })} aria-label="Datum" />
            <button className="btn small icon" aria-label="Folgetag" title="Folgetag" onClick={() => ui.set({ date: addDays(ui.date, 1), follow: false })}><ChevronRight /></button>
            <button className={'btn small today' + (ui.date === today() ? ' is-today' : '')} onClick={() => ui.goToday()}>Heute</button>
            <select value={serviceId} aria-label="Service" onChange={e => { const s = data.services.find(x => x.id === e.target.value)!; ui.set({ serviceId: s.id, follow: false, time: toMin(s.start) + 60 }); }}>
              {data.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        ) : current && <h1 className="pagetitle">{t(current)}</h1>}
        <SyncIndicator />
        <button className="btn small usermenu-btn" aria-haspopup="menu" aria-expanded={menu !== null} onClick={toggleMenu} title={user.email}>{user.name}<ChevronDown /></button>
      </header>
      <main id="main"><ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary></main>
      {bottom.length > 0 && (
        <nav className="bottomnav" aria-label="Hauptnavigation">
          {bottom.map(v => { const I = VIEW_ICON[v]; return <NavLink key={v} to={PATHS[v]} aria-label={t(v)} className={({ isActive }) => (isActive ? 'active' : '')}><I /><span>{t('kurz.' + v)}</span></NavLink>; })}
          <button className={more.some(v => PATHS[v] === loc.pathname) ? 'active' : ''} aria-haspopup="menu" aria-expanded={menu !== null} onClick={toggleMenu}><Ellipsis /><span>Mehr</span></button>
        </nav>
      )}
      {menu !== null && <UserMenu more={more} at={menu} onClose={() => setMenu(null)} />}
      <Dialogs />
    </div>
  );
}
