import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { aktiveOrgId } from "../../lib/aktiveOrgServer";
import { PUNKTE, hatBingo, zufallsWoerter, freiePlaetze } from "../../lib/bingo";

// Cold Call Bingo — alles, was Punkte kostet oder vergibt, läuft hier.
//
// Warum über den Server: Punkte dürfen nicht aus dem Browser vergeben
// werden. increment_xp ist ausdrücklich nur für den Server freigegeben
// (migration_70), sonst könnte sich jede Person per Konsole beliebig viele
// gutschreiben. Hier wird geprüft, WEM die Karte gehört, ob das Feld
// wirklich neu abgehakt ist und ob der Bonus schon vergeben wurde.
export const config = { maxDuration: 20 };

async function xp(admin, uid, betrag) {
  if (!uid || !betrag) return;
  try { await admin.rpc("increment_xp", { uid, amount: betrag }); }
  catch (e) { console.error("increment_xp fehlgeschlagen:", e.message); }
}

// Karte samt Feldern und Namen — eine Antwortform für alle Aktionen, damit
// die Oberfläche nach jedem Zug denselben vollständigen Stand bekommt.
async function karteLaden(admin, besitzerId) {
  const { data: karte } = await admin.from("bingo_karten").select("*").eq("besitzer_id", besitzerId).maybeSingle();
  if (!karte) return null;
  const { data: felder } = await admin.from("bingo_felder").select("*").eq("karte_id", karte.id).order("position");
  const ids = [...new Set((felder || []).map((f) => f.von_id).filter(Boolean))];
  const { data: leute } = ids.length
    ? await admin.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const namen = new Map((leute || []).map((p) => [p.id, p.full_name || "Unbenannt"]));
  const { data: besitzer } = await admin.from("profiles").select("full_name").eq("id", besitzerId).maybeSingle();
  return {
    id: karte.id,
    besitzer_id: besitzerId,
    besitzer: besitzer?.full_name || "Unbenannt",
    bingo_at: karte.bingo_at,
    felder: (felder || []).map((f) => ({
      position: f.position,
      wort: f.wort,
      von: f.von_id ? namen.get(f.von_id) || "Unbenannt" : null,
      von_id: f.von_id,
      abgehakt: f.abgehakt,
    })),
  };
}

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  try {
    const admin = getAdminSupabase();
    const { data: ich } = await auth.client.from("profiles")
      .select("id, full_name, organization_id, is_platform_admin").eq("id", auth.user.id).maybeSingle();
    const orgId = await aktiveOrgId(admin, ich, auth.user.id);

    // --- Karte ansehen (eigene oder die einer Kollegin zum Zustecken) ------
    if (req.method === "GET") {
      const fuer = req.query.fuer || auth.user.id;
      if (fuer !== auth.user.id) {
        // Fremde Karten nur innerhalb der eigenen Organisation.
        const { data: andere } = await admin.from("profiles").select("organization_id").eq("id", fuer).maybeSingle();
        if (!andere || andere.organization_id !== orgId) {
          return res.status(403).json({ error: "Diese Karte gehört zu einer anderen Organisation." });
        }
        return res.status(200).json({ karte: await karteLaden(admin, fuer), fremd: true });
      }

      let karte = await karteLaden(admin, auth.user.id);
      if (!karte) {
        await admin.from("bingo_karten").insert({ besitzer_id: auth.user.id, organization_id: orgId });
        karte = await karteLaden(admin, auth.user.id);
      }
      return res.status(200).json({ karte, fremd: false });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { aktion, fuer, wort, position } = req.body || {};

    // --- Ein Wort zustecken ------------------------------------------------
    if (aktion === "zustecken") {
      const zielId = fuer || auth.user.id;
      const text = String(wort || "").trim().slice(0, 60);
      if (!text) return res.status(400).json({ error: "Kein Wort angegeben." });

      const { data: ziel } = await admin.from("profiles").select("organization_id").eq("id", zielId).maybeSingle();
      if (!ziel || ziel.organization_id !== orgId) {
        return res.status(403).json({ error: "Diese Karte gehört zu einer anderen Organisation." });
      }

      let { data: karte } = await admin.from("bingo_karten").select("id").eq("besitzer_id", zielId).maybeSingle();
      if (!karte) {
        const { data: neu } = await admin.from("bingo_karten")
          .insert({ besitzer_id: zielId, organization_id: orgId }).select().single();
        karte = neu;
      }

      const { data: felder } = await admin.from("bingo_felder").select("position, wort").eq("karte_id", karte.id);
      const frei = freiePlaetze(felder || []);
      if (!frei.length) return res.status(400).json({ error: "Diese Karte ist schon voll." });
      if ((felder || []).some((f) => f.wort.toLowerCase() === text.toLowerCase())) {
        return res.status(400).json({ error: "Dieses Wort steht schon auf der Karte." });
      }

      const { error } = await admin.from("bingo_felder").insert({
        karte_id: karte.id,
        position: frei[Math.floor(Math.random() * frei.length)],
        wort: text,
        von_id: auth.user.id,
      });
      if (error) throw error;
      return res.status(200).json({ ok: true, verbleibend: frei.length - 1 });
    }

    // --- Restliche Felder mit Zufallswörtern auffüllen ---------------------
    if (aktion === "auffuellen") {
      const karte = await karteLaden(admin, auth.user.id);
      if (!karte) return res.status(400).json({ error: "Noch keine Karte vorhanden." });
      const frei = freiePlaetze(karte.felder);
      if (!frei.length) return res.status(200).json({ karte });

      const woerter = zufallsWoerter(frei.length, karte.felder.map((f) => f.wort));
      const zeilen = frei.slice(0, woerter.length).map((pos, i) => ({
        karte_id: karte.id, position: pos, wort: woerter[i], von_id: null,
      }));
      if (zeilen.length) {
        const { error } = await admin.from("bingo_felder").insert(zeilen);
        if (error) throw error;
      }
      return res.status(200).json({ karte: await karteLaden(admin, auth.user.id) });
    }

    // --- Feld abhaken ------------------------------------------------------
    if (aktion === "abhaken") {
      const karte = await karteLaden(admin, auth.user.id);
      if (!karte) return res.status(400).json({ error: "Noch keine Karte vorhanden." });
      const feld = karte.felder.find((f) => f.position === Number(position));
      if (!feld) return res.status(400).json({ error: "Dieses Feld gibt es nicht." });

      const neuerWert = !feld.abgehakt;
      const { error } = await admin.from("bingo_felder")
        .update({ abgehakt: neuerWert, abgehakt_at: neuerWert ? new Date().toISOString() : null })
        .eq("karte_id", karte.id).eq("position", feld.position);
      if (error) throw error;

      // Punkte nur beim Abhaken, nie beim Zurücknehmen — sonst liesse sich
      // durch An- und Abklicken beliebig punkten.
      let vergeben = 0;
      if (neuerWert) {
        await xp(admin, auth.user.id, PUNKTE.wort);
        vergeben = PUNKTE.wort;
        if (feld.von_id && feld.von_id !== auth.user.id) await xp(admin, feld.von_id, PUNKTE.zusteller);
      }

      const abgehakt = karte.felder
        .map((f) => (f.position === feld.position ? { ...f, abgehakt: neuerWert } : f))
        .filter((f) => f.abgehakt).map((f) => f.position);

      // Der Bonus einmal je Karte: bingo_at ist der Beleg dafür.
      let bingo = false;
      if (hatBingo(abgehakt)) {
        bingo = true;
        if (!karte.bingo_at) {
          await admin.from("bingo_karten").update({ bingo_at: new Date().toISOString() }).eq("id", karte.id);
          await xp(admin, auth.user.id, PUNKTE.bingo);
          vergeben += PUNKTE.bingo;
        }
      }

      return res.status(200).json({ karte: await karteLaden(admin, auth.user.id), bingo, punkte: vergeben });
    }

    // --- Neue Karte --------------------------------------------------------
    if (aktion === "neu") {
      const { data: karte } = await admin.from("bingo_karten").select("id").eq("besitzer_id", auth.user.id).maybeSingle();
      if (karte) {
        await admin.from("bingo_felder").delete().eq("karte_id", karte.id);
        await admin.from("bingo_karten").update({ bingo_at: null }).eq("id", karte.id);
      } else {
        await admin.from("bingo_karten").insert({ besitzer_id: auth.user.id, organization_id: orgId });
      }
      return res.status(200).json({ karte: await karteLaden(admin, auth.user.id) });
    }

    return res.status(400).json({ error: "Unbekannte Aktion." });
  } catch (e) {
    console.error("Bingo fehlgeschlagen:", e.message);
    return res.status(500).json({ error: e.message || "Das hat nicht geklappt." });
  }
}
