/**
 * Gäste-Speisekarte (öffentlich, ohne Anmeldung): wird über den QR-Code auf dem Tisch geöffnet (/m/<Tisch-Schlüssel>).
 * Der Gast wählt sein Zimmer und je Gang, wie oft welches Gericht – die Küche sieht die Auswahl sofort.
 * Erscheinungsbild (Logo, Titelbild, Farbe, Begrüßung) legt das Hotel in den Einstellungen fest.
 */
import { useEffect, useMemo, useState } from 'react';
import { repo } from '../data';
import { ALLERGENS, allergenNo } from '../domain/constants';
import { menuCourses, type GuestDish, type GuestMenu, type GuestMenuData } from '../domain/guestMenu';
import type { Allergen } from '../domain/types';
import { addDays, today } from '../lib/time';
import { allergenName, courseName, initialLang, LANGS, rememberLang, serviceName, tr, type Lang } from './texts';
import './guest.css';

/** Schriftfarbe auf der Akzentfarbe: hell oder dunkel, je nach Helligkeit */
function onColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return '#fff';
  const n = parseInt(m[1], 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#1a1a1a' : '#fff';
}
const dishName = (l: Lang, x: GuestDish) => (l === 'it' && x.nameIt) || (l === 'en' && x.nameEn) || x.name;

export function GuestMenuPage({ token }: { token: string }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [data, setData] = useState<GuestMenuData | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(0);
  const load = () => { setErr(''); repo.guestMenu(token).then(setData).catch(e => { setErr(e?.message || String(e)); setData(null); }); };
  useEffect(load, [token]);
  const b = data?.venue.branding;
  useEffect(() => {
    document.title = b?.title || data?.venue.name || 'Menü';
    document.documentElement.lang = lang;
    document.body.classList.add('guest-body');
  }, [b?.title, data?.venue.name, lang]);
  const pickLang = (l: Lang) => { setLang(l); rememberLang(l); };
  const color = b?.color || '#0F2347';
  const style = { '--brand': color, '--on-brand': onColor(color) } as React.CSSProperties;
  const welcome = (lang === 'it' && b?.welcomeIt) || (lang === 'en' && b?.welcomeEn) || b?.welcome || '';
  const menu = data?.menus[Math.min(sel, (data?.menus.length ?? 1) - 1)];
  const t0 = today();
  const dayLabel = (m: GuestMenu) => (m.date === t0 ? tr(lang, 'today') : m.date === addDays(t0, 1) ? tr(lang, 'tomorrow') : m.date);

  return (
    <div className="gm" style={style}>
      <header className={'gm-hero' + (b?.coverUrl ? ' has-cover' : '')} style={b?.coverUrl ? { backgroundImage: `url("${b.coverUrl}")` } : undefined}>
        <div className="gm-lang" role="group" aria-label="Sprache / Lingua / Language">
          {LANGS.map(l => <button key={l} aria-pressed={l === lang} onClick={() => pickLang(l)}>{l.toUpperCase()}</button>)}
        </div>
        <div className="gm-hero-inner">
          {b?.logoUrl && <img className="gm-logo" src={b.logoUrl} alt="" />}
          <h1>{b?.title || data?.venue.name || ''}</h1>
          {welcome && <p className="gm-welcome">{welcome}</p>}
          {data && <span className="gm-table">{tr(lang, 'table')} {data.table.name}</span>}
        </div>
      </header>

      <main className="gm-main">
        {data === undefined && <p className="gm-note">{tr(lang, 'loading')}</p>}
        {data === null && <div className="gm-note">{err ? <>{tr(lang, 'error')}: {err}<br /><button className="gm-btn ghost" onClick={load}>{tr(lang, 'retry')}</button></> : tr(lang, 'invalid')}</div>}
        {data && !data.menus.length && <p className="gm-note">{tr(lang, 'noMenu')}</p>}
        {data && data.menus.length > 1 && (
          <div className="gm-tabs" role="tablist">
            {data.menus.map((m, i) => (
              <button key={m.id} role="tab" aria-selected={m === menu} onClick={() => setSel(i)}>
                <small>{dayLabel(m)}</small>{serviceName(lang, m.kind, m.service)}
              </button>
            ))}
          </div>
        )}
        {menu && <MenuChooser key={menu.id} token={token} menu={menu} lang={lang} title={`${dayLabel(menu)} · ${serviceName(lang, menu.kind, menu.service)}`} onSaved={load} />}
        {menu && <AllergenLegend lang={lang} items={menu.items} />}
      </main>

      <footer className="gm-foot">
        <img src="/joke-icon.svg" alt="" width={18} height={18} /> powered by JoKe Smart Solutions
      </footer>
    </div>
  );
}

