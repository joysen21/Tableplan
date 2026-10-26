-- QR-Speisekarte: Gast gibt seine Zimmernummer ein (statt aus einer Liste zu wählen); zur Bestätigung wird der Name zum Zimmer angezeigt.
-- Der Name kommt nur für genau dieses Zimmer zurück (nicht in der Liste aller Zimmer) und nur für Gäste, die heute oder morgen im Haus sind.

create or replace function public.guest_room_name(p_token text, p_stay uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  sc record;
  d0 date := (now() at time zone 'Europe/Rome')::date;
begin
  select * into sc from public.guest_scope(p_token);
  if not found then return null; end if;
  return (select st.name from public.stays st
          where st.id = p_stay and st.venue_id = sc.venue_id and st.arrival <= d0 + 1 and st.departure >= d0);
end $$;

revoke all on function public.guest_room_name(text, uuid) from public;
grant execute on function public.guest_room_name(text, uuid) to anon, authenticated;
