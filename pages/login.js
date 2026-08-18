import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { apiGet, apiPost } from "../lib/apiClient";
import { applyOrgBranding, resetOrgBranding } from "../lib/orgBranding";
import { playLoginChime } from "../lib/sounds";
import { quoteOfTheDay } from "../lib/quotes";
import { getResolvedTheme, defaultLogoSrc } from "../lib/theme";

export default function Login() {
  // Das HB-Standard-Logo (vor Eingabe des Firmencodes bzw. ohne eigenes
  // Organisations-Logo) ist hell eingefärbt — im hellen Theme sonst fast
  // unsichtbar (siehe lib/theme.js). Start-Wert passend zum
  // Server-Rendering (immer dunkel), direkt nach dem Mount korrigiert.
  const [defaultLogo, setDefaultLogo] = useState("/logo.svg");
  useEffect(() => { setDefaultLogo(defaultLogoSrc(getResolvedTheme())); }, []);
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [agbAccepted, setAgbAccepted] = useState(false);

  const [orgCode, setOrgCode] = useState("");
  const [resolvedOrg, setResolvedOrg] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState("");

  async function resolveOrgCode(e) {
    e.preventDefault();
    if (!orgCode.trim()) return;
    setCodeError("");
    setCodeLoading(true);
    try {
      const { org } = await apiGet(`/api/org-by-slug?slug=${encodeURIComponent(orgCode.trim())}`);
      setResolvedOrg(org);
      applyOrgBranding(org);
      // Merkt sich, welche Organisation gerade per Firmencode ausgewählt wurde —
      // Plattform-Admins sehen nach dem Login bewusst DIESE Marke, nicht die
      // ihrer eigenen fest zugeordneten Organisation (siehe components/Layout.js).
      sessionStorage.setItem("hb_active_org_id", org.id);
    } catch (err) {
      setCodeError(err.message || "Unbekannter Firmen-Code.");
    } finally {
      setCodeLoading(false);
    }
  }

  function changeCompany() {
    setResolvedOrg(null);
    setOrgCode("");
    setCodeError("");
    setError("");
    resetOrgBranding();
    sessionStorage.removeItem("hb_active_org_id");
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setError(err.message || "Etwas ist schiefgelaufen.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          supabase.from("login_attempts").insert({ email, success: false }).then(({ error: laErr }) => { if (laErr) console.error("login_attempts insert failed:", laErr.message); });
          throw error;
        }
        if (data?.user) {
          // Prüfen, ob dieser Account wirklich zur Firma des eingegebenen
          // Firmencodes gehört — sonst zurück auf "falscher Zugang", auch
          // wenn E-Mail/Passwort für sich genommen korrekt waren. Plattform-
          // Admins sind davon ausgenommen (kommen mit jedem Firmencode rein).
          const { data: profile } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", data.user.id).maybeSingle();
          if (!profile || (!profile.is_platform_admin && profile.organization_id !== resolvedOrg.id)) {
            supabase.from("login_attempts").insert({ email, user_id: data.user.id, success: false }).then(({ error: laErr }) => { if (laErr) console.error("login_attempts insert failed:", laErr.message); });
            await supabase.auth.signOut();
            throw new Error("Dieser Account gehört nicht zu dieser Firma. Bitte den richtigen Firmencode verwenden.");
          }
          const { error: leErr } = await supabase.from("login_events").insert({ user_id: data.user.id });
          if (leErr) console.error("login_events insert failed:", leErr.message);
          const { error: laErr } = await supabase.from("login_attempts").insert({ email, user_id: data.user.id, success: true });
          if (laErr) console.error("login_attempts insert failed:", laErr.message);
        }
        playLoginChime();
      } else {
        if (!agbAccepted) throw new Error("Bitte die AGB akzeptieren, um fortzufahren.");
        const { data: signUpData, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, org_slug: resolvedOrg.slug, agb_accepted: true } },
        });
        if (error) throw error;

        // Falls im Supabase-Projekt "E-Mail-Bestätigung" aktiviert ist, liefert
        // signUp() noch KEINE aktive Sitzung — ohne Sitzung würden sowohl der
        // Login-Eintrag als auch die Benachrichtigungs-E-Mail an den Manager
        // stillschweigend fehlschlagen (RLS lehnt ohne auth.uid() ab), und der
        // Nutzer würde beim Weiterleiten zum Dashboard sofort wieder zum Login
        // zurückgeworfen. Das hier sichtbar machen statt lautlos scheitern zu lassen.
        if (!signUpData?.session) {
          setResetSent(false);
          setError("Registrierung erstellt — bitte bestätige zuerst deine E-Mail-Adresse (Link wurde verschickt), dann kannst du dich anmelden.");
          setMode("login");
          setLoading(false);
          return;
        }

        // signUp() meldet direkt an — ohne diesen Eintrag hätte ein brandneuer
        // Account bis zur ersten "echten" Anmeldung buchstäblich keine einzige
        // Aktivität (unsichtbar in Login-Verlauf/Aktivitäten/"aktiv diese Woche").
        const { error: leErr } = await supabase.from("login_events").insert({ user_id: signUpData.user.id });
        if (leErr) console.error("login_events insert failed:", leErr.message);
        // Best-effort — benachrichtigt die Manager der Organisation per E-Mail.
        // Darf die Registrierung selbst nie blockieren, falls das fehlschlägt.
        apiPost("/api/notify-pending-approval", {}).catch((e) => console.error("notify-pending-approval failed:", e.message));
      }
      router.push("/");
    } catch (err) {
      setError(err.message || "Etwas ist schiefgelaufen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(700px 400px at 15% -10%, rgb(var(--org-color-1-rgb, 76 93 201) / .10), transparent), radial-gradient(600px 350px at 100% 100%, rgb(var(--org-color-3-rgb, 178 49 79) / .08), transparent), var(--org-bg, transparent)" }}>
      <div className="card w-full max-w-sm overflow-hidden !p-0">
        <div className="brand-stripe !rounded-none" />
        <div className="p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <img src={resolvedOrg?.logo_url || defaultLogo} alt={resolvedOrg?.name || "HB Sales Academy"} className="h-20 w-auto mb-4" />
          <p className="text-[12.5px] italic text-textMuted leading-snug max-w-[260px]">„{quoteOfTheDay().text}"</p>
          {quoteOfTheDay().author && <p className="text-[10.5px] text-textMuted mt-1">— {quoteOfTheDay().author}</p>}
        </div>

        {!resolvedOrg ? (
          <>
            <p className="text-textMuted text-sm mb-6 text-center">Firmencode eingeben, um fortzufahren</p>
            <form onSubmit={resolveOrgCode} className="flex flex-col gap-3">
              <input className="input" placeholder="Firmencode" value={orgCode} onChange={(e) => setOrgCode(e.target.value)} required autoFocus />
              {codeError && <p className="text-coral text-xs">{codeError}</p>}
              <button className="btn justify-center" disabled={codeLoading}>
                {codeLoading ? "..." : "Weiter"}
              </button>
            </form>
          </>
        ) : mode === "forgot" ? (
          <>
            <p className="text-textMuted text-sm mb-6 text-center">Passwort zurücksetzen</p>
            {resetSent ? (
              <p className="text-teal text-sm text-center mb-4">Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen verschickt. Bitte E-Mails prüfen (auch Spam-Ordner).</p>
            ) : (
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
                <input className="input" type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
                {error && <p className="text-coral text-xs">{error}</p>}
                <button className="btn justify-center" disabled={loading}>
                  {loading ? "..." : "Link zum Zurücksetzen senden"}
                </button>
              </form>
            )}
            <button className="text-textMuted text-xs mt-4 underline" onClick={() => { setMode("login"); setResetSent(false); setError(""); }}>
              Zurück zum Login
            </button>
          </>
        ) : (
          <>
            <p className="text-textMuted text-sm mb-1 text-center">{mode === "login" ? `Melde dich bei ${resolvedOrg.name} an` : `Konto bei ${resolvedOrg.name} erstellen`}</p>
            <p className="text-center mb-5">
              <button className="text-textMuted text-[11px] underline" onClick={changeCompany}>Andere Firma?</button>
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === "signup" && (
                <input className="input" placeholder="Vor- und Nachname" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              )}
              <input className="input" type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className="input" type="password" placeholder="Passwort (mind. 10 Zeichen)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} />
              {mode === "signup" && (
                <label className="flex items-start gap-2 text-[11.5px] text-textMuted cursor-pointer select-none">
                  <input type="checkbox" className="mt-0.5" checked={agbAccepted} onChange={(e) => setAgbAccepted(e.target.checked)} required />
                  <span>
                    Ich akzeptiere die{" "}
                    <Link href="/agb" target="_blank" className="underline text-textMain">AGB</Link>
                    {" "}und die{" "}
                    <Link href="/datenschutz" target="_blank" className="underline text-textMain">Datenschutzerklärung</Link>.
                  </span>
                </label>
              )}
              {error && <p className="text-coral text-xs">{error}</p>}
              <button className="btn justify-center" disabled={loading || (mode === "signup" && !agbAccepted)}>
                {loading ? "..." : mode === "login" ? "Anmelden" : "Registrieren"}
              </button>
            </form>
            <div className="flex items-center justify-between mt-4">
              <button className="text-textMuted text-xs underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
                {mode === "login" ? "Noch kein Konto? Jetzt registrieren" : "Bereits ein Konto? Anmelden"}
              </button>
              {mode === "login" && (
                <button className="text-textMuted text-xs underline" onClick={() => { setMode("forgot"); setError(""); }}>
                  Passwort vergessen?
                </button>
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
