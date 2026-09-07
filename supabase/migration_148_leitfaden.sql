-- Der Gesprächsablauf für den Moment, in dem der Entscheider drangeht.
--
-- Eine Gedächtnisstütze, kein Schulungsmaterial: Der Kunde ist am Telefon,
-- und die Reihenfolge ist das Erste, was in dieser Lage verlorengeht.
--
-- Als JSON an der Organisation, wie die Einwand-Kategorien und die
-- Mail-Vorlagen: es sind wenige Einträge, sie werden immer zusammen
-- geladen, und eine eigene Tabelle brächte nur Verwaltungsaufwand.
--
-- Voreinstellung im Code (lib/leitfaden.js), nicht hier: eine leere Liste
-- heisst ausdrücklich "kein Leitfaden", und das muss sich von "noch nichts
-- eingestellt" unterscheiden lassen.
alter table organizations add column if not exists gespraechsleitfaden jsonb;

comment on column organizations.gespraechsleitfaden is
  'Schritte, die beim Gespräch mit der Entscheidung erscheinen: [{titel, hinweis}]. NULL = Voreinstellung, [] = kein Leitfaden.';
