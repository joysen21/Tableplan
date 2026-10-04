'use strict';
/* =========================================================
   6) UI-Helfer: Modal, Bestätigung, Drag & Drop (Maus + Touch)
   ========================================================= */
let DRAGGING = false;
function openModal(title, body, buttons = [], onMount) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg'; bg.id = 'modalBg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mh"><h2>${esc(title)}</h2>
    <button class="btn small" data-x aria-label="Schließen">✕</button></div><div class="mb">${body}</div>
    ${buttons.length ? `<div class="mf">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-b="${i}">${esc(b.label)}</button>`).join('')}</div>` : ''}</div>`;
  document.body.appendChild(bg);
  bg.addEventListener('pointerdown', e => { if (e.target === bg) bg.dataset.down = '1'; });
  bg.addEventListener('click', e => { if (e.target === bg && bg.dataset.down) closeModal(); delete bg.dataset.down; });
  $('[data-x]', bg).onclick = closeModal;
  $$('[data-b]', bg).forEach(el => el.onclick = () => { const b = buttons[+el.dataset.b]; if (b.action && b.action(bg) === false) return; if (!b.keep) closeModal(); });
  if (onMount) onMount(bg);
  return bg;
}
function closeModal() { const m = $('#modalBg'); if (m) m.remove(); }
const modalOpen = () => !!$('#modalBg');
function confirmModal(title, lines, onYes, yesLabel = 'Trotzdem speichern') {
  openModal(title, `<div class="warnbox">${lines.map(esc).join('<br>')}</div>`,
    [{ label: 'Abbrechen' }, { label: yesLabel, cls: 'primary', action: () => { setTimeout(onYes, 0); } }]);
}

/** Startet ein Ziehen per Pointer (funktioniert mit Maus und Touch). Ohne Bewegung = Klick */
function startDrag(e, { label, onDrop, onClick, onMove }) {
  if (e.button > 0) return;
  const sx = e.clientX, sy = e.clientY; let ghost = null, moved = false;
  const mv = ev => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
    moved = true; DRAGGING = true;
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.textContent = label; document.body.appendChild(ghost); }
    ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
    if (onMove) onMove(ev);
  };
  const up = ev => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    if (ghost) ghost.remove();
    setTimeout(() => DRAGGING = false, 0);
    if (moved) { const el = document.elementFromPoint(ev.clientX, ev.clientY); onDrop && onDrop(el, ev); }
    else if (ev.type === 'pointerup') onClick && onClick();
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
const dropTableId = el => { const g = el && el.closest && el.closest('[data-table-id]'); return g ? g.dataset.tableId : null; };
function svgPoint(svg, ev) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }

/** Änderung an einer Reservierung mit Konfliktprüfung übernehmen */
function applyRes(r, mutate, what) {
  const draft = JSON.parse(JSON.stringify(r)); mutate(draft);
  const commit = () => {
    if (r.stayId && JSON.stringify(r.tableIds) !== JSON.stringify(draft.tableIds)) draft.manualTable = true;
    Object.assign(r, draft); log(what || 'Reservierung geändert', `${r.name} ${r.date} ${r.time} → ${tblNames(r.tableIds) || 'ohne Tisch'}`);
    save(); render(); toast('Gespeichert');
  };
  const w = conflicts(draft);
  if (w.length) confirmModal('Bitte prüfen', w, commit); else commit();
}
const canEdit = () => S.user && (S.user.role === 'admin' || S.user.role === 'empfang');
const canStatus = () => S.user && S.user.role !== 'kueche';

/* =========================================================
   7) Raumplan (SVG) – gemeinsam für Live, Editor, Hotel
   ========================================================= */
