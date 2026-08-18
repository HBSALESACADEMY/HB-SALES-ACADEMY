import { useEffect, useState } from "react";
import Layout, { patchCachedProfile, getCachedOrg } from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { apiGetBlob } from "../lib/apiClient";
import { getStoredThemePref, setThemePref } from "../lib/theme";
import { applyOrgBranding } from "../lib/orgBranding";

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

  useEffect(() => { setThemePrefState(getStoredThemePref()); }, []);

  // Wirkt sofort (localStorage, siehe lib/theme.js) — anders als die
  // restlichen Einstellungen hier braucht das keinen Klick auf "Speichern",
  // die Vorschau soll direkt sichtbar sein. Zusätzlich am Konto gespeichert,
  // damit die Wahl auch auf anderen Geräten gilt (migration_80).
  async function chooseTheme(pref) {
    setThemePrefState(pref);
    setThemePref(pref);
    setError("");
    const org = getCachedOrg();
    if (org) applyOrgBranding(org);
    patchCachedProfile({ theme_pref: pref });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error: err } = await supabase.from("profiles").update({ theme_pref: pref }).eq("id", session.user.id);
    // Auf diesem Gerät gilt die Wahl trotzdem (localStorage, siehe oben) —
    // nur die Übertragung auf andere Geräte klappt dann nicht. Früher lief
    // dieser Fehler stumm ins Leere.
    if (err) setError("Die Darstellung gilt auf diesem Gerät, konnte aber nicht am Konto gespeichert werden: " + err.message);
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
        <p className="text-xs text-textMuted mb-4">Reihenfolge anpassen oder Kacheln ausblenden.</p>
        <div className="flex flex-col gap-1.5">
          {tileOrder.map((key, i) => {
            const tile = ALL_DASHBOARD_TILES.find((t) => t.key === key);
            if (!tile) return null;
            const isHidden = hiddenTiles.has(key);
            return (
              <div key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isHidden ? "opacity-40" : ""}`}>
                <div className="flex flex-col">
                  <button onClick={() => moveTile(key, -1)} disabled={i === 0} className="text-textMuted hover:text-textMain disabled:opacity-20 leading-none text-xs">▲</button>
                  <button onClick={() => moveTile(key, 1)} disabled={i === tileOrder.length - 1} className="text-textMuted hover:text-textMain disabled:opacity-20 leading-none text-xs">▼</button>
                </div>
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
