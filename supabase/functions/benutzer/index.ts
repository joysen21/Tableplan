// Supabase Edge Function „benutzer“: Admin legt Benutzer mit Benutzercode + Passwort an,
// setzt Passwörter neu und löscht Code-Benutzer. Der service_role-Schlüssel existiert nur hier
// (von Supabase automatisch als Umgebungsvariable bereitgestellt), nie im Browser.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ROLES = ['admin', 'empfang', 'service', 'kueche'];
const CODE = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;
const UUID = /^[0-9a-f-]{36}$/i;
const loginEmail = (code: string, venueId: string) => `${code}@${venueId}.nutzer.joke-solutions.eu`;

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Nur POST' });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    // Aufrufer prüfen: angemeldet und Admin des Betriebs
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: who } = await admin.auth.getUser(jwt);
    if (!who?.user) return reply(401, { error: 'Nicht angemeldet' });
    const b = await req.json();
    const venueId = String(b.venueId ?? '');
    if (!UUID.test(venueId)) return reply(400, { error: 'Betrieb fehlt' });
    const { data: me } = await admin.from('members').select('role').eq('venue_id', venueId).eq('user_id', who.user.id).maybeSingle();
    if (me?.role !== 'admin') return reply(403, { error: 'Nur der Admin darf Benutzer verwalten' });

    const pwOk = (p: unknown) => typeof p === 'string' && p.length >= 8 && p.length <= 72;
    // Ziel muss ein Code-Benutzer dieses Betriebs sein (E-Mail-Benutzer gehören evtl. auch anderen Betrieben)
    async function codeMember(userId: string) {
      if (!UUID.test(userId)) return null;
      const { data } = await admin.from('members').select('user_id, login_code').eq('venue_id', venueId).eq('user_id', userId).maybeSingle();
      return data?.login_code ? data : null;
    }

    if (b.action === 'create') {
      const code = String(b.code ?? '').trim().toLowerCase();
      const name = String(b.name ?? '').trim().slice(0, 80);
      if (!CODE.test(code)) return reply(400, { error: 'Benutzercode: 3–32 Zeichen, nur a–z, 0–9, Punkt, Binde- und Unterstrich' });
      if (!ROLES.includes(b.role)) return reply(400, { error: 'Unbekannte Rolle' });
      if (!pwOk(b.password)) return reply(400, { error: 'Passwort: mindestens 8 Zeichen' });
      const { data: taken } = await admin.from('members').select('user_id').eq('venue_id', venueId).eq('login_code', code).maybeSingle();
      if (taken) return reply(409, { error: `Der Benutzercode „${code}“ ist in diesem Betrieb schon vergeben` });
      const email = loginEmail(code, venueId);
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: b.password, email_confirm: true, user_metadata: { name, login_code: code, venue_id: venueId, pw_change: true },
      });
      if (error || !created.user) return reply(400, { error: /already|registered|exists/i.test(error?.message ?? '') ? `Der Benutzercode „${code}“ ist schon vergeben` : error?.message ?? 'Anlegen fehlgeschlagen' });
      const { error: e2 } = await admin.from('members').insert({ venue_id: venueId, user_id: created.user.id, role: b.role, name: name || code, email, login_code: code });
      if (e2) { await admin.auth.admin.deleteUser(created.user.id); return reply(400, { error: e2.message }); }
      return reply(200, { userId: created.user.id });
    }

    if (b.action === 'password') {
      const m = await codeMember(String(b.userId ?? ''));
      if (!m) return reply(404, { error: 'Nur bei Benutzern mit Benutzercode möglich' });
      if (!pwOk(b.password)) return reply(400, { error: 'Passwort: mindestens 8 Zeichen' });
      const { data: u } = await admin.auth.admin.getUserById(m.user_id);
      const { error } = await admin.auth.admin.updateUserById(m.user_id, { password: b.password, user_metadata: { ...(u?.user?.user_metadata ?? {}), pw_change: true } });
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true });
    }

    if (b.action === 'delete') {
      const m = await codeMember(String(b.userId ?? ''));
      if (!m) return reply(404, { error: 'Nur bei Benutzern mit Benutzercode möglich' });
      if (m.user_id === who.user.id) return reply(400, { error: 'Sich selbst entfernen geht nicht' });
      const { error } = await admin.auth.admin.deleteUser(m.user_id); // Mitgliedschaft fällt per Kaskade weg
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true });
    }
    return reply(400, { error: 'Unbekannte Aktion' });
  } catch (e) {
    return reply(500, { error: String((e as Error)?.message ?? e) });
  }
});
