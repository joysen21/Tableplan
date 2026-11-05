# Edge Function „benutzer“ einrichten (einmalig)

Damit der Admin Benutzer mit **Benutzercode + Passwort** anlegen, Passwörter neu setzen und Code-Benutzer löschen kann.
Den geheimen `service_role`-Schlüssel stellt Supabase der Funktion automatisch bereit. Er kommt nie in die App oder ins Repo.

1. Im Supabase SQL Editor die Migration `supabase/migrations/20261106000000_benutzercode.sql` ausführen.
2. Supabase-Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**.
3. Name der Funktion: **`benutzer`** (genau so, klein geschrieben).
4. Den kompletten Inhalt von `supabase/functions/benutzer/index.ts` in den Editor kopieren (vorhandenen Beispielcode ersetzen).
5. **Deploy function** klicken.
6. Die Einstellung „Verify JWT“ eingeschaltet lassen (Standard).

Danach in der App unter Einstellungen → Benutzer & Rollen ein Firmenkürzel festlegen und Benutzer anlegen.

Alternativ per Supabase-CLI: `supabase functions deploy benutzer`.
