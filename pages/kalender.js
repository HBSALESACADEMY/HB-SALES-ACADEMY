import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import SeitenReiter from "../components/SeitenReiter";
import Avatar from "../components/Avatar";
import PersonenAuswahl from "../components/PersonenAuswahl";
import LogoHintergrund from "../components/LogoHintergrund";
import { supabase } from "../lib/supabaseClient";
import { apiGet, apiPost, apiPatch, apiDelete } from "../lib/apiClient";
import { getActiveOrgId } from "../lib/activeOrg";
import { openProfile } from "../lib/profileModalBus";
import { monatsRaster, istGleicherTag, startOfWeek, endOfWeek, tagesSchluessel } from "../lib/dateRange";
import { aendereGeprueft, loescheGeprueft } from "../lib/loeschen";
import { nurUhrzeit, deutscherTag, DEUTSCHE_ZONE } from "../lib/terminzeit";
import { terminAnzeige } from "../lib/zeit";
import { kalenderTitel, terminFarbe, artVon, kuerzelVon, TERMIN_ARTEN, rueckeVor } from "../lib/terminArt";
import { ladeIcsHerunter } from "../lib/ics";
import { zeitpunktInBerlin } from "../lib/woche";

// Firmenkalender: was die ganze Organisation angeht — Schulungen, Messen,
// Feiertage, Betriebsausflug. Dazu Geburtstage und Abwesenheiten, die sich
// aus den Profilen ergeben und niemand eigens eintragen muss.
//
// Die Vertriebstermine stehen mit drin, aber jede Person sieht nur die,
// die sie ohnehin sehen darf: sie kommen über den RLS-gebundenen Client
// (siehe pages/api/org-kalender.js), nicht über den Admin-Zugang.
const ARTEN = [
  { key: "meeting", label: "Besprechung", symbol: "🗓️" },
  { key: "schulung", label: "Schulung", symbol: "🎓" },
  { key: "messe", label: "Messe", symbol: "🏢" },
  { key: "feiertag", label: "Feiertag", symbol: "🎉" },
  { key: "urlaub", label: "Urlaub", symbol: "🌴" },
  { key: "sonstiges", label: "Sonstiges", symbol: "📌" },
];
const symbolFuer = (art) => ARTEN.find((a) => a.key === art)?.symbol || "📌";

const ANSICHTEN = [["tag", "Tag"], ["woche", "Woche"], ["monat", "Monat"]];
const STATUS_SYMBOL = { zugesagt: "✅", abgesagt: "❌", offen: "⏳" };

// Deutsche Uhrzeit ist massgeblich (siehe lib/terminzeit.js).
const uhrzeitDeutsch = (iso) => nurUhrzeit(iso, DEUTSCHE_ZONE);