function chairsSVG(tb) {
  const out = [], n = +tb.max, w = +tb.w, h = +tb.h, c = (x, y) => out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" class="chair"/>`);
  if (tb.shape === 'round') {
    const rx = w / 2 + 10, ry = h / 2 + 10;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; c(Math.cos(a) * rx, Math.sin(a) * ry); }
  } else if (tb.shape === 'square' && n > 2 && n <= 4) {
    [[0, -h / 2 - 10], [w / 2 + 10, 0], [0, h / 2 + 10], [-w / 2 - 10, 0]].slice(0, n).forEach(p => c(...p));
  } else {
    const horiz = w >= h, len = horiz ? w : h, other = (horiz ? h : w) / 2 + 10;
    const sides = tb.shape === 'bench' ? [n, 0] : [Math.ceil(n / 2), Math.floor(n / 2)];
    sides.forEach((k, s) => { for (let i = 0; i < k; i++) { const pos = -len / 2 + len * (i + 0.5) / k, off = s ? other : -other; horiz ? c(pos, off) : c(off, pos); } });
    if (tb.shape === 'bench') out.push(horiz ? `<rect x="${-w / 2}" y="${h / 2 + 2}" width="${w}" height="12" rx="4" class="benchseat"/>`
      : `<rect x="${w / 2 + 2}" y="${-h / 2}" width="12" height="${h}" rx="4" class="benchseat"/>`);
  }
  return out.join('');
}
function decorSVG(d, sel) {
  const w = +d.w, h = +d.h, cls = sel ? ' sel' : '';
  const body = {
    wall: `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="var(--decor)"/>`,
    door: `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6 4"/>`,
    bar: `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="8" fill="var(--decor)"/>`,
    buffet: `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6" fill="var(--decor)" opacity=".7"/>`,
    column: `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="var(--decor)"/>`,
    plant: `<circle r="${w / 2}" fill="#2da44e" opacity=".35"/>`,
    label: ''
  }[d.type] || '';
  const txt = d.text ? `<text text-anchor="middle" dy="4" font-size="13" fill="var(--muted)">${esc(d.text)}</text>` : '';
  return `<g class="decor${cls}" data-decor-id="${d.id}" transform="translate(${d.x} ${d.y}) rotate(${d.rot || 0})">${body}${txt}
    ${sel ? `<rect x="${-w / 2 - 4}" y="${-h / 2 - 4}" width="${w + 8}" height="${h + 8}" fill="none" stroke="var(--accent)" stroke-dasharray="4 3"/>` : ''}</g>`;
}

/**
 * opts.mode: 'live' | 'edit' | 'assign'
 * opts.status(tb) → {st, r} ; opts.sel → ausgewählte ID ; opts.highlight → Set von Tisch-IDs
 */
