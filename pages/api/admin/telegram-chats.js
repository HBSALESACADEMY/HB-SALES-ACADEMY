import { requireUser } from "../../../lib/supabaseServer";
import { getAdminSupabase } from "../../../lib/supabaseAdmin";
import { istFuehrungsrolle } from "../../../lib/rollen";
import { aktiveOrgId } from "../../../lib/aktiveOrgServer";
import { gruppenCode, codePasst } from "../../../lib/gruppenCode";

// Welche Telegram-Gruppen der Bot kennt — samt ihrer Kennung.
//
// Der Grund für diese Route: Ohne sie lautet die Anleitung "ruf
// api.telegram.org/bot SCHLÜSSEL /getUpdates im Browser auf". Das heisst,
// den Bot-Schlüssel in eine Adresszeile zu tippen, wo er im Verlauf stehen
// bleibt. Für eine Kennung, die man einmal braucht, ist das ein
// schlechter Tausch.
//
// Der Schlüssel bleibt deshalb auf dem Server. Heraus kommen nur Name, Art
// und Kennung der Chats — niemals der Schlüssel selbst.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const admin = getAdminSupabase();
  const { data: profil } = await admin.from("profiles")
    .select("role, is_admin, is_platform_admin, organization_id").eq("id", auth.user.id).maybeSingle();
  if (!istFuehrungsrolle(profil)) {
    return res.status(403).json({ error: "Diese Suche ist der Leitung vorbehalten." });
  }

  // Für WELCHE Organisation gesucht wird. Normalerweise die eigene aktive;
  // ein Plattform-Admin darf auch eine andere angeben, weil er fremde
  // Organisationen verwaltet. Jede andere Angabe wird abgelehnt — sonst
  // liesse sich der Nachweis über die Adresszeile umgehen.
  const eigene = await aktiveOrgId(admin, profil, auth.user.id);
  const gewuenscht = typeof req.query.orgId === "string" ? req.query.orgId : null;
  const orgId = gewuenscht && gewuenscht !== eigene
    ? (profil?.is_platform_admin ? gewuenscht : null)
    : eigene;
  if (!orgId) return res.status(403).json({ error: "Für diese Organisation darfst du nicht suchen." });

  const code = gruppenCode(orgId);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(503).json({ error: "Für diese Academy ist kein Telegram-Bot eingerichtet (TELEGRAM_BOT_TOKEN fehlt)." });

  try {
    // my_chat_member ist der wichtigste Typ: er kommt, sobald der Bot einer
    // Gruppe HINZUGEFÜGT wird. Ohne ihn müsste erst jemand in der Gruppe
    // schreiben — und bei eingeschaltetem Datenschutz sieht der Bot davon
    // nur Nachrichten, die ihn erwähnen.
    const antwort = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates`
      + `?limit=100&allowed_updates=${encodeURIComponent(JSON.stringify(["message", "my_chat_member", "channel_post"]))}`,
    );
    const daten = await antwort.json();
    if (!daten?.ok) {
      return res.status(502).json({ error: daten?.description || "Telegram hat die Anfrage abgelehnt." });
    }

    // Zusätzlich: Wie heissen die Gruppen, die schon eingetragen SIND?
    //
    // In den Feldern steht eine nackte Nummer wie "-1001234567890". Welche
    // Gruppe das ist, weiss niemand — und eine Kennung im falschen Feld
    // merkt man erst, wenn die Nachricht in der falschen Gruppe steht.
    const namen = {};
    const gefragt = String(req.query.ids || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
    await Promise.all(gefragt.map(async (id) => {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(id)}`);
        const d = await r.json();
        namen[id] = d?.ok
          ? (d.result?.title || [d.result?.first_name, d.result?.last_name].filter(Boolean).join(" ") || d.result?.username || "Ohne Namen")
          : (d?.description || "Nicht erreichbar");
      } catch (e) {
        namen[id] = "Nicht erreichbar";
      }
    }));

    // Gelistet wird NUR, wo der Code dieser Organisation geschrieben
    // wurde.
    //
    // Ein Bot bedient alle Organisationen dieser Academy, und getUpdates
    // gibt alles heraus, was er zuletzt gesehen hat — auch die Gruppen
    // anderer Kunden. Ohne Nachweis sähe die Leitung von Firma A die
    // Gruppennamen und Kennungen von Firma B und könnte eine fremde
    // Kennung in ihr eigenes Feld eintragen. Dann gingen die Meldungen von
    // A in die Gruppe von B.
    //
    // Wer den Code in der Gruppe schreiben kann, ist in der Gruppe. Mehr
    // muss der Nachweis nicht leisten. Das Zeitfenster kommt dazu, damit
    // ein einmal geschriebener Code nicht für immer gilt.
    const FENSTER_SEKUNDEN = 30 * 60;
    const jetzt = Math.floor(Date.now() / 1000);

    const chats = new Map();
    (daten.result || []).forEach((u) => {
      const kern = u.message || u.channel_post;
      const chat = kern?.chat;
      if (!chat?.id) return;
      if (!kern.date || jetzt - kern.date > FENSTER_SEKUNDEN) return;
      // Der Code muss im Text stehen — auch in der Bildunterschrift, falls
      // jemand ihn zu einem Bild schreibt.
      if (!codePasst(`${kern.text || ""} ${kern.caption || ""}`, code)) return;
      chats.set(String(chat.id), {
        id: String(chat.id),
        titel: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "Ohne Namen",
        art: chat.type,
      });
    });

    return res.status(200).json({ chats: [...chats.values()], namen, code });
  } catch (e) {
    console.error("Telegram-Chats konnten nicht geladen werden:", e.message);
    return res.status(500).json({ error: e.message || "Die Suche ist fehlgeschlagen." });
  }
}
