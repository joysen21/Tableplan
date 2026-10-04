'use strict';
/* =========================================================
   10) Reservierungsformular (Neu / Bearbeiten)
   ========================================================= */
function openResForm(r, preset = {}) {
  if (!canEdit()) return r && openResInfo(r);
  const isNew = !r;
  const svc0 = svcById(preset.serviceId || S.serviceId);
  const d = r ? JSON.parse(JSON.stringify(r)) : Object.assign({
    id: '_new', date: S.date, serviceId: svc0.id, time: svc0.hotelTime || svc0.start, adults: 2, children: 0, duration: 0,
    name: '', phone: '', email: '', notes: '', occasion: '', allergies: '', highchair: false, vip: false, source: 'Telefon',
    status: 'bestaetigt', tableIds: [], wishes: [], stayId: null
  }, preset);
  let durAuto = isNew || d.duration === turnTime(d.serviceId, persons(d));
  if (!d.duration) d.duration = turnTime(d.serviceId, persons(d));
  d.wishes = d.wishes || [];
  const opt = (arr, val, lbl = x => x) => arr.map(x => `<option value="${esc(x)}" ${x === val ? 'selected' : ''}>${esc(lbl(x) || '–')}</option>`).join('');
  const body = `<div class="grid3">
      <label>Datum<input type="date" id="f_date" value="${d.date}"></label>
      <label>Service<select id="f_svc">${DB.services.map(s => `<option value="${s.id}" ${s.id === d.serviceId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Uhrzeit<input type="time" id="f_time" value="${d.time}" step="900"></label></div>
    <div class="sugg" id="f_seatings"></div>
    <div class="grid3" style="margin-top:8px">
      <label>Erwachsene<input type="number" id="f_ad" min="0" max="99" value="${d.adults}"></label>
      <label>Kinder<input type="number" id="f_ch" min="0" max="99" value="${d.children}"></label>
      <label>Dauer (Min.) <span id="f_durinfo"></span><input type="number" id="f_dur" min="15" step="15" value="${d.duration}"></label></div>
    <div class="grid2" style="margin-top:8px">
      <label>Name *<input id="f_name" value="${esc(d.name)}" autocomplete="off"></label>
      <label>Telefon<input id="f_phone" type="tel" value="${esc(d.phone)}"></label>
      <label>E-Mail<input id="f_mail" type="email" value="${esc(d.email)}"></label>
      <label>Quelle<select id="f_src">${opt(SOURCES, d.source)}</select></label>
      <label>Anlass<select id="f_occ">${opt(OCCASIONS, d.occasion)}</select></label>
      <label>Status<select id="f_st">${opt(Object.keys(RES_STATUS), d.status, t)}</select></label></div>
    <label style="margin-top:8px">Hotelgast verknüpfen<select id="f_stay"></select></label>
    <label style="margin-top:8px">Allergien / Unverträglichkeiten<input id="f_all" value="${esc(d.allergies)}" placeholder="z. B. Gluten, Nüsse"></label>
    <label style="margin-top:8px">Notizen<textarea id="f_notes">${esc(d.notes)}</textarea></label>
    <div class="row" style="margin-top:8px"><label class="chk"><input type="checkbox" id="f_hc" ${d.highchair ? 'checked' : ''}> Kinderstuhl</label>
      <label class="chk"><input type="checkbox" id="f_vip" ${d.vip ? 'checked' : ''}> VIP</label>
      <span class="muted">Wünsche:</span>${PROPS.map(p => `<label class="chk"><input type="checkbox" data-wish="${p}" ${d.wishes.includes(p) ? 'checked' : ''}> ${t(p)}</label>`).join('')}</div>
    <h4 style="margin:14px 0 6px">Tisch(e)</h4>
    <div class="row" id="f_tables"></div>
    <div class="row" style="margin-top:6px"><select id="f_addT" style="width:auto"></select></div>
    <div class="muted" style="font-size:12px;margin-top:8px">Vorschläge:</div><div class="sugg" id="f_sugg"></div>
    ${isNew ? `<label style="margin-top:12px">Wöchentlich wiederholen (Stammtisch) – Anzahl weiterer Wochen<input type="number" id="f_rep" min="0" max="52" value="0"></label>` : ''}
    <div id="f_warn"></div>`;
  const buttons = [];
  if (!isNew) buttons.push({ label: 'Löschen', cls: 'danger', keep: true, action: () => {
    confirmModal('Reservierung löschen?', [`${r.name} – ${fmtDate(r.date)} ${r.time}`], () => {
      DB.reservations.splice(DB.reservations.indexOf(r), 1); log('Reservierung gelöscht', r.name); save(); render(); toast('Gelöscht');
    }, 'Endgültig löschen');
  } });
  buttons.push({ label: 'Abbrechen' }, { label: 'Speichern', cls: 'primary', keep: true, action: () => saveForm() });

  const bg = openModal(isNew ? 'Neue Reservierung' : 'Reservierung bearbeiten', body, buttons);
  const read = () => {
    d.date = $('#f_date', bg).value; d.serviceId = $('#f_svc', bg).value; d.time = $('#f_time', bg).value || d.time;
    d.adults = +$('#f_ad', bg).value || 0; d.children = +$('#f_ch', bg).value || 0;
    if (durAuto) { d.duration = turnTime(d.serviceId, persons(d)); $('#f_dur', bg).value = d.duration; } else d.duration = +$('#f_dur', bg).value || 15;
    d.name = $('#f_name', bg).value.trim(); d.phone = $('#f_phone', bg).value.trim(); d.email = $('#f_mail', bg).value.trim();
    d.source = $('#f_src', bg).value; d.occasion = $('#f_occ', bg).value; d.status = $('#f_st', bg).value;
    d.allergies = $('#f_all', bg).value.trim(); d.notes = $('#f_notes', bg).value; d.highchair = $('#f_hc', bg).checked; d.vip = $('#f_vip', bg).checked;
    d.wishes = $$('[data-wish]', bg).filter(x => x.checked).map(x => x.dataset.wish);
  };
  const draw = () => {
    const s = svcById(d.serviceId);
    $('#f_durinfo', bg).innerHTML = durAuto ? '<span class="badge">auto</span>' : '<a href="#" id="f_durauto" style="font-size:11px">auto</a>';
    const da = $('#f_durauto', bg); if (da) da.onclick = e => { e.preventDefault(); durAuto = true; read(); draw(); };
    $('#f_seatings', bg).innerHTML = (s.seatings || []).map(x => `<button class="btn small" data-seat="${x}">${x} Seating</button>`).join('');
    $$('[data-seat]', bg).forEach(b => b.onclick = () => { $('#f_time', bg).value = b.dataset.seat; read(); draw(); });
    const inHouse = DB.stays.filter(x => isInHouse(x, d.date)).sort((a, b) => a.room.localeCompare(b.room));
    $('#f_stay', bg).innerHTML = `<option value="">– kein Hotelgast –</option>` + inHouse.map(x => `<option value="${x.id}" ${x.id === d.stayId ? 'selected' : ''}>Zi. ${esc(x.room)} · ${esc(x.name)} (${x.adults + x.children}P, ${x.board})</option>`).join('');
    $('#f_tables', bg).innerHTML = d.tableIds.length ? d.tableIds.map(id => `<span class="badge" style="font-size:14px;padding:6px 10px">${esc((tblById(id) || {}).name)} <a href="#" data-rm="${id}">✕</a></span>`).join('')
      + `<span class="muted">Kapazität ${capOf(d.tableIds).max} P</span>` : '<span class="muted">Noch kein Tisch – Vorschlag wählen oder später im Plan zuweisen.</span>';
    $$('[data-rm]', bg).forEach(a => a.onclick = e => { e.preventDefault(); d.tableIds = d.tableIds.filter(x => x !== a.dataset.rm); draw(); });
    $('#f_addT', bg).innerHTML = `<option value="">Tisch manuell hinzufügen…</option>` + DB.rooms.map(rm => `<optgroup label="${esc(rm.name)}">${DB.tables.filter(x => x.roomId === rm.id && !d.tableIds.includes(x.id))
      .map(x => `<option value="${x.id}">${esc(x.name)} (${x.min}–${x.max}P)${tableBusy(x.id, d.date, resStart(d), resEnd(d), d.id).length ? ' – belegt' : ''}</option>`).join('')}</optgroup>`).join('');
    const sug = suggestTables(d, 6);
    $('#f_sugg', bg).innerHTML = sug.length ? sug.map(x => `<button class="btn small" data-sg="${x.ids.join(',')}">${esc(tblNames(x.ids))} · ${capOf(x.ids).max}P · ${esc(roomById(tblById(x.ids[0]).roomId).name)}</button>`).join('') : '<span class="muted">Kein passender freier Tisch.</span>';
    $$('[data-sg]', bg).forEach(b => b.onclick = () => { d.tableIds = b.dataset.sg.split(','); draw(); });
    const w = conflicts(d);
    $('#f_warn', bg).innerHTML = w.length ? `<div class="warnbox">${w.map(esc).join('<br>')}</div>` : (d.tableIds.length ? '<div class="infobox">Keine Konflikte.</div>' : '');
  };
  bg.addEventListener('input', e => { if (e.target.id === 'f_dur') durAuto = false; if (e.target.id !== 'f_stay' && e.target.id !== 'f_addT') { read(); if (['f_date', 'f_svc', 'f_time', 'f_ad', 'f_ch', 'f_dur'].includes(e.target.id) || e.target.dataset.wish) draw(); else { const w = conflicts(d); $('#f_warn', bg).innerHTML = w.length ? `<div class="warnbox">${w.map(esc).join('<br>')}</div>` : ''; } } });
  bg.addEventListener('change', e => {
    if (e.target.id === 'f_svc') { const s = svcById(e.target.value); $('#f_time', bg).value = s.hotelTime || s.start; read(); draw(); }
    if (e.target.id === 'f_addT' && e.target.value) { d.tableIds.push(e.target.value); draw(); }
    if (e.target.id === 'f_stay') {
      const st = stayById(e.target.value); d.stayId = st ? st.id : null;
      if (st) { $('#f_name', bg).value = `${st.name} · Zi. ${st.room}`; $('#f_ad', bg).value = st.adults; $('#f_ch', bg).value = st.children;
        if (st.allergies) $('#f_all', bg).value = st.allergies; $('#f_src', bg).value = 'Hotel'; $('#f_vip', bg).checked = !!st.vip; }
      read(); draw();
    }
  });
  draw();
  setTimeout(() => { const n = $('#f_name', bg); if (n && isNew) n.focus(); }, 30);

  function saveForm() {
    read();
    if (!d.name) { toast('Bitte Namen eingeben', 'err'); return; }
    if (persons(d) < 1) { toast('Personenanzahl fehlt', 'err'); return; }
    const reps = isNew ? Math.min(52, +($('#f_rep', bg) || {}).value || 0) : 0;
    const commit = () => {
      if (isNew) {
        const base = Object.assign({}, d, { id: uid(), createdAt: Date.now() }); DB.reservations.push(base);
        for (let i = 1; i <= reps; i++) {
          const c = Object.assign({}, base, { id: uid(), date: addDays(base.date, 7 * i), seriesOf: base.id, tableIds: [...base.tableIds] });
          if (c.tableIds.some(tid => tableBusy(tid, c.date, resStart(c), resEnd(c), c.id).length)) c.tableIds = [];
          DB.reservations.push(c);
        }
        log('Reservierung angelegt', `${d.name} ${d.date} ${d.time} ${persons(d)}P${reps ? ` (+${reps} Wiederholungen)` : ''}`);
      } else {
        if (r.stayId && JSON.stringify(r.tableIds) !== JSON.stringify(d.tableIds)) d.manualTable = true;
        Object.assign(r, d); log('Reservierung geändert', `${d.name} ${d.date} ${d.time}`);
      }
      save(); closeModal(); render(); toast('Gespeichert');
    };
    const w = conflicts(d);
    if (w.length) {
      // Formular offen lassen, Bestätigung als eigenes Fenster darüber
      const keepBody = bg; keepBody.style.display = 'none';
      const box = document.createElement('div'); box.className = 'modal-bg'; box.style.zIndex = 150;
      box.innerHTML = `<div class="modal" style="max-width:480px"><div class="mh"><h2>Bitte prüfen</h2></div><div class="mb"><div class="warnbox">${w.map(esc).join('<br>')}</div></div>
        <div class="mf"><button class="btn" data-no>Zurück</button><button class="btn primary" data-yes>Trotzdem speichern</button></div></div>`;
      document.body.appendChild(box);
      $('[data-no]', box).onclick = () => { box.remove(); keepBody.style.display = ''; };
      $('[data-yes]', box).onclick = () => { box.remove(); commit(); };
    } else commit();
  }
}

/* =========================================================
   11) Ansicht: Zeitleiste (Gantt) – Tische × Uhrzeit
   ========================================================= */
function viewGantt(main) {
  const svc = svcById(S.serviceId);
  const PX = 2.2, from = toMin(svc.start) - 30, to = Math.min(24 * 60, toMin(svc.end) + Math.max(...svc.turn.map(x => x.min)) - 30);
  const W = (to - from) * PX, x = m => (m - from) * PX;
  const dayRes = DB.reservations.filter(r => r.date === S.date && occupies(r) && overlaps(resStart(r), resEnd(r), from, to) || (r.date === S.date && r.status === 'abgeschlossen' && r.serviceId === S.serviceId));
  const ticks = []; for (let m = Math.ceil(from / 30) * 30; m < to; m += 30) ticks.push(`<div class="g-tick ${m % 60 ? 'half' : ''}" style="left:${x(m)}px">${m % 60 ? '' : fromMin(m)}</div>`);
  const headTicks = ticks.join(''), tickHTML = headTicks.replace(/>\d\d:\d\d</g, '><');
  const nowL = S.date === today() && nowMin() > from && nowMin() < to ? `<div class="g-now" style="left:${x(nowMin())}px"></div>` : '';
  const bar = (r, tid) => {
    const w = conflicts(r).filter(z => z.startsWith('Überschneidung') || z.startsWith('Tisch zu') || z.includes('gesperrt'));
    return `<div class="g-bar ${w.length ? 'conflict' : ''}" data-res="${r.id}" data-from="${tid || ''}" title="${esc(r.name + ' · ' + persons(r) + 'P · ' + r.time + '–' + fromMin(resEnd(r)) + (w.length ? '\n' + w.join('\n') : ''))}"
      style="left:${x(resStart(r))}px;width:${Math.max(18, r.duration * PX - 2)}px;background:${RES_STATUS[r.status]}">${r.stayId ? '⌂ ' : ''}${r.vip ? '★ ' : ''}${esc(r.name)} · ${persons(r)}P${r.allergies ? ' ⚠' : ''}${canEdit() ? '<span class="rs"></span>' : ''}</div>`;
  };
  // Reservierungen ohne Tisch auf Spuren verteilen
  const unas = dayRes.filter(r => !(r.tableIds || []).length && r.serviceId === S.serviceId).sort((a, b) => resStart(a) - resStart(b));
  const lanes = []; for (const r of unas) { let l = lanes.find(L => resStart(r) >= resEnd(L[L.length - 1])); if (!l) lanes.push(l = []); l.push(r); }
  let rows = `<div class="g-row group"><div class="g-label" style="color:var(--danger)">Ohne Tisch (${unas.length})</div><div class="g-track" style="width:${W}px">${tickHTML}</div></div>`;
  (lanes.length ? lanes : [[]]).forEach(l => rows += `<div class="g-row" data-unassigned="1"><div class="g-label muted">—</div><div class="g-track" style="width:${W}px">${tickHTML}${nowL}${l.map(r => bar(r, '')).join('')}</div></div>`);
  for (const room of DB.rooms) {
    rows += `<div class="g-row group"><div class="g-label">${esc(room.name)}</div><div class="g-track" style="width:${W}px"></div></div>`;
    for (const tb of DB.tables.filter(z => z.roomId === room.id)) {
      const bl = isBlocked(tb, S.date, S.serviceId);
      const st = DB.stations.find(z => z.id === tb.station);
      rows += `<div class="g-row" data-table-id="${tb.id}"><div class="g-label"><i style="width:8px;height:8px;border-radius:50%;background:${st ? st.color : 'transparent'};display:inline-block"></i><b>${esc(tb.name)}</b><span class="muted">${tb.min}–${tb.max}P</span>${bl ? ' <span class="badge">gesperrt</span>' : ''}</div>
        <div class="g-track" style="width:${W}px;${bl ? 'background:repeating-linear-gradient(45deg,transparent 0 8px,var(--panel2) 8px 16px)' : ''}">${tickHTML}${nowL}
        ${dayRes.filter(r => (r.tableIds || []).includes(tb.id)).map(r => bar(r, tb.id)).join('')}</div></div>`;
    }
  }
  main.innerHTML = `<div class="panel"><div class="row" style="padding:10px 14px;border-bottom:1px solid var(--line)"><b>${esc(svc.name)} · ${fmtDate(S.date)}</b>
    <span class="muted" style="font-size:13px">${canEdit() ? 'Balken ziehen = Uhrzeit/Tisch ändern · rechten Rand ziehen = Dauer · Klick = bearbeiten' : 'Klick auf Balken = Details'}</span>
    <span style="flex:1"></span>${canEdit() ? '<button class="btn primary" id="gNew">＋ Reservierung</button>' : ''}</div>
    <div class="gantt" data-keep="gantt"><div class="g-head"><div class="g-label muted">Tisch</div><div class="g-track" style="width:${W}px">${headTicks}</div></div>${rows}</div></div>`;
  if ($('#gNew')) $('#gNew').onclick = () => openResForm(null, {});

  $$('.g-bar', main).forEach(el => el.addEventListener('pointerdown', e => {
    const r = DB.reservations.find(z => z.id === el.dataset.res);
    if (!canEdit()) { const up = () => { window.removeEventListener('pointerup', up); openResInfo(r); }; window.addEventListener('pointerup', up); return; }
    e.preventDefault();
    const resize = e.target.classList.contains('rs'), sx = e.clientX, sy = e.clientY, w0 = el.offsetWidth; let moved = false;
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return; moved = true; DRAGGING = true;
      if (resize) el.style.width = Math.max(20, w0 + dx) + 'px';
      else { el.style.transform = `translate(${snap(dx, 15 * PX)}px, ${dy}px)`; el.style.zIndex = 10; el.style.pointerEvents = 'none'; }
    };
    const up = ev => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setTimeout(() => DRAGGING = false, 0);
      if (!moved) return openResForm(r);
      const dx = ev.clientX - sx;
      if (resize) { const dur = Math.max(15, snap((w0 + dx) / PX, 15)); return applyRes(r, z => { z.duration = dur; }, 'Dauer geändert'); }
      el.style.pointerEvents = '';
      const target = document.elementFromPoint(ev.clientX, ev.clientY), row = target && target.closest('.g-row');
      const dMin = snap(dx / PX, 15), fromT = el.dataset.from;
      applyRes(r, z => {
        z.time = fromMin(resStart(z) + dMin);
        if (row && row.dataset.tableId && row.dataset.tableId !== fromT) z.tableIds = fromT ? z.tableIds.map(q => q === fromT ? row.dataset.tableId : q) : [row.dataset.tableId];
        else if (row && row.dataset.unassigned) z.tableIds = [];
      }, 'In Zeitleiste verschoben');
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }));
}

/* =========================================================
   12) Ansicht: Reservierungsliste mit Filtern
   ========================================================= */
function viewResList(main) {
  const F = Object.assign({ from: S.date, to: addDays(S.date, 6), svc: '', status: 'aktiv', q: '', hotel: false, unas: false }, S.resFilter);
  S.resFilter = F;
  const q = F.q.toLowerCase();
  const rows = DB.reservations.filter(r => r.date >= F.from && r.date <= F.to && (!F.svc || r.serviceId === F.svc) &&
    (F.status === 'alle' || (F.status === 'aktiv' ? occupies(r) : r.status === F.status)) &&
    (!F.hotel || r.stayId) && (!F.unas || !(r.tableIds || []).length) &&
    (!q || [r.name, r.phone, r.email, r.notes, r.allergies].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => a.date.localeCompare(b.date) || resStart(a) - resStart(b));
  main.innerHTML = `<div class="panel"><div class="filters">
      <label>Von<input type="date" data-f="from" value="${F.from}"></label><label>Bis<input type="date" data-f="to" value="${F.to}"></label>
      <label>Service<select data-f="svc"><option value="">alle</option>${DB.services.map(s => `<option value="${s.id}" ${F.svc === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Status<select data-f="status">${['aktiv', 'alle', ...Object.keys(RES_STATUS)].map(s => `<option value="${s}" ${F.status === s ? 'selected' : ''}>${s === 'aktiv' ? 'aktive' : s === 'alle' ? 'alle' : t(s)}</option>`).join('')}</select></label>
      <label>Suche<input data-f="q" value="${esc(F.q)}" placeholder="Name, Telefon, Notiz…"></label>
      <label class="chk" style="align-self:flex-end"><input type="checkbox" data-f="hotel" ${F.hotel ? 'checked' : ''}> nur Hotelgäste</label>
      <label class="chk" style="align-self:flex-end"><input type="checkbox" data-f="unas" ${F.unas ? 'checked' : ''}> nur ohne Tisch</label>
      <span style="flex:1"></span>
      <button class="btn" id="csvRes" style="align-self:flex-end">CSV-Export</button>
      ${canEdit() ? '<button class="btn primary" id="newRes2" style="align-self:flex-end">＋ Reservierung</button>' : ''}</div>
    <div style="overflow:auto" data-keep="resList"><table class="list"><thead><tr><th>Datum</th><th>Zeit</th><th>Name</th><th>P</th><th>Tisch</th><th>Service</th><th>Status</th><th>Quelle</th><th>Hinweise</th></tr></thead>
    <tbody>${rows.map(r => { const w = conflicts(r); return `<tr class="clickable" data-res="${r.id}"><td>${fmtShort(r.date)}</td><td>${r.time}</td>
      <td>${r.vip ? '★ ' : ''}${esc(r.name)} ${r.stayId ? '<span class="badge hotel">Hotel</span>' : ''}</td><td>${persons(r)}</td>
      <td>${(r.tableIds || []).length ? esc(tblNames(r.tableIds)) : '<b style="color:var(--danger)">–</b>'}</td><td>${esc((svcById(r.serviceId) || {}).name)}</td>
      <td><span class="badge st" style="background:${RES_STATUS[r.status]}">${t(r.status)}</span></td><td>${esc(r.source || '')}</td>
      <td style="font-size:12px">${r.allergies ? '⚠ ' + esc(r.allergies) + ' ' : ''}${r.occasion ? '🎉 ' + esc(r.occasion) + ' ' : ''}${esc(r.notes || '')}${w.length ? `<br><span style="color:var(--danger)">${w.map(esc).join('<br>')}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>
    ${rows.length ? '' : '<p class="muted" style="padding:14px">Keine Treffer.</p>'}<p class="muted" style="padding:8px 14px;font-size:12px">${rows.length} Reservierungen · ${rows.reduce((a, r) => a + persons(r), 0)} Gäste</p></div></div>`;
  $$('[data-f]', main).forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
    F[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.f === 'q') { clearTimeout(viewResList.tm); viewResList.tm = setTimeout(() => { render(); const i = $('[data-f=q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); }
    else render();
  }));
  $$('tr[data-res]', main).forEach(tr => tr.onclick = () => openResForm(DB.reservations.find(r => r.id === tr.dataset.res)));
  if ($('#newRes2')) $('#newRes2').onclick = () => openResForm(null, {});
  $('#csvRes').onclick = () => downloadCSV('reservierungen.csv', [['Datum', 'Zeit', 'Ende', 'Service', 'Name', 'Erw', 'Kinder', 'Tisch', 'Status', 'Quelle', 'Telefon', 'E-Mail', 'Allergien', 'Anlass', 'Notizen', 'Zimmer']]
    .concat(rows.map(r => [r.date, r.time, fromMin(resEnd(r)), (svcById(r.serviceId) || {}).name, r.name, r.adults, r.children, tblNames(r.tableIds), t(r.status), r.source, r.phone, r.email, r.allergies, r.occasion, r.notes, r.stayId ? (stayById(r.stayId) || {}).room : ''])));
}
function downloadCSV(name, rows) {
  const csv = '﻿' + rows.map(r => r.map(c => { const s = String(c ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
  downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
function downloadBlob(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* =========================================================
   13) Ansicht: Hotelgäste (Aufenthalte, fester Tisch, Anreise/Abreise)
   ========================================================= */
const needsTable = st => stayServices(st).length > 0;
function viewHotel(main) {
  const D = S.hotelDate;
  const inHouse = DB.stays.filter(x => isInHouse(x, D)).sort((a, b) => a.room.localeCompare(b.room, 'de', { numeric: true }));
  const arrivals = DB.stays.filter(x => x.arrival === D), departures = DB.stays.filter(x => x.departure === D);
  const open = inHouse.filter(x => needsTable(x) && !(x.tableIds || []).length);
  const dinner = DB.services.find(s => s.type === 'abend') || DB.services[0];
  const tmD = toMin(dinner.hotelTime || dinner.start);
  const room = roomById(S.roomId);
  const status = tb => {
    const st = inHouse.find(x => (x.tableIds || []).includes(tb.id));
    if (st) return { st: 'reserviert', r: { id: st.id, name: st.name, time: 'Zi.' + st.room, adults: st.adults, children: st.children, stayId: st.id, allergies: st.allergies, vip: st.vip, tableIds: st.tableIds } };
    const ext = DB.reservations.find(r => r.date === D && r.serviceId === dinner.id && occupies(r) && !r.stayId && (r.tableIds || []).includes(tb.id));
    if (ext) return { st: 'bald', r: ext };
    if (isBlocked(tb, D, dinner.id)) return { st: 'gesperrt' };
    return { st: 'frei' };
  };
  const stayRow = x => `<tr class="clickable" data-stay="${x.id}"><td><b>${esc(x.room)}</b></td><td>${x.vip ? '★ ' : ''}${esc(x.name)}</td><td>${x.adults}${x.children ? '+' + x.children : ''}</td>
    <td><span class="badge">${x.board}</span></td><td style="font-size:12px">${fmtShort(x.arrival)} – ${fmtShort(x.departure)}</td>
    <td>${(x.tableIds || []).length ? esc(tblNames(x.tableIds)) : needsTable(x) ? '<b style="color:var(--danger)">fehlt</b>' : '<span class="muted">frei</span>'}</td>
    <td style="font-size:12px">${x.allergies ? '⚠ ' + esc(x.allergies) : ''}</td></tr>`;
  const tbl = (list, empty) => list.length ? `<table class="list"><thead><tr><th>Zi.</th><th>Name</th><th>P</th><th>VP</th><th>Aufenthalt</th><th>Tisch</th><th>Hinweis</th></tr></thead><tbody>${list.map(stayRow).join('')}</tbody></table>` : `<p class="muted" style="padding:0 14px">${empty}</p>`;
  main.innerHTML = `<div class="hotel"><div class="panel">
      <div class="row" style="padding:10px 14px;border-bottom:1px solid var(--line)">
        <button class="btn small" id="hPrev">◀</button><input type="date" id="hDate" value="${D}" style="width:auto"><button class="btn small" id="hNext">▶</button><button class="btn small" id="hToday">Heute</button>
        <span style="flex:1"></span><button class="btn" id="hImport">CSV-Import</button><button class="btn primary" id="hNew">＋ Aufenthalt</button></div>
      <div class="kpis"><div class="kpi"><b>${inHouse.length}</b><small>Zimmer belegt</small></div><div class="kpi"><b>${inHouse.reduce((a, x) => a + x.adults + x.children, 0)}</b><small>Gäste im Haus</small></div>
        <div class="kpi"><b>${inHouse.filter(x => x.board === 'HP').length}/${inHouse.filter(x => x.board === 'VP' || x.board === 'AI').length}</b><small>HP / VP+AI</small></div>
        <div class="kpi"><b>${arrivals.length}</b><small>Anreisen</small></div><div class="kpi"><b>${departures.length}</b><small>Abreisen</small></div>
        <div class="kpi" style="${open.length ? 'color:var(--danger)' : ''}"><b>${open.length}</b><small>ohne Tisch</small></div></div>
      <div class="body"><h4 style="margin:0 0 6px">Ohne festen Tisch – auf den Plan ziehen</h4>
        <div>${open.length ? open.map(x => `<span class="stay-chip" data-chip="${x.id}">Zi. ${esc(x.room)} · ${esc(x.name)} · ${x.adults + x.children}P · ${x.board}</span>`).join('') : '<span class="muted">Alle Gäste mit Verpflegung haben einen Tisch. ✓</span>'}</div></div>
      <h3 style="border-top:1px solid var(--line)">Anreisen ${fmtShort(D)}</h3><div data-keep="hA">${tbl(arrivals, 'Keine Anreisen.')}</div>
      <h3 style="border-top:1px solid var(--line)">Abreisen ${fmtShort(D)}</h3><div>${tbl(departures, 'Keine Abreisen.')}</div>
      <h3 style="border-top:1px solid var(--line)">Im Haus</h3><div>${tbl(inHouse, 'Keine Gäste im Haus.')}</div>
    </div>
    <div class="panel"><h3>Feste Tische · ${esc(dinner.name)} ${fmtShort(D)}</h3>
      <div class="roomtabs">${DB.rooms.map(r => `<button class="btn small ${r.id === S.roomId ? 'on' : ''}" data-room="${r.id}">${esc(r.name)}</button>`).join('')}</div>
      <div class="plan-wrap">${room ? planSVG(room, { mode: 'assign', status }) : ''}</div>
      <div class="legend"><span><i style="background:var(--st-reserviert)"></i>Hotelgast (fester Tisch)</span><span><i style="background:var(--st-bald)"></i>Externe Reservierung</span>
        <span><i style="background:var(--st-frei)"></i>frei</span><span>Ziehen: Gast-Chip → Tisch, oder Tisch → anderer Tisch</span></div></div></div>`;

  $('#hDate').onchange = e => { S.hotelDate = e.target.value; render(); };
  $('#hPrev').onclick = () => { S.hotelDate = addDays(D, -1); render(); };
  $('#hNext').onclick = () => { S.hotelDate = addDays(D, 1); render(); };
  $('#hToday').onclick = () => { S.hotelDate = today(); render(); };
  $('#hNew').onclick = () => openStayForm(null);
  $('#hImport').onclick = openStayImport;
  $$('[data-room]', main).forEach(b => b.onclick = () => { S.roomId = b.dataset.room; render(); });
  $$('tr[data-stay]', main).forEach(tr => tr.onclick = () => openStayForm(stayById(tr.dataset.stay)));
  $$('[data-chip]', main).forEach(c => c.addEventListener('pointerdown', e => {
    const st = stayById(c.dataset.chip);
    startDrag(e, { label: `Zi. ${st.room} ${st.name}`, onClick: () => openStayForm(st), onDrop: el => { const tid = dropTableId(el); if (tid) assignStayTable(st, [tid]); } });
  }));
  $$('.tb', main).forEach(g => g.addEventListener('pointerdown', e => {
    const tb = tblById(g.dataset.tableId), s = status(tb);
    const st = s.r && s.r.stayId ? stayById(s.r.stayId) : null;
    startDrag(e, { label: st ? `Zi. ${st.room} → ?` : tb.name,
      onClick: () => st ? openStayForm(st) : (s.r ? openResForm(s.r) : toast(`${tb.name}: frei am ${fmtShort(D)}`)),
      onDrop: el => { const to = dropTableId(el); if (st && to && to !== tb.id) assignStayTable(st, st.tableIds.map(x => x === tb.id ? to : x)); } });
  }));
}
function assignStayTable(st, tableIds) {
  const tb = tableIds.map(tblById), p = st.adults + st.children, cap = capOf(tableIds);
  const w = stayTableConflicts(st, tableIds);
  if (p > cap.max) w.unshift(`Tisch zu klein: ${p} Pers., max. ${cap.max}`);
  const commit = () => {
    st.tableIds = tableIds;
    DB.reservations.filter(r => r.stayId === st.id && OPEN_STATES.includes(r.status)).forEach(r => delete r.manualTable);
    syncStay(st); log('Fester Tisch zugewiesen', `Zi. ${st.room} ${st.name} → ${tb.map(x => x.name).join('+')}`); save(); render(); toast('Fester Tisch gespeichert');
  };
  if (w.length) confirmModal('Konflikte im Aufenthalt', w.slice(0, 12).concat(w.length > 12 ? [`… und ${w.length - 12} weitere`] : []), commit, 'Trotzdem zuweisen');
  else commit();
}
function openStayForm(st) {
  const isNew = !st;
  const d = st ? JSON.parse(JSON.stringify(st)) : { id: uid(), room: '', name: '', adults: 2, children: 0, arrival: S.hotelDate, departure: addDays(S.hotelDate, 3), board: 'HP', tableIds: [], allergies: '', notes: '', vip: false, phone: '', times: {} };
  d.times = d.times || {};
  const timeSel = type => { const s = DB.services.find(x => x.type === type); if (!s || s.freeSeating) return '';
    const opts = [...new Set([s.hotelTime || s.start, ...(s.seatings || [])])];
    return `<label>Uhrzeit ${esc(s.name)}<select id="s_t_${type}">${opts.map(o => `<option ${d.times[type] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`; };
  const body = `<div class="grid3"><label>Zimmer *<input id="s_room" value="${esc(d.room)}"></label><label>Name *<input id="s_name" value="${esc(d.name)}"></label>
      <label>Verpflegung<select id="s_board">${BOARDS.map(b => `<option value="${b}" ${b === d.board ? 'selected' : ''}>${t(b)}</option>`).join('')}</select></label>
      <label>Erwachsene<input type="number" id="s_ad" min="1" value="${d.adults}"></label><label>Kinder<input type="number" id="s_ch" min="0" value="${d.children}"></label>
      <label>Telefon<input id="s_phone" value="${esc(d.phone)}"></label>
      <label>Anreise<input type="date" id="s_arr" value="${d.arrival}"></label><label>Abreise<input type="date" id="s_dep" value="${d.departure}"></label>
      <label>Fester Tisch<select id="s_tbl"><option value="">– keiner –</option>${DB.tables.map(x => `<option value="${x.id}" ${(d.tableIds || [])[0] === x.id ? 'selected' : ''}>${esc(x.name)} (${x.min}–${x.max}P, ${esc(roomById(x.roomId).name)})</option>`).join('')}</select></label></div>
    <div class="grid2" style="margin-top:8px">${timeSel('mittag')}${timeSel('abend')}</div>
    <label style="margin-top:8px">Allergien<input id="s_all" value="${esc(d.allergies)}"></label>
    <label style="margin-top:8px">Notizen<textarea id="s_notes">${esc(d.notes)}</textarea></label>
    <label class="chk" style="margin-top:8px"><input type="checkbox" id="s_vip" ${d.vip ? 'checked' : ''}> VIP / Stammgast</label>
    <p class="muted" style="font-size:12px">Halbpension = Abendessen, Vollpension = Mittag + Abend, All-Inclusive = alle Services mit Tischzuweisung. Reservierungen werden automatisch für jede Nacht angelegt.</p>
    ${!isNew ? `<h4 style="margin:12px 0 6px">Reservierungen dieses Aufenthalts</h4>${DB.reservations.filter(r => r.stayId === d.id).sort((a, b) => a.date.localeCompare(b.date) || resStart(a) - resStart(b))
      .map(r => `<div style="font-size:13px">${fmtShort(r.date)} ${esc(svcById(r.serviceId).name)} ${r.time} · Tisch ${esc(tblNames(r.tableIds) || '–')}${r.manualTable ? ' <span class="badge">manuell</span>' : ''} · ${t(r.status)}</div>`).join('') || '<span class="muted">keine</span>'}` : ''}`;
  const btns = [];
  if (!isNew) btns.push({ label: 'Löschen', cls: 'danger', keep: true, action: () => confirmModal('Aufenthalt löschen?', [`Zi. ${st.room} ${st.name} inkl. offener Reservierungen`], () => {
    DB.reservations = DB.reservations.filter(r => !(r.stayId === st.id && OPEN_STATES.includes(r.status)));
    DB.stays.splice(DB.stays.indexOf(st), 1); log('Aufenthalt gelöscht', st.name); save(); render();
  }, 'Löschen') });
  btns.push({ label: 'Abbrechen' }, { label: 'Speichern', cls: 'primary', keep: true, action: bg => {
    Object.assign(d, { room: $('#s_room', bg).value.trim(), name: $('#s_name', bg).value.trim(), board: $('#s_board', bg).value, adults: +$('#s_ad', bg).value || 1,
      children: +$('#s_ch', bg).value || 0, phone: $('#s_phone', bg).value, arrival: $('#s_arr', bg).value, departure: $('#s_dep', bg).value,
      allergies: $('#s_all', bg).value.trim(), notes: $('#s_notes', bg).value, vip: $('#s_vip', bg).checked });
    ['mittag', 'abend'].forEach(ty => { const el = $('#s_t_' + ty, bg); if (el) d.times[ty] = el.value; });
    const tsel = $('#s_tbl', bg).value;
    if (!d.room || !d.name) return toast('Zimmer und Name sind Pflicht', 'err');
    if (!(d.departure > d.arrival)) return toast('Abreise muss nach der Anreise liegen', 'err');
    const tableIds = tsel ? ((d.tableIds || [])[0] === tsel ? d.tableIds : [tsel]) : [];
    let target = st; if (isNew) { target = d; DB.stays.push(d); } else Object.assign(st, d);
    closeModal();
    const changed = JSON.stringify(tableIds) !== JSON.stringify(target.tableIds || []);
    syncStay(target);
    // Uhrzeiten auf offene Reservierungen übertragen
    DB.reservations.filter(r => r.stayId === target.id && OPEN_STATES.includes(r.status)).forEach(r => { const s = svcById(r.serviceId); if (target.times[s.type]) r.time = target.times[s.type]; });
    log(isNew ? 'Aufenthalt angelegt' : 'Aufenthalt geändert', `Zi. ${target.room} ${target.name}`);
    if (changed && tableIds.length) { save(); render(); assignStayTable(target, tableIds); return; }
    if (changed) { target.tableIds = []; DB.reservations.filter(r => r.stayId === target.id && OPEN_STATES.includes(r.status)).forEach(r => delete r.manualTable); syncStay(target); }
    save(); render(); toast('Gespeichert');
  } });
  openModal(isNew ? 'Neuer Aufenthalt' : `Zi. ${st.room} – ${st.name}`, body, btns);
}
function parseDate(s) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return s;
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[2]) + '-' + pad(m[1]);
  return null;
}
function openStayImport() {
  openModal('Hotelgäste importieren (CSV)', `<p class="muted" style="margin-top:0">Spalten (Trennzeichen ; oder ,), erste Zeile = Überschrift:<br>
    <code>Zimmer;Name;Erwachsene;Kinder;Anreise;Abreise;Verpflegung;Allergien;Notiz</code><br>Datum als TT.MM.JJJJ oder JJJJ-MM-TT · Verpflegung UF / HP / VP / AI.
    Bestehende Aufenthalte (gleiches Zimmer + Anreise) werden aktualisiert.</p>
    <input type="file" id="impFile" accept=".csv,text/csv,text/plain"><textarea id="impText" style="min-height:160px;margin-top:8px" placeholder="…oder hier einfügen"></textarea><div id="impRes"></div>`,
    [{ label: 'Abbrechen' }, { label: 'Importieren', cls: 'primary', keep: true, action: bg => {
      const lines = $('#impText', bg).value.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return toast('Keine Daten', 'err');
      const sep = lines[0].includes(';') ? ';' : ',';
      let ok = 0, upd = 0; const errs = [];
      lines.slice(1).forEach((l, i) => {
        const c = l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
        const arr = parseDate(c[4]), dep = parseDate(c[5]), board = (c[6] || 'HP').toUpperCase();
        if (!c[0] || !c[1] || !arr || !dep || !BOARDS.includes(board)) { errs.push(`Zeile ${i + 2}: ungültig`); return; }
        let st = DB.stays.find(x => x.room === c[0] && x.arrival === arr);
        const data = { room: c[0], name: c[1], adults: +c[2] || 1, children: +c[3] || 0, arrival: arr, departure: dep, board, allergies: c[7] || '', notes: c[8] || '' };
        if (st) { Object.assign(st, data); upd++; } else { st = Object.assign({ id: uid(), tableIds: [], vip: false, phone: '', times: {} }, data); DB.stays.push(st); ok++; }
        syncStay(st);
      });
      log('CSV-Import Hotelgäste', `${ok} neu, ${upd} aktualisiert`); save();
      $('#impRes', bg).innerHTML = `<div class="infobox">${ok} neu, ${upd} aktualisiert${errs.length ? '<br>' + errs.map(esc).join('<br>') : ''}</div>`;
      render();
    } }], bg => {
      $('#impFile', bg).onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => $('#impText', bg).value = rd.result; rd.readAsText(f, 'utf-8'); };
    });
}

/* =========================================================
   14) Ansicht: Berichte (Tagesliste, Küche, Allergien, Hotel, Plan) + Druck
   ========================================================= */
function viewReports(main) {
  const types = [['tag', 'Tagesübersicht'], ['kueche', 'Küchenvorschau / Briefing'], ['allergie', 'Allergie-Liste'], ['hotel', 'Hotel-Tischliste'], ['plan', 'Tischplan drucken']];
  S.report = S.report || (S.user.role === 'kueche' ? 'kueche' : 'tag');
  main.innerHTML = `<div class="panel"><div class="row" style="padding:10px 14px;border-bottom:1px solid var(--line)">
    ${types.map(([k, l]) => `<button class="btn small ${S.report === k ? 'on' : ''}" data-rep="${k}">${l}</button>`).join('')}
    <span style="flex:1"></span><button class="btn primary" id="printBtn">🖨 Drucken / PDF</button></div>
    <div class="body report" id="repBody">${reportHTML(S.report)}</div></div>`;
  $$('[data-rep]', main).forEach(b => b.onclick = () => { S.report = b.dataset.rep; render(); });
  $('#printBtn').onclick = () => { $('#printArea').innerHTML = $('#repBody').innerHTML; window.print(); };
}
function reportHTML(type) {
  const D = S.date, svc = svcById(S.serviceId);
  const head = (title, sub) => `<h2>${esc(title)}</h2><p class="muted" style="margin:0 0 10px">${esc(DB.betrieb)} · ${fmtDate(D)}${sub ? ' · ' + esc(sub) : ''} · erstellt ${new Date().toLocaleString('de-DE')}</p>`;
  const act = r => r.status !== 'storniert' && r.status !== 'noshow';
  if (type === 'tag') {
    return head('Tagesübersicht') + DB.services.map(s => {
      const rs = DB.reservations.filter(r => r.date === D && r.serviceId === s.id && act(r)).sort((a, b) => resStart(a) - resStart(b));
      if (!rs.length) return `<h4>${esc(s.name)}</h4><p class="muted">Keine Reservierungen.</p>`;
      return `<h4>${esc(s.name)} – ${rs.length} Reservierungen, ${rs.reduce((a, r) => a + persons(r), 0)} Gäste</h4><table class="list"><thead><tr><th>Zeit</th><th>Name</th><th>P</th><th>Tisch</th><th>Hinweise</th><th>Status</th></tr></thead><tbody>
        ${rs.map(r => `<tr><td>${r.time}</td><td>${r.vip ? '★ ' : ''}${esc(r.name)}</td><td>${r.adults}${r.children ? '+' + r.children + ' Ki.' : ''}</td><td>${esc(tblNames(r.tableIds) || '–')}</td>
        <td>${r.allergies ? '⚠ <b>' + esc(r.allergies) + '</b> ' : ''}${r.occasion ? '🎉 ' + esc(r.occasion) + ' ' : ''}${r.highchair ? 'Kinderstuhl ' : ''}${esc(r.notes || '')}</td><td>${t(r.status)}</td></tr>`).join('')}</tbody></table>`;
    }).join('');
  }
  if (type === 'kueche') {
    const rs = DB.reservations.filter(r => r.date === D && r.serviceId === svc.id && act(r)).sort((a, b) => resStart(a) - resStart(b));
    const slots = []; for (let m = toMin(svc.start); m <= toMin(svc.end); m += 15) slots.push({ m, c: rs.filter(r => Math.floor(resStart(r) / 15) * 15 === m).reduce((a, r) => a + persons(r), 0) });
    const max = Math.max(1, ...slots.map(s => s.c));
    const tot = rs.reduce((a, r) => a + persons(r), 0), kids = rs.reduce((a, r) => a + (+r.children || 0), 0), hotel = rs.filter(r => r.stayId).reduce((a, r) => a + persons(r), 0);
    const big = rs.filter(r => persons(r) >= 6), unas = rs.filter(r => !(r.tableIds || []).length), blocked = DB.tables.filter(x => isBlocked(x, D, svc.id));
    return head('Küchenvorschau & Briefing', svc.name) + `<div class="kpis" style="padding:0;border:0"><div class="kpi"><b>${tot}</b><small>Gäste gesamt</small></div><div class="kpi"><b>${hotel}</b><small>Hotelgäste</small></div>
      <div class="kpi"><b>${tot - hotel}</b><small>Extern</small></div><div class="kpi"><b>${kids}</b><small>Kinder</small></div><div class="kpi"><b>${rs.filter(r => r.allergies).length}</b><small>mit Allergien</small></div></div>
      <h4>Ankünfte pro 15 Minuten${svc.pacing ? ` (Pacing-Limit ${svc.pacing})` : ''}</h4>
      <div class="slotbar">${slots.map(s => `<div style="height:${s.c / max * 100}%;${svc.pacing && s.c > svc.pacing ? 'background:var(--danger)' : ''}"><span>${s.c || ''}</span></div>`).join('')}</div>
      <div class="slotlbl">${slots.map(s => `<span>${s.m % 60 ? '' : fromMin(s.m)}</span>`).join('')}</div>
      <h4>Allergien & Unverträglichkeiten</h4>${allergyTable(rs)}
      <h4>Anlässe & VIPs</h4>${rs.filter(r => r.occasion || r.vip).map(r => `<div>${r.time} · ${esc(r.name)} · Tisch ${esc(tblNames(r.tableIds) || '–')} · ${r.vip ? '★ VIP ' : ''}${esc(r.occasion || '')}</div>`).join('') || '<p class="muted">Keine.</p>'}
      <h4>Briefing</h4><ul>${big.length ? `<li>Große Gruppen: ${big.map(r => `${esc(r.name)} (${persons(r)}P, ${r.time})`).join(', ')}</li>` : ''}
        ${unas.length ? `<li><b>${unas.length} Reservierungen noch ohne Tisch</b></li>` : ''}${blocked.length ? `<li>Gesperrte Tische: ${blocked.map(x => esc(x.name)).join(', ')}</li>` : ''}
        <li>Kinderstühle: ${rs.filter(r => r.highchair).length}</li><li>Größter Ankunfts-Slot: ${fromMin(slots.reduce((a, s) => s.c > a.c ? s : a, slots[0]).m)} (${max} Gäste)</li></ul>`;
  }
  if (type === 'allergie') {
    const rs = DB.reservations.filter(r => r.date === D && act(r) && r.allergies).sort((a, b) => a.serviceId.localeCompare(b.serviceId) || resStart(a) - resStart(b));
    return head('Allergie-Liste') + allergyTable(rs, true);
  }
  if (type === 'hotel') {
    const stays = DB.stays.filter(x => isInHouse(x, D)).sort((a, b) => a.room.localeCompare(b.room, 'de', { numeric: true }));
    const dinner = DB.services.find(s => s.type === 'abend');
    return head('Hotel-Tischliste', 'Zimmer ↔ Tisch') + `<table class="list"><thead><tr><th>Zimmer</th><th>Name</th><th>Pers.</th><th>Verpfl.</th><th>Tisch</th><th>Uhrzeit</th><th>Abreise</th><th>Allergien / Notiz</th></tr></thead><tbody>
      ${stays.map(x => { const r = DB.reservations.find(z => z.stayId === x.id && z.date === D && dinner && z.serviceId === dinner.id);
        return `<tr><td><b>${esc(x.room)}</b></td><td>${x.vip ? '★ ' : ''}${esc(x.name)}${x.arrival === D ? ' <span class="badge hotel">Anreise</span>' : ''}</td><td>${x.adults}${x.children ? '+' + x.children : ''}</td><td>${x.board}</td>
        <td><b>${esc(tblNames(r ? r.tableIds : x.tableIds) || (needsTable(x) ? '— fehlt —' : 'frei'))}</b></td><td>${r ? r.time : ''}</td><td>${fmtShort(x.departure)}</td><td>${esc([x.allergies, x.notes].filter(Boolean).join(' · '))}</td></tr>`; }).join('')}</tbody></table>
      ${stays.length ? '' : '<p class="muted">Keine Hotelgäste im Haus.</p>'}`;
  }
  if (type === 'plan') {
    return head('Tischplan', `${svc.name}, Stand ${fromMin(S.time)}`) + DB.rooms.map(room => `<h4>${esc(room.name)}</h4>${planSVG(room, { mode: 'live', status: tb => tableStatusAt(tb, D, svc.id, S.time) })}`).join('') + legendHTML();
  }
  return '';
}
function allergyTable(rs, withSvc) {
  return rs.filter(r => r.allergies).length ? `<table class="list"><thead><tr>${withSvc ? '<th>Service</th>' : ''}<th>Zeit</th><th>Tisch</th><th>Name</th><th>P</th><th>Allergien</th><th>Notiz</th></tr></thead><tbody>
    ${rs.filter(r => r.allergies).map(r => `<tr>${withSvc ? `<td>${esc(svcById(r.serviceId).name)}</td>` : ''}<td>${r.time}</td><td><b>${esc(tblNames(r.tableIds) || '–')}</b></td><td>${esc(r.name)}</td><td>${persons(r)}</td><td><b>${esc(r.allergies)}</b></td><td>${esc(r.notes || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Keine Allergien gemeldet.</p>';
}
