import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // Umlaute/Akzente entfernen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Platform() {
  const [allowed, setAllowed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [justCreatedSlug, setJustCreatedSlug] = useState(null);
  const [copiedSlug, setCopiedSlug] = useState(null);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("is_platform_admin").eq("id", session.user.id).maybeSingle();
    if (!me?.is_platform_admin) { setAllowed(false); setLoading(false); return; }
    const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
    setOrgs(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createOrg() {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    setJustCreatedSlug(null);

    const base = slugify(name.trim()) || "firma";
    let slug = base;
    let attempt = 1;
    let created = null;

    while (attempt <= 20 && !created) {
      const { data, error: err } = await supabase.from("organizations").insert({ name: name.trim(), slug }).select().maybeSingle();
      if (!err) {
        created = data;
        break;
      }
      if (err.code === "23505") {
        attempt += 1;
        slug = `${base}-${attempt}`;
        continue;
      }
      setError(err.message);
      break;
    }

    if (created) {
      setName("");
      setJustCreatedSlug(created.slug);
      await load();
    }
    setCreating(false);
  }

  function copySlug(slug) {
    navigator.clipboard.writeText(slug);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 1500);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!allowed) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-white mb-1">Plattform</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nicht verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Plattform-Verwaltung</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Neue Kunden-Organisationen anlegen — der Firmencode wird automatisch generiert.</p>

      <div className="card mb-6">
        <div className="font-semibold text-white text-sm mb-3">Neue Organisation anlegen</div>
        <div className="flex items-center gap-2">
          <input className="input flex-1" placeholder="Firmenname" value={name} onChange={(e) => setName(e.target.value)} />
          <button disabled={creating} onClick={createOrg} className="btn text-xs disabled:opacity-40 flex-shrink-0">
            {creating ? "Legt an..." : "Anlegen"}
          </button>
        </div>
        {error && <p className="text-coral text-xs mt-2">{error}</p>}
        {justCreatedSlug && (
          <p className="text-teal text-sm mt-3">
            Angelegt! Firmencode: <span className="font-mono font-semibold">{justCreatedSlug}</span> — diesen Code dem Kunden für Registrierung/Login geben.
          </p>
        )}
      </div>

      <div className="text-xs text-textMuted uppercase tracking-wide mb-2.5">Alle Organisationen</div>
      <div className="flex flex-col gap-2.5">
        {orgs.map((o) => (
          <div key={o.id} className="card flex items-center gap-3.5">
            {o.logo_url && <img src={o.logo_url} alt="" className="h-8 w-auto rounded" onError={(e) => { e.target.style.display = "none"; }} />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white text-sm">{o.name}</div>
              <div className="text-xs text-textMuted mt-0.5">
                Code: <span className="font-mono">{o.slug}</span> · angelegt {new Date(o.created_at).toLocaleDateString("de-DE")}
              </div>
            </div>
            <button onClick={() => copySlug(o.slug)} className="btn-ghost text-xs flex-shrink-0">
              {copiedSlug === o.slug ? "Kopiert!" : "Code kopieren"}
            </button>
          </div>
        ))}
        {orgs.length === 0 && <p className="text-textMuted text-sm">Noch keine Organisationen angelegt.</p>}
      </div>
    </Layout>
  );
}
