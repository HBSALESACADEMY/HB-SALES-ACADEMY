import { supabase } from "./supabaseClient.js";
import { apiPost } from "./apiClient.js";
import { meldeFehler } from "./errorBus.js";
import { getActiveOrgId } from "./activeOrg.js";

// Meldet eine Änderung an einem Termin an das Team (E-Mail + Telegram, siehe
// pages/api/lead-notify.js). Wird von der Termine- und der Kunden-Seite
// genutzt, damit beide dieselben Meldungen auslösen.
//
// Beim Löschen MUSS der Aufruf abgewartet werden, BEVOR gelöscht wird: danach
// gibt es den Termin nicht mehr und die Route könnte ihn nicht mehr lesen.
// Bei allen anderen Ereignissen darf der Aufruf nebenher laufen — eine
// Benachrichtigung darf die eigentliche Änderung nie aufhalten.
// "details" entscheidet mit, ob überhaupt gemeldet wird (siehe
// lib/terminMeldung.js): { status, outcome, zeitpunktGeaendert }. Die Regel
// selbst steht auf dem Server — hier werden nur die Fakten mitgegeben.
export async function meldeTerminAenderung(leadId, ereignis, beschreibung, details = {}) {
  try {
    // Das eigene Profil wird hier eigens geladen: ohne die AKTIVE
    // Organisation (Firmencode-Ansicht von Plattform-Admins) ginge die
    // Meldung an die falsche Organisation.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: profil } = await supabase
      .from("profiles").select("organization_id, is_platform_admin")
      .eq("id", session.user.id).maybeSingle();
    await apiPost("/api/lead-notify", { leadId, ereignis, beschreibung, details, activeOrgId: getActiveOrgId(profil) });
  } catch (e) {
    // Nicht still verschlucken: die Änderung ist gespeichert, nur die
    // Meldung fehlt — das muss man sehen können.
    meldeFehler("Die Änderung wurde gespeichert, aber das Team konnte nicht benachrichtigt werden.", e.message);
  }
}
