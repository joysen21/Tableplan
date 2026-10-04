'use strict';
/* =========================================================
   15) Ansicht: Raumplan-Editor (Admin)
   ========================================================= */
const DECOR_TYPES = { wall: 'Wand', door: 'Tür', bar: 'Bar/Theke', buffet: 'Buffet', column: 'Säule', plant: 'Pflanze', label: 'Text' };
const SHAPES = { round: 'Rund', square: 'Quadratisch', rect: 'Rechteckig', bench: 'Bank/Sitzgruppe' };
function viewEditor(main) {
  const E = S.edit; if (!E.roomId || !roomById(E.roomId)) E.roomId = DB.rooms[0] && DB.rooms[0].id;
  const room = roomById(E.roomId);
  const selT = E.sel && tblById(E.sel), selD = E.sel && DB.decor.find(x => x.id === E.sel);
  DB.layouts = DB.layouts || [];
  const layouts = DB.layouts.filter(l => l.roomId === E.roomId);
  main.innerHTML = `<div class="editor">
    <div class="panel toolbox"><h3>Raum</h3><div class="body">
      <select id="eRoom">${DB.rooms.map(r => `<option value="${r.id}" ${r.id === E.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      ${room ? `<label style="margin-top:8px">Name<input id="eRoomName" value="${esc(room.name)}"></label>
      <div class="grid2" style="margin-top:6px"><label>Breite<input type="number" id="eRoomW" value="${room.w}" step="50"></label><label>Höhe<input type="number" id="eRoomH" value="${room.h}" step="50"></label></div>
      <label style="margin-top:6px">Grundriss-Bild<input type="file" id="eBg" accept="image/*"></label>
      ${room.bg ? '<button class="btn small" id="eBgDel" style="margin-top:4px">Bild entfernen</button>' : ''}` : ''}
      <button class="btn" id="eRoomAdd" style="margin-top:10px">＋ Neuer Raum</button>
      ${room ? '<button class="btn danger" id="eRoomDel">Raum löschen</button>' : ''}</div>
      <h3>Tisch hinzufügen</h3><div class="body">${Object.entries(SHAPES).map(([k, v]) => `<button class="btn" data-addt="${k}">${v}</button>`).join('')}</div>
      <h3>Element hinzufügen</h3><div class="body">${Object.entries(DECOR_TYPES).map(([k, v]) => `<button class="btn" data-addd="${k}">${v}</button>`).join('')}</div>
      <h3>Layout-Varianten</h3><div class="body">
        ${layouts.map(l => `<div class="row" style="margin-bottom:6px"><button class="btn small" data-lload="${l.id}" style="flex:1">${esc(l.name)}</button><button class="btn small danger" data-ldel="${l.id}">✕</button></div>`).join('') || '<p class="muted" style="margin:0 0 6px;font-size:12px">Keine Varianten gespeichert.</p>'}
        <button class="btn small" id="lSave">Aktuelles Layout speichern…</button></div>
    </div>
    <div class="panel"><div class="plan-wrap">${room ? planSVG(room, { mode: 'edit', sel: E.sel, showStations: true }) : '<p class="muted">Bitte Raum anlegen.</p>'}</div>
      <p class="muted" style="font-size:12px;padding:0 12px 10px;margin:0">Ziehen zum Verschieben (Raster 10) · blaues Quadrat = Größe ändern · Klick auf freie Fläche = Auswahl aufheben</p></div>
    <div class="panel props"><h3>${selT ? 'Tisch ' + esc(selT.name) : selD ? DECOR_TYPES[selD.type] : 'Reviere & Kombinationen'}</h3><div class="body">${selT ? tableProps(selT) : selD ? decorProps(selD) : stationProps()}</div></div>
  </div>`;
  bindEditor(main, room);
}
function tableProps(tb) {
  return `<div class="grid2"><label>Name/Nr.<input data-p="name" value="${esc(tb.name)}"></label><label>Form<select data-p="shape">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}" ${tb.shape === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Min. Pers.<input type="number" data-p="min" min="1" value="${tb.min}"></label><label>Max. Pers.<input type="number" data-p="max" min="1" value="${tb.max}"></label>
    <label>Breite<input type="number" data-p="w" step="2" value="${tb.w}"></label><label>Höhe<input type="number" data-p="h" step="2" value="${tb.h}"></label>
    <label>Drehung °<input type="number" data-p="rot" step="15" value="${tb.rot || 0}"></label>
    <label>Revier<select data-p="station"><option value="">–</option>${DB.stations.map(s => `<option value="${s.id}" ${tb.station === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label>Raum<select data-p="roomId">${DB.rooms.map(r => `<option value="${r.id}" ${tb.roomId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>
    <div style="margin:8px 0">${PROPS.map(p => `<label class="chk"><input type="checkbox" data-prop="${p}" ${(tb.props || []).includes(p) ? 'checked' : ''}> ${t(p)}</label>`).join('')}</div>
    <div class="row"><button class="btn small" id="eDup">Duplizieren</button><button class="btn small danger" id="eDel">Löschen</button></div>`;
}
function decorProps(d) {
  return `<div class="grid2"><label>Typ<select data-p="type">${Object.entries(DECOR_TYPES).map(([k, v]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Text<input data-p="text" value="${esc(d.text)}"></label><label>Breite<input type="number" data-p="w" value="${d.w}"></label><label>Höhe<input type="number" data-p="h" value="${d.h}"></label>
    <label>Drehung °<input type="number" data-p="rot" step="15" value="${d.rot || 0}"></label></div>
    <div class="row" style="margin-top:8px"><button class="btn small" id="eDup">Duplizieren</button><button class="btn small danger" id="eDel">Löschen</button></div>`;
}
function stationProps() {
  return `<p class="muted" style="margin-top:0;font-size:13px">Tisch anklicken, um ihn zu bearbeiten.</p><h4 style="margin:6px 0">Service-Reviere</h4>
    ${DB.stations.map(s => `<div class="row" style="margin-bottom:6px"><input type="color" data-stc="${s.id}" value="${s.color}" style="width:44px;padding:2px"><input data-stn="${s.id}" value="${esc(s.name)}" style="flex:1;width:auto">
      <button class="btn small danger" data-std="${s.id}">✕</button></div>`).join('')}
    <button class="btn small" id="stAdd">＋ Revier</button>
    <h4 style="margin:14px 0 6px">Feste Tischkombinationen</h4>
    ${DB.combos.map(c => `<div class="row" style="margin-bottom:4px"><span style="flex:1">${esc(tblNames(c.tableIds))} (${capOf(c.tableIds).max}P)</span><button class="btn small danger" data-cd="${c.id}">✕</button></div>`).join('')}
    <div class="row"><input id="cNew" placeholder="z. B. T7+T8" style="flex:1;width:auto"><button class="btn small" id="cAdd">＋</button></div>`;
}
function bindEditor(main, room) {
  const E = S.edit;
  const commit = (msg) => { save(); render(); if (msg) log(msg, ''); };
  $('#eRoom').onchange = e => { E.roomId = e.target.value; E.sel = null; render(); };
  $('#eRoomAdd').onclick = () => { const r = { id: uid(), name: 'Neuer Raum', w: 900, h: 600, bg: '' }; DB.rooms.push(r); E.roomId = r.id; E.sel = null; commit('Raum angelegt'); };
  if (room) {
    $('#eRoomName').onchange = e => { room.name = e.target.value || room.name; commit(); };
    $('#eRoomW').onchange = e => { room.w = Math.max(300, +e.target.value); commit(); };
    $('#eRoomH').onchange = e => { room.h = Math.max(200, +e.target.value); commit(); };
    $('#eBg').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 1.5e6) return toast('Bild zu groß (max. 1,5 MB) – bitte verkleinern', 'err');
      const rd = new FileReader(); rd.onload = () => { room.bg = rd.result; commit('Grundriss hochgeladen'); }; rd.readAsDataURL(f);
    };
    if ($('#eBgDel')) $('#eBgDel').onclick = () => { room.bg = ''; commit(); };
    $('#eRoomDel').onclick = () => {
      const used = DB.tables.filter(x => x.roomId === room.id).length;
      confirmModal('Raum löschen?', [`${room.name} mit ${used} Tischen wird gelöscht. Zugewiesene Reservierungen verlieren ihren Tisch.`], () => {
        const ids = DB.tables.filter(x => x.roomId === room.id).map(x => x.id);
        DB.reservations.forEach(r => r.tableIds = (r.tableIds || []).filter(x => !ids.includes(x)));
        DB.stays.forEach(s => s.tableIds = (s.tableIds || []).filter(x => !ids.includes(x)));
        DB.tables = DB.tables.filter(x => x.roomId !== room.id); DB.decor = DB.decor.filter(x => x.roomId !== room.id);
        DB.combos = DB.combos.filter(c => !c.tableIds.some(x => ids.includes(x)));
        DB.rooms.splice(DB.rooms.indexOf(room), 1); E.roomId = null; E.sel = null; commit('Raum gelöscht');
      }, 'Löschen');
    };
  }
  $$('[data-addt]', main).forEach(b => b.onclick = () => {
    if (!room) return;
    const sh = b.dataset.addt, dims = { round: [90, 90, 2, 4], square: [70, 70, 2, 4], rect: [160, 80, 4, 8], bench: [60, 160, 3, 5] }[sh];
    let n = DB.tables.length + 1; while (DB.tables.some(x => x.name === 'T' + n)) n++;
    const tb = { id: uid(), roomId: room.id, name: 'T' + n, shape: sh, x: room.w / 2, y: room.h / 2, w: dims[0], h: dims[1], rot: 0, min: dims[2], max: dims[3], station: '', props: [], blocks: [] };
    DB.tables.push(tb); E.sel = tb.id; commit('Tisch angelegt');
  });
  $$('[data-addd]', main).forEach(b => b.onclick = () => {
    if (!room) return;
    const ty = b.dataset.addd, dims = { wall: [300, 10], door: [80, 14], bar: [200, 50], buffet: [60, 200], column: [26, 26], plant: [40, 40], label: [160, 20] }[ty];
    const d = { id: uid(), roomId: room.id, type: ty, x: room.w / 2, y: room.h / 2, w: dims[0], h: dims[1], rot: 0, text: ty === 'label' ? 'Text' : '' };
    DB.decor.push(d); E.sel = d.id; commit();
  });
  // Layout-Varianten
  $('#lSave').onclick = () => openModal('Layout speichern', '<label>Name der Variante<input id="lName" placeholder="z. B. Bankett, Sommer, Hochzeit"></label>', [{ label: 'Abbrechen' }, { label: 'Speichern', cls: 'primary', action: bg => {
    const pos = {}; DB.tables.filter(x => x.roomId === room.id).forEach(x => pos[x.id] = { x: x.x, y: x.y, rot: x.rot, w: x.w, h: x.h, shape: x.shape, min: x.min, max: x.max });
    DB.layouts.push({ id: uid(), roomId: room.id, name: $('#lName', bg).value || 'Variante', pos }); commit('Layout-Variante gespeichert');
  } }]);
  $$('[data-lload]', main).forEach(b => b.onclick = () => { const l = DB.layouts.find(x => x.id === b.dataset.lload);
    DB.tables.forEach(x => { if (l.pos[x.id]) Object.assign(x, l.pos[x.id]); }); commit('Layout-Variante geladen: ' + l.name); toast('Layout „' + l.name + '“ aktiv'); });
  $$('[data-ldel]', main).forEach(b => b.onclick = () => { DB.layouts = DB.layouts.filter(x => x.id !== b.dataset.ldel); commit(); });

  // Eigenschaften
  const selObj = tblById(E.sel) || DB.decor.find(x => x.id === E.sel);
  $$('[data-p]', main).forEach(el => el.onchange = () => {
    const k = el.dataset.p; let v = el.value;
    if (['min', 'max', 'w', 'h', 'rot'].includes(k)) v = +v || 0;
    if (k === 'roomId' && v !== selObj.roomId) { E.roomId = v; }
    selObj[k] = v; if (selObj.min > selObj.max) selObj.max = selObj.min; commit();
  });
  $$('[data-prop]', main).forEach(el => el.onchange = () => { const p = el.dataset.prop; selObj.props = (selObj.props || []).filter(x => x !== p); if (el.checked) selObj.props.push(p); commit(); });
  if ($('#eDup')) $('#eDup').onclick = () => {
    const c = JSON.parse(JSON.stringify(selObj)); c.id = uid(); c.x += 30; c.y += 30;
    if (c.name) { let n = 2; while (DB.tables.some(x => x.name === selObj.name + '-' + n)) n++; c.name = selObj.name + '-' + n; c.blocks = []; DB.tables.push(c); } else DB.decor.push(c);
    E.sel = c.id; commit();
  };
  if ($('#eDel')) $('#eDel').onclick = () => {
    if (selObj.name !== undefined && DB.tables.includes(selObj)) {
      const refs = DB.reservations.filter(r => (r.tableIds || []).includes(selObj.id) && r.date >= today() && occupies(r)).length;
      const doDel = () => { DB.tables.splice(DB.tables.indexOf(selObj), 1); DB.reservations.forEach(r => r.tableIds = (r.tableIds || []).filter(x => x !== selObj.id));
        DB.stays.forEach(s => s.tableIds = (s.tableIds || []).filter(x => x !== selObj.id)); DB.combos = DB.combos.filter(c => !c.tableIds.includes(selObj.id)); E.sel = null; commit('Tisch gelöscht: ' + selObj.name); };
      if (refs) confirmModal('Tisch löschen?', [`${refs} künftige Reservierung(en) verlieren den Tisch ${selObj.name}.`], doDel, 'Löschen'); else doDel();
    } else { DB.decor.splice(DB.decor.indexOf(selObj), 1); E.sel = null; commit(); }
  };
  // Reviere & Kombinationen
  $$('[data-stc]', main).forEach(el => el.onchange = () => { DB.stations.find(s => s.id === el.dataset.stc).color = el.value; commit(); });
  $$('[data-stn]', main).forEach(el => el.onchange = () => { DB.stations.find(s => s.id === el.dataset.stn).name = el.value; commit(); });
  $$('[data-std]', main).forEach(el => el.onclick = () => { DB.stations = DB.stations.filter(s => s.id !== el.dataset.std); DB.tables.forEach(x => { if (x.station === el.dataset.std) x.station = ''; }); commit(); });
  if ($('#stAdd')) $('#stAdd').onclick = () => { DB.stations.push({ id: uid(), name: 'Revier ' + (DB.stations.length + 1), color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') }); commit(); };
  $$('[data-cd]', main).forEach(el => el.onclick = () => { DB.combos = DB.combos.filter(c => c.id !== el.dataset.cd); commit(); });
  if ($('#cAdd')) $('#cAdd').onclick = () => {
    const names = $('#cNew').value.split(/[+,; ]+/).filter(Boolean), ids = names.map(n => (DB.tables.find(x => x.name.toLowerCase() === n.toLowerCase()) || {}).id);
    if (ids.length < 2 || ids.some(x => !x)) return toast('Mindestens zwei gültige Tischnamen, z. B. T7+T8', 'err');
    DB.combos.push({ id: uid(), name: names.join('+'), tableIds: ids }); commit('Kombination angelegt');
  };

  // Ziehen/Größe im Plan
  const svg = $('svg.plan', main); if (!svg) return;
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-table-id],[data-decor-id]');
    if (!g) { if (E.sel) { E.sel = null; render(); } return; }
    const id = g.dataset.tableId || g.dataset.decorId, obj = tblById(id) || DB.decor.find(x => x.id === id);
    const resize = e.target.classList.contains('rs-handle');
    const wasSel = E.sel === id; E.sel = id;
    e.preventDefault();
    const p0 = svgPoint(svg, e), o = { x: obj.x, y: obj.y, w: obj.w, h: obj.h }; let moved = false;
    const mv = ev => {
      const p = svgPoint($('svg.plan', main), ev), dx = p.x - p0.x, dy = p.y - p0.y; moved = true;
      if (resize) { obj.w = Math.max(20, snap(o.w + dx * 2, 2)); obj.h = Math.max(10, snap(o.h + dy * 2, 2)); if (obj.shape === 'round' || obj.shape === 'square') obj.h = obj.w; }
      else { obj.x = Math.min(room.w, Math.max(0, snap(o.x + dx, 10))); obj.y = Math.min(room.h, Math.max(0, snap(o.y + dy, 10))); }
      const wrap = $('.plan-wrap', main); wrap.innerHTML = planSVG(room, { mode: 'edit', sel: E.sel, showStations: true });
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved || !wasSel) commit(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
}

/* =========================================================
   16) Ansicht: Einstellungen (Admin)
   ========================================================= */

function localUsersHTML() {
  return `${DB.users.map(u => `<div class="row" style="margin-bottom:6px"><input data-us="${u.id}" data-k="name" value="${esc(u.name)}" style="flex:2;width:auto">
        <select data-us="${u.id}" data-k="role" style="flex:2;width:auto">${Object.keys(ROLE_VIEWS).map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t(r)}</option>`).join('')}</select>
        <input data-us="${u.id}" data-k="pin" value="${esc(u.pin)}" style="flex:1;width:auto" inputmode="numeric" placeholder="PIN">
        <button class="btn small danger" data-usdel="${u.id}" ${u.id === S.user.id ? 'disabled' : ''}>✕</button></div>`).join('')}
      <button class="btn small" id="usAdd">＋ Benutzer</button>
      <p class="muted" style="font-size:12px">Hinweis: Die PIN-Anmeldung dient der Rollentrennung im Betrieb und ist kein Schutz gegen gezielten Zugriff (Daten liegen im Browser).</p>`;
}
function bindLocalUsers(main) {
  $$('[data-us]', main).forEach(el => el.onchange = () => { const u = DB.users.find(x => x.id === el.dataset.us); u[el.dataset.k] = el.value; log('Benutzer geändert', u.name); save(); });
  $$('[data-usdel]', main).forEach(b => b.onclick = () => { DB.users = DB.users.filter(u => u.id !== b.dataset.usdel); save(); render(); });
  $('#usAdd').onclick = () => { DB.users.push({ id: uid(), name: 'Neu', role: 'service', pin: String(Math.floor(1000 + Math.random() * 9000)) }); save(); render(); };
}
function viewSettings(main) {
  const turnStr = s => s.turn.map(x => `${x.maxP >= 99 ? '99' : x.maxP}:${x.min}`).join(', ');
  main.innerHTML = `<div class="hotel">
    <div class="panel"><h3>Betrieb & Services</h3><div class="body">
      <label>Name des Betriebs<input id="cfName" value="${esc(DB.betrieb)}"></label>
      <p class="muted" style="font-size:12px">Verweildauer: „bis Personen:Minuten“, z. B. <code>2:105, 4:120, 6:150, 99:180</code>. Pacing = max. ankommende Gäste je 15 Min. (0 = aus). Seatings = feste Zeiten, z. B. 18:30, 20:30.</p>
      ${DB.services.map(s => `<div class="panel" style="padding:10px;margin-bottom:10px;box-shadow:none"><div class="grid3">
        <label>Name<input data-sv="${s.id}" data-k="name" value="${esc(s.name)}"></label>
        <label>Typ<select data-sv="${s.id}" data-k="type">${['fruehstueck', 'mittag', 'abend'].map(x => `<option ${s.type === x ? 'selected' : ''} value="${x}">${{ fruehstueck: 'Frühstück', mittag: 'Mittag', abend: 'Abend' }[x]}</option>`).join('')}</select></label>
        <label>Hotel-Standardzeit<input type="time" data-sv="${s.id}" data-k="hotelTime" value="${s.hotelTime || ''}"></label>
        <label>Beginn<input type="time" data-sv="${s.id}" data-k="start" value="${s.start}"></label><label>Letzte Reservierung<input type="time" data-sv="${s.id}" data-k="end" value="${s.end}"></label>
        <label>Pacing<input type="number" min="0" data-sv="${s.id}" data-k="pacing" value="${s.pacing || 0}"></label></div>
        <div class="grid2" style="margin-top:6px"><label>Verweildauer<input data-sv="${s.id}" data-k="turn" value="${turnStr(s)}"></label><label>Seatings<input data-sv="${s.id}" data-k="seatings" value="${(s.seatings || []).join(', ')}"></label></div>
        <label class="chk" style="margin-top:6px"><input type="checkbox" data-sv="${s.id}" data-k="freeSeating" ${s.freeSeating ? 'checked' : ''}> Freie Platzwahl (keine Tischzuweisung für Hotelgäste)</label>
        <button class="btn small danger" data-svdel="${s.id}" style="margin-top:6px">Service löschen</button></div>`).join('')}
      <button class="btn" id="svAdd">＋ Service</button></div></div>
    <div><div class="panel"><h3>Benutzer & Rollen</h3><div class="body">
      ${CLOUD ? Cloud.membersHTML() : localUsersHTML()}</div></div>
    <div class="panel" style="margin-top:14px"><h3>Daten</h3><div class="body"><div class="row">
      <button class="btn" id="dExp">Sicherung exportieren (JSON)</button><label class="btn" style="color:var(--text)">Sicherung importieren<input type="file" id="dImp" accept=".json" class="hidden"></label>
      <button class="btn" id="dDemo">Demo-Daten neu erzeugen</button><button class="btn danger" id="dClear">Alle Reservierungen & Gäste löschen</button></div>
      <p class="muted" style="font-size:12px">${CLOUD ? `Speicherort: Supabase-Datenbank (Betrieb „${esc(Cloud.betriebName())}“). Geladen werden Reservierungen der letzten 120 Tage und die Zukunft.` : `Speicherort: dieser Browser (localStorage, ca. ${Math.round(JSON.stringify(DB).length / 1024)} KB belegt). Regelmäßig sichern!`}</p></div></div>
    <div class="panel" style="margin-top:14px"><h3>Protokoll (letzte 150 Änderungen)</h3><div style="max-height:420px;overflow:auto"><table class="list"><thead><tr><th>Zeit</th><th>Benutzer</th><th>Aktion</th><th>Details</th></tr></thead><tbody>
      ${DB.audit.slice(0, 150).map(a => `<tr><td style="white-space:nowrap;font-size:12px">${new Date(a.ts).toLocaleString('de-DE')}</td><td>${esc(a.user)}</td><td>${esc(a.action)}</td><td style="font-size:12px">${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div></div></div></div>`;

  $('#cfName').onchange = e => { DB.betrieb = e.target.value; save(); render(); };
  $$('[data-sv]', main).forEach(el => el.onchange = () => {
    const s = svcById(el.dataset.sv), k = el.dataset.k;
    if (k === 'turn') {
      const rows = el.value.split(',').map(x => x.split(':').map(Number)).filter(x => x.length === 2 && x[0] > 0 && x[1] > 0).map(([p, m]) => ({ maxP: p, min: m }));
      if (!rows.length) return toast('Format: 2:90, 4:120, 99:150', 'err'); s.turn = rows.sort((a, b) => a.maxP - b.maxP);
    } else if (k === 'seatings') s.seatings = el.value.split(/[,; ]+/).filter(x => /^\d{1,2}:\d{2}$/.test(x));
    else if (k === 'freeSeating') s.freeSeating = el.checked;
    else if (k === 'pacing') s.pacing = +el.value || 0;
    else s[k] = el.value;
    log('Service geändert', s.name); save(); render();
  });
  $$('[data-svdel]', main).forEach(b => b.onclick = () => {
    const s = svcById(b.dataset.svdel), n = DB.reservations.filter(r => r.serviceId === s.id).length;
    if (DB.services.length < 2) return toast('Mindestens ein Service nötig', 'err');
    confirmModal('Service löschen?', [`${s.name} – ${n} Reservierungen werden ebenfalls gelöscht.`], () => {
      DB.reservations = DB.reservations.filter(r => r.serviceId !== s.id); DB.services.splice(DB.services.indexOf(s), 1); S.serviceId = null; log('Service gelöscht', s.name); save(); render();
    }, 'Löschen');
  });
  $('#svAdd').onclick = () => { DB.services.push({ id: uid(), name: 'Neuer Service', type: 'abend', start: '17:00', end: '20:00', hotelTime: '18:00', freeSeating: false, pacing: 0, turn: [{ maxP: 2, min: 90 }, { maxP: 99, min: 120 }], seatings: [] }); save(); render(); };
  if (CLOUD) Cloud.bindMembers(main); else bindLocalUsers(main);
  $('#dExp').onclick = () => downloadBlob(`tischplan-sicherung-${today()}.json`, new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' }));
  $('#dImp').onchange = e => {
    const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { try { const d = JSON.parse(rd.result); if (!d.version || !d.tables) throw new Error('Kein gültiges Tischplan-Backup');
      confirmModal('Sicherung einspielen?', ['Alle aktuellen Daten werden ersetzt.'], () => { DB = d; log('Sicherung importiert', f.name); save(); render(); toast('Sicherung eingespielt'); }, 'Ersetzen');
    } catch (err) { toast(err.message, 'err'); } };
    rd.readAsText(f);
  };
  $('#dDemo').onclick = () => confirmModal('Demo-Daten neu erzeugen?', ['Alle aktuellen Daten werden durch Beispieldaten ersetzt.'], () => {
    const u = S.user; DB = demoData(); S.user = CLOUD ? u : (DB.users.find(x => x.role === u.role) || DB.users[0]); save(); render(); toast('Demo-Daten erzeugt'); }, 'Ersetzen');
  $('#dClear').onclick = () => confirmModal('Alles löschen?', ['Alle Reservierungen und Hotelaufenthalte werden gelöscht. Räume, Tische und Einstellungen bleiben erhalten.'], () => {
    DB.reservations = []; DB.stays = []; log('Reservierungen & Gäste gelöscht', ''); save(); render(); }, 'Löschen');
}

