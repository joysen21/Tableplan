-- Optional: Tabellen des HTML-Prototyps (prototype/) entfernen, wenn sie nicht mehr gebraucht werden.
-- ACHTUNG: löscht alle Daten des Prototyps endgültig.
drop table if exists public.tp_records cascade;
drop table if exists public.tp_mitglieder cascade;
drop table if exists public.tp_betriebe cascade;
drop function if exists public.tp_create_betrieb(text);
drop function if exists public.tp_add_member(uuid, text, text, text);
drop function if exists public.tp_can_write(uuid, text);
drop function if exists public.tp_role(uuid);
drop function if exists public.tp_touch();
