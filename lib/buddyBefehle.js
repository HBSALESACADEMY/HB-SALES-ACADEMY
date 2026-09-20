import { sendePersoenlich } from "./telegramPersoenlich.js";
import { zahlenFuerTage } from "./zahlenLaden.js";
import { callAI } from "./aiClient.js";
import { impulsWochen, summiereTage, zahlenBlock } from "./wochenimpuls.js";
import { KENNZAHLEN, arbeitstagDavor, tagesName } from "./tagesauswertung.js";
import { berlinHeute } from "./woche.js";
import { istFuehrungsrolle } from "./rollen.js";
import { briefingFuerPerson } from "./buddyBriefing.js";
import { zielStand } from "./buddyZiele.js";
import { ladeEinwaende, passendeEinwaende, einwandZeilen, einwandAnweisung, einwandOhneKI } from "./buddyEinwand.js";
import {
  szenarioVon, waehleSzenario, startText, kundenAnweisung, rueckmeldungAnweisung, rueckmeldungOhneKI,
  alsNachrichten, alsProtokoll, istAbgelaufen, MAX_RUNDEN, ABLAUF_STUNDEN,
} from "./buddyRollenspiel.js";
import { findePerson, ladeVorbereitung, vorbereitungsZeilen, vorbereitungsAnweisung, vorbereitungsText } from "./buddyVorbereitung.js";
import { sendeTeamlage } from "./teamlageVersand.js";
import { starteNeuenTermin } from "./buddyNeuerTermin.js";

// Die Kurzbefehle des Vertriebsbuddys — und die Übungen, die daraus
// entstehen (Einwand-Hilfe, Rollenspiel, Gesprächsvorbereitung).
//
// Zahlen kommen wie überall aus der Academy. Die KI schreibt nur dort, wo
// es ums Formulieren geht, und jede Stelle hat eine Antwort ohne KI, falls
// Gemini gerade nicht antwortet.

export const BEFEHLE = [
  { befehl: "heute", kurz: "Deine Zahlen von heute" },
  { befehl: "woche", kurz: "Deine Woche im Vergleich zur Vorwoche" },
  { befehl: "ziel", kurz: "Stand deiner Team-Ziele" },
  { befehl: "termine", kurz: "Deine Termine heute und offene Ergebnisse" },
  { befehl: "neu", kurz: "Neuen Termin anlegen — ich frage alles ab" },
  { befehl: "einwand", kurz: "Hilfe bei einem Einwand, z. B. /einwand zu teuer" },
  { befehl: "rollenspiel", kurz: "Ich spiele den Kunden, du übst" },
  { befehl: "stopp", kurz: "Rollenspiel beenden, Rückmeldung holen" },
  { befehl: "gespraech", kurz: "Leitung: Einzelgespräch vorbereiten, z. B. /gespraech Anna" },
  { befehl: "team", kurz: "Leitung: die Teamlage jetzt" },
  { befehl: "hilfe", kurz: "Was ich alles kann" },
];

const ALIASE = { start: "hilfe", help: "hilfe", stop: "stopp", ende: "stopp", gespräch: "gespraech", ziele: "ziel", termin: "termine" };

