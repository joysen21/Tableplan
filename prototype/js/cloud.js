'use strict';
/* =========================================================
   Cloud-Modus (Supabase): Anmeldung, Betriebswahl, Laden,
   Synchronisation (nur geänderte Datensätze) und Realtime.
   Aktiv nur, wenn config.js URL + anon-Key enthält.
   ========================================================= */
const INITIAL_HASH = location.hash; // vor createClient sichern (Einladungs-/Passwort-Links)

const Cloud = !CLOUD ? null : (() => {
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const CLIENT_ID = uid();
  const COLLS = ['rooms', 'tables', 'decor', 'combos', 'stations', 'services', 'layouts', 'stays', 'reservations', 'audit'];
  const HISTORY_DAYS = +CFG.historyDays || 120;   // ältere Reservierungen werden nicht geladen
  const AUDIT_LIMIT = 300;
  const wantSetPw = /type=(invite|recovery)/.test(INITIAL_HASH);

  let session = null, memberships = [], member = null, B = null, BNAME = '';
  let state = 'init';            // init | login | setpw | loading | select | nobetrieb | empty | ready | error
  let lastError = '', syncState = 'ok', rtState = '', wasDown = false;
  let SYNCED = new Map();        // "coll|id" → JSON-Stand, der in der Datenbank liegt
  let timer = null, syncing = false, again = false, channel = null, renderPending = false;
  let members = null;

  const blankDB = () => ({ version: 1, rev: 0, betrieb: '', rooms: [], tables: [], decor: [], combos: [], stations: [], services: [], layouts: [], stays: [], reservations: [], audit: [], users: [] });
  const splitKey = k => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1)]; };
  const metaJSON = () => JSON.stringify({ betrieb: DB.betrieb || '', version: DB.version || 1 });
  const errText = e => { const m = (e && (e.message || e.error_description)) || String(e);
    return m === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch' : m === 'Email not confirmed' ? 'E-Mail-Adresse noch nicht bestätigt' : m; };

  /* ---------- Start & Anmeldung ---------- */
  async function init() {
    DB = blankDB();
    sb.auth.onAuthStateChange((ev, s) => {
      session = s;
      if (ev === 'SIGNED_OUT') { reset(); state = 'login'; render(); }
      if (ev === 'PASSWORD_RECOVERY') { state = 'setpw'; render(); }
    });
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (session) await afterLogin(); else { state = 'login'; render(); }
  }
  async function afterLogin() {
    state = 'loading'; render();
    const { data, error } = await sb.from('tp_mitglieder').select('betrieb_id, role, name, email, tp_betriebe(name)').eq('user_id', session.user.id);
    if (error) return fail(error);
    memberships = data || [];
    if (wantSetPw && !afterLogin.pwDone) { state = 'setpw'; return render(); }
    if (!memberships.length) { state = 'nobetrieb'; return render(); }
    let last = null; try { last = localStorage.getItem('tischplan.betrieb'); } catch (e) {}
    const m = memberships.find(x => x.betrieb_id === last) || (memberships.length === 1 ? memberships[0] : null);
    if (!m) { state = 'select'; return render(); }
    await openBetrieb(m);
  }
  async function openBetrieb(m) {
    member = m; B = m.betrieb_id; BNAME = (m.tp_betriebe && m.tp_betriebe.name) || '';
    try { localStorage.setItem('tischplan.betrieb', B); } catch (e) {}
    S.user = { id: session.user.id, name: m.name || session.user.email, role: m.role, email: session.user.email };
    state = 'loading'; render();
    try { await loadAll(); } catch (e) { return fail(e); }
    subscribe();
    if (!DB.services.length) { state = 'empty'; return render(); }
    state = 'ready'; S.view = ROLE_VIEWS[S.user.role][0]; S.serviceId = null; S.roomId = null; render();
  }
  function fail(e) { console.error(e); lastError = errText(e); state = 'error'; render(); }
  function reset() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    clearTimeout(timer); B = null; member = null; S.user = null; SYNCED = new Map(); DB = blankDB(); members = null;
  }
  async function logout() {
    if (pending()) { await flush(); }
    reset(); state = 'login'; render();
    await sb.auth.signOut();
  }

  /* ---------- Laden ---------- */
  async function loadAll() {
    const cutoff = addDays(today(), -HISTORY_DAYS), rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('tp_records').select('coll, id, data').eq('betrieb_id', B).neq('coll', 'audit')
        .or(`res_date.is.null,res_date.gte.${cutoff}`).order('coll').order('id').range(from, from + 999);
      if (error) throw error;
      rows.push(...data); if (data.length < 1000) break;
    }
    const au = await sb.from('tp_records').select('coll, id, data').eq('betrieb_id', B).eq('coll', 'audit').order('updated_at', { ascending: false }).limit(AUDIT_LIMIT);
    if (au.error) throw au.error;
    const D = blankDB(); D.betrieb = BNAME; SYNCED = new Map();
    for (const r of rows) {
      if (r.coll === 'meta') { if (r.data && r.data.betrieb) D.betrieb = r.data.betrieb; continue; }
      if (D[r.coll]) D[r.coll].push(r.data);
    }
    D.audit = au.data.map(r => r.data).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    DB = D;
    for (const c of COLLS) for (const r of DB[c]) SYNCED.set(c + '|' + r.id, JSON.stringify(r));
    if (rows.some(r => r.coll === 'meta')) SYNCED.set('meta|settings', metaJSON());
  }

  /* ---------- Speichern: nur geänderte Datensätze übertragen ---------- */
  function currentMap() {
    const m = new Map();
    for (const c of COLLS) for (const r of DB[c] || []) { if (!r.id) r.id = uid(); m.set(c + '|' + r.id, JSON.stringify(r)); }
    m.set('meta|settings', metaJSON());
    return m;
  }
  function diff() {
    const cur = currentMap(), ups = [], dels = [];
    for (const [k, v] of cur) if (SYNCED.get(k) !== v) ups.push([k, v]);
    for (const k of SYNCED.keys()) if (!cur.has(k) && !k.startsWith('audit|')) dels.push(k);
    return { ups, dels };
  }
  const pending = () => { if (!B || syncing) return syncing; const d = diff(); return d.ups.length + d.dels.length > 0; };
  function scheduleSync() { if (!B) return; setSync('saving'); clearTimeout(timer); timer = setTimeout(flush, 250); }
  async function flush() {
    if (!B) return;
    if (syncing) { again = true; return; }
    syncing = true; setSync('saving');
    try {
      const { ups, dels } = diff();
      for (let i = 0; i < ups.length; i += 500) {
        const chunk = ups.slice(i, i + 500);
        const rows = chunk.map(([k, v]) => { const [coll, id] = splitKey(k), data = JSON.parse(v);
          return { betrieb_id: B, coll, id, data, client_id: CLIENT_ID, res_date: coll === 'reservations' && /^\d{4}-\d\d-\d\d$/.test(data.date) ? data.date : null }; });
        const { error } = await sb.from('tp_records').upsert(rows, { onConflict: 'betrieb_id,coll,id' });
        if (error) throw error;
        chunk.forEach(([k, v]) => SYNCED.set(k, v));
      }
      const byColl = {};
      dels.forEach(k => { const [c, id] = splitKey(k); (byColl[c] = byColl[c] || []).push(id); });
      for (const c in byColl) for (let i = 0; i < byColl[c].length; i += 200) {
        const part = byColl[c].slice(i, i + 200);
        const { error } = await sb.from('tp_records').delete().eq('betrieb_id', B).eq('coll', c).in('id', part);
        if (error) throw error;
        part.forEach(id => SYNCED.delete(c + '|' + id));
      }
      setSync('ok');
    } catch (e) {
      console.error(e); lastError = errText(e);
      if (e && e.code === '42501') { // keine Berechtigung → Serverstand neu laden, lokale Änderung verwerfen
        toast('Keine Berechtigung für diese Änderung – sie wurde verworfen.', 'err');
        syncing = false; again = false; await refresh(true); return;
      }
      setSync('error'); toast('Speichern in der Datenbank fehlgeschlagen: ' + lastError + ' – neuer Versuch in 10 s', 'err');
      clearTimeout(timer); timer = setTimeout(flush, 10000);
    } finally {
      syncing = false;
      if (again) { again = false; flush(); }
    }
  }
  /** Serverstand neu laden (nach Verbindungsabbruch, Rückkehr in den Tab …) */
  async function refresh(force) {
    if (!B || state !== 'ready') return;
    if (!force && pending()) { await flush(); if (pending()) return; }
    try { await loadAll(); setSync('ok'); requestRender(); } catch (e) { setSync('error'); }
  }

  /* ---------- Realtime: Änderungen anderer Geräte übernehmen ---------- */
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('tp-' + B + '-' + CLIENT_ID)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tp_records', filter: 'betrieb_id=eq.' + B }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tp_records', filter: 'betrieb_id=eq.' + B }, onChange)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tp_records' }, onChange) // DELETE lässt sich nicht filtern
      .subscribe(st => {
        rtState = st;
        if (st === 'SUBSCRIBED') { if (wasDown) { wasDown = false; refresh(); } }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') wasDown = true;
        updateIndicator();
      });
  }
  function onChange(p) {
    if (p.eventType === 'DELETE') {
      const o = p.old; if (!o || o.betrieb_id !== B) return;
      const k = o.coll + '|' + o.id; if (!SYNCED.has(k)) return;
      SYNCED.delete(k);
      if (DB[o.coll]) { const i = DB[o.coll].findIndex(x => x.id === o.id); if (i >= 0) DB[o.coll].splice(i, 1); }
      return requestRender();
    }
    const n = p.new; if (!n || n.betrieb_id !== B || n.client_id === CLIENT_ID) return;
    const k = n.coll + '|' + n.id;
    if (n.coll === 'meta') { DB.betrieb = (n.data && n.data.betrieb) || DB.betrieb; SYNCED.set(k, metaJSON()); return requestRender(); }
    if (n.coll === 'reservations' && n.res_date && n.res_date < addDays(today(), -HISTORY_DAYS)) return;
    const arr = DB[n.coll] || (DB[n.coll] = []);
    const cur = arr.find(x => x.id === n.id);
    if (cur) { Object.keys(cur).forEach(key => delete cur[key]); Object.assign(cur, n.data); } // Objekt-Identität behalten (offene Formulare)
    else if (n.coll === 'audit') arr.unshift(n.data);
    else arr.push(n.data);
    SYNCED.set(k, JSON.stringify(cur || n.data));
    requestRender();
  }
  const isTyping = () => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !!a.closest('#main'); };
  function requestRender() {
    if (state !== 'ready') return;
    if (modalOpen() || DRAGGING || isTyping()) { renderPending = true; return; }
    render();
  }
  setInterval(() => { if (renderPending && !modalOpen() && !DRAGGING && !isTyping()) { renderPending = false; render(); } }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('online', () => { flush(); refresh(); });
  window.addEventListener('beforeunload', e => { if (B && (syncing || syncState !== 'ok')) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Statusanzeige in der Kopfzeile ---------- */
  function setSync(s) { syncState = s; updateIndicator(); }
  function indicator() {
    if (syncState === 'error') return ['var(--danger)', 'Nicht gespeichert', 'Letzter Fehler: ' + lastError];
    if (syncState === 'saving') return ['var(--warn)', 'Speichert…', 'Änderungen werden übertragen'];
    if (rtState && rtState !== 'SUBSCRIBED') return ['var(--warn)', 'Live getrennt', 'Verbindung für Live-Aktualisierung unterbrochen – wird automatisch wiederhergestellt'];
    return ['var(--ok)', 'Gespeichert', 'Alle Änderungen sind in der Datenbank · Live-Aktualisierung aktiv'];
  }
  function statusHTML() { const [c, l, tt] = indicator(); return `<span id="syncInd" class="badge" title="${esc(tt)}" style="border-color:${c}"><b style="color:${c}">●</b> ${esc(l)}</span>`; }
  function updateIndicator() { const el = $('#syncInd'); if (el) el.outerHTML = statusHTML(); }

  /* ---------- Masken vor dem eigentlichen Programm ---------- */
  function gateBox(title, body) {
    $('#app').innerHTML = `<div class="login panel"><h3>${esc(title)}</h3><div class="body">${body}</div></div>`;
  }
  function renderGate() {
    if (state === 'init' || state === 'loading') return gateBox('Tischplan', '<p class="muted">Daten werden geladen…</p>');
    if (state === 'login') {
      gateBox('Tischplan – Anmeldung', `<form id="lf"><label>E-Mail<input type="email" id="lEmail" autocomplete="username" required></label>
        <label style="margin-top:8px">Passwort<input type="password" id="lPw" autocomplete="current-password" required></label>
        <button class="btn primary" style="margin-top:12px;width:100%;justify-content:center">Anmelden</button></form>
        <p style="margin:12px 0 0;font-size:13px"><a href="#" id="lForgot">Passwort vergessen?</a></p>`);
      $('#lf').onsubmit = async e => {
        e.preventDefault();
        const btn = $('#lf button'); btn.disabled = true;
        const { data, error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lPw').value });
        btn.disabled = false;
        if (error) return toast('Anmeldung fehlgeschlagen: ' + errText(error), 'err');
        session = data.session; afterLogin();
      };
      $('#lForgot').onclick = async e => {
        e.preventDefault(); const em = $('#lEmail').value.trim();
        if (!em) return toast('Bitte zuerst die E-Mail-Adresse eintragen', 'err');
        const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
        toast(error ? 'Fehler: ' + errText(error) : 'E-Mail zum Zurücksetzen wurde gesendet', error ? 'err' : undefined);
      };
      return;
    }
    if (state === 'setpw') {
      gateBox('Passwort festlegen', `<form id="pf"><p class="muted" style="margin-top:0">${esc(session ? session.user.email : '')}</p>
        <label>Neues Passwort (mind. 8 Zeichen)<input type="password" id="p1" autocomplete="new-password" minlength="8" required></label>
        <label style="margin-top:8px">Wiederholen<input type="password" id="p2" autocomplete="new-password" required></label>
        <button class="btn primary" style="margin-top:12px;width:100%;justify-content:center">Speichern</button></form>`);
      $('#pf').onsubmit = async e => {
        e.preventDefault();
        if ($('#p1').value !== $('#p2').value) return toast('Passwörter stimmen nicht überein', 'err');
        const { error } = await sb.auth.updateUser({ password: $('#p1').value });
        if (error) return toast(errText(error), 'err');
        afterLogin.pwDone = true; history.replaceState(null, '', location.pathname); toast('Passwort gespeichert'); afterLogin();
      };
      return;
    }
    if (state === 'select') {
      gateBox('Betrieb wählen', `<div class="userbtns">${memberships.map((m, i) => `<button class="btn" data-m="${i}"><b>${esc((m.tp_betriebe || {}).name || 'Betrieb')}</b><small class="muted">${t(m.role)}</small></button>`).join('')}</div>
        <p style="margin-top:14px"><button class="btn small" id="gOut">Abmelden</button></p>`);
      $$('[data-m]').forEach(b => b.onclick = () => openBetrieb(memberships[+b.dataset.m]));
      $('#gOut').onclick = logout; return;
    }
    if (state === 'nobetrieb') {
      gateBox('Kein Betrieb zugeordnet', `<p>Ihr Benutzer <b>${esc(session.user.email)}</b> ist noch keinem Betrieb zugeordnet. Bitten Sie den Admin, Sie unter <i>Einstellungen → Benutzer & Rollen</i> hinzuzufügen.</p>
        <details><summary class="muted">Ersteinrichtung: neuen Betrieb anlegen</summary><label style="margin-top:8px">Name des Betriebs<input id="nbName" placeholder="z. B. Hotel Sonnenhof"></label>
        <button class="btn primary" id="nbBtn" style="margin-top:8px">Betrieb anlegen (ich werde Admin)</button></details>
        <p style="margin-top:14px"><button class="btn small" id="gOut">Abmelden</button></p>`);
      $('#nbBtn').onclick = async () => {
        const { error } = await sb.rpc('tp_create_betrieb', { p_name: $('#nbName').value });
        if (error) return toast(errText(error), 'err');
        try { localStorage.removeItem('tischplan.betrieb'); } catch (e) {}
        afterLogin();
      };
      $('#gOut').onclick = logout; return;
    }
    if (state === 'empty') {
      const admin = S.user && S.user.role === 'admin';
      gateBox(`${BNAME} – Einrichtung`, admin ? `<p>Der Betrieb hat noch keine Daten. Wie möchten Sie starten?</p>
        <div class="row"><button class="btn primary" id="eDemo">Mit Demo-Daten (zum Ausprobieren)</button><button class="btn" id="eEmpty">Leer – nur Grundeinstellungen</button></div>
        <p class="muted" style="font-size:12px">Beides lässt sich später unter Einstellungen → Daten ersetzen.</p>`
        : `<p>Der Betrieb ist noch nicht eingerichtet. Bitte melden Sie sich bei Ihrem Admin.</p><button class="btn small" id="gOut">Abmelden</button>`);
      const start = D => { const keepName = BNAME; DB = D; DB.betrieb = keepName; DB.users = []; log('Betrieb eingerichtet', ''); state = 'ready'; S.view = ROLE_VIEWS[S.user.role][0]; S.serviceId = null; save(); render(); };
      if (admin) {
        $('#eDemo').onclick = () => start(demoData());
        $('#eEmpty').onclick = () => { const D = demoData();
          Object.assign(D, { rooms: [{ id: 'r1', name: 'Restaurant', w: 1000, h: 650, bg: '' }], tables: [], decor: [], combos: [], stays: [], reservations: [], audit: [], layouts: [] });
          start(D); };
      } else $('#gOut').onclick = logout;
      return;
    }
    gateBox('Fehler', `<div class="warnbox">${esc(lastError)}</div><p class="muted" style="font-size:13px">Prüfen Sie die Internetverbindung und ob das Datenbank-Schema (supabase/schema.sql) eingespielt wurde.</p>
      <div class="row"><button class="btn primary" id="gRetry">Erneut versuchen</button><button class="btn" id="gOut">Abmelden</button></div>`);
    $('#gRetry').onclick = () => session ? afterLogin() : (state = 'login', render());
    $('#gOut').onclick = logout;
  }

  /* ---------- Einstellungen: Mitglieder verwalten ---------- */
  function membersHTML() {
    const isAdmin = S.user.role === 'admin';
    if (!members) return '<p class="muted">Lade Benutzer…</p>';
    return `${members.map(m => `<div class="row" style="margin-bottom:6px">
        <input data-mn="${m.user_id}" value="${esc(m.name)}" style="flex:2;width:auto" ${isAdmin ? '' : 'disabled'} title="${esc(m.email)}">
        <span class="muted" style="flex:2;font-size:12px;overflow:hidden;text-overflow:ellipsis">${esc(m.email)}</span>
        <select data-mr="${m.user_id}" style="flex:2;width:auto" ${isAdmin && m.user_id !== S.user.id ? '' : 'disabled'}>${Object.keys(ROLE_VIEWS).map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${t(r)}</option>`).join('')}</select>
        <button class="btn small danger" data-md="${m.user_id}" ${isAdmin && m.user_id !== S.user.id ? '' : 'disabled'}>✕</button></div>`).join('')}
      ${isAdmin ? `<h4 style="margin:14px 0 6px">Benutzer hinzufügen</h4><div class="grid3"><label>E-Mail<input id="mEmail" type="email"></label><label>Name<input id="mName"></label>
        <label>Rolle<select id="mRole">${Object.keys(ROLE_VIEWS).map(r => `<option value="${r}" ${r === 'service' ? 'selected' : ''}>${t(r)}</option>`).join('')}</select></label></div>
        <button class="btn small primary" id="mAdd" style="margin-top:8px">Hinzufügen</button>
        <p class="muted" style="font-size:12px">Neue Benutzer zuerst in Supabase einladen (<i>Authentication → Users → Invite user</i>). Mit dem Link in der Einladungsmail legen sie hier ihr Passwort fest.</p>` : ''}
      ${memberships.length > 1 ? '<button class="btn small" id="mSwitch" style="margin-top:6px">Betrieb wechseln</button>' : ''}
      <p class="muted" style="font-size:12px">Angemeldet als ${esc(S.user.email)} (${t(S.user.role)}).</p>`;
  }
  async function loadMembers() {
    const { data, error } = await sb.from('tp_mitglieder').select('user_id, role, name, email').eq('betrieb_id', B).order('name');
    if (error) return toast(errText(error), 'err');
    members = data; if (S.view === 'settings') render();
  }
  function bindMembers(main) {
    if (!members) { loadMembers(); return; }
    const upd = async (uidM, patch) => {
      const { error } = await sb.from('tp_mitglieder').update(patch).eq('betrieb_id', B).eq('user_id', uidM);
      if (error) toast(errText(error), 'err'); else toast('Gespeichert');
      loadMembers();
    };
    $$('[data-mn]', main).forEach(el => el.onchange = () => upd(el.dataset.mn, { name: el.value }));
    $$('[data-mr]', main).forEach(el => el.onchange = () => upd(el.dataset.mr, { role: el.value }));
    $$('[data-md]', main).forEach(el => el.onclick = () => { const m = members.find(x => x.user_id === el.dataset.md);
      confirmModal('Benutzer entfernen?', [`${m.name} (${m.email}) verliert den Zugriff auf diesen Betrieb.`], async () => {
        const { error } = await sb.from('tp_mitglieder').delete().eq('betrieb_id', B).eq('user_id', m.user_id);
        if (error) toast(errText(error), 'err'); loadMembers();
      }, 'Entfernen'); });
    const add = $('#mAdd', main);
    if (add) add.onclick = async () => {
      const { error } = await sb.rpc('tp_add_member', { p_betrieb: B, p_email: $('#mEmail').value, p_role: $('#mRole').value, p_name: $('#mName').value });
      if (error) return toast(errText(error), 'err');
      toast('Benutzer hinzugefügt'); log('Benutzer hinzugefügt', $('#mEmail').value); save(); loadMembers();
    };
    const sw = $('#mSwitch', main);
    if (sw) sw.onclick = async () => { if (pending()) await flush(); try { localStorage.removeItem('tischplan.betrieb'); } catch (e) {} reset(); state = 'select'; render(); };
    // Betriebsname zusätzlich in tp_betriebe pflegen
    const cf = $('#cfName', main);
    if (cf && S.user.role === 'admin') cf.addEventListener('change', async () => { BNAME = cf.value; await sb.from('tp_betriebe').update({ name: cf.value }).eq('id', B); });
  }

  return { init, logout, renderGate, renderLogin: renderGate, ready: () => state === 'ready', scheduleSync, flush, statusHTML,
    membersHTML, bindMembers, betriebName: () => BNAME, _debug: () => ({ state, B, syncState, rtState, synced: SYNCED.size }) };
})();
