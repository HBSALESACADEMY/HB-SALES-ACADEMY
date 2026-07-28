import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { supabase } from "../../lib/supabaseClient";

function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4;
  }
  return h * 60;
}

function toHex(r, g, b) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// Bis zu 3 markante, deutlich unterschiedliche Farben aus einem Bild erkennen
// (Histogramm-Binning + Hue-Sortierung für einen stimmigen Verlauf) — keine
// externe Bibliothek nötig, alles per <canvas>.
function extractDominantColors(imgEl, count = 3) {
  const size = 60;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const step = 24;
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${Math.round(r / step)}_${Math.round(g / step)}_${Math.round(b / step)}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count += 1;
    buckets.set(key, bucket);
  }
  if (buckets.size === 0) return [];

  // Nach absteigender Häufigkeit (Bucket-Größe) sortieren.
  const byFrequency = Array.from(buckets.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, b]) => ({ r: Math.round(b.r / b.count), g: Math.round(b.g / b.count), b: Math.round(b.b / b.count) }));

  const picked = [];
  const minDistance = 60;
  for (const c of byFrequency) {
    if (picked.length >= count) break;
    const tooClose = picked.some((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < minDistance);
    if (!tooClose) picked.push(c);
  }
  for (const c of byFrequency) {
    if (picked.length >= count) break;
    if (!picked.includes(c)) picked.push(c);
  }

  return picked
    .map((c) => ({ ...c, hue: rgbToHue(c.r, c.g, c.b) }))
    .sort((a, b) => a.hue - b.hue)
    .map((c) => toHex(c.r, c.g, c.b));
}

export default function AdminOrganization() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("#7B2FF7");
  const [primaryColor, setPrimaryColor] = useState("#E8368F");
  const [tertiaryColor, setTertiaryColor] = useState("#FF6B35");
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
        setSecondaryColor(orgData.secondary_color || "#7B2FF7");
        setPrimaryColor(orgData.primary_color || "#E8368F");
        setTertiaryColor(orgData.tertiary_color || "#FF6B35");
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
      const colors = extractDominantColors(img, 3);
      if (colors.length === 3) {
        setSecondaryColor(colors[0]);
        setPrimaryColor(colors[1]);
        setTertiaryColor(colors[2]);
      } else if (colors.length === 2) {
        setSecondaryColor(colors[0]);
        setPrimaryColor(colors[1]);
      } else if (colors.length === 1) {
        setPrimaryColor(colors[0]);
      }
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
      secondary_color: secondaryColor,
      primary_color: primaryColor,
      tertiary_color: tertiaryColor,
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
      <p className="text-textMuted text-sm mb-6">Name, Logo und Markenfarben eurer Organisation — für alle Mitglieder eurer Organisation sichtbar.</p>

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
        <p className="text-[11px] text-textMuted mb-4">Beim Hochladen werden bis zu 3 markante Farben aus dem Logo erkannt und unten als kompletter Marken-Verlauf vorgeschlagen — danach frei anpassbar.</p>

        <label className="block text-xs text-textMuted mb-1.5">Markenverlauf (Anfang → Mitte → Ende)</label>
        <div className="flex items-center gap-4 mb-2">
          <div className="flex items-center gap-2">
            <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
            <span className="text-xs text-textMuted font-mono">{secondaryColor}</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
            <span className="text-xs text-textMuted font-mono">{primaryColor}</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={tertiaryColor} onChange={(e) => setTertiaryColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
            <span className="text-xs text-textMuted font-mono">{tertiaryColor}</span>
          </div>
        </div>
        <div className="h-2 rounded-full mb-5" style={{ background: `linear-gradient(90deg, ${secondaryColor} 0%, ${primaryColor} 55%, ${tertiaryColor} 100%)` }} />

        {error && <p className="text-coral text-xs mb-3">{error}</p>}
        <button disabled={saving || uploadingLogo} onClick={save} className="btn disabled:opacity-40">
          {saving ? "Speichert..." : saved ? "Gespeichert!" : "Speichern"}
        </button>
      </div>
    </Layout>
  );
}
