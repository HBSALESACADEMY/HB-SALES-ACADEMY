-- Testaccount: alle Kurse als abgeschlossen markieren.
--
-- KEINE Migration — ein einmaliges Hilfsskript, um einen Demo-/Testaccount
-- mit vollständigem Lernfortschritt zu befüllen (alle 24 Modul-Quiz bestanden,
-- alle 7 Abschlussprüfungen bestanden). Nicht auf echte Nutzerkonten anwenden:
-- die Ergebnisse sind erfunden, nicht wirklich erarbeitet.
--
-- VORHER die E-Mail-Adresse des Testaccounts unten eintragen.

do $$
declare
  v_email text := 'HIER_DIE_EMAIL_DES_TESTACCOUNTS_EINTRAGEN';
  v_uid uuid;
  r record;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'Kein Konto mit der E-Mail % gefunden.', v_email;
  end if;

  -- Sauber neu aufbauen, falls das Skript ein zweites Mal läuft — sonst
  -- sammeln sich Duplikate an und die Auswertungen (Lernpfade, Insights)
  -- rechnen mit doppelten Einträgen.
  delete from quiz_results where user_id = v_uid;
  delete from exam_results where user_id = v_uid;

  -- Alle Modul-Quiz: volle Punktzahl (muss zu lib/curriculum.js passen).
  for r in
    select * from (values
      ('grundlagen', 'g1', 6), ('grundlagen', 'g2', 6), ('grundlagen', 'g3', 6),
      ('beziehung', 'b1', 6), ('beziehung', 'b2', 6), ('beziehung', 'b3', 6),
      ('ueberzeugung', 'u1', 6), ('ueberzeugung', 'u2', 6), ('ueberzeugung', 'u3', 6), ('ueberzeugung', 'u4', 6),
      ('verzerrung', 'v1', 6), ('verzerrung', 'v2', 6), ('verzerrung', 'v3', 6), ('verzerrung', 'v4', 6),
      ('einwand', 'e1', 6), ('einwand', 'e2', 6), ('einwand', 'e3', 6), ('einwand', 'e4', 6),
      ('kaltakquise', 'k1', 6), ('kaltakquise', 'k2', 6), ('kaltakquise', 'k3', 6),
      ('bestandskunden', 'b1', 6), ('bestandskunden', 'b2', 6), ('bestandskunden', 'b3', 6)
    ) as t(course_id, module_id, mc_total)
  loop
    insert into quiz_results (user_id, course_id, module_id, mc_score, mc_total, open_score, open_total, open_feedback)
    values (
      v_uid, r.course_id, r.module_id, r.mc_total, r.mc_total, 92, 100,
      jsonb_build_object('score', 92, 'feedback', 'Testdaten — Kurs zu Demonstrationszwecken als abgeschlossen markiert.')
    );
  end loop;

  -- Alle Abschlussprüfungen bestanden (Bestehensgrenze: MC >= 80%,
  -- Fallstudie >= 60 — siehe pages/api/exam-submit.js).
  for r in
    select * from (values
      ('grundlagen'), ('beziehung'), ('ueberzeugung'), ('verzerrung'),
      ('einwand'), ('kaltakquise'), ('bestandskunden')
    ) as t(course_id)
  loop
    insert into exam_results (user_id, course_id, score, total, passed, mc_score, mc_total, capstone_score, capstone_feedback)
    values (
      v_uid, r.course_id, 94, 100, true, 18, 18, 88,
      jsonb_build_object(
        'score', 88,
        'feedback', 'Testdaten — Prüfung zu Demonstrationszwecken als bestanden markiert.',
        'erfuellteKriterien', '[]'::jsonb,
        'fehlendeKriterien', '[]'::jsonb
      )
    );
  end loop;

  raise notice 'Fertig: 24 Modul-Quiz und 7 Abschlussprüfungen für % angelegt.', v_email;
end $$;
