-- Migration 45: Ergebnis eines Termins festhalten — Kunde geworden,
-- überlegt (mit Follow-up-Termin) oder Absage. Getrennt von "status"
-- (Termin-Logistik: geplant/wahrgenommen/abgesagt) — outcome beschreibt das
-- VERTRIEBLICHE Ergebnis nach dem Gespräch.
-- Einmalig im Supabase SQL Editor ausführen.

alter table leads add column if not exists outcome text check (outcome in ('kunde', 'follow_up', 'absage'));

insert into nav_items (key, label, icon, route, is_builtin, requires_manager, order_index)
values ('kunden', 'Kunden', 'award', '/kunden', true, false, 18)
on conflict (key) do nothing;
