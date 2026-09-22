import { sendePersoenlich } from "./telegramPersoenlich.js";
import { istFuehrungsrolle } from "./rollen.js";
import { resolveObjectionCategories } from "./objectionCategories.js";
import { istNeuerGrund, meldungText, TAGES_GRENZE } from "./einwandMeldung.js";

// Der Versand der Einwand-Meldung. Das Prüfen und der Text stehen in
// lib/einwandMeldung.js.
//
// Bleibt die Meldung aus, ist nichts verloren: Der Vorschlag steht
// weiterhin in Verwaltung → Einwände. Die Meldung ist der schnellere Weg
// dorthin, nicht der einzige.

// Fehlt migration_178, kennt die Datenbank die Spalte "einwaende" noch
// nicht. Dann soll die Meldung trotzdem rausgehen — nur eben ohne die
// Möglichkeit, sie einzeln abzuschalten.
const SPALTE_FEHLT = /einwaende/;

async function leitungMitTelegram(admin, orgId) {
  const { data: mitglieder } = await admin.from("profiles")
    .select("id, full_name, role, is_admin, is_platform_admin")
    .eq("organization_id", orgId).eq("status", "approved");
  const leitung = (mitglieder || []).filter((m) => istFuehrungsrolle(m));
  if (!leitung.length) return { empfaenger: [], hinweis: null };

  const ids = leitung.map((m) => m.id);
  const mitSpalte = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id, einwaende").in("user_id", ids).not("chat_id", "is", null);
  if (!mitSpalte.error) {
    return { empfaenger: (mitSpalte.data || []).filter((v) => v.einwaende !== false), hinweis: null };
  }
  if (!SPALTE_FEHLT.test(mitSpalte.error.message || "")) return { empfaenger: [], hinweis: mitSpalte.error.message };

  const ohneSpalte = await admin.from("telegram_verknuepfungen")
    .select("user_id, chat_id").in("user_id", ids).not("chat_id", "is", null);
  if (ohneSpalte.error) return { empfaenger: [], hinweis: ohneSpalte.error.message };
  return {
    empfaenger: ohneSpalte.data || [],
    hinweis: "In der Datenbank fehlt noch eine Änderung (migration_178) — bis dahin lässt sich diese Meldung nicht einzeln abschalten.",
  };
}

/**
 * Einen neu eingetippten Grund melden.
 *
 * @returns { gesendet, neu, grund }. "neu: false" heisst: Der Wortlaut war
 *          schon da, und das ist keine Panne, sondern der Normalfall.
 */
export async function meldeNeuenGrund(admin, { orgId = null, userId = null, text = "" } = {}) {
  if (!orgId || !userId) return { gesendet: 0, neu: false, grund: "Keine Organisation gefunden." };

  const { data: vorschlaege, error } = await admin.from("grund_vorschlaege")
    .select("id, text, user_id, created_at, status").eq("organization_id", orgId).limit(2000);
  if (error) return { gesendet: 0, neu: false, grund: error.message };

  const { data: org } = await admin.from("organizations")
    .select("objection_categories").eq("id", orgId).maybeSingle();
  if (!istNeuerGrund(text, vorschlaege || [], resolveObjectionCategories(org))) {
    return { gesendet: 0, neu: false };
  }

  // Der Schutz gegen eine Meldungslawine: Er zählt die Vorschläge DIESER
  // Person von heute, nicht die des ganzen Teams — sonst bremst ein
  // einzelner Ausprobierer die Meldungen für alle anderen aus.
  const heute = new Date().toISOString().slice(0, 10);
  const heuteVonIhr = (vorschlaege || []).filter((v) => v.user_id === userId && String(v.created_at || "").startsWith(heute));
  if (heuteVonIhr.length > TAGES_GRENZE) {
    return { gesendet: 0, neu: true, grund: `Mehr als ${TAGES_GRENZE} eigene Gründe heute von dieser Person — nicht gemeldet.` };
  }

  const { data: person } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { empfaenger, hinweis } = await leitungMitTelegram(admin, orgId);
  if (!empfaenger.length) return { gesendet: 0, neu: true, grund: hinweis };

  // "Offen" heisst: wartet noch auf eine Entscheidung. Übernommene und
  // abgelehnte sind erledigt und gehören nicht in die Zahl.
  const offen = (vorschlaege || []).filter((v) => (v.status || "offen") === "offen").length;
  const nachricht = meldungText({
    text,
    von: person?.full_name || "",
    offen,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  });
  if (!nachricht) return { gesendet: 0, neu: false };

  let gesendet = 0;
  for (const v of empfaenger) {
    // Wer den Grund selbst eingetippt hat, braucht die Meldung darüber
    // nicht — auch die Leitung telefoniert.
    if (v.user_id === userId) continue;
    const versand = await sendePersoenlich(admin, v, nachricht);
    if (versand?.ok) gesendet += 1;
  }
  return { gesendet, neu: true, grund: hinweis };
}
