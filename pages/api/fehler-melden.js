import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { sendeAlarm } from "../../lib/alarm";
import { istMeldenswert, meldungsSchluessel, sollMelden } from "../../lib/fehlerMeldung";

// Störungen, die im Browser passieren, an den Betreiber-Chat melden.
//
// Warum das nötig ist: die tägliche Systemprüfung sieht nur die Technik
// dahinter — Datenbank, Speicher, Schlüssel. Ob jemand sein Profilbild nicht
// hochladen kann oder eine Seite weiss bleibt, merkt sie nicht. Solche
// Fehler standen bisher nur auf dem Bildschirm der betroffenen Person, und
// ob sie sich meldet, ist Zufall.
//
// Gemeldet wird an den Betreiber-Chat (TELEGRAM_CHAT_ID), nicht an den Chat
// der Organisation: eine Störung ist unsere Sache, nicht die des Kunden.
export const config = { maxDuration: 15 };

// Pro Server-Instanz. Kein perfekter Schutz gegen Wiederholungen, aber der
// Unterschied zwischen einer Nachricht und fünfzig.
const gesehen = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  const wo = String(req.body?.wo || "unbekannt").slice(0, 80);
  const meldung = String(req.body?.meldung || "").slice(0, 400);
  if (!istMeldenswert(meldung)) return res.status(200).json({ ok: true, gemeldet: false });
  if (!sollMelden(meldungsSchluessel(wo, meldung), gesehen)) {
    return res.status(200).json({ ok: true, gemeldet: false });
  }

  try {
    const admin = getAdminSupabase();
    const { data: person } = await admin.from("profiles")
      .select("full_name, organization_id").eq("id", auth.user.id).maybeSingle();
    const { data: org } = person?.organization_id
      ? await admin.from("organizations").select("name").eq("id", person.organization_id).maybeSingle()
      : { data: null };

    await sendeAlarm([
      "⚠️ Störung in der Academy",
      "",
      `Wo: ${wo}`,
      `Meldung: ${meldung}`,
      `Bei: ${person?.full_name || "Unbenannt"}${org?.name ? ` (${org.name})` : ""}`,
    ].join("\n"));
    return res.status(200).json({ ok: true, gemeldet: true });
  } catch (e) {
    // Ein Störungsmelder, der selbst Störungen wirft, macht alles schlimmer.
    console.error("Störungsmeldung fehlgeschlagen:", e?.message || e);
    return res.status(200).json({ ok: true, gemeldet: false });
  }
}