function planSVG(room, opts = {}) {
  const tables = DB.tables.filter(x => x.roomId === room.id);
  const decor = DB.decor.filter(x => x.roomId === room.id);
  const parts = [];
  parts.push(`<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--plan-grid)" stroke-width="1"/></pattern></defs>`);
  parts.push(`<rect width="${room.w}" height="${room.h}" fill="url(#grid)"/>`);
  if (room.bg) parts.push(`<image href="${room.bg}" x="0" y="0" width="${room.w}" height="${room.h}" preserveAspectRatio="xMidYMid meet" opacity="${opts.mode === 'edit' ? .55 : .35}"/>`);
  for (const d of decor) parts.push(decorSVG(d, opts.mode === 'edit' && opts.sel === d.id));
  // Verbindungslinien für kombinierte Tische einer Reservierung
  if (opts.status) {
    const seen = new Set();
    for (const tb of tables) {
      const s = opts.status(tb); if (!s.r || seen.has(s.r.id) || (s.r.tableIds || []).length < 2) continue; seen.add(s.r.id);
      const pts = s.r.tableIds.map(tblById).filter(x => x && x.roomId === room.id);
      for (let i = 1; i < pts.length; i++) parts.push(`<line x1="${pts[i - 1].x}" y1="${pts[i - 1].y}" x2="${pts[i].x}" y2="${pts[i].y}" stroke="var(--text)" stroke-width="3" stroke-dasharray="6 5" opacity=".5"/>`);
    }
  }
  for (const tb of tables) {
    const s = opts.status ? opts.status(tb) : { st: 'frei' };
    const fill = `var(--st-${s.st})`, light = s.st === 'frei';
    const station = DB.stations.find(x => x.id === tb.station);
    const sel = opts.sel === tb.id, hl = opts.highlight && opts.highlight.has(tb.id);
    const w = +tb.w, h = +tb.h;
    const shape = tb.shape === 'round' ? `<ellipse rx="${w / 2}" ry="${h / 2}" fill="${fill}" class="tbody"/>`
      : `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="7" fill="${fill}" class="tbody"/>`;
    const outline = (opts.showStations && station) ? (tb.shape === 'round' ? `<ellipse rx="${w / 2 + 3}" ry="${h / 2 + 3}" fill="none" stroke="${station.color}" stroke-width="4"/>`
      : `<rect x="${-w / 2 - 3}" y="${-h / 2 - 3}" width="${w + 6}" height="${h + 6}" rx="9" fill="none" stroke="${station.color}" stroke-width="4"/>`) : '';
    const selR = (sel || hl) ? `<rect x="${-w / 2 - 16}" y="${-h / 2 - 16}" width="${w + 32}" height="${h + 32}" rx="12" fill="none" stroke="${hl ? 'var(--hotel)' : 'var(--accent)'}" stroke-width="3" stroke-dasharray="6 4"/>` : '';
    const col = light ? 'var(--text)' : '#fff';
    const lines = [`<tspan x="0" font-weight="700" font-size="14">${esc(tb.name)} ${TABLE_ST_ICON[s.st] || ''}</tspan>`];
    if (opts.mode !== 'edit') {
      const r = s.r || s.next;
      const small = Math.min(w, h) < 66, maxLen = small ? 7 : 12;
      if (r && (s.r || opts.mode === 'assign')) {
        const nm = r.name.split(' · ')[0];
        lines.push(`<tspan x="0" dy="14" font-size="11">${esc(nm.length > maxLen ? nm.slice(0, maxLen - 1) + '…' : nm)}</tspan>`);
        if (small) lines.push(`<tspan x="0" dy="13" font-size="10">${persons(r)}P${r.stayId ? '⌂' : ''}${r.allergies ? '⚠' : ''}</tspan>`); else lines.push(`<tspan x="0" dy="13" font-size="11">${r.time} · ${persons(r)}P${r.stayId ? ' ⌂' : ''}${r.allergies ? ' ⚠' : ''}${r.vip ? ' ★' : ''}</tspan>`);
      } else if (s.next) {
        lines.push(`<tspan x="0" dy="14" font-size="11" opacity=".8">ab ${s.next.time}</tspan>`);
      } else lines.push(`<tspan x="0" dy="14" font-size="11" opacity=".7">${tb.min}–${tb.max} P</tspan>`);
    } else lines.push(`<tspan x="0" dy="14" font-size="11" opacity=".7">${tb.min}–${tb.max} P</tspan>`);
    const dy = -((lines.length - 1) * 13) / 2 + 4;
    parts.push(`<g class="tb" data-table-id="${tb.id}" transform="translate(${tb.x} ${tb.y}) rotate(${tb.rot || 0})" style="cursor:pointer">
      ${selR}<g class="chairs">${chairsSVG(tb)}</g>${outline}${shape}
      <text text-anchor="middle" y="${dy}" fill="${col}" transform="rotate(${-(tb.rot || 0)})" pointer-events="none">${lines.join('')}</text>
      ${opts.mode === 'edit' && sel ? `<rect class="rs-handle" x="${w / 2 - 6}" y="${h / 2 - 6}" width="14" height="14" fill="var(--accent)" style="cursor:nwse-resize"/>` : ''}</g>`);
  }
  return `<svg class="plan" viewBox="0 0 ${room.w} ${room.h}" data-room="${room.id}"><style>.chair{fill:var(--panel);stroke:var(--muted);stroke-width:1.5}.benchseat{fill:var(--decor)}.tbody{stroke:rgba(0,0,0,.25);stroke-width:1.5}</style>${parts.join('')}</svg>`;
}
const legendHTML = () => `<div class="legend">${TABLE_ST.map(s => `<span><i style="background:var(--st-${s})"></i>${TABLE_ST_ICON[s] || ''} ${t(s)}</span>`).join('')}
  <span>⌂ Hotelgast</span><span>⚠ Allergie</span><span>★ VIP</span></div>`;

/* =========================================================
   8) App-Rahmen: Login, Kopfzeile, Navigation
   ========================================================= */
