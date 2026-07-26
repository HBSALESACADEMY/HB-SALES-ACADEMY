import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    setProfile(data);
    setFullName(data?.full_name || "");
    setBio(data?.bio || "");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function uploadPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const ext = file.name.split(".").pop();
    const path = `${session.user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-Buster, damit das neue Foto sofort statt der alten Version angezeigt wird.
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", session.user.id);
    setProfile((p) => ({ ...p, avatar_url: url }));
    setUploading(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("profiles").update({ full_name: fullName.trim(), bio: bio.trim() }).eq("id", session.user.id);
    if (err) setError(err.message);
    else setSaved(true);
    setSaving(false);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Mein Profil</h1>
      <div className="brand-stripe w-16 mb-6" />

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card max-w-md">
        <div className="flex items-center gap-4 mb-6">
          <Avatar name={fullName || "?"} src={profile?.avatar_url} size={72} />
          <label className="btn-ghost text-xs cursor-pointer">
            {uploading ? "Lädt hoch..." : "Foto ändern"}
            <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} disabled={uploading} />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-textMuted mb-1 block">Name</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-textMuted mb-1 block">Über mich (optional)</label>
            <textarea className="input" rows={3} placeholder="Ein kurzer Satz über dich..." value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <button disabled={saving} onClick={save} className="btn self-start disabled:opacity-40">
            {saving ? "Speichert..." : "Speichern"}
          </button>
          {saved && <p className="text-teal text-xs">Gespeichert!</p>}
        </div>
      </div>
    </Layout>
  );
}
