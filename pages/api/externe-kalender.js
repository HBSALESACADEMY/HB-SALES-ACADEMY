import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { pruefeUrl, aktualisiereKalender } from "../../lib/externerKalenderAbruf";

// Die eigenen externen Kalender verwalten.
//
// Alles hier dreht sich ausschliesslich um das EIGENE Konto — niemand
// verwaltet die Kalender anderer, auch keine Führungskraft. Die Adresse ist
// bei Google und Apple ausdrücklich eine "geheime Adresse": wer sie hat,
// liest den Kalender. Deshalb wird sie beim Auflisten auch nur verkürzt
// zurückgegeben und nie im Klartext ausgeliefert.
export const config = { maxDuration: 30 };

// Genug für privat, Arbeit und Familie — und eine Grenze, damit niemand aus
// Versehen zwanzig Kalender abrufen lässt.
const MAX_KALENDER = 5;

function kurz(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}/…`;
  } catch (e) { return "…"; }
}

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;
  const admin = getAdminSupabase();

  try {
    if (req.method === "GET") {
      const { data } = await admin.from("externe_kalender")
        .select("id, name, sichtbarkeit, aktiv, url, letzter_abruf, letzter_fehler")
        .eq("user_id", user.id).order("created_at");
      return res.status(200).json({
        kalender: (data || []).map((k) => ({ ...k, url: kurz(k.url) })),
      });
    }

    if (req.method === "POST") {
      const { data: vorhandene } = await admin.from("externe_kalender")
        .select("id", { count: "exact" }).eq("user_id", user.id);
      if ((vorhandene?.length || 0) >= MAX_KALENDER) {
        return res.status(400).json({ error: `Mehr als ${MAX_KALENDER} Kalender gehen nicht.` });
      }

      const geprueft = pruefeUrl(req.body?.url);
      if (geprueft.fehler) return res.status(400).json({ error: geprueft.fehler });

      const { data: profil } = await admin.from("profiles")
        .select("organization_id, is_platform_admin").eq("id", user.id).maybeSingle();

      const { data: neu, error } = await admin.from("externe_kalender").insert({
        user_id: user.id,
        organization_id: await aktiveOrgId(admin, profil, user.id),
        name: String(req.body?.name || "Mein Kalender").slice(0, 60),
        url: geprueft.url,
        sichtbarkeit: req.body?.sichtbarkeit === "titel" ? "titel" : "belegt",
      }).select().single();
      if (error) throw error;

      // Sofort abrufen: sonst steht ein neuer Kalender bis zum nächsten
      // Aufruf leer da, und niemand weiss, ob die Adresse stimmt.
      const ergebnis = await aktualisiereKalender(admin, neu);
      return res.status(200).json({ ok: true, id: neu.id, ...ergebnis });
    }

    if (req.method === "PATCH") {
      const id = req.body?.id;
      if (!id) return res.status(400).json({ error: "id fehlt." });
      const patch = {};
      if (req.body.sichtbarkeit === "titel" || req.body.sichtbarkeit === "belegt") patch.sichtbarkeit = req.body.sichtbarkeit;
      if (typeof req.body.aktiv === "boolean") patch.aktiv = req.body.aktiv;
      if (typeof req.body.name === "string") patch.name = req.body.name.slice(0, 60);
      // Das eq auf user_id ist die eigentliche Absicherung: der Admin-Zugang
      // umgeht die Regeln der Datenbank, also muss die Grenze hier stehen.
      const { error } = await admin.from("externe_kalender").update(patch).eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "id fehlt." });
      const { error } = await admin.from("externe_kalender").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("Externe Kalender:", e.message);
    return res.status(500).json({ error: e.message || "Der Kalender konnte nicht gespeichert werden." });
  }
}