function renderLogin() {
  if (CLOUD) return Cloud.renderLogin();
  $('#app').innerHTML = `<div class="login panel"><h3>${esc(DB.betrieb)} – Anmeldung</h3><div class="body">
    <p class="muted">Benutzer wählen und PIN eingeben.</p>
    <div class="userbtns">${DB.users.map(u => `<button class="btn" data-u="${u.id}"><b>${esc(u.name)}</b><small class="muted">${t(u.role)}</small></button>`).join('')}</div>
    <p class="muted" style="font-size:12px;margin-top:14px">Demo-PINs: Admin 0000 · Empfang 1111 · Service 2222 · Küche 3333</p></div></div>`;
  $$('[data-u]').forEach(b => b.onclick = () => {
    const u = DB.users.find(x => x.id === b.dataset.u);
    openModal('PIN für ' + u.name, `<input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" style="font-size:22px;text-align:center">`,
      [{ label: 'Anmelden', cls: 'primary', keep: true, action: () => tryLogin(u) }],
      bg => { const i = $('#pin', bg); i.focus(); i.onkeydown = e => { if (e.key === 'Enter') tryLogin(u); }; });
  });
}
function tryLogin(u) {
  if ($('#pin').value !== u.pin) { toast('PIN falsch', 'err'); return; }
  closeModal(); S.user = u; S.view = ROLE_VIEWS[u.role][0];
  try { sessionStorage.setItem('tischplan.user', u.id); } catch (e) {}
  log('Anmeldung', u.name); save(); render();
}
function logout() { if (CLOUD) return Cloud.logout(); S.user = null; try { sessionStorage.removeItem('tischplan.user'); } catch (e) {} render(); }

