import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { supabase } from "../../lib/supabaseClient";

// Durchschnittsfarbe eines Bildes per <canvas> berechnen — keine externe
// Bibliothek nötig. Transparente Pixel werden ignoriert, damit ein Logo mit
// durchsichtigem Hintergrund nicht Richtung Schwarz/Grau verzerrt.
function extractAverageColor(imgEl) {
  const size = 50;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2];
    count++;
  }
  if (!count) return null;
  r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export default function AdminOrganization() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#E8368F");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: me } = await supabase.from("profiles").select("is_admin, organization_id").eq("id", session.user.id).maybeSingle();
      if (!me?.is_admin) { setIsAdmin(false); setLoading(false); return; }
      const { data: orgData } = await supabase.from("organizations").select("*").eq("id", me.organization_id).maybeSingle();
      if (orgData) {
        setOrg(orgData);
        setName(orgData.name || "");
        setLogoUrl(orgData.logo_url || "");
        setPrimaryColor(orgData.primary_color || "#E8368F");
      }
      setLoading(false);
    }
    load();
  }, []);

  function pickLogoFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !org) return;
    setError("");
    setUploadingLogo(true);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const autoColor = extractAverageColor(img);
      if (autoColor) setPrimaryColor(autoColor);
      URL.revokeObjectURL(objectUrl);

      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${org.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("org-logos").upload(path, file, { contentType: file.type });
      if (upErr) { setError(upErr.message); setUploadingLogo(false); return; }
      const { data: pub } = supabase.storage.from("org-logos").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      setUploadingLogo(false);
    };
    img.onerror = () => { setError("Bild konnte nicht gelesen werden."); setUploadingLogo(false); };
    img.src = objectUrl;
  }

  async function save() {
    if (!org || !name.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);
    const { error: err } = await supabase.from("organizations").update({
      name: name.trim(),
      logo_url: logoUrl.trim() || null,
      primary_color: primaryColor,
    }).eq("id", org.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => window.location.reload(), 900);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isAdmin) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-white mb-1">Organisation</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Admin-Konten verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Organisation</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Name, Logo und Akzentfarbe eurer Organisation — für alle Mitglieder eurer Organisation sichtbar.</p>

      <div className="card">
        <label className="block text-xs text-textMuted mb-1.5">Name</label>
        <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Firmenname" />

        <label className="block text-xs text-textMuted mb-1.5">Logo</label>
        <div className="flex items-center gap-3 mb-4">
          {logoUrl && <img src={logoUrl} alt="Logo-Vorschau" className="h-12 w-auto rounded" onError={(e) => { e.target.style.display = "none"; }} />}
          <label className="btn-ghost text-xs cursor-pointer">
            {uploadingLogo ? "Lädt hoch..." : "Logo hochladen"}
            <input type="file" accept="image/*" className="hidden" onChange={pickLogoFile} disabled={uploadingLogo} />
          </label>
        </div>
        <p className="text-[11px] text-textMuted mb-4">Die Akzentfarbe unten wird beim Hochladen automatisch aus dem Logo vorgeschlagen — danach frei anpassbar.</p>

        <label className="block text-xs text-textMuted mb-1.5">Akzentfarbe</label>
        <div className="flex items-center gap-3 mb-5">
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-16 rounded border border-line bg-transparent cursor-pointer" />
          <span className="text-sm text-textMuted font-mono">{primaryColor}</span>
        </div>

        {error && <p className="text-coral text-xs mb-3">{error}</p>}
        <button disabled={saving || uploadingLogo} onClick={save} className="btn disabled:opacity-40">
          {saving ? "Speichert..." : saved ? "Gespeichert!" : "Speichern"}
        </button>
      </div>
    </Layout>
  );
}
