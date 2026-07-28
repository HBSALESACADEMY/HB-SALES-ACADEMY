import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { playLoginChime } from "../lib/sounds";
import { quoteOfTheDay } from "../lib/quotes";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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
          const { error: leErr } = await supabase.from("login_events").insert({ user_id: data.user.id });
          if (leErr) console.error("login_events insert failed:", leErr.message);
          const { error: laErr } = await supabase.from("login_attempts").insert({ email, user_id: data.user.id, success: true });
          if (laErr) console.error("login_attempts insert failed:", laErr.message);
        }
        playLoginChime();
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
      }
      router.push("/");
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
          <img src="/logo.svg" alt="HB Sales Academy" className="h-20 w-auto mb-4" />
          <p className="text-[12.5px] italic text-textMuted leading-snug max-w-[260px]">„{quoteOfTheDay().text}"</p>
          {quoteOfTheDay().author && <p className="text-[10.5px] text-[#5A5F72] mt-1">— {quoteOfTheDay().author}</p>}
        </div>
        {mode === "forgot" ? (
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
            <p className="text-textMuted text-sm mb-6 text-center">{mode === "login" ? "Melde dich an" : "Konto erstellen"}</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === "signup" && (
                <input className="input" placeholder="Vor- und Nachname" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              )}
              <input className="input" type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className="input" type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              {error && <p className="text-coral text-xs">{error}</p>}
              <button className="btn justify-center" disabled={loading}>
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
