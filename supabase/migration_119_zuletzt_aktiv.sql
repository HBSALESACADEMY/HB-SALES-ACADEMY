-- Wer gerade in der Academy ist.
--
-- Gemeldet: "Gerade ist niemand da", während eine Vertrieblerin arbeitet.
-- Grund: Anwesenheit wurde aus den Seitenaufrufen abgeleitet, und die
-- entstehen nur beim WECHSEL einer Seite. Wer eine halbe Stunde im Call
-- Tracker sitzt und Anwahlen tippt, wechselt keine Seite — und galt damit
-- als weg, obwohl er gerade am meisten arbeitet.
--
-- Deshalb ein eigener Zeitstempel, den die geöffnete Academy regelmässig
-- erneuert, solange der Tab sichtbar ist (components/Layout.js).
alter table profiles add column if not exists zuletzt_aktiv_at timestamptz;

-- Für "wer ist gerade da" wird nach diesem Zeitstempel sortiert und gefiltert.
create index if not exists profiles_zuletzt_aktiv_idx on profiles (organization_id, zuletzt_aktiv_at desc);

-- Kein Nachtragen aus alten Daten: "zuletzt gesehen" lässt sich nicht
-- rückwirkend erfinden. Leer heisst "noch nicht bekannt", und die Anzeige
-- fällt für diese Konten weiterhin auf die Seitenaufrufe zurück.
