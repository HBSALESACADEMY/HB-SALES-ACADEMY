-- Die Erklärung des Vertriebsbuddys — einmal für jeden.
--
-- Wer sich neu verbindet, bekommt sie direkt nach der Begrüssung. Alle,
-- die schon vorher verbunden waren, kennen sie nicht: Sie haben eine
-- Begrüssung von früher bekommen, in der es den Buddy in dieser Form noch
-- nicht gab.
--
-- Diese Spalte hält fest, wer sie hat. Damit geht sie im nächsten
-- Morgenlauf an alle Übrigen — und an niemanden zweimal.

alter table telegram_verknuepfungen add column if not exists erklaerung_am timestamptz;
