'use strict';
/* =========================================================
   Start
   ========================================================= */
if (CLOUD) {
  Cloud.init();
} else {
  if (CFG.supabaseUrl && !window.supabase) setTimeout(() => toast('Supabase-Bibliothek nicht geladen (vendor/supabase.js) – lokaler Modus aktiv', 'err'), 500);
  load();
  try { const uidS = sessionStorage.getItem('tischplan.user'); if (uidS) S.user = DB.users.find(u => u.id === uidS) || null; } catch (e) {}
  S.serviceId = serviceForTime(S.time);
  render();
}
// Live-Plan im Modus „Jetzt“ jede halbe Minute aktualisieren
setInterval(() => {
  if (!S.user || !S.follow || modalOpen() || DRAGGING || !['live', 'zeit'].includes(S.view)) return;
  if (CLOUD && !Cloud.ready()) return;
  S.time = nowMin(); S.date = today(); render();
}, 30000);