/** Zuletzt gewähltes Zimmer auf diesem Handy merken (Frühstück mit freier Platzwahl: sonst jedes Mal neu aus der Liste wählen) */
const STAY_KEY = 'tischplan.guest.stay';
const rememberedStay = () => { try { return localStorage.getItem(STAY_KEY); } catch { return null; } };

function MenuChooser({ token, menu, lang, title, onSaved }: { token: string; menu: GuestMenu; lang: Lang; title: string; onSaved: () => void }) {
  const rooms = menu.rooms;
  const [stayId, setStayIdRaw] = useState<string | null>(() =>
    rooms.length === 1 ? rooms[0].stayId : rooms.find(r => r.stayId === rememberedStay())?.stayId ?? null);
  const setStayId = (id: string | null) => {
    setStayIdRaw(id);
    if (id) try { localStorage.setItem(STAY_KEY, id); } catch { /* egal */ }
  };
  const room = rooms.find(r => r.stayId === stayId);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const courses = menuCourses(menu.items);
  const open = menu.state === 'offen';
  // Gänge mit nur einem Gericht: automatisch für alle Personen
  const single = useMemo(() => courses.filter(c => menu.items.filter(i => i.course === c).length === 1), [menu]);
  useEffect(() => {
    if (!room) return;
    const base = { ...room.counts };
    for (const c of single) { const it = menu.items.find(i => i.course === c)!; if (!base[it.dishId]) base[it.dishId] = room.persons; }
    setCounts(base); setMsg(null);
    // nur beim Zimmerwechsel neu setzen – nicht nach dem Senden (sonst verschwindet die Bestätigung)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stayId, menu.id]);

  const sumOf = (c: string) => menu.items.filter(i => i.course === c).reduce((a, i) => a + (counts[i.dishId] ?? 0), 0);
  const step = (it: GuestDish, delta: number) => {
    if (!room || !open) return;
    const cur = counts[it.dishId] ?? 0, next = cur + delta;
    if (next < 0 || (delta > 0 && sumOf(it.course) >= room.persons)) return;
    setCounts({ ...counts, [it.dishId]: next }); setMsg(null);
  };
  const complete = room ? courses.every(c => sumOf(c) === room.persons) : false;
  async function send() {
    if (!room) return;
    setBusy(true); setMsg(null);
    try {
      await repo.guestSave(token, menu.id, room.stayId, Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)));
      setMsg({ ok: true, text: tr(lang, 'saved') });
      onSaved();
    } catch (e: any) { setMsg({ ok: false, text: `${tr(lang, 'error')}: ${e?.message || e}` }); }
    setBusy(false);
  }

  return (
    <section className="gm-menu">
      <h2 className="gm-menu-title">{title}</h2>
      {!open && <p className="gm-banner">{tr(lang, 'closed')}</p>}
      {!rooms.length ? <p className="gm-note">{tr(lang, menu.pick ? 'noRoomFree' : 'noRoom')}</p> : menu.pick && rooms.length > 1 ? (
        // Freie Platzwahl: Zimmer aus allen Zimmern mit dieser Mahlzeit auswählen
        <div className="gm-rooms">
          <p>{tr(lang, 'freeSeating')}</p>
          <select className="gm-roompick" aria-label={tr(lang, 'pickRoom')} value={stayId ?? ''} onChange={e => setStayId(e.target.value || null)}>
            <option value="">{tr(lang, 'pickRoom')}</option>
            {rooms.map(r => <option key={r.stayId} value={r.stayId}>{tr(lang, 'room')} {r.roomNo} · {r.persons} {tr(lang, 'persons')}{Object.keys(r.counts).length ? ' ✓' : ''}</option>)}
          </select>
        </div>
      ) : rooms.length > 1 && (
        <div className="gm-rooms">
          <p>{tr(lang, 'whichRoom')}</p>
          <div>{rooms.map(r => (
            <button key={r.stayId} aria-pressed={r.stayId === stayId} onClick={() => setStayId(r.stayId)}>
              {tr(lang, 'room')} {r.roomNo}<small>{r.persons} {tr(lang, 'persons')}{Object.keys(r.counts).length ? ' · ✓' : ''}</small>
            </button>
          ))}</div>
        </div>
      )}
      {rooms.length === 1 && room && <p className="gm-roomline">{tr(lang, 'room')} {room.roomNo} · {room.persons} {tr(lang, 'persons')}</p>}
      {room && open && <p className="gm-hint">{tr(lang, 'chooseHint')}</p>}

      {courses.map(c => {
        const list = menu.items.filter(i => i.course === c);
        const sum = sumOf(c), isSingle = list.length === 1;
        return (
          <div key={c} className="gm-course">
            <h3><span>{courseName(lang, c)}</span></h3>
            {room && !isSingle && <p className={'gm-count' + (sum === room.persons ? ' done' : '')}>{sum} / {room.persons} {sum === room.persons ? tr(lang, 'chosen') : tr(lang, 'missing')}</p>}
            {list.map(it => (
              <div key={it.dishId} className={'gm-dish' + ((counts[it.dishId] ?? 0) > 0 && room && !isSingle ? ' picked' : '')}>
                <div className="gm-dish-text">
                  <span className="gm-dish-name">{dishName(lang, it)}</span>
                  <span className="gm-dish-meta">
                    {it.diet.includes('vegan') ? <span className="gm-tag">🌱 {tr(lang, 'vegan')}</span> : it.diet.includes('vegetarisch') ? <span className="gm-tag">🌿 {tr(lang, 'veg')}</span> : null}
                    {it.allergens.length > 0 && <span className="gm-all" title={it.allergens.map(a => allergenName(lang, a)).join(', ')}>{tr(lang, 'allergens')}: {it.allergens.map(allergenNo).join(', ')}</span>}
                  </span>
                </div>
                {room && (isSingle ? <span className="gm-served">{tr(lang, 'served')}</span> : (
                  <div className="gm-step" aria-label={dishName(lang, it)}>
                    <button aria-label="−" disabled={!open || !(counts[it.dishId] ?? 0)} onClick={() => step(it, -1)}>−</button>
                    <b>{counts[it.dishId] ?? 0}</b>
                    <button aria-label="+" disabled={!open || sum >= room.persons} onClick={() => step(it, 1)}>+</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}

      {room && open && <>
        {!complete && !msg && <p className="gm-hint" style={{ marginTop: 18 }}>{tr(lang, 'partial')}</p>}
        {msg && <p className={'gm-msg ' + (msg.ok ? 'ok' : 'err')}>{msg.text}{msg.ok && <><br /><small>{tr(lang, 'change')}</small></>}</p>}
        <div className="gm-send"><button className="gm-btn" disabled={busy} onClick={send}>{busy ? tr(lang, 'saving') : tr(lang, 'save')}</button></div>
      </>}
    </section>
  );
}

function AllergenLegend({ lang, items }: { lang: Lang; items: GuestDish[] }) {
  const used = ALLERGENS.filter(a => items.some(i => i.allergens.includes(a as Allergen)));
  if (!used.length) return null;
  return (
    <details className="gm-legend">
      <summary>{tr(lang, 'allergenInfo')}</summary>
      <ul>{used.map(a => <li key={a}><b>{allergenNo(a)}</b> {allergenName(lang, a)}</li>)}</ul>
    </details>
  );
}
