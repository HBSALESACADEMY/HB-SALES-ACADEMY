import { supabase } from "./supabaseClient.js";
import { istMeldenswert } from "./fehlerMeldung.js";

// Eine Störung im Browser an den Betreiber melden — im Hintergrund, ohne
// dass die betroffene Person davon etwas merkt.
//
// Bewusst "leise": Der Nutzer sieht seine eigene Fehlermeldung ohnehin. Was
// er nicht braucht, ist ein zweiter Hinweis darüber, dass die Meldung
// weitergeleitet wurde — und schon gar keinen Fehler, weil das Melden selbst
// schiefging (siehe pages/api/fehler-melden.js).
export function meldeFehler(wo, meldung) {
  if (typeof window === "undefined") return;
  const text = meldung instanceof Error ? meldung.message : String(meldung || "");
  if (!istMeldenswert(text)) return;

  // Ohne Anmeldung gibt es niemanden zu benennen, und die Route lehnt ab.
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return;
    fetch("/api/fehler-melden", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ wo, meldung: text }),
      keepalive: true,
    }).catch(() => {});
  }).catch(() => {});
}
