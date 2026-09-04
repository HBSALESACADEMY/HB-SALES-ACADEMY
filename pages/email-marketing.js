import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import MehrfachAuswahl from "../components/MehrfachAuswahl";
import { supabase } from "../lib/supabaseClient";
import { istFuehrungsrolle } from "../lib/rollen";
import { getActiveOrgId } from "../lib/activeOrg";
import { aendereGeprueft, loescheGeprueft } from "../lib/loeschen";
import { EMAIL_STATUS, STATUS_REIHENFOLGE, istErledigt, marketingQuote, gueltigeAdresse } from "../lib/emailKontakt";
import { deutscheZeit } from "../lib/terminzeit";
import { downloadCsv } from "../lib/csv";
import { feldFarbe } from "../lib/diagrammFarben";

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
  // Für welchen Kontakt gerade ein Termin eingetragen wird.
  const [terminFuer, setTerminFuer] = useState(null);
  const [terminZeit, setTerminZeit] = useState("");
  // Welcher Kontakt gerade bearbeitet wird, und der Entwurf dazu.
  const [bearbeite, setBearbeite] = useState(null);
  const [entwurf, setEntwurf] = useState(null);

  async function laden() {
    setLaedt(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setDarf(false); setLaedt(false); return; }
    setIch(session.user.id);

    const { data: profil } = await supabase.from("profiles")
      .select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
    if (!istFuehrungsrolle(profil)) { setDarf(false); setLaedt(false); return; }
    setDarf(true);

    const orgId = getActiveOrgId(profil);
    const [{ data: zeilen, error: err }, { data: leute }] = await Promise.all([
      supabase.from("email_kontakte").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("profiles").select("id, full_name").eq("organization_id", orgId),
    ]);
    if (err) setFehler(err.message);
    setKontakte(zeilen || []);
    setPersonen((leute || []).map((p) => ({ id: p.id, name: p.full_name || "Unbenannt" })));
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

  // Wird ein Termin daraus, entsteht ein ECHTER Termin — mit Kalender,
  // Benachrichtigung und Zählung beim ursprünglichen Vertriebler. Sonst
  // hätte man zwei Systeme mit Terminen, die nie zusammenkommen.
  async function macheTermin(kontakt, wann) {
    const zeitpunkt = new Date(wann);
    if (!wann || Number.isNaN(zeitpunkt.getTime())) { setFehler("Bitte einen Zeitpunkt wählen."); return; }

    const { data: lead, error: err } = await supabase.from("leads").insert({
      // Der Termin gehört dem, der den Kontakt erarbeitet hat — nicht dem,
      // der die Mail verschickt hat.
      created_by: kontakt.user_id,
      organization_id: kontakt.organization_id,
      name: kontakt.name,
      email: kontakt.email,
      phone: kontakt.telefon,
      company: kontakt.firma,
      notes: kontakt.notiz ? `Aus E-Mail-Marketing.\n${kontakt.notiz}` : "Aus E-Mail-Marketing.",
      appointment_at: zeitpunkt.toISOString(),
      status: "geplant",
    }).select().single();

    if (err) { setFehler(err.message); return; }
    await supabase.from("email_kontakte").update({ lead_id: lead.id }).eq("id", kontakt.id);
    await setzeStatus(kontakt, "termin");
    setTerminFuer(null);
    setTerminZeit("");
  }

  // Bearbeiten ist kein Luxus: ein Tippfehler in der Adresse macht den
  // ganzen Kontakt wertlos, und wer ihn im Gespräch aufgeschnappt hat, kann
  // ihn hinterher nicht mehr korrigieren.
  function starteBearbeiten(k) {
    setBearbeite(k.id);
    setEntwurf({
      name: k.name || "", email: k.email || "", firma: k.firma || "",
      telefon: k.telefon || "", notiz: k.notiz || "",
    });
    setFehler("");
  }

  async function speichereBearbeitung(k) {
    if (!entwurf.name.trim()) { setFehler("Der Name darf nicht leer sein."); return; }
    if (!gueltigeAdresse(entwurf.email)) { setFehler("Bitte eine gültige E-Mail-Adresse eintragen."); return; }
    const patch = {
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
    if (!confirm(`Kontakt „${k.name}" wirklich löschen? Er wurde von ${nameVon(k.user_id)} erfasst und ist danach weg.`)) return;
    setKontakte((prev) => prev.filter((x) => x.id !== k.id));
    const err = await loescheGeprueft(
      supabase.from("email_kontakte").delete().eq("id", k.id),
      "Diesen Kontakt darf nur die Leitung der Organisation löschen."
    );
    if (err) { setFehler(err); laden(); }
  }

  const gefiltert = kontakte.filter((k) => {
    if (nurOffene && istErledigt(k.status)) return false;
    if (wer.length && !wer.includes(k.user_id)) return false;
    return true;
  });

  const nameVon = (id) => personen.find((p) => p.id === id)?.name || "Unbenannt";
  const quote = marketingQuote(kontakte);

  function exportiere() {
    downloadCsv(
      `email-marketing-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "E-Mail", "Firma", "Telefon", "Von", "Notiz", "Status", "Erfasst"],
      gefiltert.map((k) => [
        k.name, k.email, k.firma || "", k.telefon || "", nameVon(k.user_id),
        k.notiz || "", EMAIL_STATUS[k.status] || k.status,
        new Date(k.created_at).toLocaleDateString("de-DE"),
      ])
    );
  }

  if (darf === false) {
    return (
      <Layout>
        <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">E-Mail Marketing</h1>
        <div className="brand-stripe w-16 mb-4" />
        <div className="card text-sm text-textMuted">
          Dieser Bereich ist der Leitung vorbehalten. Deine eigenen Kontakte siehst du im Call Tracker.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">E-Mail Marketing</h1>
      <div className="brand-stripe w-16 mb-4" />

      <div className="card mb-4">
        <p className="text-xs text-textMuted">
          Kontakte, die im Gespräch um eine E-Mail gebeten haben. Erfasst werden sie von den Vertrieblern im
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
        <button onClick={() => setNurOffene((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${nurOffene ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
          {nurOffene ? "Nur offene" : "Alle anzeigen"}
        </button>
        {personen.length > 1 && (
          <>
            <span className="text-[11px] text-textMuted">Von:</span>
            <MehrfachAuswahl eintraege={personen} ausgewaehlt={wer} onChange={setWer} alleText="Alle Vertriebler" />
          </>
        )}
        <button onClick={exportiere} className="btn-ghost text-xs ml-auto">
          <Icon name="download" size={12} /> Für Excel
        </button>
      </div>

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
          <div key={k.id} className="card">
            <div className="flex items-start gap-2 flex-wrap mb-1">
              <span className="font-semibold text-textMain text-sm">{k.name}</span>
              {k.firma && <span className="text-xs text-textMuted">{k.firma}</span>}
              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ml-auto text-textMuted border-line">
                {EMAIL_STATUS[k.status] || k.status}
              </span>
            </div>
            {bearbeite === k.id ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
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
                  Angelegt von <span className="text-textMain">{nameVon(k.user_id)}</span> am {deutscheZeit(k.created_at)} Uhr
                </div>
                {k.notiz && <p className="text-xs text-textMain bg-surfaceRaised rounded-lg px-3 py-2 mb-2">{k.notiz}</p>}
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
                  <button onClick={() => starteBearbeiten(k)} className="btn-ghost text-xs">Bearbeiten</button>
                  <button onClick={() => loesche(k)} className="btn-ghost text-xs text-coral">Löschen</button>
                </>
              )}
              {bearbeite !== k.id && k.status === "offen" && (
                <button onClick={() => setzeStatus(k, "verschickt")} className="btn text-xs">
                  ✓ Mail verschickt
                </button>
              )}
              {bearbeite !== k.id && k.status !== "offen" && k.status !== "termin" && terminFuer !== k.id && (
                <button onClick={() => { setTerminFuer(k.id); setTerminZeit(""); }} className="btn text-xs">
                  Termin daraus geworden
                </button>
              )}
              {terminFuer === k.id && (
                <div className="flex items-center gap-2 flex-wrap w-full">
                  <input type="datetime-local" className="input !w-auto !py-1.5 text-xs"
                    value={terminZeit} onChange={(e) => setTerminZeit(e.target.value)} />
                  <button onClick={() => macheTermin(k, terminZeit)} className="btn text-xs">Termin anlegen</button>
                  <button onClick={() => setTerminFuer(null)} className="btn-ghost text-xs">Abbrechen</button>
                  <span className="text-[11px] text-textMuted w-full">
                    Der Termin wird bei {nameVon(k.user_id)} angelegt — dort ist der Kontakt entstanden.
                  </span>
                </div>
              )}
              {bearbeite !== k.id && STATUS_REIHENFOLGE.filter((s) => s !== k.status && s !== "termin" && !(s === "offen" && k.status !== "offen")).map((s) => (
                <button key={s} onClick={() => setzeStatus(k, s)} className="btn-ghost text-xs">
                  {EMAIL_STATUS[s]}
                </button>
              ))}
              {k.verschickt_am && (
                <span className="text-[11px] text-textMuted ml-auto">
                  verschickt {deutscheZeit(k.verschickt_am)} Uhr
                  {k.verschickt_von ? ` von ${nameVon(k.verschickt_von)}` : ""}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
