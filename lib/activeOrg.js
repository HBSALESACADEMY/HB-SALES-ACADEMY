// Für Plattform-Admins: die Organisation, deren Firmencode sie zuletzt auf
// der Login-Seite eingegeben haben (session-gebunden), NICHT zwingend ihre
// eigene Heimat-Organisation. Für alle anderen Konten: immer die eigene,
// echte organization_id.
//
// Zentral hier, damit "welche Organisation ist gerade aktiv" überall exakt
// gleich berechnet wird — unterschiedliche Berechnungen an verschiedenen
// Stellen führten dazu, dass von Plattform-Admins per Firmencode angelegte
// Ordner/Kurse fälschlich der eigenen Heimat-Organisation des Plattform-
// Admins zugeordnet wurden statt der gerade aktiven (siehe migration_53).
export function getActiveOrgId(profile) {
  if (!profile) return null;
  if (profile.is_platform_admin) {
    return sessionStorage.getItem("hb_active_org_id") || profile.organization_id || null;
  }
  return profile.organization_id || null;
}

// Hinterlegt die gewählte Organisation zusätzlich SERVERSEITIG (Tabelle
// active_org, migration_92). Der sessionStorage-Eintrag oben reicht nicht:
// die Zugriffsregeln der Datenbank laufen im Server und sehen den Browser
// nicht — ohne diesen Eintrag könnten sie einen Plattform-Admin nicht auf
// eine Organisation begrenzen.
//
// Fehler werden bewusst nur protokolliert: schlägt es fehl, bleibt die
// Sichtbarkeit auf dem Stand von vorher, aber die Anmeldung soll deshalb
// nicht scheitern.
export async function merkeAktiveOrg(supabase, userId, organizationId) {
  if (!userId) return;
  try {
    if (organizationId) {
      await supabase.from("active_org").upsert({ user_id: userId, organization_id: organizationId, gesetzt_at: new Date().toISOString() });
    } else {
      await supabase.from("active_org").delete().eq("user_id", userId);
    }
  } catch (e) {
    console.error("Aktive Organisation konnte nicht hinterlegt werden:", e.message);
  }
}

// Browser und Server müssen sich über die aktive Organisation EINIG sein.
//
// Der Fehler dahinter: die Wahl stand an zwei Stellen. Im Browser in
// sessionStorage (pro Tab!), auf dem Server in der Tabelle active_org (pro
// Konto, dauerhaft). Wich beides voneinander ab, filterte die Seite auf
// Organisation A, während die Zugriffsregeln Organisation B durchliessen —
// übrig blieb nur, was einem selbst gehört. Ein zweiter Tab genügte dafür,
// und je nachdem, welcher zuletzt geladen hatte, klappte es mal und mal nicht.
//
// Regel: Was im Tab steht, hat Vorrang — dort hat die Person gerade einen
// Firmencode eingegeben. Steht dort nichts (neuer Tab), gilt der Server,
// nicht die Heimat-Organisation. Erst wenn beides fehlt, die Heimat.
export function abgleichAktiveOrg({ gespeichert, server, heimat }) {
  if (gespeichert) {
    return {
      aktiv: gespeichert,
      serverSchreiben: gespeichert !== server ? gespeichert : null,
      sessionSchreiben: null,
    };
  }
  if (server) {
    return { aktiv: server, serverSchreiben: null, sessionSchreiben: server };
  }
  return {
    aktiv: heimat || null,
    serverSchreiben: heimat || null,
    sessionSchreiben: heimat || null,
  };
}

// Ein Weg, beide Seiten in Übereinstimmung zu bringen — hier, damit die
// Zeichenkette "hb_active_org_id" die Datei nicht verlässt (siehe Test
// "die aktive Organisation wird nirgends nachgebaut").
export async function synchronisiereAktiveOrg(supabase, profil) {
  if (!profil?.is_platform_admin) return getActiveOrgId(profil);
  const gespeichert = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("hb_active_org_id");
  const { data: serverOrg } = await supabase.from("active_org")
    .select("organization_id").eq("user_id", profil.id).maybeSingle();

  const abgleich = abgleichAktiveOrg({
    gespeichert,
    server: serverOrg?.organization_id || null,
    heimat: profil.organization_id || null,
  });
  if (abgleich.sessionSchreiben && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("hb_active_org_id", abgleich.sessionSchreiben);
  }
  if (abgleich.serverSchreiben) await merkeAktiveOrg(supabase, profil.id, abgleich.serverSchreiben);
  return abgleich.aktiv;
}
