import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { applyOrgBranding, resetOrgBranding } from "../lib/orgBranding";
import { getResolvedTheme, defaultLogoSrc } from "../lib/theme";

export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [org, setOrg] = useState(null);
  // Das HB-Standard-Logo (ohne eigenes Organisations-Logo) ist hell
  // eingefärbt — im hellen Theme sonst fast unsichtbar (siehe lib/theme.js).
  const [defaultLogo, setDefaultLogo] = useState("/logo.svg");
  useEffect(() => { setDefaultLogo(defaultLogoSrc(getResolvedTheme())); }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Weißes Label: bisher zeigte diese Seite (im Gegensatz zu login.js)
  // immer fest das HB-Logo/Markenfarben, egal für welche Organisation der
  // Link war — der Recovery-Link legt zwar eine Session an, aber ohne
  // dieses Nachladen bliebe die Seite unbrandet.
  async function loadOrgBranding() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", session.user.id).maybeSingle();
    if (!profile?.organization_id) return;
    const { data: orgRow } = await supabase.from("organizations").select("*").eq("id", profile.organization_id).maybeSingle();
    if (orgRow) { setOrg(orgRow); applyOrgBranding(orgRow); }
  }

  useEffect(() => {
    // Der Recovery-Link aus der E-Mail legt beim Laden automatisch eine
    // kurzlebige Session an (detectSessionInUrl, Standard bei supabase-js).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") { setReady(true); loadOrgBranding(); }
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) { setReady(true); loadOrgBranding(); } });
    return () => { sub.subscription.unsubscribe(); resetOrgBranding(); };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 10) { setError("Passwort muss mindestens 10 Zeichen haben."); return; }
    if (password !== confirm) { setError("Passwörter stimmen nicht überein."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push("/"), 2000);
    } catch (err) {
      setError(err.message || "Etwas ist schiefgelaufen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(700px 400px at 15% -10%, rgba(123,47,247,.10), transparent), radial-gradient(600px 350px at 100% 100%, rgba(255,107,53,.08), transparent)" }}>
      <div className="card w-full max-w-sm overflow-hidden !p-0">
        <div className="brand-stripe !rounded-none" />
        <div className="p-6">
          <div className="flex flex-col items-center text-center mb-5">
            <img src={org?.logo_url || defaultLogo} alt={org?.name || "HB Sales Academy"} className="h-20 w-auto mb-4" />
          </div>
          <p className="text-textMuted text-sm mb-6 text-center">Neues Passwort festlegen</p>

          {done ? (
            <p className="text-teal text-sm text-center">Passwort geändert. Du wirst weitergeleitet...</p>
          ) : !ready ? (
            <p className="text-textMuted text-sm text-center">Link wird geprüft...</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input className="input" type="password" placeholder="Neues Passwort (mind. 10 Zeichen)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} />
              <input className="input" type="password" placeholder="Neues Passwort wiederholen" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} />
              {error && <p className="text-coral text-xs">{error}</p>}
              <button className="btn justify-center" disabled={loading}>
                {loading ? "..." : "Passwort speichern"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
