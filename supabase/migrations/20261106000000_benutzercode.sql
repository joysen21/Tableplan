-- Benutzer mit Benutzercode + Passwort (vom Admin angelegt)
-- Firmenkürzel je Betrieb (Anmeldung: Firma + Code + Passwort); der Benutzer selbst wird über die
-- Edge Function „benutzer“ angelegt (Supabase-Admin-Schnittstelle, service_role nur dort).
-- Interne Anmelde-Adresse eines Code-Benutzers: <code>@<venue_id>.nutzer.joke-solutions.eu (wird nie angeschrieben).

alter table public.venues add column if not exists login_code text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'venues_login_code_format') then
    alter table public.venues add constraint venues_login_code_format check (login_code is null or login_code ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$');
  end if;
end $$;
create unique index if not exists venues_login_code_key on public.venues (login_code) where login_code is not null;

alter table public.members add column if not exists login_code text;
create unique index if not exists members_login_code_key on public.members (venue_id, login_code) where login_code is not null;

-- Anmeldemaske: Firmenkürzel → Betrieb (nur Id und Name, nur bei exakt bekanntem Kürzel)
create or replace function public.venue_by_login_code(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', id, 'name', name) from public.venues where login_code = lower(trim(p_code)) limit 1
$$;
revoke all on function public.venue_by_login_code(text) from public;
grant execute on function public.venue_by_login_code(text) to anon, authenticated;
