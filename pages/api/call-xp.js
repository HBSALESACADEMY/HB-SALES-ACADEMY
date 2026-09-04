import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { offeneXp, xpFuerTag } from "../../lib/callXp";

// Schreibt XP für die heutige Arbeit im Call Tracker gut.
//
// Warum auf dem Server und nicht im Browser: increment_xp ist ausdrücklich
// nur für den Service-Role-Client freigegeben. Käme der Betrag aus der
// Seite, liesse sich jede Zahl behaupten — und bei einer Rangliste ist das
// keine theoretische Sorge.
//
// Gerechnet wird aus den ZAHLEN IN DER DATENBANK, nicht aus dem, was die
// Anfrage mitschickt. Die Route nimmt nur den Tag entgegen.
export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  const tag = typeof req.body?.tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.tag) ? req.body.tag : null;
  if (!tag) return res.status(400).json({ error: "Tag fehlt." });

  try {
    const admin = getAdminSupabase();
    const { data: zeile } = await admin.from("call_log_days")
      .select("counts, reasons, xp_vergeben").eq("user_id", user.id).eq("log_date", tag).maybeSingle();
    if (!zeile) return res.status(200).json({ vergeben: 0, gesamt: 0 });

    const anspruch = xpFuerTag(zeile.counts || {}, zeile.reasons || {});
    const offen = offeneXp(zeile.counts || {}, zeile.reasons || {}, zeile.xp_vergeben || 0);
    if (offen <= 0) return res.status(200).json({ vergeben: 0, gesamt: anspruch });

    // Erst merken, dann gutschreiben: bricht der zweite Schritt ab, wurde
    // zu wenig vergeben. Andersherum wäre es zu viel — und zu viel XP
    // bekommt man nie wieder sauber aus einer Rangliste heraus.
    const { error: merkFehler } = await admin.from("call_log_days")
      .update({ xp_vergeben: (zeile.xp_vergeben || 0) + offen })
      .eq("user_id", user.id).eq("log_date", tag);
    if (merkFehler) throw merkFehler;

    await admin.rpc("increment_xp", { uid: user.id, amount: offen });
    return res.status(200).json({ vergeben: offen, gesamt: anspruch });
  } catch (e) {
    console.error("Call-XP fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "XP konnten nicht gutgeschrieben werden." });
  }
}