export default function Kalender() {
  const [daten, setDaten] = useState(null);
  const [ansicht, setAnsicht] = useState("monat");
  const [anker, setAnker] = useState(() => new Date());
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  // Das Kalender-Abo: Link in den eigenen Kalender eintragen (migration_131).
  const [aboOffen, setAboOffen] = useState(false);
  const [abo, setAbo] = useState(null);
  const [aboBusy, setAboBusy] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  // Eigene Kalender, die in die Academy gespiegelt werden (migration_134).
  const [quellen, setQuellen] = useState(null);
  const [quelleEntwurf, setQuelleEntwurf] = useState({ name: "", url: "", sichtbarkeit: "belegt" });
  const [quelleBusy, setQuelleBusy] = useState(false);
  const [formularOffen, setFormularOffen] = useState(false);
  const [entwurf, setEntwurf] = useState({ titel: "", art: "meeting", von: "", bis: "", uhrzeit: "", beschreibung: "" });
  const [busy, setBusy] = useState(false);
  const [gewaehlterTag, setGewaehlterTag] = useState(null);
  // Einladen: welcher Termin gerade offen ist, als "quelle:id".
  const [einladenFuer, setEinladenFuer] = useState(null);
  // Wer beim Anlegen gleich mit eingeladen wird.
  const [neueGaeste, setNeueGaeste] = useState([]);
  // Nachträglich bearbeiten: ein Tippfehler im Titel oder eine verschobene
  // Uhrzeit soll den Eintrag nicht kosten.
  const [bearbeitenId, setBearbeitenId] = useState(null);
  const [bearbeitenEntwurf, setBearbeitenEntwurf] = useState(null);

  const heute = tagesSchluessel();
  // Wer den Termin angelegt hat. Bei einem Folgetermin oder Closing Call
  // ist das die Person, die den ERSTEN Termin gelegt hat — der neue erbt
  // sie beim Anlegen. Führt jemand anderes das Gespräch, bleibt es trotzdem
  // ihr Interessent, und genau das soll im Kalender stehen.
  const nameVon = (id) => (daten?.personen || []).find((p) => p.id === id)?.name || "";
  // Einen Termin direkt hier bearbeiten: Zeitpunkt ändern oder ihn auf die
  // nächste Stufe rücken. Vorher musste man dafür die Seite wechseln, den
  // Termin in der Liste suchen und den Kalender wieder aufmachen.
  const [terminBearbeiten, setTerminBearbeiten] = useState(null);
  const [terminEntwurf, setTerminEntwurf] = useState({ zeitpunkt: "", art: "" });
  const [terminBusy, setTerminBusy] = useState(false);
  // Suche über den ganzen Zeitraum: Wer einen bestimmten Kunden sucht,
  // blättert sonst Monat für Monat durch — und findet ihn erst, wenn er den
  // Tag zufällig trifft.
  const [suche, setSuche] = useState("");

  async function speichereTermin(t) {
    if (!terminEntwurf.zeitpunkt) return;
    setTerminBusy(true);
    setFehler("");
    const neuerZeitpunkt = new Date(terminEntwurf.zeitpunkt).toISOString();

    // Eine neue Stufe heisst weiterrücken — mit Eintrag im Verlauf. Bleibt
    // die Stufe gleich, ist es schlicht eine Verschiebung.
    //
    // Ausnahme: Ein Termin OHNE Stufe rückt nicht weiter, er bekommt seine
    // erste. Ihn weiterrücken zu lassen schriebe eine abgeschlossene Stufe
    // in den Verlauf, die es nie gab — und in der Auswertung stünde ein
    // Gespräch, das nicht stattgefunden hat.
    const bisher = artVon(t).key;
    const wechselt = terminEntwurf.art && terminEntwurf.art !== bisher;
    const { data: { session } } = await supabase.auth.getSession();
    const patch = !wechselt
      ? { appointment_at: neuerZeitpunkt }
      : bisher === "unbestimmt"
        ? { termin_art: terminEntwurf.art, appointment_at: neuerZeitpunkt }
        : rueckeVor(t, terminEntwurf.art, neuerZeitpunkt, session?.user?.id || null);

    const err = await aendereGeprueft(
      supabase.from("leads").update(patch).eq("id", t.id),
      "Diesen Termin darf nur ändern, wer ihn angelegt hat, oder ein Manager.");
    if (err) setFehler(err);
    else {
      setTerminBearbeiten(null);
      await laden();
    }
    setTerminBusy(false);
  }

  // Der geladene Zeitraum hängt an der Ansicht — die Wochenansicht reicht
  // über den Monatswechsel hinaus.
  const zeitraum = (() => {
    if (ansicht === "tag") return { von: tagesSchluessel(anker), bis: tagesSchluessel(anker) };
    if (ansicht === "woche") return { von: tagesSchluessel(startOfWeek(anker)), bis: tagesSchluessel(endOfWeek(anker)) };
    const erster = new Date(anker.getFullYear(), anker.getMonth(), 1);
    const letzter = new Date(anker.getFullYear(), anker.getMonth() + 1, 0);
    return { von: tagesSchluessel(erster), bis: tagesSchluessel(letzter) };
  })();

  // still: ohne Ladeanzeige. Nach einer eigenen Änderung soll die Seite
  // nicht kurz leer werden — man arbeitet gerade weiter.
  async function laden(still) {
    if (!still) setLaedt(true);
    try {
      setDaten(await apiGet(`/api/org-kalender?von=${zeitraum.von}&bis=${zeitraum.bis}`));
      setFehler("");
    } catch (e) {
      setFehler(e.message || "Der Kalender konnte nicht geladen werden.");
    }
    if (!still) setLaedt(false);
  }

  // Beim Blättern bleibt das Bisherige stehen, bis das Neue da ist —
  // eine leere Seite zwischendrin reisst aus dem Arbeiten heraus.
  useEffect(() => { laden(!!daten); }, [zeitraum.von, zeitraum.bis]);

  async function speichern() {
    if (!entwurf.titel.trim() || !entwurf.von) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: profil } = await supabase.from("profiles")
        .select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const orgId = getActiveOrgId(profil);
      const { data: angelegt, error } = await supabase.from("org_events").insert({
        organization_id: orgId,
        created_by: session.user.id,
        titel: entwurf.titel.trim(),
        beschreibung: entwurf.beschreibung.trim() || null,
        von: entwurf.von,
        bis: entwurf.bis || null,
        uhrzeit: entwurf.uhrzeit || null,
        art: entwurf.art,
      }).select().single();
      if (error) throw error;
      // Einladungen gleich mit — sonst müsste man den Eintrag erst suchen,
      // um die Leute nachträglich einzuladen.
      if (neueGaeste.length) {
        const { error: einladungsFehler } = await supabase.from("termin_einladungen").insert(
          neueGaeste.map((personId) => ({
            quelle: "org_event", ziel_id: angelegt.id, person_id: personId,
            eingeladen_von: session.user.id, organization_id: orgId,
          }))
        );
        if (einladungsFehler) throw einladungsFehler;
      }
      setFormularOffen(false);
      setNeueGaeste([]);
      setEntwurf({ titel: "", art: "meeting", von: "", bis: "", uhrzeit: "", beschreibung: "" });
      await laden(true);
    } catch (e) {
      setFehler(e.message || "Der Eintrag konnte nicht gespeichert werden.");
    }
    setBusy(false);
  }

  function bearbeitenStarten(e) {
    setBearbeitenId(e.id);
    setBearbeitenEntwurf({
      titel: e.titel || "", art: e.art || "meeting", von: e.von || "",
      bis: e.bis || "", uhrzeit: e.uhrzeit || "", beschreibung: e.beschreibung || "",
    });
  }

  async function bearbeitenSpeichern() {
    if (!bearbeitenEntwurf?.titel.trim() || !bearbeitenEntwurf.von) return;
    setBusy(true);
    const meldung = await aendereGeprueft(
      supabase.from("org_events").update({
        titel: bearbeitenEntwurf.titel.trim(),
        beschreibung: bearbeitenEntwurf.beschreibung.trim() || null,
        von: bearbeitenEntwurf.von,
        bis: bearbeitenEntwurf.bis || null,
        uhrzeit: bearbeitenEntwurf.uhrzeit || null,
        art: bearbeitenEntwurf.art,
      }).eq("id", bearbeitenId),
      "Ändern darf den Eintrag, wer ihn angelegt hat, oder eine Führungsrolle."
    );
    if (meldung) { setFehler(meldung); setBusy(false); return; }
    setBearbeitenId(null);
    setBearbeitenEntwurf(null);
    await laden(true);
    setBusy(false);
  }

  async function loeschen(id, titel) {
    if (!confirm(`„${titel}“ wirklich entfernen?`)) return;
    const meldung = await loescheGeprueft(
      supabase.from("org_events").delete().eq("id", id),
      "Das Entfernen wurde abgelehnt — eigene Einträge darf jede Person löschen, fremde nur eine Führungsrolle."
    );
    if (meldung) { setFehler(meldung); return; }
    await laden(true);
  }

  // --- Einladungen ---------------------------------------------------------

  async function einladen(quelle, zielId, personIds) {
    const liste = Array.isArray(personIds) ? personIds : [personIds];
    if (!liste.length) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: profil } = await supabase.from("profiles")
        .select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const orgId = getActiveOrgId(profil);
      const { error } = await supabase.from("termin_einladungen").insert(
        liste.map((personId) => ({
          quelle, ziel_id: zielId, person_id: personId,
          eingeladen_von: session.user.id, organization_id: orgId,
        }))
      );
      if (error) throw error;
      // Sofort anzeigen, statt auf die Antwort des Servers zu warten — das
      // Nachladen bestätigt es nur noch.
      const neu = liste.map((personId) => ({
        id: `neu-${zielId}-${personId}`, quelle, ziel_id: zielId, person_id: personId,
        eingeladen_von: session.user.id, status: "offen",
        name: (daten?.personen || []).find((p) => p.id === personId)?.name || "Unbenannt",
      }));
      setDaten((d) => (d ? { ...d, einladungen: [...(d.einladungen || []), ...neu] } : d));
      setEinladenFuer(null);
      await laden(true);
    } catch (e) {
      setFehler(e.message || "Die Einladung konnte nicht verschickt werden.");
    }
    setBusy(false);
  }

  async function antworten(einladungId, status) {
    setBusy(true);
    setDaten((d) => (d ? {
      ...d,
      offeneEinladungen: (d.offeneEinladungen || []).filter((e) => e.id !== einladungId),
      einladungen: (d.einladungen || []).map((e) => (e.id === einladungId ? { ...e, status } : e)),
    } : d));
    const meldung = await aendereGeprueft(
      supabase.from("termin_einladungen").update({ status, beantwortet_am: new Date().toISOString() }).eq("id", einladungId),
      "Nur die eingeladene Person selbst kann zu- oder absagen."
    );
    if (meldung) setFehler(meldung);
    await laden(true);
    setBusy(false);
  }

  // Ein Nachfassen abhaken. Es bleibt im Kalender stehen, nur blass und
  // durchgestrichen: dass es erledigt IST, ist die Information — löscht man
  // es, sieht der Tag aus, als wäre nie etwas gewesen.
  async function nachfassErledigt(n) {
    setBusy(true);
    const meldung = await aendereGeprueft(
      supabase.from("nachfass_termine").update({ erledigt_am: new Date().toISOString() }).eq("id", n.id),
      "Abhaken darf nur, wer zuständig ist oder es eingetragen hat."
    );
    if (meldung) setFehler(meldung);
    await laden(true);
    setBusy(false);
  }

  // Verschieben: um einen Tag weiter, gleiche Uhrzeit. Bewusst ein Klick
  // und kein Formular — ein Rückruf rutscht meistens um einen Tag, und wer
  // dafür ein Datumsfeld ausfüllen muss, hakt ihn stattdessen ab.
  async function nachfassVerschieben(n) {
    setBusy(true);
    const neu = new Date(new Date(n.faellig_am).getTime() + 86400000).toISOString();
    const meldung = await aendereGeprueft(
      supabase.from("nachfass_termine")
        // Neu melden: nach dem Verschieben ist die alte Meldung
        // gegenstandslos, und die neue soll am neuen Tag kommen.
        .update({ faellig_am: neu, erinnert_am: null }).eq("id", n.id),
      "Verschieben darf nur, wer zuständig ist oder es eingetragen hat."
    );
    if (meldung) setFehler(meldung);
    await laden(true);
    setBusy(false);
  }

  async function nachfassLoeschen(n) {
    setBusy(true);
    const meldung = await loescheGeprueft(
      supabase.from("nachfass_termine").delete().eq("id", n.id),
      "Löschen darf nur, wer zuständig ist oder es eingetragen hat."
    );
    if (meldung) setFehler(meldung);
    await laden(true);
    setBusy(false);
  }

  async function einladungZuruecknehmen(einladungId) {
    const meldung = await loescheGeprueft(
      supabase.from("termin_einladungen").delete().eq("id", einladungId),
      "Zurücknehmen darf nur, wer eingeladen hat."
    );
    if (meldung) { setFehler(meldung); return; }
    await laden(true);
  }

  // Habe ICH zu diesem Termin zu- oder abgesagt? Steht in denselben Daten,
  // war aber bisher nur an der Einladungsliste im Tagesdetail zu sehen.
  function meinStatus(quelle, zielId) {
    const e = (daten?.einladungen || []).find(
      (x) => x.quelle === quelle && x.ziel_id === zielId && x.person_id === daten?.selbst
    );
    return e?.status || null;
  }

  function einladungenZu(quelle, zielId) {
    return (daten?.einladungen || []).filter((e) => e.quelle === quelle && e.ziel_id === zielId);
  }

  // --- Zusammenstellen -----------------------------------------------------

  // Passt dieser Eintrag zur Suche? Verglichen wird über alles, wonach man
  // suchen würde: Kundenname, Firma, die Person, die den Termin gelegt hat,
  // und die Stufe.
  function passtZurSuche(eintrag) {
    const begriff = suche.trim().toLowerCase();
    if (!begriff) return true;
    const felder = [
      eintrag.name, eintrag.titel, eintrag.company, eintrag.notiz, eintrag.title, eintrag.kunde,
      nameVon(eintrag.created_by), nameVon(eintrag.zustaendig), eintrag.autor,
      artVon(eintrag).label, artVon(eintrag).kurz,
    ];
    return felder.filter(Boolean).some((f) => String(f).toLowerCase().includes(begriff));
  }

  function eintraegeAm(datum) {
    const leer = { eintraege: [], termine: [], geburtstage: [], abwesend: [], extern: [], vergangene: [], nachfass: [], aufgaben: [] };
    if (!daten || !datum) return leer;
    const schluessel = tagesSchluessel(datum);
    return {
      eintraege: daten.eintraege.filter((e) => schluessel >= e.von && schluessel <= (e.bis || e.von) && passtZurSuche(e)),
      // Nach deutscher Zeit einsortiert — sonst rutscht ein Abendtermin für
      // jemanden im Ausland auf den falschen Tag.
      termine: (daten.termine || []).filter((t) => deutscherTag(t.appointment_at) === schluessel && passtZurSuche(t)),
      // Abgeschlossene Stufen: Seit ein Termin weiterrückt statt sich zu
      // verdoppeln, stünde der Tag des Erstgesprächs sonst leer da.
      vergangene: (daten.vergangeneStufen || []).filter((v) => deutscherTag(v.appointment_at) === schluessel && passtZurSuche(v)),
      // Das Follow-up nach einer Mail — im Kalender der zuständigen
      // Person, damit der Rückruf nicht nur ein guter Vorsatz bleibt.
      nachfass: (daten.nachfass || []).filter((n) => deutscherTag(n.faellig_am) === schluessel && passtZurSuche(n)),
      // Und die Aufgaben mit Frist: eine Frist, die in keinem Kalender
      // steht, wird am Tag der Frist entdeckt oder gar nicht.
      aufgaben: (daten.aufgaben || []).filter((a) => deutscherTag(a.due_date) === schluessel && passtZurSuche(a)),
      geburtstage: daten.geburtstage.filter((g) => g.tag === schluessel),
      abwesend: daten.abwesenheiten.filter((a) => schluessel >= a.von && schluessel <= a.bis),
      // Termine aus privaten Kalendern (migration_134). Über Beginn UND
      // Ende: ein ganztägiger Eintrag über drei Tage gehört an alle drei.
      extern: (daten.externeTermine || []).filter((t) => {
        const von = deutscherTag(t.beginn);
        // Ganztägige Termine enden im Format am Folgetag — sonst stünde der
        // Urlaub einen Tag zu lang im Kalender.
        const bisRoh = new Date(new Date(t.ende).getTime() - (t.ganztags ? 1000 : 0));
        return schluessel >= von && schluessel <= deutscherTag(bisRoh.toISOString());
      }),
    };
  }

  const wochenTage = (() => {
    const start = startOfWeek(anker);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  })();

  // Der Abo-Link wird erst beim Öffnen erzeugt: wer das Abo nie nutzt,
  // bekommt auch keinen Schlüssel, der irgendwo herumliegen könnte.
  async function oeffneAbo() {
    setAboOffen((v) => !v);
    if (quellen === null) ladeQuellen();
    if (abo) return;
    setAboBusy(true);
    try {
      setAbo(await apiGet("/api/kalender-abo-link"));
    } catch (e) {
      setFehler(e?.message || "Der Abo-Link konnte nicht erzeugt werden.");
    }
    setAboBusy(false);
  }

  // Neuer Schlüssel — der alte Link ist im selben Moment wertlos. Der Weg
  // für den Fall, dass jemand den Link versehentlich weitergegeben hat.
  async function aboNeu() {
    if (!confirm("Neuen Link erzeugen? Der bisherige hört sofort auf zu funktionieren — Kalender, die ihn schon eingetragen haben, zeigen dann nichts mehr an.")) return;
    setAboBusy(true);
    try {
      setAbo(await apiPost("/api/kalender-abo-link", { neu: true }));
      setKopiert(false);
    } catch (e) {
      setFehler(e?.message || "Der neue Link konnte nicht erzeugt werden.");
    }
    setAboBusy(false);
  }

  // Umfang umstellen. Der Link bleibt derselbe — es ändert sich nur, was
  // darüber ausgeliefert wird, und zwar sofort für alle Kalender, die ihn
  // schon eingetragen haben.
  async function setzeUmfang(umfang, personen) {
    setAboBusy(true);
    try {
      setAbo(await apiPost("/api/kalender-abo-link", {
        umfang,
        ...(personen ? { personen } : {}),
      }));
    } catch (e) {
      setFehler(e?.message || "Der Umfang konnte nicht geändert werden.");
    }
    setAboBusy(false);
  }

  async function ladeQuellen() {
    try {
      const { kalender } = await apiGet("/api/externe-kalender");
      setQuellen(kalender || []);
    } catch (e) {
      setQuellen([]);
    }
  }

  async function fuegeQuelleHinzu() {
    if (!quelleEntwurf.url.trim()) return;
    setQuelleBusy(true);
    setFehler("");
    try {
      const antwort = await apiPost("/api/externe-kalender", quelleEntwurf);
      // Der Abruf läuft sofort mit — ein Fehler dabei ist der eigentlich
      // interessante Fall, denn dann stimmt die Adresse nicht.
      if (antwort.fehler) setFehler(antwort.fehler);
      setQuelleEntwurf({ name: "", url: "", sichtbarkeit: "belegt" });
      await ladeQuellen();
      await laden();
    } catch (e) {
      setFehler(e?.message || "Der Kalender konnte nicht hinzugefügt werden.");
    }
    setQuelleBusy(false);
  }

  async function aendereQuelle(id, patch) {
    setQuelleBusy(true);
    try {
      await apiPatch("/api/externe-kalender", { id, ...patch });
      await ladeQuellen();
      await laden();
    } catch (e) {
      setFehler(e?.message || "Die Änderung war nicht möglich.");
    }
    setQuelleBusy(false);
  }

  async function entferneQuelle(id) {
    if (!confirm("Diesen Kalender entfernen? Seine Termine verschwinden damit aus der Academy.")) return;
    setQuelleBusy(true);
    try {
      await apiDelete(`/api/externe-kalender?id=${id}`);
      await ladeQuellen();
      await laden();
    } catch (e) {
      setFehler(e?.message || "Der Kalender konnte nicht entfernt werden.");
    }
    setQuelleBusy(false);
  }

  async function kopiereAbo() {
    try {
      await navigator.clipboard.writeText(abo.url);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2500);
    } catch (e) {
      setFehler("Kopieren war nicht möglich — bitte den Link von Hand markieren.");
    }
  }

  function blaettern(richtung) {
    setGewaehlterTag(null);
    setAnker((d) => {
      const n = new Date(d);
      if (ansicht === "tag") n.setDate(n.getDate() + richtung);
      else if (ansicht === "woche") n.setDate(n.getDate() + 7 * richtung);
      else n.setMonth(n.getMonth() + richtung);
      return n;
    });
  }

  const titelZeile = ansicht === "tag"
    ? anker.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : ansicht === "woche"
      ? `${wochenTage[0].toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${wochenTage[6].toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`
      : anker.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const offeneEinladungen = daten?.offeneEinladungen || [];
  const detailTag = ansicht === "tag" ? anker : gewaehlterTag;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Kalender</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-5">
        Was die ganze Firma angeht — Besprechungen, Schulungen, Messen, Feiertage. Geburtstage,
        Abwesenheiten und deine Vertriebstermine stehen automatisch mit drin.
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input !py-1.5 text-xs !w-auto flex-1 min-w-[12rem]"
          placeholder="Im Kalender suchen: Kunde, Firma, Vertriebler, Stufe…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        {suche && (
          <>
            <button onClick={() => setSuche("")} className="btn-ghost text-xs">Suche zurücksetzen</button>
            <span className="text-[11px] text-textMuted">
              {/* Ohne Rückmeldung sieht ein leerer Monat nach einem Fehler
                  aus statt nach einer Suche ohne Treffer. */}
              Es werden nur passende Einträge angezeigt.
            </span>
          </>
        )}
      </div>

      {/* Was die Farben bedeuten. Ohne Legende rät man, und geraten wird
          falsch. */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {TERMIN_ARTEN.map((a) => (
          <span key={a.key} className="flex items-center gap-1.5 text-[11px] text-textMuted">
            <span className="w-2 h-2 rounded-full" style={{ background: a.farbe }} />
            {kuerzelVon(a)} · {a.label}
          </span>
        ))}
      </div>

      {fehler && <div className="card mb-4 border-coral/40 text-sm text-coral">{fehler}</div>}

      {/* Kalender-Abo: einmal eintragen, danach hält sich der eigene
          Kalender selbst auf dem Stand. Der Link ist ein Geheimnis — das
          steht ausdrücklich dabei, weil man ihn sonst arglos weiterschickt. */}
      {aboOffen && (
        <div className="card mb-4">
          <div className="font-semibold text-textMain text-sm mb-1">Termine im eigenen Kalender</div>
          <p className="text-xs text-textMuted mb-3">
            Diesen Link einmal in Apple-, Google- oder Outlook-Kalender eintragen. Danach stehen deine Termine
            dort automatisch drin: verschobene wandern mit, abgesagte werden durchgestrichen. Du musst nichts
            mehr einzeln exportieren.
          </p>

          {aboBusy && !abo && <p className="text-xs text-textMuted">Link wird erzeugt…</p>}

          {abo && (
            <>
              {abo.darfTeam && (
                <div className="mb-3">
                  <div className="text-xs text-textMain mb-1.5">Was soll im Kalender stehen?</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      ["eigene", "Nur meine Termine"],
                      ["team", "Mein ganzes Team"],
                      ["auswahl", "Bestimmte Personen"],
                    ].map(([key, label]) => (
                      <button key={key} onClick={() => setzeUmfang(key, key === "auswahl" ? abo.auswahl : null)} disabled={aboBusy}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border disabled:opacity-40 ${abo.umfang === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* "Mein ganzes Team" nimmt auch die mit, die morgen
                      dazukommen — bei einer festen Auswahl muss man nach
                      jeder Neueinstellung selbst daran denken. Das gehört
                      dazugeschrieben, sonst fehlt irgendwann jemand. */}
                  {abo.umfang === "team" && (
                    <p className="text-[11px] text-textMuted mt-1.5">
                      Auch neue Teammitglieder erscheinen automatisch — du musst die Liste nie nachziehen.
                    </p>
                  )}

                  {abo.umfang === "auswahl" && (
                    <div className="mt-2">
                      {abo.auswaehlbar?.length ? (
                        <>
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <button onClick={() => setzeUmfang("auswahl", abo.auswaehlbar.map((p) => p.id))}
                              disabled={aboBusy} className="btn-ghost text-xs disabled:opacity-40">Alle</button>
                            <button onClick={() => setzeUmfang("auswahl", [])}
                              disabled={aboBusy} className="btn-ghost text-xs disabled:opacity-40">Keine</button>
                            <span className="text-[11px] text-textMuted">
                              {abo.auswahl?.length || 0} von {abo.auswaehlbar.length} ausgewählt
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {abo.auswaehlbar.map((p) => {
                              const an = (abo.auswahl || []).includes(p.id);
                              return (
                                <button key={p.id} disabled={aboBusy}
                                  onClick={() => setzeUmfang("auswahl", an
                                    ? (abo.auswahl || []).filter((x) => x !== p.id)
                                    : [...(abo.auswahl || []), p.id])}
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border disabled:opacity-40 ${an ? "border-amber text-textMain" : "border-line text-textMuted hover:text-textMain"}`}
                                  style={an ? { background: "color-mix(in srgb, var(--org-accent, #E9B44C) 18%, transparent)" } : undefined}>
                                  {an ? "✓ " : ""}{p.name}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] text-textMuted">
                          Zu deinen Teams ist noch niemand zugeordnet — es gibt nichts auszuwählen.
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-textMuted mt-2">
                    Der Link bleibt derselbe — jede Umstellung wirkt sofort, auch in Kalendern, die ihn schon
                    eingetragen haben. Bei fremden Terminen steht der Name der Person hinter dem Termin.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <input readOnly value={abo.url} onFocus={(e) => e.target.select()}
                  className="input !py-1.5 text-xs flex-1 min-w-[240px] font-mono" />
                <button onClick={kopiereAbo} className="btn text-xs">{kopiert ? "Kopiert ✓" : "Link kopieren"}</button>
                {/* Apple und Outlook tragen den Kalender über webcal:// mit
                    einem Klick ein, statt die Datei herunterzuladen. */}
                <a href={abo.webcal} className="btn-ghost text-xs">Direkt eintragen (Apple / Outlook)</a>
              </div>

              <div className="text-xs text-textMuted leading-relaxed mb-3">
                <strong className="text-textMain">Google Kalender:</strong> Andere Kalender → Per URL hinzufügen → Link einfügen.<br />
                <strong className="text-textMain">Apple Kalender:</strong> Ablage → Neues Kalenderabonnement → Link einfügen.<br />
                <strong className="text-textMain">Outlook:</strong> Kalender hinzufügen → Aus dem Internet abonnieren.
              </div>

              <div className="rounded-xl border border-amber/40 px-3 py-2 mb-3">
                <div className="text-xs text-textMain mb-1">Der Link ist wie ein Schlüssel.</div>
                <p className="text-[11px] text-textMuted">
                  Wer ihn hat, sieht {abo.umfang === "team"
                    ? "die Termine deines ganzen Teams"
                    : abo.umfang === "auswahl" && abo.auswahl?.length
                      ? `deine Termine und die von ${abo.auswahl.length} weiteren Personen`
                      : "deine Termine"} —
                  ohne Anmeldung. Also nicht weitergeben und nicht in eine Gruppe posten. Ändern kannst du damit
                  nichts, es wird nur gelesen.
                  {(abo.umfang === "team" || (abo.umfang === "auswahl" && abo.auswahl?.length > 0))
                    && " Weil hier fremde Termine drinstehen, wiegt ein weitergegebener Link schwerer als sonst."}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={aboNeu} disabled={aboBusy} className="btn-ghost text-xs text-coral disabled:opacity-40">
                  {aboBusy ? "Erzeugt…" : "Neuen Link erzeugen"}
                </button>
                <span className="text-[11px] text-textMuted">Macht den bisherigen Link sofort wertlos.</span>
              </div>
            </>
          )}

          <div className="border-t border-line mt-4 pt-4">
            <div className="font-semibold text-textMain text-sm mb-1">Mein Kalender in der Academy</div>
            <p className="text-xs text-textMuted mb-3">
              Die andere Richtung: trage hier die Adresse deines privaten Kalenders ein, dann erscheinen
              deine Termine auch hier. So sieht man beim Terminieren, wann du schon belegt bist. Bei Google
              heisst das <strong className="text-textMain">„Geheime Adresse im iCal-Format“</strong> (Einstellungen →
              Kalender → Kalender integrieren), bei Apple die Freigabe-Adresse, bei Outlook „Kalender
              veröffentlichen“.
            </p>

            {(quellen || []).map((k) => (
              <div key={k.id} className="rounded-xl border border-line px-3 py-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-textMain">{k.name}</span>
                  <span className="text-[11px] text-textMuted font-mono">{k.url}</span>
                  <button onClick={() => entferneQuelle(k.id)} disabled={quelleBusy}
                    className="btn-ghost text-xs text-coral ml-auto disabled:opacity-40">Entfernen</button>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {[["belegt", "Nur „Belegt“ zeigen"], ["titel", "Titel zeigen"]].map(([key, label]) => (
                    <button key={key} onClick={() => aendereQuelle(k.id, { sichtbarkeit: key })} disabled={quelleBusy}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border disabled:opacity-40 ${k.sichtbarkeit === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                      {label}
                    </button>
                  ))}
                  <span className="text-[11px] text-textMuted">
                    {k.sichtbarkeit === "titel"
                      ? "Andere sehen, worum es geht."
                      : "Andere sehen nur, dass du keine Zeit hast."}
                  </span>
                </div>
                {k.letzter_fehler && (
                  <p className="text-[11px] text-coral mt-1.5">{k.letzter_fehler}</p>
                )}
              </div>
            ))}

            <div className="flex items-center gap-2 flex-wrap">
              <input className="input !py-1.5 text-xs !w-auto" placeholder="Name (z. B. Privat)"
                value={quelleEntwurf.name}
                onChange={(e) => setQuelleEntwurf((q) => ({ ...q, name: e.target.value }))} />
              <input className="input !py-1.5 text-xs flex-1 min-w-[220px]" placeholder="https://calendar.google.com/…/basic.ics"
                value={quelleEntwurf.url}
                onChange={(e) => setQuelleEntwurf((q) => ({ ...q, url: e.target.value }))} />
              <button onClick={fuegeQuelleHinzu} disabled={quelleBusy || !quelleEntwurf.url.trim()}
                className="btn text-xs disabled:opacity-40">
                {quelleBusy ? "Prüft…" : "Kalender hinzufügen"}
              </button>
            </div>
            <p className="text-[11px] text-textMuted mt-2">
              Neue Kalender starten auf „Nur Belegt“ — dass ein Arzttermin im Firmenkalender steht, will
              niemand aus Versehen. Du selbst siehst deine Titel immer.
            </p>
          </div>
        </div>
      )}

      {/* Offene Einladungen zuerst — unabhängig davon, welcher Zeitraum
          gerade angezeigt wird. */}
      {offeneEinladungen.length > 0 && (
        <div className="card mb-4 border-amber/40">
          <div className="text-sm font-semibold text-amber mb-2">
            {offeneEinladungen.length === 1 ? "Du bist eingeladen" : `${offeneEinladungen.length} Einladungen für dich`}
          </div>
          <div className="flex flex-col gap-2">
            {offeneEinladungen.map((e) => (
              <div key={e.id} className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-textMain">{e.titel}</span>
                <span className="text-xs text-textMuted">
                  {e.zeitpunkt ? `${terminAnzeige(e.zeitpunkt).haupt} Uhr` : `${e.tag.slice(8)}.${e.tag.slice(5, 7)}.${e.uhrzeit ? ` · ${e.uhrzeit}` : ""}`}
                  {" · von "}{e.von_name}
                </span>
                <span className="flex items-center gap-1.5 ml-auto">
                  <button disabled={busy} onClick={() => antworten(e.id, "zugesagt")} className="btn text-xs disabled:opacity-40">Zusagen</button>
                  <button disabled={busy} onClick={() => antworten(e.id, "abgesagt")} className="btn-ghost text-xs disabled:opacity-40">Absagen</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => blaettern(-1)} className="btn-ghost text-xs">‹ Zurück</button>
          <span className="font-display font-semibold text-textMain text-sm flex items-center gap-2">
            {titelZeile}
            {/* In der Tagesansicht sieht man sonst nicht, ob man gerade auf
                heute schaut oder drei Tage weitergeblättert hat. */}
            {ansicht === "tag" && tagesSchluessel(anker) === heute && (
              <span className="text-[10px] rounded-full bg-amber text-[var(--org-button-text,#fff)] px-2 py-px font-semibold">heute</span>
            )}
          </span>
          <button onClick={() => blaettern(1)} className="btn-ghost text-xs">Weiter ›</button>
          <button onClick={() => { setAnker(new Date()); setGewaehlterTag(null); }} className="btn-ghost text-xs text-textMuted">Heute</button>
        </div>
        <div className="flex items-center gap-2">
          <SeitenReiter
            reiter={ANSICHTEN.map(([key, label]) => ({ key, label }))}
            aktiv={ansicht}
            onWechsel={(k) => { setAnsicht(k); setGewaehlterTag(null); }}
          />
          <button onClick={oeffneAbo} className="btn-ghost text-xs" title="Termine im eigenen Kalender abonnieren">
            📆 Mit meinem Kalender verbinden
          </button>
          <button onClick={() => { setFormularOffen((v) => !v); setEntwurf((e) => ({ ...e, von: e.von || heute })); }} className="btn text-xs">
            {formularOffen ? "Abbrechen" : "+ Eintrag"}
          </button>
        </div>
      </div>

      {formularOffen && (
        <div className="card mb-4 flex flex-col gap-2">
          <input className="input" placeholder="Worum geht es?" value={entwurf.titel} maxLength={120}
            onChange={(e) => setEntwurf((z) => ({ ...z, titel: e.target.value }))} />
          <div className="flex items-center gap-2 flex-wrap">
            <select className="input !w-auto" value={entwurf.art} onChange={(e) => setEntwurf((z) => ({ ...z, art: e.target.value }))}>
              {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.symbol} {a.label}</option>)}
            </select>
            <input type="date" className="input !w-auto" value={entwurf.von} onChange={(e) => setEntwurf((z) => ({ ...z, von: e.target.value }))} />
            <span className="text-xs text-textMuted">bis</span>
            <input type="date" className="input !w-auto" value={entwurf.bis} onChange={(e) => setEntwurf((z) => ({ ...z, bis: e.target.value }))} />
            <input className="input !w-24" placeholder="14:00" maxLength={5} value={entwurf.uhrzeit}
              onChange={(e) => setEntwurf((z) => ({ ...z, uhrzeit: e.target.value }))} />
          </div>
          <textarea className="input" rows={2} placeholder="Ergänzung (optional)" value={entwurf.beschreibung} maxLength={500}
            onChange={(e) => setEntwurf((z) => ({ ...z, beschreibung: e.target.value }))} />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-textMuted mb-1">Einladen (optional)</div>
            <PersonenAuswahl
              personen={(daten?.personen || []).filter((p) => p.id !== daten?.selbst)}
              ausgewaehlt={neueGaeste}
              onChange={setNeueGaeste}
            />
          </div>
          <div className="flex items-center gap-2">
            <button disabled={busy || !entwurf.titel.trim() || !entwurf.von} onClick={speichern} className="btn text-xs disabled:opacity-40">
              {busy ? "Speichert…" : "Eintragen"}
            </button>
            <span className="text-[11px] text-textMuted">Sichtbar für alle in deiner Organisation. „bis“ nur bei mehrtägigen Terminen.</span>
          </div>
        </div>
      )}

      {laedt ? (
        <p className="text-textMuted text-sm">Lädt…</p>
      ) : (
        <>
          {ansicht === "monat" && (
            /* Das Logo der eigenen Organisation liegt hinter dem Raster —
               blass genug, dass die Tage lesbar bleiben, und ohne Klickfläche,
               damit es die Tages-Knöpfe nicht abfängt. */
            <div className="card mb-4 relative overflow-hidden">
              <LogoHintergrund />
              <div className="relative grid grid-cols-7 gap-1 mb-1">
                {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((t) => (
                  <div key={t} className="text-[10px] uppercase tracking-wide text-textMuted text-center">{t}</div>
                ))}
              </div>
              <div className="relative grid grid-cols-7 gap-1">
                {monatsRaster(anker).map((tag, i) => {
                  if (!tag) return <div key={`leer-${i}`} />;
                  const inhalt = eintraegeAm(tag);
                  const anzahl = inhalt.eintraege.length + inhalt.geburtstage.length + inhalt.termine.length
                    + inhalt.extern.length + (inhalt.nachfass || []).length + (inhalt.aufgaben || []).length;
                  const istHeute = tagesSchluessel(tag) === heute;
                  const gewaehlt = gewaehlterTag && istGleicherTag(tag, gewaehlterTag);
                  return (
                    /* In der Kachel steht, WAS an dem Tag ist — ein Symbol
                       allein zwang dazu, jeden Tag einzeln anzutippen, nur um
                       herauszufinden, worum es geht. */
                    <button key={tag.toISOString()}
                      onClick={() => setGewaehlterTag(gewaehlt ? null : tag)}
                      /* Heute hat eine eigene Fläche, nicht nur eine
                         Randfarbe: im vollen Monatsraster geht ein dünner
                         Rand zwischen dreissig anderen unter. Der GEWÄHLTE
                         Tag bleibt trotzdem unterscheidbar — er bekommt den
                         kräftigen Rahmen, heute die Fläche. */
                      className={`min-h-[5.5rem] rounded-lg border p-1 flex flex-col items-stretch text-left text-xs overflow-hidden transition-colors
                        ${gewaehlt ? "border-amber bg-amber/15" : istHeute ? "border-amber/50 bg-amber/[0.07]" : "border-line"}
                        ${anzahl ? "text-textMain" : "text-textMuted"} hover:border-amber/60`}>
                      <span className="px-0.5 flex items-center gap-1">
                        {istHeute ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber text-[var(--org-button-text,#fff)] text-[11px] font-bold">
                            {tag.getDate()}
                          </span>
                        ) : (
                          tag.getDate()
                        )}
                      </span>
                      <span className="flex flex-col gap-0.5 mt-0.5 leading-tight">
                        {zeilenFuerTag(inhalt, meinStatus, nameVon).slice(0, 3).map((z, k) => (
                          <span key={k} title={z.titel} className={`truncate text-[10px] px-0.5 flex items-center gap-1 ${z.vergangen ? "opacity-50" : ""}`}>
                            {/* Die Farbe der Stufe: Setting, Folgetermin
                                und Closing sind im vollen Monat sonst nicht
                                zu unterscheiden. */}
                            {z.farbe && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: z.farbe }} />}
                            <span className="truncate">{z.symbol} {z.titel}</span>
                          </span>
                        ))}
                        {zeilenFuerTag(inhalt, meinStatus, nameVon).length > 3 && (
                          <span className="text-[10px] text-textMuted px-0.5">+{zeilenFuerTag(inhalt, meinStatus, nameVon).length - 3} weitere</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {ansicht === "woche" && (
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 mb-4">
              {wochenTage.map((tag) => {
                const inhalt = eintraegeAm(tag);
                const istHeute = tagesSchluessel(tag) === heute;
                return (
                  <div key={tag.toISOString()} className={`card !p-2.5 ${istHeute ? "border-amber/50 bg-amber/[0.07]" : ""}`}>
                    <div className={`text-[11px] mb-1.5 flex items-center gap-1.5 ${istHeute ? "text-amber font-semibold" : "text-textMuted"}`}>
                      {tag.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                      {istHeute && <span className="text-[10px] rounded-full bg-amber text-[var(--org-button-text,#fff)] px-1.5 py-px">heute</span>}
                    </div>
                    <TagesInhalt inhalt={inhalt} meinStatus={meinStatus} kompakt />
                  </div>
                );
              })}
            </div>
          )}

          {detailTag && (
            <div className="card mb-4">
              <div className="font-semibold text-textMain text-sm mb-2">
                {detailTag.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
              <TagesInhalt
                inhalt={eintraegeAm(detailTag)}
                meinStatus={meinStatus}
                nameVon={nameVon}
                terminBearbeiten={terminBearbeiten}
                terminEntwurf={terminEntwurf}
                setTerminEntwurf={setTerminEntwurf}
                terminBusy={terminBusy}
                onTerminBearbeiten={(t) => {
                  setTerminBearbeiten(t.id);
                  // Vorbefüllt mit dem, was gerade gilt — man ändert meist
                  // nur eines von beidem.
                  const d = new Date(t.appointment_at);
                  setTerminEntwurf({
                    zeitpunkt: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
                    art: artVon(t).key,
                  });
                }}
                onTerminSpeichern={speichereTermin}
                onTerminAbbrechen={() => setTerminBearbeiten(null)}
                onNachfassErledigt={nachfassErledigt}
                onNachfassVerschieben={nachfassVerschieben}
                onNachfassLoeschen={nachfassLoeschen}
                bearbeitenId={bearbeitenId}
                bearbeitenEntwurf={bearbeitenEntwurf}
                setBearbeitenEntwurf={setBearbeitenEntwurf}
                onBearbeiten={bearbeitenStarten}
                onBearbeitenSpeichern={bearbeitenSpeichern}
                onBearbeitenAbbrechen={() => { setBearbeitenId(null); setBearbeitenEntwurf(null); }}
                einladungenZu={einladungenZu}
                personen={daten?.personen || []}
                selbst={daten?.selbst}
                einladenFuer={einladenFuer}
                setEinladenFuer={setEinladenFuer}
                onEinladen={einladen}
                onZuruecknehmen={einladungZuruecknehmen}
                onLoeschen={loeschen}
                busy={busy}
              />
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

// Was in einer Tageskachel steht — Uhrzeit und Name statt bloss ein Symbol.
// Vertriebstermine zuerst: sie haben eine Uhrzeit und sind das, wonach im
// Kalender gesucht wird.
// Das eigene Ja oder Nein gehört in die Zeile: eine Zusage, die man nur in
// der Einladungsliste wiederfindet, sieht aus, als sei sie nie angekommen.
function zeilenFuerTag(inhalt, meinStatus, nameVon = () => "") {
  const zeichen = (quelle, id, standard) => {
    const status = meinStatus ? meinStatus(quelle, id) : null;
    if (status === "zugesagt") return "✅";
    if (status === "abgesagt") return "❌";
    if (status === "offen") return "⏳";
    return standard;
  };
  return [
    // "10:30 CC: Max Muster – Ernestine": Kürzel für die Stufe, dahinter
    // die Person, die den ERSTEN Termin gelegt hat. Führt jemand anderes
    // das Gespräch, bleibt es trotzdem ihr Interessent.
    ...inhalt.termine.map((t) => ({
      symbol: zeichen("lead", t.id, "📞"),
      titel: `${uhrzeitDeutsch(t.appointment_at)} ${kalenderTitel(t, nameVon(t.created_by))}`,
      farbe: terminFarbe(t),
    })),
    // Was an diesem Tag stattgefunden hat und inzwischen weitergerückt ist.
    // Blass, weil es Vergangenheit ist — aber sichtbar, denn stattgefunden
    // hat es.
    ...(inhalt.vergangene || []).map((v) => ({
      symbol: "✓",
      titel: `${uhrzeitDeutsch(v.appointment_at)} ${kalenderTitel(v, nameVon(v.created_by))}`,
      farbe: terminFarbe(v),
      vergangen: true,
    })),
    // Das Nachfassen: erledigte blass und abgehakt, offene mit Pinnadel.
    ...(inhalt.nachfass || []).map((n) => ({
      symbol: n.erledigt_am ? "✓" : "📌",
      titel: `${uhrzeitDeutsch(n.faellig_am)} ${n.titel}`,
      vergangen: !!n.erledigt_am,
    })),
    ...(inhalt.aufgaben || []).map((a) => ({
      symbol: a.done ? "✓" : "✅",
      titel: `${uhrzeitDeutsch(a.due_date)} ${a.title}`,
      vergangen: !!a.done,
    })),
    ...inhalt.eintraege.map((e) => ({ symbol: zeichen("org_event", e.id, symbolFuer(e.art)), titel: e.uhrzeit ? `${e.uhrzeit} ${e.titel}` : e.titel })),
    // Privatkalender zuletzt: sie sind Hintergrund für die Frage "wer kann
    // wann", nicht das, wonach im Firmenkalender gesucht wird.
    ...inhalt.extern.map((t) => ({
      symbol: "🔒",
      titel: t.ganztags ? t.titel : `${uhrzeitDeutsch(t.beginn)} ${t.titel}`,
    })),
    ...inhalt.geburtstage.map((g) => ({ symbol: "🎂", titel: g.name })),
    ...inhalt.abwesend.map((a) => ({ symbol: "🌴", titel: `${a.name} abwesend` })),
  ];
}

// Der Inhalt eines Tages — in der Wochenansicht kompakt, in der Tagesansicht
// mit allem, was dazugehört: Beschreibung, Einladungen, Knöpfe.
function TagesInhalt({ inhalt, kompakt, einladungenZu, meinStatus, personen, selbst, einladenFuer, setEinladenFuer, onEinladen, onZuruecknehmen, onLoeschen, busy,
  bearbeitenId, bearbeitenEntwurf, setBearbeitenEntwurf, onBearbeiten, onBearbeitenSpeichern, onBearbeitenAbbrechen,
  terminBearbeiten, terminEntwurf, setTerminEntwurf, onTerminBearbeiten, onTerminSpeichern, onTerminAbbrechen, terminBusy, nameVon,
  onNachfassErledigt, onNachfassVerschieben, onNachfassLoeschen }) {
  const leer = inhalt.eintraege.length === 0 && inhalt.geburtstage.length === 0
    && inhalt.termine.length === 0 && inhalt.abwesend.length === 0 && inhalt.extern.length === 0
    && (inhalt.vergangene || []).length === 0 && (inhalt.nachfass || []).length === 0
    && (inhalt.aufgaben || []).length === 0;
  if (leer) return <p className="text-textMuted text-xs">{kompakt ? "—" : "Für diesen Tag ist nichts eingetragen."}</p>;

  return (
    <>
      {inhalt.geburtstage.map((g) => (
        <div key={`geb-${g.id}`} className="flex items-center gap-2 py-1 cursor-pointer" onClick={() => openProfile(g.id)}>
          <span>🎂</span>
          {!kompakt && <Avatar name={g.name} src={g.avatar_url} size={24} />}
          <span className={kompakt ? "text-[11px] text-textMain truncate" : "text-sm text-textMain"}>
            {kompakt ? g.name : `${g.name} hat Geburtstag`}
          </span>
        </div>
      ))}

      {inhalt.eintraege.map((e) => (bearbeitenId === e.id ? (
        <div key={e.id} className="flex flex-col gap-2 py-2 border-b border-line">
          <input className="input !py-1.5 text-xs" value={bearbeitenEntwurf.titel} maxLength={120}
            onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, titel: ev.target.value }))} />
          <div className="flex items-center gap-2 flex-wrap">
            <select className="input !w-auto !py-1.5 text-xs" value={bearbeitenEntwurf.art}
              onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, art: ev.target.value }))}>
              {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.symbol} {a.label}</option>)}
            </select>
            <input type="date" className="input !w-auto !py-1.5 text-xs" value={bearbeitenEntwurf.von}
              onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, von: ev.target.value }))} />
            <span className="text-xs text-textMuted">bis</span>
            <input type="date" className="input !w-auto !py-1.5 text-xs" value={bearbeitenEntwurf.bis || ""}
              onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, bis: ev.target.value }))} />
            <input className="input !w-24 !py-1.5 text-xs" placeholder="14:00" maxLength={5} value={bearbeitenEntwurf.uhrzeit || ""}
              onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, uhrzeit: ev.target.value }))} />
          </div>
          <textarea className="input !py-1.5 text-xs" rows={2} placeholder="Ergänzung (optional)" maxLength={500}
            value={bearbeitenEntwurf.beschreibung || ""}
            onChange={(ev) => setBearbeitenEntwurf((z) => ({ ...z, beschreibung: ev.target.value }))} />
          <div className="flex items-center gap-2">
            <button disabled={busy || !bearbeitenEntwurf.titel.trim() || !bearbeitenEntwurf.von} onClick={onBearbeitenSpeichern} className="btn text-xs disabled:opacity-40">Speichern</button>
            <button disabled={busy} onClick={onBearbeitenAbbrechen} className="btn-ghost text-xs">Abbrechen</button>
          </div>
        </div>
      ) : (
        <div key={e.id} className="flex items-start gap-2 py-1">
          <span>{symbolFuer(e.art)}</span>
          <div className="flex-1 min-w-0">
            <div className={kompakt ? "text-[11px] text-textMain truncate" : "text-sm text-textMain"}>
              {e.titel}{e.uhrzeit && <span className="text-textMuted"> · {e.uhrzeit}</span>}
            </div>
            {!kompakt && (
              <>
                {e.beschreibung && <div className="text-[11px] text-textMuted">{e.beschreibung}</div>}
                <div className="text-[11px] text-textMuted">von {e.autor}</div>
                <Einladungsleiste
                  quelle="org_event" zielId={e.id}
                  einladungen={einladungenZu ? einladungenZu("org_event", e.id) : []}
                  personen={personen} selbst={selbst}
                  offen={einladenFuer === `org_event:${e.id}`}
                  setOffen={setEinladenFuer} onEinladen={onEinladen} onZuruecknehmen={onZuruecknehmen} busy={busy}
                />
              </>
            )}
          </div>
          {!kompakt && onLoeschen && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => eintragInEigenenKalender(e)} title="In den eigenen Kalender übernehmen" className="btn-ghost text-xs">📥 Übernehmen</button>
              <button onClick={() => onBearbeiten(e)} className="btn-ghost text-xs">Bearbeiten</button>
              <button onClick={() => onLoeschen(e.id, e.titel)} className="btn-ghost text-xs text-coral">Entfernen</button>
            </span>
          )}
        </div>
      )))}

      {(inhalt.vergangene || []).map((v) => (
        <div key={`v-${v.id}`} className="flex items-start gap-2 py-1 opacity-60">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: terminFarbe(v) }} />
            ✓
          </span>
          <div className="flex-1 min-w-0">
            <div className={kompakt ? "text-[11px] text-textMain truncate" : "text-sm text-textMain"}>
              {kuerzelVon(artVon(v)) && <span className="text-textMuted">{kuerzelVon(artVon(v))}: </span>}
              {v.name}{v.company ? <span className="text-textMuted"> · {v.company}</span> : null}
            </div>
            <div className="text-[11px] text-textMuted">
              hat stattgefunden{nameVon && nameVon(v.created_by) ? ` · ${nameVon(v.created_by)}` : ""}
              {v.ergebnis ? ` · ${v.ergebnis === "kunde" ? "Kunde geworden" : v.ergebnis === "follow_up" ? "überlegt" : "Absage"}` : ""}
              {" · der Termin ist inzwischen weitergerückt"}
            </div>
          </div>
        </div>
      ))}

      {inhalt.termine.map((t) => (
        <div key={`t-${t.id}`} className="flex items-start gap-2 py-1">
          {/* Die Farbe der Stufe statt eines Symbols für alle: Setting,
              Folgetermin und Closing sind sonst nicht zu unterscheiden. */}
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: terminFarbe(t) }} />
            📞
          </span>
          <div className="flex-1 min-w-0">
            <div className={kompakt ? "text-[11px] text-textMain truncate" : "text-sm text-textMain"}>
              {kuerzelVon(artVon(t)) && <span className="text-textMuted">{kuerzelVon(artVon(t))}: </span>}
              {t.name}{t.company ? <span className="text-textMuted"> · {t.company}</span> : null}
            </div>
            <div className="text-[11px] text-textMuted">
              {terminZeile(t.appointment_at, kompakt)}{!kompakt && ` · ${t.autor}`}
              {meinStatus && meinStatus("lead", t.id) === "zugesagt" && <span className="text-teal"> · du hast zugesagt</span>}
              {meinStatus && meinStatus("lead", t.id) === "abgesagt" && <span className="text-coral"> · du hast abgesagt</span>}
            </div>
            {/* Bearbeiten direkt hier: Zeitpunkt ändern oder auf die
                nächste Stufe rücken. Vorher musste man dafür die Seite
                wechseln und den Termin in der Liste suchen. */}
            {!kompakt && terminBearbeiten === t.id ? (
              <div className="flex flex-col gap-2 mt-2 p-2 rounded-lg border border-line">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-textMuted">Stufe:</span>
                  {TERMIN_ARTEN.map((a) => (
                    <button key={a.key} onClick={() => setTerminEntwurf((d) => ({ ...d, art: a.key }))}
                      className={`px-2 py-1 rounded-full text-[11px] border ${terminEntwurf.art === a.key ? "text-textMain" : "border-line text-textMuted"}`}
                      style={terminEntwurf.art === a.key
                        ? { borderColor: a.farbe, background: `color-mix(in srgb, ${a.farbe} 18%, transparent)` }
                        : undefined}>
                      {kuerzelVon(a)} · {a.label}
                    </button>
                  ))}
                </div>
                <input type="datetime-local" className="input !py-1.5 text-xs"
                  value={terminEntwurf.zeitpunkt}
                  onChange={(e) => setTerminEntwurf((d) => ({ ...d, zeitpunkt: e.target.value }))} />
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => onTerminSpeichern(t)} disabled={terminBusy} className="btn text-xs disabled:opacity-40">
                    {terminBusy ? "Speichert…" : "Speichern"}
                  </button>
                  <button onClick={onTerminAbbrechen} className="btn-ghost text-xs">Abbrechen</button>
                  {terminEntwurf.art && terminEntwurf.art !== artVon(t).key && artVon(t).key !== "unbestimmt" && (
                    <span className="text-[11px] text-textMuted w-full">
                      Der Termin rückt auf die neue Stufe — es entsteht kein zweiter Eintrag, und die bisherige
                      Stufe bleibt mit ihrem Datum im Verlauf stehen.
                    </span>
                  )}
                </div>
              </div>
            ) : !kompakt && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <button onClick={() => terminInEigenenKalender(t)} className="btn-ghost text-xs">📥 In meinen Kalender</button>
                {onTerminBearbeiten && (
                  <button onClick={() => onTerminBearbeiten(t)} className="btn-ghost text-xs">Bearbeiten</button>
                )}
              </div>
            )}
            {!kompakt && (
              <Einladungsleiste
                quelle="lead" zielId={t.id}
                einladungen={einladungenZu ? einladungenZu("lead", t.id) : []}
                personen={personen} selbst={selbst}
                offen={einladenFuer === `lead:${t.id}`}
                setOffen={setEinladenFuer} onEinladen={onEinladen} onZuruecknehmen={onZuruecknehmen} busy={busy}
              />
            )}
          </div>
        </div>
      ))}

      {/* Das Nachfassen nach einer Mail. Steht im Kalender der zuständigen
          Person — ohne Kalendereintrag ist ein Rückruf in drei Tagen nur
          ein guter Vorsatz. */}
      {(inhalt.nachfass || []).map((n) => (
        <div key={`nf-${n.id}`} className={`flex items-start gap-2 py-1 ${n.erledigt_am ? "opacity-50" : ""}`}>
          <span>{n.erledigt_am ? "✓" : "📌"}</span>
          <div className="flex-1 min-w-0">
            <div className={`${kompakt ? "text-[11px] truncate" : "text-sm"} ${n.erledigt_am ? "text-textMuted line-through" : "text-textMain"}`}>
              {n.titel}
            </div>
            <div className="text-[11px] text-textMuted">
              {terminZeile(n.faellig_am, kompakt)}
              {/* Der eigene Name gehört nicht dazu — im Kalender steht nur
                  das eigene Follow-up. Wer es eingetragen hat, schon: das
                  beantwortet "warum steht das hier". */}
              {!kompakt && n.erstellerName && n.erstellt_von !== n.zustaendig ? ` · eingetragen von ${n.erstellerName}` : ""}
            </div>
            {!kompakt && n.notiz && <div className="text-[11px] text-textMuted mt-0.5">{n.notiz}</div>}
            {!kompakt && !n.erledigt_am && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {onNachfassErledigt && (
                  <button onClick={() => onNachfassErledigt(n)} disabled={busy}
                    className="btn-ghost text-[11px] disabled:opacity-40">Erledigt</button>
                )}
                {/* Verschieben statt löschen und neu anlegen: ein Rückruf
                    rutscht ständig, und wer ihn dafür jedes Mal neu
                    eintippen muss, trägt ihn irgendwann gar nicht mehr
                    ein. */}
                {onNachfassVerschieben && (
                  <button onClick={() => onNachfassVerschieben(n)} disabled={busy}
                    className="btn-ghost text-[11px] disabled:opacity-40">🕒 Verschieben</button>
                )}
                {onNachfassLoeschen && (
                  <button onClick={() => onNachfassLoeschen(n)} disabled={busy}
                    className="btn-ghost text-[11px] text-coral disabled:opacity-40">Löschen</button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Aufgaben mit Frist. Abhaken geht am Termin selbst — hier steht
          nur, dass heute etwas fällig ist, denn genau das ging bisher
          unter. */}
      {(inhalt.aufgaben || []).map((a) => (
        <div key={`auf-${a.id}`} className={`flex items-start gap-2 py-1 ${a.done ? "opacity-50" : ""}`}>
          <span>{a.done ? "✓" : "✅"}</span>
          <div className="flex-1 min-w-0">
            <div className={`${kompakt ? "text-[11px] truncate" : "text-sm"} ${a.done ? "text-textMuted line-through" : "text-textMain"}`}>
              {a.title}
            </div>
            <div className="text-[11px] text-textMuted">
              {terminZeile(a.due_date, kompakt)}
              {!kompakt && a.kunde ? ` · ${a.kunde}` : ""}
              {!kompakt && a.autor ? ` · ${a.autor}` : ""}
            </div>
            {!kompakt && a.lead_id && (
              <a href={`/termine?leadId=${a.lead_id}`} className="text-[11px] text-amber hover:underline">→ zum Termin</a>
            )}
          </div>
        </div>
      ))}

      {/* Aus privaten Kalendern. Blasser und ohne Knöpfe: sie sind der
          Hintergrund für "wer kann wann", nichts, was man hier bearbeitet.
          Steht dort "Belegt", hat die Person genau das so eingestellt. */}
      {inhalt.extern.map((t) => (
        <div key={`ext-${t.id}`} className="flex items-start gap-2 py-1 opacity-75">
          <span>🔒</span>
          <div className="flex-1 min-w-0">
            <div className={kompakt ? "text-[11px] text-textMain truncate" : "text-sm text-textMain"}>
              {t.titel}
            </div>
            <div className="text-[11px] text-textMuted">
              {t.ganztags ? "ganztägig" : terminZeile(t.beginn, kompakt)}
              {t.eigener
                ? (t.quelle && !kompakt ? ` · ${t.quelle}` : "")
                : ` · ${personen?.find((p) => p.id === t.user_id)?.name || "Teammitglied"}`}
            </div>
          </div>
        </div>
      ))}

      {inhalt.abwesend.map((a) => (
        <div key={`abw-${a.id}`} className="text-[11px] text-textMuted py-1">🌴 {a.name} ist abwesend</div>
      ))}
    </>
  );
}

function terminZeile(iso, kompakt) {
  if (kompakt) return `${uhrzeitDeutsch(iso)} Uhr`;
  const { haupt, zusatz } = terminAnzeige(iso);
  return zusatz ? `${haupt} Uhr (bei dir ${zusatz})` : `${haupt} Uhr`;
}

// Wer eingeladen ist und wie er geantwortet hat — plus die Auswahl, wen man
// noch einladen möchte. Zusagen kann nur die eingeladene Person selbst.
function Einladungsleiste({ quelle, zielId, einladungen, personen, selbst, offen, setOffen, onEinladen, onZuruecknehmen, busy }) {
  const [gewaehlte, setGewaehlte] = useState([]);
  const schonEingeladen = new Set(einladungen.map((e) => e.person_id));
  const auswahl = (personen || []).filter((p) => p.id !== selbst && !schonEingeladen.has(p.id));

  return (
    <div className="mt-1">
      {einladungen.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-textMuted">
          {einladungen.map((e) => (
            <span key={e.id} className="flex items-center gap-1">
              <span title={e.status}>{STATUS_SYMBOL[e.status] || "⏳"}</span>
              <button onClick={() => openProfile(e.person_id)} className="hover:text-textMain">{e.name}</button>
              {e.eingeladen_von === selbst && e.status === "offen" && (
                <button onClick={() => onZuruecknehmen(e.id)} className="text-coral hover:underline">×</button>
              )}
            </span>
          ))}
        </div>
      )}
      {offen ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <PersonenAuswahl personen={auswahl} ausgewaehlt={gewaehlte} onChange={setGewaehlte} />
          <div className="flex items-center gap-2">
            <button disabled={busy || !gewaehlte.length} onClick={() => onEinladen(quelle, zielId, gewaehlte)} className="btn text-xs disabled:opacity-40">
              {gewaehlte.length > 1 ? `${gewaehlte.length} einladen` : "Einladen"}
            </button>
            <button onClick={() => { setGewaehlte([]); setOffen(null); }} className="btn-ghost text-xs">Abbrechen</button>
          </div>
        </div>
      ) : (
        auswahl.length > 0 && (
          <button disabled={busy} onClick={() => setOffen(`${quelle}:${zielId}`)} className="btn-ghost text-xs mt-1 disabled:opacity-40">
            + Einladen
          </button>
        )
      )}
    </div>
  );
}

// Einen Eintrag an den Kalender des eigenen Geräts übergeben. Ohne Uhrzeit
// wird daraus ein ganztägiger Termin — so steht er dort, wo er hingehört,
// statt um Mitternacht (siehe lib/ics.js).
function eintragInEigenenKalender(e) {
  // Die eingetragene Uhrzeit ist deutsche Zeit — nicht die des Geräts, das
  // die Datei erzeugt (siehe lib/woche.js).
  const start = zeitpunktInBerlin(e.von, e.uhrzeit);
  ladeIcsHerunter(start
    ? {
        uid: `org-event-${e.id}@hb-sales-academy.de`,
        titel: e.titel,
        beschreibung: e.beschreibung || "",
        start,
        dauerMinuten: 60,
      }
    : {
        uid: `org-event-${e.id}@hb-sales-academy.de`,
        titel: e.titel,
        beschreibung: e.beschreibung || "",
        tagVon: e.von,
        tagBis: e.bis || e.von,
      });
}

function terminInEigenenKalender(t) {
  ladeIcsHerunter({
    uid: `lead-${t.id}@hb-sales-academy.de`,
    // Wer den Termin gelegt hat, steht im Titel — im fremden Kalender sieht
    // man oft nur diese eine Zeile.
    titel: `Termin: ${t.name}${t.autor ? ` von ${t.autor}` : ""}`,
    beschreibung: t.company ? `Firma: ${t.company}` : "",
    start: t.appointment_at,
    dauerMinuten: 60,
  });
}