/** "/heute@HBSalesAcademy_bot" → { befehl: "heute", rest: "" } — oder null. */
export function leseBefehl(text) {
  const treffer = String(text || "").trim().match(/^\/([a-zäöüß_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!treffer) return null;
  const roh = treffer[1].toLowerCase();
  return { befehl: ALIASE[roh] || roh, rest: String(treffer[2] || "").trim() };
}

export function hilfeText(istLeitung = false) {
  const liste = BEFEHLE.filter((b) => istLeitung || !b.kurz.startsWith("Leitung:"));
  return [
    "🤝 Das kann ich für dich tun:",
    "",
    ...liste.map((b) => `/${b.befehl} — ${b.kurz.replace(/^Leitung: /, "")}`),
    "",
    "Du kannst mir auch einfach schreiben — zum Beispiel „Kunde sagt, er hat schon eine Agentur“" +
      (istLeitung ? " oder „Bereite mein Gespräch mit Anna vor“." : "."),
  ].join("\n");
}

async function kiSatz(anweisung, nachrichten, maxTokens = 400) {
  try {
    return String(await callAI(anweisung, nachrichten, maxTokens) || "").trim();
  } catch (e) {
    console.error("Vertriebsbuddy: KI nicht erreichbar:", e.message);
    return "";
  }
}

export function heuteText({ heute, vorher, vergleichsTag }) {
  const zeilen = KENNZAHLEN.filter((k) => heute[k.key] > 0 || vorher[k.key] > 0)
    .map((k) => `${k.label}: ${heute[k.key]} (${tagesName(vergleichsTag)}: ${vorher[k.key]})`);
  if (!KENNZAHLEN.some((k) => heute[k.key] > 0)) {
    return ["📊 Heute ist noch nichts eingetragen.", ...(zeilen.length ? ["", `Zum Vergleich ${tagesName(vergleichsTag)}:`, ...zeilen] : []),
      "", "Der erste Anruf ist der schwerste — danach läuft's."].join("\n");
  }
  return ["📊 Heute bisher:", "", ...zeilen].join("\n");
}

// ---------------------------------------------------------------------------
// Rollenspiel

async function setzeModus(admin, userId, modus, daten = null) {
  const { error } = await admin.from("telegram_verknuepfungen").update({
    modus, modus_daten: daten, modus_seit: modus ? new Date().toISOString() : null,
  }).eq("user_id", userId);
  if (error) console.error("Vertriebsbuddy: Modus nicht gespeichert:", error.message);
  return !error;
}

export async function starteRollenspiel(admin, v, text = "") {
  const szenario = waehleSzenario(text, v.modus_daten?.zuletzt || null);
  const ok = await setzeModus(admin, v.user_id, "rollenspiel", {
    szenario: szenario.key, runden: 0, verlauf: [{ von: "kunde", text: szenario.start }],
  });
  if (!ok) {
    return sendePersoenlich(admin, v, "Das Rollenspiel kann ich gerade nicht starten — in der Datenbank fehlt noch eine Änderung (migration_175).");
  }
  return sendePersoenlich(admin, v, startText(szenario));
}

async function beendeRollenspiel(admin, v) {
  const daten = v.modus_daten || {};
  const szenario = szenarioVon(daten.szenario);
  // Zuerst den Modus lösen: Egal was danach schiefgeht, der Chat darf nicht
  // im Rollenspiel hängen bleiben.
  await setzeModus(admin, v.user_id, null, { zuletzt: daten.szenario || null });
  if (!szenario) return sendePersoenlich(admin, v, "Das Rollenspiel ist beendet.");
  const eigene = (daten.verlauf || []).filter((z) => z.von === "vertrieb");
  if (!eigene.length) {
    return sendePersoenlich(admin, v, `Rollenspiel „${szenario.titel}“ beendet. Mit /rollenspiel geht's jederzeit weiter.`);
  }
  const rueckmeldung = await kiSatz(rueckmeldungAnweisung(szenario),
    [{ role: "user", content: `Das Gespräch:\n\n${alsProtokoll(daten.verlauf)}` }], 500);
  return sendePersoenlich(admin, v, rueckmeldung
    ? `🎭 Rollenspiel „${szenario.titel}“ — meine Rückmeldung:\n\n${rueckmeldung}\n\nNoch eine Runde? /rollenspiel`
    : rueckmeldungOhneKI(szenario));
}

/** Eine Antwort des Vertrieblers im laufenden Rollenspiel. */
export async function rollenspielZug(admin, v, text) {
  const daten = v.modus_daten || {};
  const szenario = szenarioVon(daten.szenario);
  if (!szenario) { await setzeModus(admin, v.user_id, null); return false; }

  const verlauf = [...(daten.verlauf || []), { von: "vertrieb", text: String(text).slice(0, 1200) }];
  const runden = (daten.runden || 0) + 1;
  if (runden >= MAX_RUNDEN) {
    return beendeRollenspiel(admin, { ...v, modus_daten: { ...daten, verlauf } });
  }
  const antwort = await kiSatz(kundenAnweisung(szenario), alsNachrichten(verlauf), 200);
  if (!antwort) {
    await setzeModus(admin, v.user_id, null);
    return sendePersoenlich(admin, v, "Ich komme gerade nicht an meine Antworten heran — das Rollenspiel ist unterbrochen. Versuch es später mit /rollenspiel.");
  }
  verlauf.push({ von: "kunde", text: antwort });
  await setzeModus(admin, v.user_id, "rollenspiel", { ...daten, runden, verlauf });
  return sendePersoenlich(admin, v, `☎️ ${antwort}`);
}

/**
 * Liegen gebliebene Rollenspiele wegräumen — im Morgenlauf.
 *
 * Wer mitten im Rollenspiel aufhört und nie wieder schreibt, hätte seinen
 * Wortwechsel sonst dauerhaft in der Datenbank stehen. Versprochen ist,
 * dass er nur so lange bleibt, wie das Rollenspiel läuft.
 */
export async function raeumeRollenspieleAuf(admin, jetzt = new Date()) {
  const grenze = new Date(jetzt.getTime() - ABLAUF_STUNDEN * 3600000).toISOString();
  const { error } = await admin.from("telegram_verknuepfungen")
    .update({ modus: null, modus_daten: null, modus_seit: null })
    // Auch offene Eintrags-Vorschläge (lib/buddyEintrag.js): Sie gelten
    // eine Stunde und enthalten Kundennamen.
    .in("modus", ["rollenspiel", "eintrag", "neuerTermin"]).lt("modus_seit", grenze);
  if (error) console.error("Vertriebsbuddy: Rollenspiele nicht aufgeräumt:", error.message);
  return !error;
}

/** Läuft gerade ein Rollenspiel, das noch nicht abgelaufen ist? */
export function imRollenspiel(v, jetzt = new Date()) {
  return v?.modus === "rollenspiel" && !istAbgelaufen(v.modus_seit, jetzt);
}

// ---------------------------------------------------------------------------
// Einwand-Hilfe und Gesprächsvorbereitung

export async function einwandHilfe(admin, v, profil, text) {
  if (!text) {
    return sendePersoenlich(admin, v, "Schreib mir den Einwand dazu, zum Beispiel:\n/einwand Der Kunde sagt, er hat schon eine Agentur.");
  }
  const treffer = passendeEinwaende(await ladeEinwaende(admin, profil?.organization_id), text, 3);
  const ki = treffer.length
    ? await kiSatz(einwandAnweisung({ name: profil?.full_name, organisation: profil?.organisation }),
      [{ role: "user", content: `Situation: ${text}\n\nAus dem Leitfaden:\n\n${einwandZeilen(treffer).join("\n\n")}` }], 400)
    : "";
  return sendePersoenlich(admin, v, ki || einwandOhneKI(treffer));
}

/**
 * @param still  aus einer frei geschriebenen Nachricht: Findet sich niemand,
 *               kommt keine Fehlermeldung, sondern false — dann war es wohl
 *               keine Bitte um Vorbereitung, und der Buddy antwortet normal.
 */
export async function gespraechVorbereiten(admin, v, profil, suche, { still = false } = {}) {
  if (!istFuehrungsrolle(profil)) {
    return sendePersoenlich(admin, v, "Die Gesprächsvorbereitung ist für die Vertriebsleitung gedacht.");
  }
  if (!suche) return sendePersoenlich(admin, v, "Mit wem? Zum Beispiel: /gespraech Anna");
  const { data: mitglieder } = await admin.from("profiles")
    .select("id, full_name").eq("organization_id", profil.organization_id).eq("status", "approved");
  const fund = findePerson(mitglieder || [], suche);
  if (!fund && still) return false;
  if (!fund) return sendePersoenlich(admin, v, `„${suche}“ finde ich in deiner Organisation nicht.`);
  if (fund.mehrdeutig) {
    return sendePersoenlich(admin, v, `Da passen mehrere: ${fund.mehrdeutig.join(", ")}. Schreib den vollen Namen, zum Beispiel /gespraech ${fund.mehrdeutig[0]}`);
  }
  const daten = await ladeVorbereitung(admin, fund.person);
  const ki = await kiSatz(vorbereitungsAnweisung({ leitung: profil.full_name }),
    [{ role: "user", content: `Person: ${daten.name}\n\n${vorbereitungsZeilen(daten).join("\n")}` }], 500);
  return sendePersoenlich(admin, v, vorbereitungsText(daten, ki));
}

// ---------------------------------------------------------------------------
// Der Verteiler

/**
 * Einen Befehl ausführen.
 *
 * @param v       die Verknüpfung (user_id, chat_id, modus, modus_daten, modus_seit)
 * @param profil  Profil samt Organisationsname
 */
export async function fuehreBefehlAus(admin, v, profil, { befehl, rest }) {
  const istLeitung = istFuehrungsrolle(profil);

  // Ein neuer Befehl mitten im Rollenspiel beendet es — ausser /stopp,
  // das genau dafür da ist.
  if (imRollenspiel(v) && befehl !== "stopp") await setzeModus(admin, v.user_id, null);

  switch (befehl) {
    case "hilfe":
      return sendePersoenlich(admin, v, hilfeText(istLeitung));

    case "heute": {
      const heute = berlinHeute();
      const vergleichsTag = arbeitstagDavor(heute);
      const proTag = await zahlenFuerTage(admin, [heute, vergleichsTag]);
      return sendePersoenlich(admin, v, heuteText({
        heute: summiereTage(proTag, [heute], v.user_id),
        vorher: summiereTage(proTag, [vergleichsTag], v.user_id),
        vergleichsTag,
      }));
    }

    case "woche": {
      const { diese, vorher } = impulsWochen();
      const proTag = await zahlenFuerTage(admin, [...diese, ...vorher]);
      const zeilen = zahlenBlock(summiereTage(proTag, diese, v.user_id), summiereTage(proTag, vorher, v.user_id));
      return sendePersoenlich(admin, v, zeilen.length
        ? ["📈 Deine Woche bis jetzt:", "", ...zeilen].join("\n")
        : "📈 In dieser und der letzten Woche ist noch nichts eingetragen.");
    }

    case "ziel": {
      const stand = await zielStand(admin, v.user_id);
      if (stand.ohneTeam) return sendePersoenlich(admin, v, "Du bist noch in keinem Team — deshalb gibt es keine Team-Ziele. Die Leitung legt Teams unter „Mein Team“ an.");
      return sendePersoenlich(admin, v, stand.zeilen.length
        ? ["Deine laufenden Ziele:", "", stand.zeilen.join("\n\n")].join("\n")
        : "Gerade läuft kein Ziel für dein Team.");
    }

    case "termine": {
      const ergebnis = await briefingFuerPerson(admin, v, { name: profil?.full_name });
      if (!ergebnis.termine && !ergebnis.fragen) {
        return sendePersoenlich(admin, v, "Heute stehen keine Termine an, und bei den letzten fehlt kein Ergebnis. 👍");
      }
      return null;
    }

    case "neu":
      return starteNeuenTermin(admin, v, profil);

    case "einwand":
      return einwandHilfe(admin, v, profil, rest);

    case "rollenspiel":
      return starteRollenspiel(admin, v, rest);

    case "stopp":
      if (!imRollenspiel(v)) return sendePersoenlich(admin, v, "Gerade läuft kein Rollenspiel. Starten kannst du eins mit /rollenspiel.");
      return beendeRollenspiel(admin, v);

    case "gespraech":
      return gespraechVorbereiten(admin, v, profil, rest);

    case "team": {
      if (!istLeitung) return sendePersoenlich(admin, v, "Die Teamlage bekommt die Vertriebsleitung.");
      const lage = await sendeTeamlage(admin, { nurFuer: v.user_id, erzwingen: true });
      if (!lage.gesendet) {
        return sendePersoenlich(admin, v, lage.grund
          || "Die Teamlage ging nicht raus. Ist sie unter Einstellungen → Telegram eingeschaltet, und gibt es diese Woche schon Zahlen?");
      }
      return null;
    }

    default:
      return sendePersoenlich(admin, v, `Den Befehl /${befehl} kenne ich nicht.\n\n${hilfeText(istLeitung)}`);
  }
}
