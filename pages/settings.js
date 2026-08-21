import { useEffect, useState } from "react";
import Layout, { patchCachedProfile, getCachedOrg } from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { apiGetBlob, apiPost } from "../lib/apiClient";
import { getStoredThemePref, hasStoredThemePref, setThemePref } from "../lib/theme";
import { applyOrgBranding } from "../lib/orgBranding";
import { ZEITZONEN, merkeZeitzone, formatiere } from "../lib/zeit";
import { MELDUNGSARTEN, standardWahl } from "../lib/benachrichtigungen";

const THEME_OPTIONS = [
  ["light", "Hell"],
  ["dark", "Dunkel"],
  ["system", "Systemeinstellung"],
];

const CONTACT_FIELDS = [
  { key: "bio", label: "Über mich" },
  { key: "company_name", label: "Unternehmen" },
  { key: "role_title", label: "Position" },
  { key: "website", label: "Webseite" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "phone", label: "Telefon" },
];

export default function Settings() {
  const [profile, setProfile] = useState(null);
  const [visibility, setVisibility] = useState({});
  const [leaderboardOptOut, setLeaderboardOptOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [themePref, setThemePrefState] = useState("system");
  const [themeStatus, setThemeStatus] = useState("");
  const [zeitzone, setZeitzone] = useState("");
  const [zeitzoneStatus, setZeitzoneStatus] = useState("");
  const [meldungen, setMeldungen] = useState({});
  const [startseite, setStartseite] = useState("");
  const [abwesendVon, setAbwesendVon] = useState("");
  const [abwesendBis, setAbwesendBis] = useState("");
  const [kontoLoeschen, setKontoLoeschen] = useState(false);
  const [loeschText, setLoeschText] = useState("");
  const [loeschBusy, setLoeschBusy] = useState(false);

  useEffect(() => { setThemePrefState(getStoredThemePref()); }, []);

  // Wirkt sofort (localStorage, siehe lib/theme.js) — anders als die
  // restlichen Einstellungen hier braucht das keinen Klick auf "Speichern",
  // die Vorschau soll direkt sichtbar sein. Zusätzlich am Konto gespeichert,
  // damit die Wahl auch auf anderen Geräten gilt (migration_80).
  async function chooseTheme(pref) {
    setThemePrefState(pref);
    setThemePref(pref);
    setError("");

    // Gegenprobe: hat der Browser die Wahl wirklich behalten? In privaten
    // Fenstern oder bei blockiertem Speicher schlägt das lautlos fehl — genau
    // dann wirkt es so, als "merke" sich die App nichts.
    const merktSichGeraet = hasStoredThemePref();

    const org = getCachedOrg();
    if (org) applyOrgBranding(org);
    patchCachedProfile({ theme_pref: pref });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setThemeStatus(merktSichGeraet ? "Auf diesem Gerät gespeichert." : ""); return; }
    const { error: err } = await supabase.from("profiles").update({ theme_pref: pref }).eq("id", session.user.id);

    if (err) {
      setThemeStatus("");
      setError(
        merktSichGeraet
          ? "Gilt auf diesem Gerät, konnte aber nicht am Konto gespeichert werden: " + err.message
          : "Konnte weder auf diesem Gerät noch am Konto gespeichert werden: " + err.message
      );
      return;
    }
    setThemeStatus(
      merktSichGeraet
        ? "Gespeichert — gilt auf diesem Gerät und auf deinen anderen Geräten."
        : "Am Konto gespeichert. Dieser Browser speichert nichts (privates Fenster?), deshalb kann es beim Laden kurz umspringen."
    );
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(data);
      // Am Konto gespeicherte Wahl hat Vorrang — sonst stünde hier auf einem
      // neuen Gerät "Systemeinstellung", obwohl bewusst etwas gewählt wurde.
      if (data?.theme_pref) setThemePrefState(data.theme_pref);
      // Zeitzone aus dem Profil übernehmen und für die Anzeige spiegeln
      // (siehe lib/zeit.js) — sonst gilt sie erst nach dem nächsten Speichern.
      setZeitzone(data?.zeitzone || "");
      setMeldungen(data?.benachrichtigungen || standardWahl());
      setStartseite(data?.startseite || "");
      setAbwesendVon(data?.abwesend_von || "");
      setAbwesendBis(data?.abwesend_bis || "");
      merkeZeitzone(data?.zeitzone || "");
      setVisibility(data?.contact_visibility || {});
      setLeaderboardOptOut(data?.leaderboard_opt_out || false);
      setLoading(false);
    }
    load();
  }, []);

  function toggleVisibility(key) {
    setVisibility((v) => ({ ...v, [key]: v[key] === "friends" ? "public" : "friends" }));
  }

  async function save() {
    setSaved(false);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    // dashboard_prefs bleibt unangetastet: die Kacheln werden auf dem
    // Dashboard selbst bearbeitet. Würde hier gespeichert, überschriebe ein
    // Klick auf "Speichern" die dort getroffene Auswahl.
    const { error: err } = await supabase.from("profiles").update({ contact_visibility: visibility, leaderboard_opt_out: leaderboardOptOut }).eq("id", session.user.id);
    if (err) { setError(err.message); return; }
    patchCachedProfile({ contact_visibility: visibility, leaderboard_opt_out: leaderboardOptOut });
    setSaved(true);
  }

  async function exportData() {
    setExporting(true);
    try {
      const blob = await apiGetBlob("/api/export-data");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "meine-daten.json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  // Ein gemeinsamer Speicherweg für die schlichten Felder — jedes einzeln
  // zu behandeln hiesse dieselbe Fehlerbehandlung viermal.
  async function speichereFeld(felder, beiFehler) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error: err } = await supabase.from("profiles").update(felder).eq("id", session.user.id);
    if (err) setError(beiFehler || err.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 1200); }
  }

  function setzeMeldung(key, an) {
    const neu = { ...standardWahl(), ...meldungen, [key]: an };
    setMeldungen(neu);
    speichereFeld({ benachrichtigungen: neu }, "Einstellung konnte nicht gespeichert werden (fehlt migration_108?).");
  }

  async function loescheKonto() {
    setLoeschBusy(true);
    try {
      await apiPost("/api/delete-own-account", {});
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (e) {
      setError(e.message || "Das Konto konnte nicht gelöscht werden.");
      setLoeschBusy(false);
    }
  }

  async function speichereZeitzone(wert) {
    setZeitzone(wert);
    merkeZeitzone(wert);
    setZeitzoneStatus("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error: err } = await supabase.from("profiles").update({ zeitzone: wert || null }).eq("id", session.user.id);
    // Fehlt die Spalte (migration_107), gilt die Wahl trotzdem auf diesem
    // Gerät — sie wird nur nicht mitgenommen.
    setZeitzoneStatus(err ? "nur auf diesem Gerät gespeichert" : "gespeichert");
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Einstellungen</h1>
      <div className="brand-stripe w-16 mb-4" />

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">Darstellung</div>
        <p className="text-xs text-textMuted mb-4">Hell, dunkel oder automatisch nach Systemeinstellung deines Geräts.</p>
        <div className="flex items-center gap-2 flex-wrap">
          {THEME_OPTIONS.map(([key, label]) => (
            <button key={key} onClick={() => chooseTheme(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${themePref === key ? "border-teal/40 text-teal bg-teal/10" : "border-line text-textMuted hover:text-textMain"}`}>
              {label}
            </button>
          ))}
        </div>
        {themeStatus && <p className="text-xs text-teal mt-3">{themeStatus}</p>}
      </div>

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">Zeitzone</div>
        <p className="text-xs text-textMuted mb-3">
          In welcher Zeit Termine, Erinnerungen und Prüfzeitpunkte angezeigt werden.
          „Automatisch“ nimmt die Einstellung deines Geräts — geht die falsch, stimmen auch die Zeiten nicht.
        </p>
        <select className="input" value={zeitzone} onChange={(e) => speichereZeitzone(e.target.value)}>
          {ZEITZONEN.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
        </select>
        <p className="text-[11px] text-textMuted mt-2">
          Aktuelle Uhrzeit in dieser Zeitzone: <strong>{formatiere(new Date(), { dateStyle: "short", timeStyle: "medium" })}</strong>
          {zeitzoneStatus && <span className="text-teal"> · {zeitzoneStatus}</span>}
        </p>
      </div>

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">Sichtbarkeit der Kontaktdaten</div>
        <p className="text-xs text-textMuted mb-4">Entscheide pro Feld, wer es in deinem Profil sehen kann.</p>
        <div className="flex flex-col gap-2.5">
          {CONTACT_FIELDS.map((f) => {
            const isFriendsOnly = visibility[f.key] === "friends";
            return (
              <div key={f.key} className="flex items-center justify-between">
                <span className="text-sm text-textMain">{f.label}</span>
                <button onClick={() => toggleVisibility(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${isFriendsOnly ? "border-violet/40 text-violet bg-violet/10" : "border-teal/40 text-teal bg-teal/10"}`}>
                  {isFriendsOnly ? "Nur Freunde" : "Öffentlich"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card max-w-lg mb-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-textMain text-sm mb-1">Auf der Rangliste erscheinen</div>
            <p className="text-xs text-textMuted">Wenn ausgeschaltet, wirst du für andere nicht im XP-Ranking angezeigt.</p>
          </div>
          <button onClick={() => setLeaderboardOptOut((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex-shrink-0 ${!leaderboardOptOut ? "border-teal/40 text-teal bg-teal/10" : "border-line text-textMuted"}`}>
            {!leaderboardOptOut ? "Sichtbar" : "Ausgeblendet"}
          </button>
        </div>
      </div>

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">Dashboard-Kacheln</div>
        {/* Bearbeitet wird direkt am Schnellzugriff auf dem Dashboard —
            dieselbe Sache an zwei Stellen zu pflegen, führte zuverlässig
            dazu, dass beide Listen auseinanderliefen. */}
        <p className="text-xs text-textMuted">
          Welche Kacheln im Schnellzugriff stehen, stellst du auf dem Dashboard selbst ein:
          dort oben rechts über dem Schnellzugriff auf <strong>Bearbeiten</strong>. Die Reihenfolge
          änderst du ebenfalls dort per Ziehen. Deine Auswahl gilt nur für dich.
        </p>
      </div>

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">E-Mail-Benachrichtigungen</div>
        <p className="text-xs text-textMuted mb-3">
          Was dir per E-Mail zugestellt wird. Im Dashboard und in der Navigation siehst du alles weiterhin —
          hier geht es nur um Mails.
        </p>
        <div className="flex flex-col gap-2.5">
          {MELDUNGSARTEN.map((m) => {
            const an = meldungen[m.key] !== false;
            return (
              <label key={m.key} className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={an} onChange={(e) => setzeMeldung(m.key, e.target.checked)} />
                <span className="min-w-0">
                  <span className="text-sm text-textMain block">{m.label}</span>
                  <span className="text-[11px] text-textMuted">{m.hinweis}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">Startseite</div>
        <p className="text-xs text-textMuted mb-3">Welcher Bereich sich nach dem Anmelden öffnet.</p>
        <select className="input" value={startseite}
          onChange={(e) => { setStartseite(e.target.value); speichereFeld({ startseite: e.target.value || null }); }}>
          <option value="">Dashboard (Standard)</option>
          <option value="/call-tracker">Call Tracker</option>
          <option value="/termine">Termine</option>
          <option value="/courses">Kurse</option>
          <option value="/team">Mein Team</option>
          <option value="/community">Community</option>
        </select>
      </div>

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">Abwesenheit</div>
        <p className="text-xs text-textMuted mb-3">
          Urlaub oder Krankheit eintragen. Dein Team sieht dann, warum in dieser Zeit keine Anwahlen
          und Termine von dir kommen — statt dass es nach Nachlassen aussieht.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className="input !w-auto" value={abwesendVon || ""}
            onChange={(e) => { setAbwesendVon(e.target.value); speichereFeld({ abwesend_von: e.target.value || null }); }} />
          <span className="text-xs text-textMuted">bis</span>
          <input type="date" className="input !w-auto" value={abwesendBis || ""}
            onChange={(e) => { setAbwesendBis(e.target.value); speichereFeld({ abwesend_bis: e.target.value || null }); }} />
          {(abwesendVon || abwesendBis) && (
            <button className="btn-ghost text-xs text-textMuted"
              onClick={() => { setAbwesendVon(""); setAbwesendBis(""); speichereFeld({ abwesend_von: null, abwesend_bis: null }); }}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">Meine Daten</div>
        <p className="text-xs text-textMuted mb-4">Lade eine Kopie aller dir zugeordneten Daten herunter (Profil, Leads, Aufnahmen-Metadaten, Quiz-/Prüfungsergebnisse, Rollenspiele, Community-Beiträge u.a.) — dein Auskunfts- und Mitnahmerecht nach Art. 15/20 DSGVO.</p>
        <button onClick={exportData} disabled={exporting} className="btn-ghost text-xs disabled:opacity-40">
          {exporting ? "Wird erstellt..." : "Daten exportieren (JSON)"}
        </button>
      </div>

      <div className="card max-w-lg mb-5 border-coral/30">
        <div className="font-semibold text-coral text-sm mb-1">Konto löschen</div>
        <p className="text-xs text-textMuted mb-3">
          Entfernt dein Konto und alles, was daran hängt: Kursfortschritt, Zertifikate, Termine,
          Aufnahmen und Beiträge. <strong>Das lässt sich nicht rückgängig machen.</strong> Lade dir vorher
          oben deine Daten herunter, wenn du sie behalten willst.
        </p>
        {!kontoLoeschen ? (
          <button onClick={() => setKontoLoeschen(true)} className="btn-ghost text-xs text-coral">Konto löschen …</button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-textMuted">Tipp zur Bestätigung <strong>LÖSCHEN</strong> ein:</p>
            <input className="input" value={loeschText} onChange={(e) => setLoeschText(e.target.value)} placeholder="LÖSCHEN" />
            <div className="flex items-center gap-2">
              <button disabled={loeschText !== "LÖSCHEN" || loeschBusy} onClick={loescheKonto}
                className="btn text-xs disabled:opacity-40">
                {loeschBusy ? "Wird gelöscht…" : "Endgültig löschen"}
              </button>
              <button onClick={() => { setKontoLoeschen(false); setLoeschText(""); }} className="btn-ghost text-xs text-textMuted">Abbrechen</button>
            </div>
          </div>
        )}
      </div>

      <button onClick={save} className="btn">Speichern</button>
      {saved && <span className="text-teal text-xs ml-3">Gespeichert!</span>}
      {error && <span className="text-coral text-xs ml-3">{error}</span>}
    </Layout>
  );
}
