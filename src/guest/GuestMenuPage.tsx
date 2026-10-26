/**
 * Gäste-Speisekarte (öffentlich, ohne Anmeldung): wird über den QR-Code auf dem Tisch geöffnet (/m/<Tisch-Schlüssel>).
 * Der Gast gibt seine Zimmernummer ein (Bestätigung mit Namen) und wählt je Gang, wie oft welches Gericht – die Küche sieht die Auswahl sofort.
 * Erscheinungsbild (Logo, Titelbild, Farbe, Begrüßung) legt das Hotel in den Einstellungen fest.
 */
import { useEffect, useMemo, useState } from 'react';
import { repo } from '../data';
import { ALLERGENS, allergenNo } from '../domain/constants';
import { menuCourses, partyKey, type GuestDish, type GuestMenu, type GuestMenuData, type GuestRoom } from '../domain/guestMenu';
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
          {data?.table && <span className="gm-table">{tr(lang, 'table')} {data.table.name}</span>}
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
        {menu && <MenuChooser key={menu.id} token={token} menu={menu} tableName={data!.table?.name ?? ''} lang={lang} title={`${dayLabel(menu)} · ${serviceName(lang, menu.kind, menu.service)}`} onSaved={load} />}
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

function MenuChooser({ token, menu, tableName, lang, title, onSaved }: { token: string; menu: GuestMenu; tableName: string; lang: Lang; title: string; onSaved: () => void }) {
  const rooms = menu.rooms;
  const [stayId, setStayIdRaw] = useState<string | null>(() =>
    rooms.length === 1 ? partyKey(rooms[0]) : rooms.some(r => partyKey(r) === rememberedStay()) ? rememberedStay() : null);
  const setStayId = (id: string | null) => {
    setStayIdRaw(id);
    if (id) try { localStorage.setItem(STAY_KEY, id); } catch { /* egal */ }
  };
  const room = rooms.find(r => partyKey(r) === stayId);
  // externe Gäste (ohne Zimmer) erscheinen als „Tisch …“, bei mehreren durchnummeriert
  // mehrere externe Reservierungen am selben Tisch werden durchnummeriert
  const tableOf = (r: GuestRoom) => r.tableName || tableName;
  const same = (r: GuestRoom) => rooms.filter(x => !x.roomNo && tableOf(x) === tableOf(r));
  const label = (r: GuestRoom) => r.roomNo ? `${tr(lang, 'room')} ${r.roomNo}`
    : `${tr(lang, 'table')} ${tableOf(r)}${same(r).length > 1 ? ` (${same(r).indexOf(r) + 1})` : ''}`;
  const hotel = rooms.filter(r => r.roomNo), ext = rooms.filter(r => !r.roomNo);
  const [entry, setEntry] = useState(room?.roomNo ?? '');
  const [notFound, setNotFound] = useState('');
  // Name zum Zimmer zur Bestätigung – nur für dieses Zimmer vom Server geholt
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    if (room?.stayId) repo.guestRoomName(token, room.stayId).then(setName).catch(() => setName(null));
  }, [room?.stayId, token]);
  const findRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const no = entry.trim().toLowerCase();
    const r = hotel.find(x => x.roomNo.trim().toLowerCase() === no);
    if (!r) { setNotFound(entry.trim()); return; }
    setNotFound(''); setStayId(partyKey(r));
  };
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const courses = menuCourses(menu.items);
  const open = menu.state === 'offen';
  // Gänge mit nur einem Gericht: vorbelegt für alle Personen, die Menge lässt sich wie bei den anderen Gängen ändern (z. B. ohne Dessert)
  const single = useMemo(() => courses.filter(c => menu.items.filter(i => i.course === c).length === 1), [menu]);
  useEffect(() => {
    if (!room) return;
    const base = { ...room.counts };
    // nur ohne gespeicherte Auswahl vorbelegen – sonst würde ein bewusst abgewählter Gang wieder auftauchen
    if (!Object.keys(room.counts).length) for (const c of single) { const it = menu.items.find(i => i.course === c)!; base[it.dishId] = room.persons; }
    setCounts(base); setNote(room.note ?? ''); setMsg(null);
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
  // vollständig = jeder Gang mit Auswahl ist für alle Personen gewählt; einen einzelnen Gang wegzulassen ist eine bewusste Wahl
  const complete = room ? courses.filter(c => !single.includes(c)).every(c => sumOf(c) === room.persons) : false;
  async function send() {
    if (!room) return;
    setBusy(true); setMsg(null);
    try {
      await repo.guestSave(token, menu.id, { stayId: room.stayId, resId: room.resId }, Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)), note.trim());
      setMsg({ ok: true, text: tr(lang, 'saved') });
      onSaved();
    } catch (e: any) { setMsg({ ok: false, text: `${tr(lang, 'error')}: ${e?.message || e}` }); }
    setBusy(false);
  }

  return (
    <section className="gm-menu">
      <h2 className="gm-menu-title">{title}</h2>
      {!open && <p className="gm-banner">{tr(lang, 'closed')}</p>}
      {!rooms.length ? <p className="gm-note">{tr(lang, menu.pick ? 'noRoomFree' : 'noRoom')}</p> : rooms.length === 1 ? (
        room && <p className="gm-roomline">{label(room)}{name && <> · <b>{name}</b></>} · {room.persons} {tr(lang, 'persons')}</p>
      ) : room ? (
        <div className="gm-roomsel">
          <p className="gm-roomline">{label(room)}{name && <> · <b>{name}</b></>} · {room.persons} {tr(lang, 'persons')}</p>
          <button className="gm-btn ghost" onClick={() => { setStayId(null); setEntry(''); }}>{tr(lang, 'otherRoom')}</button>
        </div>
      ) : (
        // Zimmernummer eingeben statt aus einer Liste wählen; externe Gäste (ohne Zimmer) wählen ihren Tisch
        <div className="gm-rooms">
          {hotel.length > 0 && <form className="gm-roomentry" onSubmit={findRoom}>
            <p>{tr(lang, 'enterRoom')}</p>
            <div><input aria-label={tr(lang, 'roomNo')} inputMode="numeric" autoComplete="off" value={entry} placeholder={tr(lang, 'roomNo')}
              onChange={e => { setEntry(e.target.value); setNotFound(''); }} />
              <button className="gm-btn" type="submit" disabled={!entry.trim()}>{tr(lang, 'go')}</button></div>
          </form>}
          {notFound && <p className="gm-msg err" role="alert">{tr(lang, 'roomNotFound').replace('{n}', notFound)}</p>}
          {ext.length > 0 && <label className="gm-ext">{tr(lang, hotel.length ? 'noHotelRoom' : 'pickTable')}
            <select aria-label={tr(lang, 'pickTable')} value="" onChange={e => setStayId(e.target.value || null)}>
              <option value="">{tr(lang, 'pickTable')}</option>
              {ext.map(r => <option key={partyKey(r)} value={partyKey(r)}>{label(r)} · {r.persons} {tr(lang, 'persons')}{Object.keys(r.counts).length ? ' ✓' : ''}</option>)}
            </select></label>}
        </div>
      )}
      {room && Object.keys(room.counts).length > 0 && !msg && <p className="gm-banner info">{tr(lang, 'alreadyChosen')}</p>}
      {room && open && <p className="gm-hint">{tr(lang, 'chooseHint')}</p>}

      {courses.map(c => {
        const list = menu.items.filter(i => i.course === c);
        const sum = sumOf(c);
        return (
          <div key={c} className="gm-course">
            <h3><span>{courseName(lang, c)}</span></h3>
            {room && <p className={'gm-count' + (sum === room.persons ? ' done' : '')}>{sum} / {room.persons} {sum === room.persons ? tr(lang, 'chosen') : tr(lang, 'missing')}</p>}
            {list.map(it => (
              <div key={it.dishId} className={'gm-dish' + ((counts[it.dishId] ?? 0) > 0 && room ? ' picked' : '')}>
                <div className="gm-dish-text">
                  <span className="gm-dish-name">{dishName(lang, it)}</span>
                  <span className="gm-dish-meta">
                    {it.diet.includes('vegan') ? <span className="gm-tag">🌱 {tr(lang, 'vegan')}</span> : it.diet.includes('vegetarisch') ? <span className="gm-tag">🌿 {tr(lang, 'veg')}</span> : null}
                    {it.allergens.length > 0 && <span className="gm-all" title={it.allergens.map(a => allergenName(lang, a)).join(', ')}>{tr(lang, 'allergens')}: {it.allergens.map(allergenNo).join(', ')}</span>}
                  </span>
                </div>
                {room && (
                  <div className="gm-step" aria-label={dishName(lang, it)}>
                    <button aria-label="−" disabled={!open || !(counts[it.dishId] ?? 0)} onClick={() => step(it, -1)}>−</button>
                    <b>{counts[it.dishId] ?? 0}</b>
                    <button aria-label="+" disabled={!open || sum >= room.persons} onClick={() => step(it, 1)}>+</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {room && !open && room.note && <p className="gm-hint" style={{ marginTop: 18 }}>{tr(lang, 'noteLabel')}: {room.note}</p>}
      {room && open && <>
        <label className="gm-note-field">{tr(lang, 'noteLabel')}
          <textarea value={note} maxLength={500} rows={2} placeholder={tr(lang, 'notePh')} onChange={e => { setNote(e.target.value); setMsg(null); }} /></label>
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
