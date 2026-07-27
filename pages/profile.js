import { useEffect, useState } from "react";
import Layout, { patchCachedProfile } from "../components/Layout";
import Avatar from "../components/Avatar";
import AvatarCropper from "../components/AvatarCropper";
import { supabase } from "../lib/supabaseClient";

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [fields, setFields] = useState({ full_name: "", bio: "", company_name: "", role_title: "", website: "", instagram: "", linkedin: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // Datei, die gerade zugeschnitten wird

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    setProfile(data);
    setFields({
      full_name: data?.full_name || "", bio: data?.bio || "",
      company_name: data?.company_name || "", role_title: data?.role_title || "",
      website: data?.website || "", instagram: data?.instagram || "",
      linkedin: data?.linkedin || "", phone: data?.phone || "",
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function pickFile(e) {
    const file = e.target.files[0];
    if (file) setPendingFile(file);
    e.target.value = "";
  }

  async function handleCropped(blob) {
    setPendingFile(null);
    setUploading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    // Eindeutiger Dateiname bei jedem Upload — vermeidet jegliche Probleme beim
    // Überschreiben alter Dateien und sorgt dafür, dass Änderungen immer sichtbar werden.
    const path = `${session.user.id}/${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", session.user.id);
    if (dbErr) { setError(dbErr.message); setUploading(false); return; }
    setProfile((p) => ({ ...p, avatar_url: url }));
    patchCachedProfile({ avatar_url: url });
    setUploading(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const { data: { session } } = await supabase.auth.getSession();
    const payload = {
      full_name: fields.full_name.trim(), bio: fields.bio.trim(),
      company_name: fields.company_name.trim(), role_title: fields.role_title.trim(),
      website: fields.website.trim(), instagram: fields.instagram.trim(),
      linkedin: fields.linkedin.trim(), phone: fields.phone.trim(),
    };
    const { error: err } = await supabase.from("profiles").update(payload).eq("id", session.user.id);
    if (err) setError(err.message);
    else { setSaved(true); patchCachedProfile(payload); }
    setSaving(false);
  }

  function setField(key, value) { setFields((f) => ({ ...f, [key]: value })); }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Mein Profil</h1>
      <div className="brand-stripe w-16 mb-4" />

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      {pendingFile && (
        <AvatarCropper file={pendingFile} onCancel={() => setPendingFile(null)} onCropped={handleCropped} />
      )}

      <div className="card max-w-md mb-4">
        <div className="flex items-center gap-4 mb-2">
          <Avatar name={fields.full_name || "?"} src={profile?.avatar_url} size={72} />
          <label className="btn-ghost text-xs cursor-pointer">
            {uploading ? "Lädt hoch..." : "Foto ändern"}
            <input type="file" accept="image/*" className="hidden" onChange={pickFile} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="card max-w-md">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-textMuted mb-1 block">Name</label>
            <input className="input" value={fields.full_name} onChange={(e) => setField("full_name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-textMuted mb-1 block">Über mich (optional)</label>
            <textarea className="input" rows={3} placeholder="Ein kurzer Satz über dich..." value={fields.bio} onChange={(e) => setField("bio", e.target.value)} />
          </div>

          <div className="border-t border-line pt-3 mt-1">
            <div className="text-[11px] text-textMuted uppercase tracking-wide mb-3">Kontaktdaten — für alle im Team sichtbar</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-textMuted mb-1 block">Unternehmen</label>
                <input className="input" value={fields.company_name} onChange={(e) => setField("company_name", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-textMuted mb-1 block">Position</label>
                <input className="input" placeholder="z.B. Vertriebler" value={fields.role_title} onChange={(e) => setField("role_title", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-textMuted mb-1 block">Webseite</label>
                <input className="input" placeholder="https://..." value={fields.website} onChange={(e) => setField("website", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-textMuted mb-1 block">Instagram</label>
                <input className="input" placeholder="@name" value={fields.instagram} onChange={(e) => setField("instagram", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-textMuted mb-1 block">LinkedIn</label>
                <input className="input" placeholder="linkedin.com/in/..." value={fields.linkedin} onChange={(e) => setField("linkedin", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-textMuted mb-1 block">Telefon</label>
                <input className="input" value={fields.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>
            </div>
          </div>

          <button disabled={saving} onClick={save} className="btn self-start mt-1 disabled:opacity-40">
            {saving ? "Speichert..." : "Speichern"}
          </button>
          {saved && <p className="text-teal text-xs">Gespeichert!</p>}
        </div>
      </div>
    </Layout>
  );
}
