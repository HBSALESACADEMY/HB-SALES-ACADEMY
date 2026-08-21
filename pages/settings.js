import { useEffect, useState } from "react";
import Layout, { patchCachedProfile, getCachedOrg } from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { apiGetBlob } from "../lib/apiClient";
import { getStoredThemePref, hasStoredThemePref, setThemePref } from "../lib/theme";
import { applyOrgBranding } from "../lib/orgBranding";
import { ZEITZONEN, merkeZeitzone, formatiere } from "../lib/zeit";

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

const ALL_DASHBOARD_TILES = [
  { key: "messages", label: "Nachrichten" },
  { key: "members", label: "Mitglieder" },
  { key: "community", label: "Community" },
  { key: "daily-challenge", label: "Tages-Challenge" },
  { key: "duel", label: "Quiz-Duell" },
  { key: "flashcards", label: "Flashcards" },
  { key: "simulator", label: "Simulator" },
  { key: "leaderboard", label: "Rangliste" },
];

export default function Settings() {
  const [profile, setProfile] = useState(null);
  const [visibility, setVisibility] = useState({});
  const [leaderboardOptOut, setLeaderboardOptOut] = useState(false);
  const [tileOrder, setTileOrder] = useState(ALL_DASHBOARD_TILES.map((t) => t.key));
  const [hiddenTiles, setHiddenTiles] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [themePref, setThemePrefState] = useState("system");
  const [themeStatus, setThemeStatus] = useState("");
  const [zeitzone, setZeitzone] = useState("");
  const [zeitzoneStatus, setZeitzoneStatus] = useState("");

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
      merkeZeitzone(data?.zeitzone || "");
      setVisibility(data?.contact_visibility || {});
      setLeaderboardOptOut(data?.leaderboard_opt_out || false);
      const prefs = data?.dashboard_prefs || {};
      const savedOrder = prefs.order && prefs.order.length ? prefs.order : ALL_DASHBOARD_TILES.map((t) => t.key);
      const merged = [...savedOrder, ...ALL_DASHBOARD_TILES.map((t) => t.key).filter((k) => !savedOrder.includes(k))];
      setTileOrder(merged);
      setHiddenTiles(new Set(prefs.hidden || []));
      setLoading(false);
    }
    load();
  }, []);

  function toggleVisibility(key) {
    setVisibility((v) => ({ ...v, [key]: v[key] === "friends" ? "public" : "friends" }));
  }

  function toggleTileHidden(key) {
    setHiddenTiles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function moveTile(key, dir) {
    setTileOrder((prev) => {
      const idx = prev.indexOf(key);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  async function save() {
    setSaved(false);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const dashboard_prefs = { order: tileOrder, hidden: Array.from(hiddenTiles) };
    const { error: err } = await supabase.from("profiles").update({ contact_visibility: visibility, dashboard_prefs, leaderboard_opt_out: leaderboardOptOut }).eq("id", session.user.id);
    if (err) { setError(err.message); return; }
    patchCachedProfile({ contact_visibility: visibility, dashboard_prefs, leaderboard_opt_out: leaderboardOptOut });
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
        {/* Die Reihenfolge wird auf dem Dashboard selbst per Ziehen
            geändert — hier standen dieselben Kacheln nochmal mit Pfeilen,
            zwei Wege für dieselbe Sache. Geblieben ist das Ein- und
            Ausblenden, das es auf dem Dashboard nicht gibt. */}
        <p className="text-xs text-textMuted mb-4">Welche Kacheln auf dem Dashboard erscheinen. Die Reihenfolge änderst du dort direkt per Ziehen.</p>
        <div className="flex flex-col gap-1.5">
          {tileOrder.map((key) => {
            const tile = ALL_DASHBOARD_TILES.find((t) => t.key === key);
            if (!tile) return null;
            const isHidden = hiddenTiles.has(key);
            return (
              <div key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isHidden ? "opacity-40" : ""}`}>
                <span className="text-sm text-textMain flex-1">{tile.label}</span>
                <button onClick={() => toggleTileHidden(key)} className="btn-ghost text-xs">
                  {isHidden ? "Einblenden" : "Ausblenden"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card max-w-lg mb-5">
        <div className="font-semibold text-textMain text-sm mb-1">Meine Daten</div>
        <p className="text-xs text-textMuted mb-4">Lade eine Kopie aller dir zugeordneten Daten herunter (Profil, Leads, Aufnahmen-Metadaten, Quiz-/Prüfungsergebnisse, Rollenspiele, Community-Beiträge u.a.) — dein Auskunfts- und Mitnahmerecht nach Art. 15/20 DSGVO.</p>
        <button onClick={exportData} disabled={exporting} className="btn-ghost text-xs disabled:opacity-40">
          {exporting ? "Wird erstellt..." : "Daten exportieren (JSON)"}
        </button>
      </div>

      <button onClick={save} className="btn">Speichern</button>
      {saved && <span className="text-teal text-xs ml-3">Gespeichert!</span>}
      {error && <span className="text-coral text-xs ml-3">{error}</span>}
    </Layout>
  );
}
