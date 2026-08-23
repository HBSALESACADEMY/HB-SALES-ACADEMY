-- Wann jemand sein Profil eingerichtet hat.
--
-- Gemeldet: "Profilbild hinzugefügt" taucht in den Aktivitäten nicht auf.
-- Grund: Es wurde nie festgehalten. Ein Profil trägt nur seinen jetzigen
-- Stand, kein Datum der letzten Änderung — für die Anzeige eines Profils
-- reicht das, für eine Aktivitätenliste nicht.
--
-- Zwei getrennte Zeitstempel statt einem: "hat ein Profilbild hochgeladen"
-- ist die Nachricht, auf die eine Führungskraft wartet, während "hat seine
-- Telefonnummer geändert" nur Rauschen wäre, wenn beides gleich aussieht.
alter table profiles add column if not exists profil_geaendert_at timestamptz;
alter table profiles add column if not exists avatar_geaendert_at timestamptz;

-- Bestand: wer schon ein Bild hat, hat es irgendwann hochgeladen — wann,
-- weiss niemand mehr. Bewusst NICHT auf "jetzt" setzen: dann stünde morgen
-- in den Aktivitäten, die halbe Firma hätte heute ein Profilbild
-- hochgeladen. Leer heisst "nicht bekannt", und leer wird nicht angezeigt.
