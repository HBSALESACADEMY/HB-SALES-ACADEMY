import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import MehrfachAuswahl from "../components/MehrfachAuswahl";
import MailVorlagen from "../components/MailVorlagen";
import FilterAuswahl from "../components/FilterAuswahl";
import Aufklapper from "../components/Aufklapper";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { istFuehrungsrolle } from "../lib/rollen";
import { getActiveOrgId } from "../lib/activeOrg";
import { aendereGeprueft, loescheGeprueft } from "../lib/loeschen";
import { EMAIL_STATUS, STATUS_REIHENFOLGE, istErledigt, marketingQuote, gueltigeAdresse } from "../lib/emailKontakt";
import {
  fuelleVorlage, fertigeMail, brauchtNachfassen, liegtSeitTagen, NACHFASSEN_AB_TAGEN,
  BEISPIEL_KONTAKT, vorlagenErfolg, werteFuerKontakt,
} from "../lib/marketingVorlage";
import { deutscheZeit } from "../lib/terminzeit";
import { downloadCsv } from "../lib/csv";
import { feldFarbe } from "../lib/diagrammFarben";
import { resolveLeadFields, resolveCoreRequired } from "../lib/leadFields";

// E-Mail Marketing: die Kontakte, die im Gespräch um eine Mail gebeten
// haben (migration_138).
//
// Der Reiter ist Führungsstoff — die Vertriebler erfassen ihre Kontakte im
// Call Tracker und sehen sie dort. Hier wird verschickt und nachgehalten.
export default function EmailMarketing() {
  const [darf, setDarf] = useState(null);
  const [kontakte, setKontakte] = useState([]);
  const [personen, setPersonen] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [nurOffene, setNurOffene] = useState(true);
  const [wer, setWer] = useState([]);
  const [ich, setIch] = useState(null);
  // Führung sieht und macht alles; Vertriebler sehen ihre eigenen Kontakte
  // und dürfen sie korrigieren, solange nichts rausgegangen ist.
  const [leitung, setLeitung] = useState(false);
  // Für welchen Kontakt gerade ein Termin eingetragen wird.
  const [terminFuer, setTerminFuer] = useState(null);
  const [terminZeit, setTerminZeit] = useState("");
  // Welcher Kontakt gerade bearbeitet wird, und der Entwurf dazu.
  const [bearbeite, setBearbeite] = useState(null);
  const [entwurf, setEntwurf] = useState(null);
  const [terminBusy, setTerminBusy] = useState(false);
  const [vergangenheit, setVergangenheit] = useState(null);
  // Mail schreiben: Vorlagen der Organisation, Entwurf, Versand.
  const [vorlagen, setVorlagen] = useState([]);
  const [orgName, setOrgName] = useState("");
  const [mailFuer, setMailFuer] = useState(null);
  const [mail, setMail] = useState({ betreff: "", text: "" });
  const [mailVorlage, setMailVorlage] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [nurNachfassen, setNurNachfassen] = useState(false);
  const [org, setOrg] = useState(null);
  const [terminDaten, setTerminDaten] = useState(null);
  // Vorlagen hier verwalten, nicht nur in der Verwaltung: dass eine fehlt,
  // merkt man beim Schreiben — und dann will man nicht erst die Seite
  // wechseln und den Kontakt wiederfinden.
  const [vorlagenOffen, setVorlagenOffen] = useState(false);
  const [vorlagenEntwurf, setVorlagenEntwurf] = useState(null);
  const [vorlagenBusy, setVorlagenBusy] = useState(false);
  const [signatur, setSignatur] = useState("");
  const [anhaenge, setAnhaenge] = useState([]);
  const [gewaehlteAnhaenge, setGewaehlteAnhaenge] = useState([]);
  const [anhangBusy, setAnhangBusy] = useState(false);
  const [probeStand, setProbeStand] = useState(null);
  // Ob der Versand überhaupt eingerichtet ist. Der Knopf steht auch in der
  // Verwaltung — aber gebraucht wird er hier, wo man Mails verschickt.
  const [testStand, setTestStand] = useState(null);
  const [testBusy, setTestBusy] = useState(false);
  // Welcher Kontakt aufgeklappt ist. Eine Liste, in der jeder Eintrag einen
  // halben Bildschirm füllt, ist keine Liste — man scrollt an dem vorbei,
  // was man sucht.
  const [offenerKontakt, setOffenerKontakt] = useState(null);

  async function laden() {
    setLaedt(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setDarf(false); setLaedt(false); return; }
    setIch(session.user.id);

    const { data: profil } = await supabase.from("profiles")
      .select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    // Auch Vertriebler dürfen hierher: sie sehen ihre eigenen Kontakte —
    // dafür sorgen die Zugriffsregeln, nicht diese Seite. Wer einen Kontakt
    // erarbeitet hat, soll sehen, was daraus wird.
    const fuehrung = istFuehrungsrolle(profil);
    setLeitung(fuehrung);
    setDarf(true);

    const orgId = getActiveOrgId(profil);
    const [{ data: zeilen, error: err }, { data: leute }] = await Promise.all([
      // Der Name des Erfassers kommt MIT der Zeile. Über die Organisation
      // allein ginge es nicht: wer per Firmencode hier arbeitet, hat eine
      // andere Heimat-Organisation und stand deshalb als "Unbenannt" da —
      // ausgerechnet bei den Kontakten, die man selbst erfasst hat.
      supabase.from("email_kontakte")
        .select("*, erfasser:user_id(full_name), versender:verschickt_von(full_name)")
        .is("geloescht_am", null)
        .order("created_at", { ascending: false }).limit(1000),
      fuehrung
        ? supabase.from("profiles").select("id, full_name").eq("organization_id", orgId)
        : Promise.resolve({ data: [] }),
    ]);
    const { data: org } = await supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
    // Die Kennung wird zum Speichern der Vorlagen gebraucht.
    setVorlagen(Array.isArray(org?.email_vorlagen) ? org.email_vorlagen : []);
    setOrgName(org?.name || "");
    // Dieselben Felder wie im Call Tracker — ein Termin aus dem Marketing
    // ist kein Termin zweiter Klasse.
    setOrg(org || null);
    setSignatur(org?.email_signatur || "");
    const { data: dateien } = await supabase.from("email_anhaenge")
      .select("*").order("created_at", { ascending: false });
    setAnhaenge(dateien || []);
    if (err) setFehler(err.message);
    setKontakte(zeilen || []);

    // Für den Filter: die Organisation plus alle, die tatsächlich Kontakte
    // erfasst haben. Sonst fehlt im Filter genau die Person, deren Kontakte
    // in der Liste stehen.
    const ausKontakten = new Map();
    (zeilen || []).forEach((k) => {
      if (k.user_id && !ausKontakten.has(k.user_id)) {
        ausKontakten.set(k.user_id, k.erfasser?.full_name || "Unbenannt");
      }
    });
    (leute || []).forEach((p) => ausKontakten.set(p.id, p.full_name || "Unbenannt"));
    setPersonen([...ausKontakten].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    setLaedt(false);
  }

  useEffect(() => { laden(); }, []);

  // Status setzen. Über aendereGeprueft, weil eine abgelehnte Änderung sonst
  // nichts meldet und der Haken beim nächsten Laden einfach wieder weg wäre.
  async function setzeStatus(kontakt, status) {
    const jetzt = new Date().toISOString();
    const patch = { status };
    if (status === "verschickt") { patch.verschickt_am = jetzt; patch.verschickt_von = ich; }
    if (istErledigt(status)) patch.ergebnis_am = jetzt;

    setKontakte((prev) => prev.map((k) => (k.id === kontakt.id ? { ...k, ...patch } : k)));
    const err = await aendereGeprueft(
      supabase.from("email_kontakte").update(patch).eq("id", kontakt.id),
      "Diesen Kontakt darf nur die Leitung der Organisation ändern."
    );
    if (err) { setFehler(err); laden(); }
  }

  // Wird ein Termin daraus, entsteht ein ECHTER Termin beim ursprünglichen
  // Vertriebler — mit Kalender, Benachrichtigung und Zählung. Sonst hätte
  // man zwei Systeme mit Terminen, die nie zusammenkommen.
  //
  // Über den Server, nicht aus dem Browser: der Termin gehört einer ANDEREN
  // Person, und daran hängen Rechte, Benachrichtigungen und die Frage, in
  // wessen Statistik er landet.
  // Das Formular öffnen — vorbefüllt mit dem, was aus dem Gespräch bekannt
  // ist. Was fehlt, muss ergänzt werden: es sind dieselben Pflichtfelder wie
  // im Call Tracker.
  function starteTermin(k) {
    setTerminFuer(k.id);
    setTerminZeit("");
    setVergangenheit(null);
    setFehler("");
    setTerminDaten({
      name: k.name || "",
      phone: k.telefon || "",
      email: k.email || "",
      fields: { company: k.firma || "" },
    });
  }

  async function macheTermin(kontakt, wann, trotzdem = false) {
    const zeitpunkt = new Date(wann);
    if (!wann || Number.isNaN(zeitpunkt.getTime())) { setFehler("Bitte einen Zeitpunkt wählen."); return; }
    setFehler("");
    setTerminBusy(true);
    try {
      await apiPost("/api/marketing-termin", {
        kontaktId: kontakt.id, zeitpunkt: zeitpunkt.toISOString(), trotzdem, daten: terminDaten,
      });
      setTerminFuer(null);
      setTerminZeit("");
      setVergangenheit(null);
      setTerminDaten(null);
      await laden();
    } catch (e) {
      // Ein Zeitpunkt in der Vergangenheit ist fast immer ein Tippfehler im
      // Datum — die Route fragt zurück, statt stumm anzulegen.
      if (/Vergangenheit/i.test(e?.message || "")) setVergangenheit({ id: kontakt.id, wann, text: e.message });
      else setFehler(e?.message || "Der Termin konnte nicht angelegt werden.");
    }
    setTerminBusy(false);
  }

  // Bearbeiten ist kein Luxus: ein Tippfehler in der Adresse macht den
  // ganzen Kontakt wertlos, und wer ihn im Gespräch aufgeschnappt hat, kann
  // ihn hinterher nicht mehr korrigieren.
  function starteBearbeiten(k) {
    setBearbeite(k.id);
    setEntwurf({
      anrede: k.anrede || "", name: k.name || "", email: k.email || "", firma: k.firma || "",
      telefon: k.telefon || "", notiz: k.notiz || "",
    });
    setFehler("");
  }

  async function speichereBearbeitung(k) {
    if (!entwurf.name.trim()) { setFehler("Der Name darf nicht leer sein."); return; }
    if (!gueltigeAdresse(entwurf.email)) { setFehler("Bitte eine gültige E-Mail-Adresse eintragen."); return; }
    const patch = {
      anrede: entwurf.anrede === "herr" || entwurf.anrede === "frau" ? entwurf.anrede : null,
      name: entwurf.name.trim(),
      email: entwurf.email.trim(),
      firma: entwurf.firma.trim() || null,
      telefon: entwurf.telefon.trim() || null,
      notiz: entwurf.notiz.trim() || null,
    };
    setKontakte((prev) => prev.map((x) => (x.id === k.id ? { ...x, ...patch } : x)));
    const err = await aendereGeprueft(
      supabase.from("email_kontakte").update(patch).eq("id", k.id),
      "Diesen Kontakt darf nur die Leitung der Organisation ändern."
    );
    if (err) { setFehler(err); laden(); return; }
    setBearbeite(null);
    setEntwurf(null);
  }

  // Löschen ist endgültig und betrifft die Arbeit einer anderen Person —
  // deshalb wird der Name in der Rückfrage genannt.
  async function loesche(k) {
    if (!confirm(`Kontakt „${k.name}" in den Papierkorb legen? Er wurde von ${nameVon(k.user_id, k.erfasser?.full_name)} erfasst.`)) return;
    setKontakte((prev) => prev.filter((x) => x.id !== k.id));
    // Papierkorb statt endgültig (migration_145) — der eine Fehlklick soll
    // nicht die Arbeit eines anderen vernichten.
    const err = await aendereGeprueft(
      supabase.from("email_kontakte").update({ geloescht_am: new Date().toISOString() }).eq("id", k.id),
      "Diesen Kontakt darf nur die Leitung der Organisation löschen."
    );
    if (err) { setFehler(err); laden(); }
  }

  // Mail schreiben. Die Vorlage wird beim Öffnen gefüllt, nicht erst beim
  // Senden: man soll sehen, was rausgeht, und es noch ändern können.
  function werteFuer(k) {
    return werteFuerKontakt(k, {
      vertriebler: nameVon(k.user_id, k.erfasser?.full_name),
      organisation: orgName,
    });
  }

  function starteMail(k, vorlage = null) {
    const werte = werteFuer(k);
    // Signatur gleich mit: man soll sehen, was rausgeht — und nicht erst
    // beim Kunden merken, dass die Anschrift fehlt oder doppelt dasteht.
    const fertig = vorlage
      ? fertigeMail(vorlage, werte, signatur)
      : { betreff: `Ihre Anfrage${k.firma ? ` – ${k.firma}` : ""}`, text: signatur ? fuelleVorlage(signatur, werte) : "" };
    setMailFuer(k.id);
    setMailVorlage(vorlage?.name || "");
    setMail(fertig);
    // Die festen Anhänge der Vorlage sind sofort dabei — abwählbar, aber
    // man muss nicht daran denken.
    setGewaehlteAnhaenge((vorlage?.anhaenge || []).filter((id) => anhaenge.some((a) => a.id === id)));
    setProbeStand(null);
    setFehler("");
  }

  async function sendeMail(k, anMichSelbst = false) {
    if (!mail.betreff.trim() || !mail.text.trim()) { setFehler("Betreff und Text dürfen nicht leer sein."); return; }
    setMailBusy(true);
    setProbeStand(null);
    try {
      const antwort = await apiPost("/api/marketing-mail", {
        kontaktId: k.id,
        betreff: mail.betreff,
        text: mail.text,
        vorlage: mailVorlage || null,
        anhaenge: gewaehlteAnhaenge,
        anMichSelbst,
      });
      if (anMichSelbst) {
        // Der Kontakt bleibt unberührt: eine Probemail ist keine
        // verschickte Mail.
        setProbeStand(`Probemail ist raus an ${antwort.an}.`);
      } else {
        setMailFuer(null);
        setMail({ betreff: "", text: "" });
        setGewaehlteAnhaenge([]);
        await laden();
      }
    } catch (e) {
      setFehler(e?.message || "Die Mail konnte nicht verschickt werden.");
    }
    setMailBusy(false);
  }

  // Anhänge: direkt in den Speicher, wie bei den Aufnahmen — dazu ein
  // Eintrag, damit man sie beim Schreiben auswählen kann.
  async function ladeAnhangHoch(datei) {
    if (!datei || !org?.id) return;
    if (datei.size > 4 * 1024 * 1024) {
      setFehler("Die Datei ist grösser als 4 MB — viele Postfächer lehnen das ab.");
      return;
    }
    setAnhangBusy(true);
    setFehler("");
    const pfad = `${org.id}/${Date.now()}-${datei.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("email-anhaenge").upload(pfad, datei);
    if (upErr) { setFehler(upErr.message); setAnhangBusy(false); return; }
    const { data: eintrag, error } = await supabase.from("email_anhaenge").insert({
      organization_id: org.id, name: datei.name, pfad, groesse: datei.size,
    }).select().single();
    if (error) setFehler(error.message);
    else setAnhaenge((prev) => [eintrag, ...prev]);
    setAnhangBusy(false);
  }

  async function loescheAnhang(a) {
    if (!confirm(`Anhang „${a.name}" löschen?`)) return;
    await supabase.storage.from("email-anhaenge").remove([a.pfad]);
    const err = await loescheGeprueft(
      supabase.from("email_anhaenge").delete().eq("id", a.id),
      "Anhänge verwaltet die Leitung der Organisation."
    );
    if (err) setFehler(err);
    else setAnhaenge((prev) => prev.filter((x) => x.id !== a.id));
  }

  async function speichereVorlagen() {
    setVorlagenBusy(true);
    setFehler("");
    // Unvollständige verwerfen: eine Vorlage ohne Text steht sonst in der
    // Auswahl und liefert eine leere Mail.
    const sauber = (vorlagenEntwurf || [])
      .filter((v) => v.name?.trim() && v.text?.trim())
      // Verweise auf gelöschte Dateien mitschleppen hiesse: die Mail
      // scheitert später an einem Anhang, den es nicht mehr gibt.
      .map((v) => ({ ...v, anhaenge: (v.anhaenge || []).filter((id) => anhaenge.some((a) => a.id === id)) }));
    const err = await aendereGeprueft(
      supabase.from("organizations")
        .update({ email_vorlagen: sauber, email_signatur: signatur.trim() || null })
        .eq("id", org?.id),
      "Vorlagen darf nur die Leitung der Organisation ändern."
    );
    if (err) setFehler(err);
    else {
      setVorlagen(sauber);
      setVorlagenEntwurf(null);
      setVorlagenOffen(false);
    }
    setVorlagenBusy(false);
  }

  const gefiltert = kontakte.filter((k) => {
    if (nurNachfassen) return brauchtNachfassen(k);
    if (nurOffene && istErledigt(k.status)) return false;
    if (wer.length && !wer.includes(k.user_id)) return false;
    return true;
  });

  // Der Name aus der Zeile selbst hat Vorrang — er stammt aus derselben
  // Abfrage und ist auch dann da, wenn die Person nicht zur Organisation
  // dieses Firmencodes gehört.
  const nameVon = (id, mitgeliefert) =>
    mitgeliefert || personen.find((p) => p.id === id)?.name || "Unbenannt";
  const quote = marketingQuote(kontakte);

  function exportiere() {
    downloadCsv(
      `email-marketing-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "E-Mail", "Firma", "Telefon", "Von", "Notiz", "Status", "Erfasst"],
      gefiltert.map((k) => [
        k.name, k.email, k.firma || "", k.telefon || "", nameVon(k.user_id, k.erfasser?.full_name),
        k.notiz || "", EMAIL_STATUS[k.status] || k.status,
        new Date(k.created_at).toLocaleDateString("de-DE"),
      ])
    );
  }


  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">E-Mail Marketing</h1>
      <div className="brand-stripe w-16 mb-4" />

      <div className="card mb-4">
        <p className="text-xs text-textMuted">
          Kontakte, die im Gespräch um eine E-Mail gebeten haben. Verschickte Mails ohne Ergebnis melden sich
          nach {NACHFASSEN_AB_TAGEN} Tagen von selbst — einmal, nicht täglich. Erfasst werden sie von den Vertrieblern im
          Call Tracker — hier werden sie verschickt und nachgehalten. Wird ein Termin daraus, entsteht ein
          echter Termin, der beim ursprünglichen Vertriebler zählt.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { label: "Offen", wert: kontakte.filter((k) => k.status === "offen").length, farbe: "#C9A227" },
          { label: "Verschickt", wert: kontakte.filter((k) => k.status === "verschickt").length, farbe: feldFarbe("erreicht") },
          { label: "Termine daraus", wert: kontakte.filter((k) => k.status === "termin").length, farbe: feldFarbe("termin") },
          { label: "Trefferquote", wert: quote === null ? "—" : `${quote} %`, farbe: feldFarbe("anwahlen"), hinweis: "Termine je bearbeitetem Kontakt" },
        ].map((k) => (
          <div key={k.label} className="card !py-3">
            <div className="text-xl font-display font-semibold" style={{ color: k.farbe }}>{k.wert}</div>
            <div className="text-[11px] text-textMuted leading-tight">{k.label}</div>
            {k.hinweis && <div className="text-[10px] text-textMuted leading-tight mt-0.5">{k.hinweis}</div>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Ein Filter statt zweier Knöpfe, die sich gegenseitig
            ausschalten — welche Kombination gerade gilt, musste man sonst
            aus zwei Zuständen zusammenreimen. */}
        <FilterAuswahl
          etikett="Zeigen:"
          wert={nurNachfassen ? "nachfassen" : nurOffene ? "offen" : "alle"}
          onChange={(v) => { setNurNachfassen(v === "nachfassen"); setNurOffene(v === "offen"); }}
          optionen={[
            { wert: "offen", label: "Nur offene", anzahl: kontakte.filter((k) => !istErledigt(k.status)).length },
            { wert: "nachfassen", label: "Braucht Nachfassen", anzahl: kontakte.filter((k) => brauchtNachfassen(k)).length },
            { wert: "alle", label: "Alle", anzahl: kontakte.length },
          ]}
        />
        {leitung && personen.length > 1 && (
          <>
            <span className="text-[11px] text-textMuted">Von:</span>
            <MehrfachAuswahl eintraege={personen} ausgewaehlt={wer} onChange={setWer} alleText="Alle Vertriebler" />
          </>
        )}
        <button onClick={exportiere} className="btn-ghost text-xs ml-auto">
          <Icon name="download" size={12} /> Für Excel
        </button>
      </div>

      {/* Vorlagen: hier zu bearbeiten und nicht nur in der Verwaltung, weil
          man beim Schreiben merkt, dass eine fehlt. Dieselbe Komponente und
          dasselbe Feld wie dort — zwei Masken für dieselbe Sache wären der
          sichere Weg zu zwei verschiedenen Verhaltensweisen. */}
      <div className="card mb-4">
        <button
          onClick={() => {
            setVorlagenOffen((v) => !v);
            if (!vorlagenEntwurf) setVorlagenEntwurf(vorlagen.map((v) => ({ ...v })));
          }}
          aria-expanded={vorlagenOffen}
          className="flex items-center gap-2 w-full text-left">
          <span className="font-semibold text-textMain text-sm flex-1">
            Mail-Vorlagen ({vorlagen.length})
          </span>
          <span className={`text-textMuted text-xs transition-transform ${vorlagenOffen ? "rotate-90" : ""}`}>›</span>
        </button>
        {/* Direkt sichtbar, was es gibt — man soll nicht aufklappen müssen,
            um zu wissen, ob eine passende Vorlage existiert. */}
        {!vorlagenOffen && (
          <div className="flex flex-col gap-1.5 mt-2">
            {vorlagen.length === 0 && (
              <p className="text-xs text-textMuted">
                Noch keine Vorlage. Ohne Vorlage schreibt jeder seinen eigenen Text — aufklappen und anlegen.
              </p>
            )}
            {vorlagen.map((v) => {
              const erfolg = vorlagenErfolg(kontakte).find((e) => e.name === v.name);
              return (
                <div key={v.name} className="flex items-start gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="text-textMain">{v.name}</div>
                    <div className="text-[11px] text-textMuted truncate">{v.betreff || "(kein Betreff)"}</div>
                  </div>
                  {erfolg && (
                    <span className="text-[11px] text-textMuted flex-shrink-0">
                      {erfolg.verschickt}× verschickt
                      {erfolg.quote !== null ? ` · ${erfolg.quote} % Termine` : ""}
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      // Der reine Text in die Zwischenablage — für alle,
                      // die ausserhalb der Academy schreiben.
                      try {
                        await navigator.clipboard.writeText(`${v.betreff || ""}\n\n${v.text || ""}`.trim());
                        setProbeStand("Vorlage kopiert.");
                        setTimeout(() => setProbeStand(null), 2500);
                      } catch (e) { setFehler("Kopieren war nicht möglich."); }
                    }}
                    className="btn-ghost text-[11px] flex-shrink-0">Kopieren</button>
                  <button
                    onClick={() => {
                      const kopie = { ...v, name: `${v.name} (Kopie)` };
                      setVorlagenEntwurf([...(vorlagenEntwurf || vorlagen), kopie]);
                      setVorlagenOffen(true);
                    }}
                    className="btn-ghost text-[11px] flex-shrink-0">Duplizieren</button>
                </div>
              );
            })}
            {probeStand && <p className="text-[11px] text-teal">{probeStand}</p>}
          </div>
        )}

        <Aufklapper offen={vorlagenOffen}>
          <div className="mt-3">
            <MailVorlagen vorlagen={vorlagenEntwurf || []} onChange={setVorlagenEntwurf} anhaenge={anhaenge} signatur={signatur} />

            {/* Die Vorschau: der fertige Text mit einem erfundenen Kontakt.
                So sieht man Anrede, Absätze und Signatur, bevor eine echte
                Mail rausgeht. */}
            {(vorlagenEntwurf || []).filter((v) => v.text?.trim()).length > 0 && (
              <div className="card mt-3">
                <div className="text-xs text-textMain font-semibold mb-2">Vorschau mit Beispielkontakt</div>
                {(vorlagenEntwurf || []).filter((v) => v.text?.trim()).map((v, i) => {
                  const fertig = fertigeMail(v, { ...BEISPIEL_KONTAKT, vertriebler: "Beispiel Vertrieblerin", organisation: orgName }, signatur);
                  return (
                    <div key={i} className="mb-3">
                      <div className="text-[11px] text-textMuted mb-1">{v.name || "(ohne Namen)"} · Betreff: {fertig.betreff}</div>
                      <pre className="text-[11px] text-textMain whitespace-pre-wrap bg-surfaceRaised rounded-lg px-3 py-2">{fertig.text}</pre>
                    </div>
                  );
                })}
              </div>
            )}

            <label className="block text-xs text-textMuted mt-4 mb-1">Standardschluss unter jeder Mail</label>
            <textarea className="input !py-1.5 text-xs" rows={4} value={signatur}
              onChange={(e) => setSignatur(e.target.value)}
              placeholder={"Viele Grüße\n{{vertriebler}}\n{{organisation}}\nMusterstraße 1, 12345 Musterstadt"} />
            <p className="text-[11px] text-textMuted mt-1 mb-2">
              Kommt automatisch unter jede Mail — Signatur, Anschrift, Abmeldehinweis. Bei Werbemails an
              Geschäftskontakte gehört ein Absender mit Anschrift dazu, und an einer Stelle gepflegt ist das
              billiger, als es später in acht Vorlagen nachzuziehen.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={speichereVorlagen} disabled={vorlagenBusy} className="btn text-xs disabled:opacity-40">
                {vorlagenBusy ? "Wird gespeichert…" : "Vorlagen speichern"}
              </button>
              <button onClick={() => { setVorlagenEntwurf(vorlagen.map((v) => ({ ...v }))); setVorlagenOffen(false); }}
                className="btn-ghost text-xs">Abbrechen</button>
              <span className="text-[11px] text-textMuted">
                Gilt für die ganze Organisation — auch in der Verwaltung unter Organisation → E-Mail.
              </span>
            </div>

            {/* Anhänge: einmal hochladen, bei jeder Mail auswählbar. */}
            <div className="mt-4 pt-4 border-t border-line">
              <div className="text-xs text-textMain font-semibold mb-2">Anhänge</div>
              <div className="flex flex-col gap-1.5 mb-2">
                {anhaenge.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <span className="text-textMain flex-1 truncate">{a.name}</span>
                    <span className="text-[11px] text-textMuted flex-shrink-0">
                      {a.groesse ? `${Math.round(a.groesse / 1024)} KB` : ""}
                    </span>
                    <button onClick={() => loescheAnhang(a)} className="btn-ghost text-[11px] text-coral">Löschen</button>
                  </div>
                ))}
                {anhaenge.length === 0 && <p className="text-[11px] text-textMuted">Noch keine Dateien.</p>}
              </div>
              <label className="btn-ghost text-xs cursor-pointer inline-block">
                {anhangBusy ? "Wird geladen…" : "+ Datei hochladen"}
                <input type="file" className="hidden" disabled={anhangBusy}
                  onChange={(e) => { ladeAnhangHoch(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <p className="text-[11px] text-textMuted mt-1">
                Höchstens 4 MB je Datei — grössere lehnen viele Postfächer ab, und dann kommt gar nichts an.
              </p>
            </div>
          </div>
        </Aufklapper>
      </div>

      {/* Eine falsche Absenderadresse legt den Versand still lahm. Wer hier
          Mails verschickt, soll das mit einem Klick prüfen können, statt es
          daran zu merken, dass eine Kundenmail nicht ankommt. */}
      {leitung && (
        <div className="card mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-textMain font-semibold">Versand prüfen</span>
            <span className="text-[11px] text-textMuted">
              Absender: {org?.email_absender || "Standardadresse der Academy"}
              {org?.email_antwort_an ? ` · Antworten an ${org.email_antwort_an}` : ""}
            </span>
            <button
              onClick={async () => {
                setTestBusy(true);
                setTestStand(null);
                try {
                  setTestStand(await apiPost("/api/test-mail", {}));
                } catch (e) {
                  setTestStand({ ok: false, text: e?.message || "Die Testmail konnte nicht ausgelöst werden." });
                }
                setTestBusy(false);
              }}
              disabled={testBusy}
              className="btn-ghost text-xs ml-auto disabled:opacity-40">
              {testBusy ? "Wird verschickt…" : "Testmail an mich senden"}
            </button>
          </div>
          {testStand && (
            <p className={`text-[11px] mt-2 ${testStand.ok ? "text-teal" : "text-coral"}`}>{testStand.text}</p>
          )}
          <p className="text-[11px] text-textMuted mt-2">
            Absender- und Antwortadresse stellst du unter Verwaltung → Organisation → E-Mail ein.
          </p>
        </div>
      )}

      {fehler && <div className="card mb-4 border-coral/40 text-sm text-coral">{fehler}</div>}
      {laedt && <p className="text-textMuted text-sm">Lädt...</p>}

      {!laedt && gefiltert.length === 0 && (
        <div className="card text-sm text-textMuted">
          {kontakte.length === 0
            ? "Noch keine Kontakte. Sie entstehen, wenn ein Vertriebler im Call Tracker „E-Mail gewünscht“ auswählt."
            : "Nichts Offenes in dieser Auswahl — mit „Alle anzeigen“ siehst du auch das Erledigte."}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {gefiltert.map((k) => (
          <div key={k.id} className="card !py-2.5">
            {/* Eine Zeile je Kontakt: Name, Firma, Status, Senden. Alles
                Weitere erst beim Aufklappen — sonst füllt ein einzelner
                Eintrag den Bildschirm und man findet nichts wieder. */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setOffenerKontakt(offenerKontakt === k.id ? null : k.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <span className={`text-textMuted text-xs transition-transform ${offenerKontakt === k.id ? "rotate-90" : ""}`}>›</span>
                <span className="font-semibold text-textMain text-sm truncate">{k.name}</span>
                {k.firma && <span className="text-xs text-textMuted truncate">{k.firma}</span>}
                {brauchtNachfassen(k) && (
                  <span className="text-[10px] text-amber flex-shrink-0">{liegtSeitTagen(k.verschickt_am)} T.</span>
                )}
              </button>

              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border text-textMuted border-line flex-shrink-0">
                {EMAIL_STATUS[k.status] || k.status}
              </span>

              {/* Der Versand-Knopf steht an JEDEM Eintrag, nicht nur bei den
                  offenen: auch ein Kontakt, der schon eine Mail bekommen
                  hat, braucht manchmal eine zweite. */}
              {leitung && mailFuer !== k.id && (
                <button onClick={() => { setOffenerKontakt(k.id); starteMail(k, vorlagen[0] || null); }}
                  className="btn text-xs flex-shrink-0" title={`Mail an ${k.email}`}>
                  ✉️ Senden
                </button>
              )}
            </div>

            {offenerKontakt !== k.id && mailFuer !== k.id ? null : (
            <div className="mt-2">
            {/* Wurde ein Termin daraus, führt der Weg dorthin — sonst
                sucht man ihn in der Terminliste zusammen. */}
            {k.lead_id && (
              <a href={`/termine?leadId=${k.lead_id}`} className="inline-block text-[11px] text-amber hover:underline mb-2">
                → zum Termin
              </a>
            )}
            {/* Die Mail selbst — mit Vorlage vorbefüllt, aber änderbar:
                man soll sehen, was rausgeht. */}
            {mailFuer === k.id && (
              <div className="mb-3">
                {vorlagen.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className="text-[11px] text-textMuted">Vorlage:</span>
                    {vorlagen.map((v, i) => (
                      <button key={i} onClick={() => starteMail(k, v)} className="btn-ghost text-[11px]">
                        {v.name}
                      </button>
                    ))}
                    <button onClick={() => starteMail(k, null)} className="btn-ghost text-[11px] text-textMuted">
                      Leer
                    </button>
                  </div>
                )}
                <input className="input !py-1.5 text-xs mb-2" placeholder="Betreff"
                  value={mail.betreff} onChange={(e) => setMail((d) => ({ ...d, betreff: e.target.value }))} />
                <textarea className="input !py-1.5 text-xs" rows={8} placeholder="Text der Mail"
                  value={mail.text} onChange={(e) => setMail((d) => ({ ...d, text: e.target.value }))} />
                {anhaenge.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <span className="text-[11px] text-textMuted">Anhänge:</span>
                    {anhaenge.map((a) => {
                      const an = gewaehlteAnhaenge.includes(a.id);
                      return (
                        <button key={a.id}
                          onClick={() => setGewaehlteAnhaenge((prev) => (an ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                          className={`px-2 py-1 rounded-full text-[11px] border ${an ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
                          {an ? "✓ " : ""}{a.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <button onClick={() => sendeMail(k)} disabled={mailBusy} className="btn text-xs disabled:opacity-40">
                    {mailBusy ? "Wird verschickt…" : `An ${k.email} senden`}
                  </button>
                  {/* Die Sicherheitsstufe vor dem Ernstfall: dieselbe Mail,
                      derselbe Absender, nur an dich. Am Kontakt ändert das
                      nichts. */}
                  <button onClick={() => sendeMail(k, true)} disabled={mailBusy} className="btn-ghost text-xs disabled:opacity-40">
                    Erst an mich selbst
                  </button>
                  <button onClick={() => setMailFuer(null)} className="btn-ghost text-xs">Abbrechen</button>
                  <span className="text-[11px] text-textMuted w-full">
                    Geht im Namen von {orgName || "eurer Organisation"} raus. Nach dem Versand steht der Kontakt
                    automatisch auf „verschickt“ — mit Zeitpunkt und Betreff in der Notiz.
                    {signatur ? " Der Standardschluss steht schon im Text." : ""}
                  </span>
                  {probeStand && <span className="text-[11px] text-teal w-full">{probeStand}</span>}
                </div>
              </div>
            )}

            {bearbeite === k.id ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  {[["", "—"], ["frau", "Frau"], ["herr", "Herr"]].map(([wert, label]) => (
                    <button key={wert || "leer"} type="button"
                      onClick={() => setEntwurf((d) => ({ ...d, anrede: wert }))}
                      className={`px-2 py-1.5 rounded-lg text-xs border flex-1 ${entwurf.anrede === wert ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <input className="input !py-1.5 text-xs" placeholder="Name" value={entwurf.name}
                  onChange={(e) => setEntwurf((d) => ({ ...d, name: e.target.value }))} />
                <input className="input !py-1.5 text-xs" placeholder="E-Mail" type="email" value={entwurf.email}
                  onChange={(e) => setEntwurf((d) => ({ ...d, email: e.target.value }))} />
                <input className="input !py-1.5 text-xs" placeholder="Firma" value={entwurf.firma}
                  onChange={(e) => setEntwurf((d) => ({ ...d, firma: e.target.value }))} />
                <input className="input !py-1.5 text-xs" placeholder="Telefon" type="tel" value={entwurf.telefon}
                  onChange={(e) => setEntwurf((d) => ({ ...d, telefon: e.target.value }))} />
                <textarea className="input !py-1.5 text-xs sm:col-span-2" rows={3} placeholder="Gesprächsnotiz"
                  value={entwurf.notiz} onChange={(e) => setEntwurf((d) => ({ ...d, notiz: e.target.value }))} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap text-xs text-textMuted mb-2">
                  <a href={`mailto:${k.email}`} className="text-amber hover:underline">{k.email}</a>
                  {k.telefon && <span>{k.telefon}</span>}
                </div>
                {/* Wer den Kontakt erarbeitet hat, steht in einer eigenen
                    Zeile: daran hängt, wem der Termin später gehört. */}
                <div className="text-[11px] text-textMuted mb-2">
                  Angelegt von <span className="text-textMain">{nameVon(k.user_id, k.erfasser?.full_name)}</span> am {deutscheZeit(k.created_at)} Uhr
                  {brauchtNachfassen(k) && (
                    <span className="text-amber"> · seit {liegtSeitTagen(k.verschickt_am)} Tagen ohne Antwort</span>
                  )}
                </div>
                {k.notiz && <p className="text-xs text-textMain bg-surfaceRaised rounded-lg px-3 py-2 mb-2">{k.notiz}</p>}
                {/* Was verschickt wurde, getrennt von dem, was im Gespräch
                    gesagt wurde — sonst wächst die Notiz mit jedem Versand
                    und landet in der nächsten Mail. */}
                {k.letzter_betreff && (
                  <p className="text-[11px] text-textMuted mb-2">
                    Zuletzt verschickt: „{k.letzter_betreff}"
                  </p>
                )}
              </>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {bearbeite === k.id ? (
                <>
                  <button onClick={() => speichereBearbeitung(k)} className="btn text-xs">Speichern</button>
                  <button onClick={() => { setBearbeite(null); setEntwurf(null); }} className="btn-ghost text-xs">Abbrechen</button>
                </>
              ) : (
                <>
                  {/* Nach dem Versand liegt die Mail beim Kunden — was dort
                      stand, ändert niemand mehr rückwirkend. Für die Leitung
                      bleibt es offen, sie muss Tippfehler korrigieren
                      können. */}
                  {(leitung || k.status === "offen") && (
                    <button onClick={() => starteBearbeiten(k)} className="btn-ghost text-xs">Bearbeiten</button>
                  )}
                  <button onClick={() => loesche(k)} className="btn-ghost text-xs text-coral">Löschen</button>
                  {!leitung && k.status !== "offen" && (
                    <span className="text-[11px] text-textMuted">
                      Die Mail ist raus — Änderungen macht ab hier die Leitung.
                    </span>
                  )}
                </>
              )}
              {leitung && bearbeite !== k.id && k.status === "offen" && (
                <button onClick={() => setzeStatus(k, "verschickt")} className="btn text-xs">
                  ✓ Mail verschickt
                </button>
              )}
              {leitung && bearbeite !== k.id && k.status !== "offen" && k.status !== "termin" && terminFuer !== k.id && (
                <button onClick={() => starteTermin(k)} className="btn text-xs">
                  Termin daraus geworden
                </button>
              )}
              {terminFuer === k.id && (
                <div className="flex items-center gap-2 flex-wrap w-full">
                  {/* Dieselben Felder wie im Call Tracker, samt der
                      Pflichtangaben dieser Organisation. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mb-1">
                    <div>
                      <label className="block text-[11px] text-textMuted mb-1">Name *</label>
                      <input className="input !py-1.5 text-xs" value={terminDaten?.name || ""}
                        onChange={(e) => setTerminDaten((d) => ({ ...d, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-[11px] text-textMuted mb-1">
                        Telefon{resolveCoreRequired(org).phone ? " *" : ""}
                      </label>
                      <input className="input !py-1.5 text-xs" type="tel" value={terminDaten?.phone || ""}
                        onChange={(e) => setTerminDaten((d) => ({ ...d, phone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-[11px] text-textMuted mb-1">
                        E-Mail{resolveCoreRequired(org).email ? " *" : ""}
                      </label>
                      <input className="input !py-1.5 text-xs" type="email" value={terminDaten?.email || ""}
                        onChange={(e) => setTerminDaten((d) => ({ ...d, email: e.target.value }))} />
                    </div>
                    {resolveLeadFields(org).filter((f) => f.type !== "checkbox" && !f.multiline).map((f) => (
                      <div key={f.key}>
                        <label className="block text-[11px] text-textMuted mb-1">{f.label}{f.required ? " *" : ""}</label>
                        <input className="input !py-1.5 text-xs" value={terminDaten?.fields?.[f.key] || ""}
                          onChange={(e) => setTerminDaten((d) => ({ ...d, fields: { ...d.fields, [f.key]: e.target.value } }))} />
                      </div>
                    ))}
                    {resolveLeadFields(org).filter((f) => f.multiline).map((f) => (
                      <div key={f.key} className="sm:col-span-2">
                        <label className="block text-[11px] text-textMuted mb-1">{f.label}{f.required ? " *" : ""}</label>
                        <textarea className="input !py-1.5 text-xs" rows={2} value={terminDaten?.fields?.[f.key] || ""}
                          onChange={(e) => setTerminDaten((d) => ({ ...d, fields: { ...d.fields, [f.key]: e.target.value } }))} />
                      </div>
                    ))}
                    {resolveLeadFields(org).filter((f) => f.type === "checkbox").map((f) => (
                      <label key={f.key} className="flex items-center gap-2 text-xs text-textMuted">
                        <input type="checkbox" checked={!!terminDaten?.fields?.[f.key]}
                          onChange={(e) => setTerminDaten((d) => ({ ...d, fields: { ...d.fields, [f.key]: e.target.checked } }))} />
                        {f.label}{f.required ? " *" : ""}
                      </label>
                    ))}
                  </div>
                  <label className="block text-[11px] text-textMuted w-full">Termin (Datum/Uhrzeit) *</label>
                  <input type="datetime-local" className="input !w-auto !py-1.5 text-xs"
                    value={terminZeit} onChange={(e) => setTerminZeit(e.target.value)} />
                  <button onClick={() => macheTermin(k, terminZeit)} disabled={terminBusy} className="btn text-xs disabled:opacity-40">
                    {terminBusy ? "Wird angelegt…" : "Termin anlegen"}
                  </button>
                  <button onClick={() => { setTerminFuer(null); setTerminDaten(null); }} className="btn-ghost text-xs">Abbrechen</button>
                  <span className="text-[11px] text-textMuted w-full">
                    Der Termin wird bei {nameVon(k.user_id, k.erfasser?.full_name)} angelegt — dort ist der Kontakt
                    entstanden. Er landet in deren Kalender und Statistik, und sie bekommt eine Nachricht darüber.
                  </span>
                  {vergangenheit?.id === k.id && (
                    <div className="w-full card border-amber/50">
                      <div className="text-xs text-textMain mb-2">{vergangenheit.text}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => macheTermin(k, vergangenheit.wann, true)} className="btn-ghost text-xs">
                          Ja, trotzdem anlegen
                        </button>
                        <button onClick={() => setVergangenheit(null)} className="btn-ghost text-xs text-textMuted">
                          Datum korrigieren
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {leitung && bearbeite !== k.id && STATUS_REIHENFOLGE.filter((s) => s !== k.status && s !== "termin" && !(s === "offen" && k.status !== "offen")).map((s) => (
                <button key={s} onClick={() => setzeStatus(k, s)} className="btn-ghost text-xs">
                  {EMAIL_STATUS[s]}
                </button>
              ))}
              {k.verschickt_am && (
                <span className="text-[11px] text-textMuted ml-auto">
                  verschickt {deutscheZeit(k.verschickt_am)} Uhr
                  {k.verschickt_von ? ` von ${nameVon(k.verschickt_von, k.versender?.full_name)}` : ""}
                </span>
              )}
            </div>
            </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