function headerHTML() {
  const views = ROLE_VIEWS[S.user.role];
  const showCtx = ['live', 'zeit', 'res', 'berichte'].includes(S.view);
  return `<header><span class="brand">🍽 ${esc(DB.betrieb)}</span>
    <nav>${views.map(v => `<button data-view="${v}" class="${S.view === v ? 'active' : ''}">${t(v)}</button>`).join('')}</nav>
    <span class="spacer"></span>
    ${showCtx ? `<div class="ctx"><button class="btn small" data-day="-1" aria-label="Vortag">◀</button>
      <input type="date" id="ctxDate" value="${S.date}"><button class="btn small" data-day="1" aria-label="Folgetag">▶</button>
      <button class="btn small" data-day="0">Heute</button>
      <select id="ctxSvc">${DB.services.map(s => `<option value="${s.id}" ${s.id === S.serviceId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
    ${CLOUD ? Cloud.statusHTML() : ''}<button class="btn small" id="themeBtn" title="Hell/Dunkel">${getTheme() === 'dark' ? '☀' : '☾'}</button>
    <button class="btn small" id="logoutBtn" title="Abmelden">${esc(S.user.name)} ⎋</button></header>`;
}
function bindHeader() {
  $$('[data-view]').forEach(b => b.onclick = () => { S.view = b.dataset.view; render(); });
  $$('[data-day]').forEach(b => b.onclick = () => {
    const d = +b.dataset.day; S.date = d ? addDays(S.date, d) : today();
    S.follow = S.date === today() && d === 0; if (S.follow) { S.time = nowMin(); S.serviceId = serviceForTime(S.time); }
    render();
  });
  const cd = $('#ctxDate'); if (cd) cd.onchange = () => { if (cd.value) { S.date = cd.value; S.follow = false; render(); } };
  const cs = $('#ctxSvc'); if (cs) cs.onchange = () => { S.serviceId = cs.value; S.follow = false; S.time = toMin(svcById(cs.value).start) + 60; render(); };
  $('#themeBtn').onclick = () => { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); render(); };
  $('#logoutBtn').onclick = logout;
}

function render() {
  document.documentElement.dataset.theme = getTheme();
  if (CLOUD && !Cloud.ready()) return Cloud.renderGate();
  if (!S.user) return renderLogin();
  if (!ROLE_VIEWS[S.user.role].includes(S.view)) S.view = ROLE_VIEWS[S.user.role][0];
  if (!S.serviceId || !svcById(S.serviceId)) S.serviceId = serviceForTime(S.time);
  if (!S.roomId || !roomById(S.roomId)) S.roomId = DB.rooms[0] && DB.rooms[0].id;
  // Scrollpositionen merken
  const keep = {}; $$('[data-keep]').forEach(el => keep[el.dataset.keep] = [el.scrollLeft, el.scrollTop]);
  $('#app').innerHTML = headerHTML() + '<main id="main"></main>';
  bindHeader();
  const main = $('#main');
  ({ live: viewLive, zeit: viewGantt, res: viewResList, hotel: viewHotel, berichte: viewReports, editor: viewEditor, settings: viewSettings })[S.view](main);
  $$('[data-keep]').forEach(el => { const k = keep[el.dataset.keep]; if (k) { el.scrollLeft = k[0]; el.scrollTop = k[1]; } });
}

/* =========================================================
   9) Ansicht: Live-Tischplan
   ========================================================= */
function viewLive(main) {
  const room = roomById(S.roomId), svc = svcById(S.serviceId);
  const tm = S.time;
  const list = DB.reservations.filter(r => r.date === S.date && r.serviceId === S.serviceId)
    .sort((a, b) => resStart(a) - resStart(b) || a.name.localeCompare(b.name));
  const act = list.filter(r => r.status !== 'storniert' && r.status !== 'noshow');
  const covers = act.reduce((a, r) => a + persons(r), 0);
  const seated = act.filter(r => SEATED_STATES.includes(r.status)).reduce((a, r) => a + persons(r), 0);
  const unassigned = act.filter(r => !(r.tableIds || []).length && r.status !== 'abgeschlossen').length;
  const freeNow = DB.tables.filter(x => tableStatusAt(x, S.date, S.serviceId, tm).st === 'frei').length;
  const showOpen = S.liveOpenOnly;
  const shown = showOpen ? list.filter(r => occupies(r)) : list;
  main.innerHTML = `<div class="live">
    <div class="panel">
      <div class="roomtabs">${DB.rooms.map(r => `<button class="btn small ${r.id === S.roomId ? 'on' : ''}" data-room="${r.id}">${esc(r.name)}</button>`).join('')}
        <span class="spacer" style="flex:1"></span>
        <label class="chk"><input type="checkbox" id="stToggle" ${S.showStations ? 'checked' : ''}> Reviere</label>
        <input type="time" id="liveTime" value="${fromMin(tm)}" step="300" style="width:auto">
        <button class="btn small ${S.follow ? 'on' : ''}" id="nowBtn">Jetzt</button>
      </div>
      <div class="plan-wrap">${room ? planSVG(room, { mode: 'live', showStations: S.showStations, status: tb => tableStatusAt(tb, S.date, S.serviceId, tm) }) : '<p class="muted">Kein Raum angelegt.</p>'}</div>
      ${legendHTML()}
    </div>
    <div class="panel">
      <div class="kpis"><div class="kpi"><b>${act.length}</b><small>Reserv.</small></div><div class="kpi"><b>${covers}</b><small>Gäste</small></div>
        <div class="kpi"><b>${seated}</b><small>im Haus</small></div><div class="kpi"><b>${freeNow}</b><small>Tische frei</small></div>
        <div class="kpi" style="${unassigned ? 'color:var(--danger)' : ''}"><b>${unassigned}</b><small>ohne Tisch</small></div></div>
      <div class="row" style="padding:10px 12px;border-bottom:1px solid var(--line)">
        ${canEdit() ? `<button class="btn primary" id="newRes">＋ Reservierung</button><button class="btn" id="walkin">🚶 Walk-in</button>` : ''}
        <label class="chk"><input type="checkbox" id="openOnly" ${showOpen ? 'checked' : ''}> nur aktive</label></div>
      <div class="reslist" data-keep="liveList">
        ${shown.length ? shown.map(r => resItemHTML(r)).join('') : `<p class="muted" style="padding:12px">Keine Reservierungen für ${esc(svc.name)}.</p>`}
      </div>
      ${canEdit() ? '<p class="muted" style="font-size:12px;padding:8px 12px;margin:0">Tipp: Reservierung aus der Liste auf einen Tisch ziehen.</p>' : ''}
    </div></div>`;

  $$('[data-room]', main).forEach(b => b.onclick = () => { S.roomId = b.dataset.room; render(); });
  $('#stToggle').onchange = e => { S.showStations = e.target.checked; render(); };
  $('#openOnly').onchange = e => { S.liveOpenOnly = e.target.checked; render(); };
  $('#liveTime').onchange = e => { S.time = toMin(e.target.value); S.follow = false; render(); };
  $('#nowBtn').onclick = () => { S.follow = true; S.date = today(); S.time = nowMin(); S.serviceId = serviceForTime(S.time); render(); };
  if ($('#newRes')) $('#newRes').onclick = () => openResForm(null, {});
  if ($('#walkin')) $('#walkin').onclick = () => openWalkin();

  // Tische: Klick = Details, Ziehen = Reservierung verschieben
  $$('.tb', main).forEach(g => g.addEventListener('pointerdown', e => {
    const tb = tblById(g.dataset.tableId), s = tableStatusAt(tb, S.date, S.serviceId, tm);
    startDrag(e, {
      label: s.r ? `${s.r.name} → ?` : tb.name,
      onClick: () => openTablePopup(tb),
      onDrop: el => {
        const to = dropTableId(el);
        if (!s.r || !canEdit() || !to || to === tb.id) return;
        applyRes(s.r, d => { d.tableIds = d.tableIds.map(x => x === tb.id ? to : x); }, 'Tisch gewechselt');
      }
    });
  }));
  // Liste: Klick = bearbeiten, Ziehen auf Tisch = zuweisen
  $$('.ritem', main).forEach(it => it.addEventListener('pointerdown', e => {
    const r = DB.reservations.find(x => x.id === it.dataset.res);
    startDrag(e, {
      label: `${r.name} (${persons(r)}P)`,
      onClick: () => canEdit() ? openResForm(r) : openResInfo(r),
      onDrop: el => { const to = dropTableId(el); if (to && canEdit()) applyRes(r, d => { d.tableIds = [to]; }, 'Tisch zugewiesen'); }
    });
  }));
}
function resItemHTML(r, showDate) {
  const unas = occupies(r) && !(r.tableIds || []).length;
  const w = conflicts(r);
  return `<div class="ritem ${unas ? 'unassigned' : ''} ${occupies(r) || r.status === 'abgeschlossen' ? '' : 'cancel'}" data-res="${r.id}">
    <div class="time">${showDate ? fmtShort(r.date) + '<br>' : ''}${r.time}</div>
    <div class="main"><div class="name">${r.vip ? '★ ' : ''}${esc(r.name)}</div>
      <div class="sub">${persons(r)} P${r.children ? ` (${r.children} Ki.)` : ''} · ${(r.tableIds || []).length ? 'Tisch ' + esc(tblNames(r.tableIds)) : '<b style="color:var(--danger)">ohne Tisch</b>'}
      ${r.allergies ? ' · ⚠ ' + esc(r.allergies) : ''}${r.occasion ? ' · 🎉 ' + esc(r.occasion) : ''}</div></div>
    <div style="text-align:right">${r.stayId ? '<span class="badge hotel">Hotel</span><br>' : ''}<span class="badge st" style="background:${RES_STATUS[r.status]}">${t(r.status)}</span>
      ${w.length ? `<br><span class="badge warn" title="${esc(w.join('\n'))}">⚠ ${w.length}</span>` : ''}</div></div>`;
}

/** Popup beim Antippen eines Tisches */
function openTablePopup(tb) {
  const s = tableStatusAt(tb, S.date, S.serviceId, S.time);
  const r = s.r && (SEATED_STATES.includes(s.r.status) || s.st !== 'bald' ? s.r : s.r);
  const dayRes = DB.reservations.filter(x => x.date === S.date && (x.tableIds || []).includes(tb.id) && x.status !== 'storniert')
    .sort((a, b) => resStart(a) - resStart(b));
  const blocked = isBlocked(tb, S.date, S.serviceId);
  const st = DB.stations.find(x => x.id === tb.station);
  let body = `<p class="muted" style="margin-top:0">${tb.min}–${tb.max} Personen · ${esc(roomById(tb.roomId).name)}${st ? ' · ' + esc(st.name) : ''}
    ${(tb.props || []).length ? '<br>' + tb.props.map(t).join(', ') : ''} · Status: <b>${t(s.st)}</b></p>`;
  if (r) {
    const stay = r.stayId && stayById(r.stayId);
    body += `<div class="infobox"><b>${r.vip ? '★ ' : ''}${esc(r.name)}</b> · ${persons(r)} P${r.children ? ` (${r.children} Kinder)` : ''} · ${r.time}–${fromMin(resEnd(r))}
      ${stay ? `<br>Hotelgast Zi. ${esc(stay.room)} · ${t(stay.board)} · bis ${fmtShort(stay.departure)}` : ''}
      ${r.allergies ? `<br>⚠ <b>${esc(r.allergies)}</b>` : ''}${r.occasion ? `<br>🎉 ${esc(r.occasion)}` : ''}${r.highchair ? '<br>Kinderstuhl' : ''}
      ${r.notes ? `<br>📝 ${esc(r.notes)}` : ''}<br>Status: <b>${t(r.status)}</b> · Tisch(e): ${esc(tblNames(r.tableIds))}</div>`;
    if (canStatus()) body += `<div class="stbtns">${['eingetroffen', 'platziert', 'rechnung', 'abgeschlossen', 'noshow', 'storniert']
      .map(x => `<button class="btn ${r.status === x ? 'on' : ''}" data-st="${x}" style="border-left:5px solid ${RES_STATUS[x]}">${t(x)}</button>`).join('')}</div>`;
    if (canEdit()) {
      const freeT = DB.tables.filter(x => x.id !== tb.id && !(r.tableIds || []).includes(x.id) && !tableBusy(x.id, r.date, resStart(r), resEnd(r), r.id).length);
      body += `<div class="row" style="margin-top:12px"><select id="addTbl" style="width:auto"><option value="">Tisch dazunehmen…</option>${freeT.map(x => `<option value="${x.id}">${esc(x.name)} (${x.max}P, ${esc(roomById(x.roomId).name)})</option>`).join('')}</select>
        ${(r.tableIds || []).length > 1 ? `<button class="btn" id="splitTbl">${esc(tb.name)} abtrennen</button>` : ''}</div>`;
    }
  } else if (!blocked && canEdit()) {
    body += `<div class="row"><button class="btn primary" id="wiHere">🚶 Walk-in hier platzieren</button><button class="btn" id="resHere">＋ Reservierung für diesen Tisch</button></div>`;
  }
  if (blocked) body += `<div class="warnbox">Gesperrt: ${esc((tb.blocks.find(b => b.date === S.date && (!b.serviceId || b.serviceId === S.serviceId)) || {}).reason || '')}</div>`;
  body += `<h4 style="margin:16px 0 6px">Heute an diesem Tisch</h4>${dayRes.length ? dayRes.map(x => `<div class="row" style="font-size:13px;padding:3px 0">
    <b>${x.time}–${fromMin(resEnd(x))}</b> ${esc(x.name)} · ${persons(x)}P <span class="badge st" style="background:${RES_STATUS[x.status]}">${t(x.status)}</span></div>`).join('') : '<p class="muted">Keine Reservierungen.</p>'}`;
  const btns = [];
  if (canEdit()) btns.push({ label: blocked ? 'Sperre aufheben' : 'Tisch sperren', action: () => toggleBlock(tb, blocked) });
  if (r && canEdit()) btns.push({ label: 'Reservierung bearbeiten', cls: 'primary', action: () => setTimeout(() => openResForm(r), 0) });
  btns.push({ label: 'Schließen' });
  openModal('Tisch ' + tb.name, body, btns, bg => {
    $$('[data-st]', bg).forEach(b => b.onclick = () => { setStatus(r, b.dataset.st); closeModal(); });
    const at = $('#addTbl', bg); if (at) at.onchange = () => { if (at.value) { closeModal(); applyRes(r, d => d.tableIds.push(at.value), 'Tische zusammengelegt'); } };
    const sp = $('#splitTbl', bg); if (sp) sp.onclick = () => { closeModal(); applyRes(r, d => { d.tableIds = d.tableIds.filter(x => x !== tb.id); }, 'Tisch abgetrennt'); };
    const wh = $('#wiHere', bg); if (wh) wh.onclick = () => { closeModal(); openWalkin(tb); };
    const rh = $('#resHere', bg); if (rh) rh.onclick = () => { closeModal(); openResForm(null, { tableIds: [tb.id], time: fromMin(Math.max(toMin(svcById(S.serviceId).start), Math.ceil(S.time / 15) * 15)) }); };
  });
}
function toggleBlock(tb, blocked) {
  if (blocked) {
    tb.blocks = tb.blocks.filter(b => !(b.date === S.date && (!b.serviceId || b.serviceId === S.serviceId)));
    log('Tischsperre aufgehoben', tb.name); save(); render(); return;
  }
  setTimeout(() => openModal('Tisch ' + tb.name + ' sperren', `<div class="grid2"><label>Datum<input type="date" id="bDate" value="${S.date}"></label>
    <label>Service<select id="bSvc"><option value="">ganzer Tag</option>${DB.services.map(s => `<option value="${s.id}" ${s.id === S.serviceId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
    <label>Grund<input id="bReason" placeholder="z. B. defekt, Event, Personal"></label>`,
    [{ label: 'Abbrechen' }, { label: 'Sperren', cls: 'primary', action: bg => {
      tb.blocks.push({ date: $('#bDate', bg).value, serviceId: $('#bSvc', bg).value || null, reason: $('#bReason', bg).value });
      log('Tisch gesperrt', tb.name); save(); render();
    } }]), 0);
}
function setStatus(r, st) {
  const old = r.status; r.status = st;
  if (st === 'platziert' && old !== 'platziert' && r.date === today()) {
    // Ankunftszeit festhalten (für spätere Auswertungen der Verweildauer)
    r.seatedAt = nowMin();
  }
  if (st === 'abgeschlossen' && r.seatedAt != null && r.date === today()) r.finishedAt = nowMin();
  log('Status geändert', `${r.name}: ${t(old)} → ${t(st)}`); save(); render();
}
function openResInfo(r) {
  openModal(r.name, `<p>${fmtDate(r.date)} · ${r.time} · ${persons(r)} P · Tisch ${esc(tblNames(r.tableIds) || '–')}</p>
    ${r.allergies ? `<div class="warnbox">Allergien: ${esc(r.allergies)}</div>` : ''}${r.notes ? `<p>📝 ${esc(r.notes)}</p>` : ''}
    ${canStatus() ? `<div class="stbtns">${['eingetroffen', 'platziert', 'rechnung', 'abgeschlossen', 'noshow'].map(x => `<button class="btn ${r.status === x ? 'on' : ''}" data-st="${x}">${t(x)}</button>`).join('')}</div>` : ''}`,
    [{ label: 'Schließen' }], bg => $$('[data-st]', bg).forEach(b => b.onclick = () => { setStatus(r, b.dataset.st); closeModal(); }));
}

/** Walk-in: Personenzahl → Tischvorschläge → sofort platzieren */
function openWalkin(fixedTable) {
  const st = { p: 2, name: '' };
  const draw = bg => {
    $('#wiP', bg).textContent = st.p;
    const tm = Math.max(S.date === today() ? nowMin() : S.time, 0);
    const draft = { id: '_new', date: S.date, serviceId: S.serviceId, time: fromMin(Math.round(tm / 5) * 5), adults: st.p, children: 0, duration: turnTime(S.serviceId, st.p), status: 'platziert', tableIds: [] };
    const sug = fixedTable ? [{ ids: [fixedTable.id] }] : suggestTables(draft, 8);
    $('#wiSug', bg).innerHTML = sug.length ? sug.map((s, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-ids="${s.ids.join(',')}">${esc(tblNames(s.ids))} (${capOf(s.ids).max}P)</button>`).join('')
      : '<span class="warnbox">Aktuell kein passender Tisch frei.</span>';
    $$('[data-ids]', bg).forEach(b => b.onclick = () => {
      const r = Object.assign(draft, { id: uid(), name: $('#wiName', bg).value || 'Walk-in', source: 'Walk-in', tableIds: b.dataset.ids.split(','), createdAt: Date.now(), seatedAt: nowMin() });
      const w = conflicts(r);
      const commit = () => { DB.reservations.push(r); log('Walk-in platziert', `${r.name} ${r.adults}P → ${tblNames(r.tableIds)}`); save(); render(); toast('Walk-in platziert'); };
      closeModal(); if (w.length) confirmModal('Bitte prüfen', w, commit, 'Trotzdem platzieren'); else commit();
    });
  };
  openModal('Walk-in' + (fixedTable ? ' an ' + fixedTable.name : ''), `<div class="row" style="justify-content:center;gap:16px">
      <button class="btn" id="wiMinus" style="font-size:24px;min-width:60px">−</button><b id="wiP" style="font-size:36px;min-width:50px;text-align:center"></b>
      <button class="btn" id="wiPlus" style="font-size:24px;min-width:60px">＋</button><span class="muted">Personen</span></div>
    <label style="margin-top:12px">Name (optional)<input id="wiName" placeholder="Walk-in"></label>
    <h4 style="margin:14px 0 6px">${fixedTable ? 'Tisch' : 'Freie Tische (beste Passung zuerst)'}</h4><div class="sugg" id="wiSug"></div>`,
    [{ label: 'Abbrechen' }], bg => {
      $('#wiMinus', bg).onclick = () => { st.p = Math.max(1, st.p - 1); draw(bg); };
      $('#wiPlus', bg).onclick = () => { st.p = Math.min(40, st.p + 1); draw(bg); };
      draw(bg);
    });
}
