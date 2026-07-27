import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { playLoginChime } from "../lib/sounds";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          supabase.from("login_attempts").insert({ email, success: false }); // bewusst ohne await
          throw error;
        }
        if (data?.user) {
          supabase.from("login_events").insert({ user_id: data.user.id }); // bewusst ohne await, soll den Login nicht verzögern
          supabase.from("login_attempts").insert({ email, user_id: data.user.id, success: true });
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
        <img src="/logo.svg" alt="HB Sales Academy" className="h-10 w-auto mb-3" />
        <p className="text-textMuted text-sm mb-6">{mode === "login" ? "Melde dich an" : "Konto erstellen"}</p>
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
        <button className="text-textMuted text-xs mt-4 underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Noch kein Konto? Jetzt registrieren" : "Bereits ein Konto? Anmelden"}
        </button>
        </div>
      </div>
    </div>
  );
}
