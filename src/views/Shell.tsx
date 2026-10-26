/** Rahmen der angemeldeten App: am PC Seitenmenü links (ein-/ausklappbar), Kopfzeile mit Datum/Service, Status; Benutzermenü;
 *  am Handy statt Seitenmenü die Navigationsleiste unten (Hauptansichten + „Mehr“); Dialoge */
import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { BedDouble, CalendarClock, CalendarDays, ChartColumn, ChartGantt, ChefHat, ChevronDown, ChevronLeft, ChevronRight, Ellipsis, LogOut, Moon, PencilRuler, Pin, PinOff, Settings, ShoppingCart, ConciergeBell, CookingPot, SquareParking, HandHeart, Bike, CalendarCheck, Sun, Utensils, type LucideIcon } from '../ui/icons';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { repo } from '../data';
import type { ViewKey } from '../domain/constants';
import { t } from '../lib/i18n';
import { PATHS } from '../lib/paths';
import { addDays, nowMin, today, toMin } from '../lib/time';
import { useApp } from '../store/app';
import { useData, useServiceId, useViews } from '../store/hooks';
import { useUi } from '../store/ui';
import { useDialogs } from '../store/dialogs';
import { dragState } from '../ui/drag';
import { useThemeStore } from '../ui/theme';
import { Dialogs } from '../forms/Dialogs';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { dueAlertCount, dueDashboard } from '../domain/due';

const VIEW_ICON: Record<ViewKey, LucideIcon> = {
  live: Utensils, zeit: ChartGantt, res: CalendarDays, hotel: BedDouble, menue: ChefHat, dienst: CalendarClock, pass: ConciergeBell, chef: CookingPot, garage: SquareParking, massage: HandHeart, fahrrad: Bike, faellig: CalendarCheck, bestell: ShoppingCart, berichte: ChartColumn, editor: PencilRuler, settings: Settings
};
/** So viele Ansichten passen in die Leiste unten (plus „Mehr“) */
const BOTTOM_MAX = 4;
const NAV_KEY = 'tischplan.nav.pinned';
const loadPinned = () => { try { return localStorage.getItem(NAV_KEY) === '1'; } catch { return false; } };

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
  const showCtx = [PATHS.live, PATHS.zeit, PATHS.res, PATHS.pass, PATHS.chef, PATHS.berichte].includes(loc.pathname);
  const views = useViews();
  const current = views.find(v => PATHS[v] === loc.pathname);
  // Leiste unten nur bei mehreren Ansichten; was nicht hineinpasst, steht im „Mehr“-Menü
  const bottom = views.length > 1 ? views.slice(0, BOTTOM_MAX) : [];
  // Fälligkeiten: Hinweiszahl im Menü (überfällig, heute, demnächst) und einmal am Tag eine Meldung
  const dueN = views.includes('faellig') ? dueAlertCount(data.dueItems ?? [], today()) : 0;
  const badge = (v: ViewKey) => (v === 'faellig' && dueN > 0 ? <span className="nav-badge" aria-label={`${dueN} fällig`}>{dueN}</span> : null);
  // Meldung oben (bis zum Schließen; danach erst am nächsten Tag wieder)
  const dueKey = `tischplan.faellig.meldung.${data.venue.id}`;
  const [dueHidden, setDueHidden] = useState(() => { try { return localStorage.getItem(dueKey) === today(); } catch { return false; } });
  const dd = dueN ? dueDashboard(data.dueItems, today()) : null;
  const hideDue = () => { setDueHidden(true); try { localStorage.setItem(dueKey, today()); } catch { /* egal */ } };
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
  // Seitenmenü (PC): automatisch (schmal, klappt beim Darüberfahren auf) oder fixiert offen; wird im Browser gemerkt
  const [pinned, setPinned] = useState(loadPinned);
  const toggleNav = () => setPinned(p => { try { localStorage.setItem(NAV_KEY, p ? '0' : '1'); } catch { /* egal */ } return !p; });

  return (
    <div className={'shell' + (bottom.length ? ' has-bottomnav' : '') + (pinned ? ' nav-pinned' : ' nav-auto')}>
      <aside className="sidenav">
        <span className="brand" title={data.venue.name}><img className="logo-light" src="/joke-icon.svg" alt="JoKe" /><img className="logo-dark" src="/joke-icon-weiss.svg" alt="JoKe" /><span className="venue lbl">{data.venue.name}</span></span>
        <nav className="topnav" aria-label="Ansichten">{views.map(v => { const I = VIEW_ICON[v]; return (
          <NavLink key={v} to={PATHS[v]} aria-label={t(v)} className={({ isActive }) => (isActive ? 'active' : '')}><I aria-hidden="true" /><span className="lbl">{t(v)}</span>{badge(v)}</NavLink>); })}</nav>
        <button className="side-toggle" onClick={toggleNav} aria-pressed={pinned} aria-label={pinned ? 'Menü automatisch einklappen' : 'Menü fixieren'} title={pinned ? 'Menü automatisch einklappen' : 'Menü offen fixieren'}>
          {pinned ? <PinOff /> : <Pin />}<span className="lbl">{pinned ? 'Automatisch einklappen' : 'Menü fixieren'}</span></button>
      </aside>
      <div className="shell-main">
      <header>
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
      {dd && !dueHidden && loc.pathname !== PATHS.faellig && <div className="due-banner" role="status">
        <CalendarCheck aria-hidden="true" /><span><b>Fälligkeiten:</b> {[dd.ueberfaellig.length && `${dd.ueberfaellig.length} überfällig`, dd.faellig.length && `${dd.faellig.length} heute fällig`, dd.bald.length && `${dd.bald.length} demnächst`].filter(Boolean).join(', ')}</span>
        <NavLink to={PATHS.faellig} className="btn small" onClick={hideDue}>Ansehen</NavLink>
        <button className="btn small icon ghost" aria-label="Meldung schließen" title="Bis morgen ausblenden" onClick={hideDue}>×</button>
      </div>}
      <main id="main"><ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary></main>
      </div>
      {bottom.length > 0 && (
        <nav className="bottomnav" aria-label="Hauptnavigation">
          {bottom.map(v => { const I = VIEW_ICON[v]; return <NavLink key={v} to={PATHS[v]} aria-label={t(v)} className={({ isActive }) => (isActive ? 'active' : '')}><I /><span>{t('kurz.' + v)}</span>{badge(v)}</NavLink>; })}
          <button className={more.some(v => PATHS[v] === loc.pathname) ? 'active' : ''} aria-haspopup="menu" aria-expanded={menu !== null} onClick={toggleMenu}><Ellipsis /><span>Mehr</span>{more.includes('faellig') && badge('faellig')}</button>
        </nav>
      )}
      {menu !== null && <UserMenu more={more} at={menu} onClose={() => setMenu(null)} />}
      <Dialogs />
    </div>
  );
}
