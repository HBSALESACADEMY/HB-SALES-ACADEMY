import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import AdminTabs from "../../components/AdminTabs";
import { supabase } from "../../lib/supabaseClient";
import { ABSTAND } from "../../lib/autoRefresh";
import { apiPost } from "../../lib/apiClient";

// Zeigt den zuletzt geprüften Systemzustand. Die Prüfung selbst läuft
// serverseitig (pages/api/cron/health-check.js) und meldet Störungen per
// Telegram — diese Seite ist zum Nachschauen, nicht die Überwachung selbst.
export default function SystemStatus() {
  const [erlaubt, setErlaubt] = useState(true);
  const [laedt, setLaedt] = useState(true);
  const [stand, setStand] = useState(null);
  const [busy, setBusy] = useState("");
  const [meldung, setMeldung] = useState("");

  async function laden() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("is_platform_admin").eq("id", session.user.id).maybeSingle();
    if (!me?.is_platform_admin) { setErlaubt(false); setLaedt(false); return; }
    const { data } = await supabase.from("system_health").select("*").eq("id", true).maybeSingle();
    setStand(data || null);
    setLaedt(false);
  }

  useEffect(() => {
    laden();
    const timer = setInterval(() => { if (!document.hidden) laden(); }, ABSTAND.GELEGENTLICH);
    const beiSichtbar = () => { if (!document.hidden) laden(); };
    document.addEventListener("visibilitychange", beiSichtbar);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", beiSichtbar); };
  }, []);

  // Prüfung auf Knopfdruck: der automatische Lauf ist im Hobby-Tarif nur
  // einmal täglich möglich, bis dahin stünde hier sonst nichts.
  async function pruefen(senden) {
    setBusy(senden ? "senden" : "pruefen");
    setMeldung("");
    try {
      const r = await apiPost("/api/admin/system-check", { senden });
      if (r.schreibFehler) setMeldung(`Geprüft, aber der Zustand liess sich nicht speichern: ${r.schreibFehler} — fehlt migration_83?`);
      else if (senden) setMeldung(r.gesendet ? "Bericht an Telegram gesendet." : (r.hinweis || "Nicht gesendet."));
      else setMeldung("Prüfung abgeschlossen.");
      await laden();
    } catch (e) {
      setMeldung(e.message || "Die Prüfung ist fehlgeschlagen.");
    }
    setBusy("");
  }

  if (laedt) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;
  if (!erlaubt) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Systemstatus</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist dem Plattform-Betreiber vorbehalten.</p>
      </Layout>
    );
  }

  const alt = stand && (Date.now() - new Date(stand.geprueft_at).getTime()) > 3 * 60 * 60 * 1000;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Systemstatus</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />

      <div className="card mb-4 flex items-center gap-2 flex-wrap">
        <button onClick={() => pruefen(false)} disabled={!!busy} className="btn text-xs disabled:opacity-40">
          {busy === "pruefen" ? "Prüft..." : "Jetzt prüfen"}
        </button>
        <button onClick={() => pruefen(true)} disabled={!!busy} className="btn-ghost text-xs disabled:opacity-40">
          {busy === "senden" ? "Sendet..." : "📤 Bericht an Telegram senden"}
        </button>
        {meldung && <span className="text-xs text-textMuted">{meldung}</span>}
      </div>

      {!stand ? (
        <div className="card">
          <p className="text-textMuted text-sm">
            Noch keine Prüfung gelaufen. Der automatische Lauf ist einmal täglich (Vercel-Hobby erlaubt nicht mehr) —
            mit „Jetzt prüfen" oben bekommst du den Zustand sofort.
          </p>
        </div>
      ) : (
        <>
          <div className={`card mb-4 border ${stand.gesund ? "border-teal/40" : "border-coral/50"}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{stand.gesund ? "✅" : "🔴"}</span>
              <div>
                <div className="font-display font-semibold text-textMain">
                  {stand.gesund ? "Alles in Ordnung" : "Störung erkannt"}
                </div>
                <div className="text-xs text-textMuted">
                  Zuletzt geprüft: {new Date(stand.geprueft_at).toLocaleString("de-DE")}
                </div>
              </div>
            </div>
            {alt && (
              <p className="text-xs text-coral mt-3">
                Die letzte Prüfung liegt über drei Stunden zurück — möglicherweise läuft die automatische Prüfung nicht.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {(stand.pruefungen || []).map((p) => (
              <div key={p.name} className="card flex items-center gap-3 !py-3">
                <span>{p.ok ? "✅" : "🔴"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-textMain font-medium">{p.name}</div>
                  <div className={`text-xs ${p.ok ? "text-textMuted" : "text-coral"}`}>{p.hinweis}</div>
                  {/* Bei einer Störung reicht der Name des fehlenden Schlüssels
                      nicht — was ausfällt und was zu tun ist, gehört daneben. */}
                  {!p.ok && p.folge && <div className="text-xs text-textMuted mt-1.5"><strong>Folge:</strong> {p.folge}</div>}
                  {!p.ok && p.loesung && <div className="text-xs text-textMuted mt-1"><strong>Behebung:</strong> {p.loesung}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[11px] text-textMuted mt-5">
        Störungen werden zusätzlich per Telegram gemeldet, sobald sie auftreten — und wieder, wenn sie behoben sind.
        Ein Totalausfall der Academy lässt sich hiermit nicht erkennen; dafür braucht es eine Überwachung von aussen
        auf die Adresse <span className="font-mono">/api/health</span>.
      </p>
    </Layout>
  );
}
