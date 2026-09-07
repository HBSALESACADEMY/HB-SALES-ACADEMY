-- Vertriebler sehen ihre eigenen Kontakte im E-Mail-Marketing.
--
-- Wer einen Kontakt erarbeitet hat, soll sehen, was daraus wird — und ihn
-- korrigieren können, solange noch nichts rausgegangen ist. Ein Tippfehler
-- in der Adresse fällt oft erst auf, wenn man die Zeile später wiedersieht.
--
-- Die Grenze ist der Versand: sobald die Mail beim Kunden liegt, ändert
-- niemand mehr rückwirkend, was angeblich dringestanden hat. Ab da ist es
-- Sache der Leitung.
drop policy if exists "email_kontakte_update_own" on email_kontakte;
create policy "email_kontakte_update_own" on email_kontakte for update using (
  auth.uid() = user_id and status = 'offen'
);

-- Löschen bleibt ohne Einschränkung: einen versehentlich erfassten Kontakt
-- muss man auch dann noch loswerden, wenn der Status schon weitergelaufen
-- ist — sonst steht ein falscher Eintrag für immer in der Liste.
drop policy if exists "email_kontakte_delete_own" on email_kontakte;
create policy "email_kontakte_delete_own" on email_kontakte for delete using (auth.uid() = user_id);

-- Der Menüpunkt gilt jetzt für alle. Was jemand dort sieht, entscheiden die
-- Zugriffsregeln: Vertriebler ihre eigenen Kontakte, die Leitung die der
-- ganzen Organisation.
update nav_items set requires_manager = false where key = 'email-marketing';
