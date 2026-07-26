import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";

export default function Community() {
  const [selfId, setSelfId] = useState(null);
  const [isManager, setIsManager] = useState(false);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState("all"); // "all" | group.id
  const [posts, setPosts] = useState([]);
  const [profileNames, setProfileNames] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [kudosByPost, setKudosByPost] = useState({});
  const [newPost, setNewPost] = useState("");
  const [newPostGroup, setNewPostGroup] = useState("");
  const [newPostFile, setNewPostFile] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showGroupForm, setShowGroupForm] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    setIsManager(me?.role === "manager");

    const [{ data: groups }, { data: posts }, { data: comments }, { data: kudos }, { data: profiles }] = await Promise.all([
      supabase.from("community_groups").select("*").order("created_at"),
      supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(80),
      supabase.from("community_comments").select("*").order("created_at", { ascending: true }),
      supabase.from("community_kudos").select("*"),
      supabase.from("profiles").select("id, full_name").eq("status", "approved"),
    ]);

    setGroups(groups || []);

    const names = {};
    (profiles || []).forEach((p) => { names[p.id] = p.full_name || "Unbenannt"; });
    setProfileNames(names);

    const cByPost = {};
    (comments || []).forEach((c) => { cByPost[c.post_id] = cByPost[c.post_id] || []; cByPost[c.post_id].push(c); });
    setCommentsByPost(cByPost);

    const kByPost = {};
    (kudos || []).forEach((k) => {
      kByPost[k.post_id] = kByPost[k.post_id] || { count: 0, mine: false };
      kByPost[k.post_id].count += 1;
      if (k.user_id === session.user.id) kByPost[k.post_id].mine = true;
    });
    setKudosByPost(kByPost);

    setPosts(posts || []);
    setLoading(false);

    await supabase.from("profiles").update({ last_seen_community_at: new Date().toISOString() }).eq("id", session.user.id);
  }

  useEffect(() => { load(); }, []);

  async function submitPost() {
    if (!newPost.trim()) return;
    setPosting(true);
    const { data: { session } } = await supabase.auth.getSession();

    let attachment_url = null, attachment_type = null;
    if (newPostFile) {
      const ext = newPostFile.name.split(".").pop();
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("community-uploads").upload(path, newPostFile);
      if (!upErr) {
        const { data: pub } = supabase.storage.from("community-uploads").getPublicUrl(path);
        attachment_url = pub.publicUrl;
        attachment_type = newPostFile.type.startsWith("image/") ? "image" : newPostFile.type.startsWith("video/") ? "video" : "file";
      }
    }

    await supabase.from("community_posts").insert({
      user_id: session.user.id,
      content: newPost.trim(),
      group_id: newPostGroup || null,
      attachment_url,
      attachment_type,
    });
    setNewPost("");
    setNewPostFile(null);
    setPosting(false);
    await load();
  }

  async function createGroup() {
    if (!newGroupName.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("community_groups").insert({ name: newGroupName.trim(), created_by: session.user.id });
    setNewGroupName("");
    setShowGroupForm(false);
    await load();
  }

  async function deleteGroup(id) {
    await supabase.from("community_groups").delete().eq("id", id);
    if (activeGroup === id) setActiveGroup("all");
    await load();
  }

  async function toggleKudos(postId) {
    const { data: { session } } = await supabase.auth.getSession();
    const mine = kudosByPost[postId]?.mine;
    if (mine) await supabase.from("community_kudos").delete().eq("post_id", postId).eq("user_id", session.user.id);
    else await supabase.from("community_kudos").insert({ post_id: postId, user_id: session.user.id });
    await load();
  }

  async function submitComment(postId) {
    const text = commentDrafts[postId];
    if (!text?.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("community_comments").insert({ post_id: postId, user_id: session.user.id, content: text.trim() });
    setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    await load();
  }

  async function deletePost(postId) {
    await supabase.from("community_posts").delete().eq("id", postId);
    await load();
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  const visiblePosts = activeGroup === "all" ? posts : posts.filter((p) => p.group_id === activeGroup);

  return (
    <Layout>
      <h1 className="text-2xl font-display text-white mb-1">Community</h1>
      <p className="text-textMuted text-sm mb-5">Teilt Erfolge, Tipps, Fotos und Erfahrungen mit dem ganzen Team.</p>

      {/* Group tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button onClick={() => setActiveGroup("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${activeGroup === "all" ? "bg-amber text-[#16130A] border-amber" : "border-line text-textMuted hover:text-white hover:border-[#3A3F55]"}`}>
          Alle
        </button>
        {groups.map((g) => (
          <div key={g.id} className="relative group">
            <button onClick={() => setActiveGroup(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${activeGroup === g.id ? "bg-amber text-[#16130A] border-amber" : "border-line text-textMuted hover:text-white hover:border-[#3A3F55]"}`}>
              {g.name}
            </button>
            {isManager && (
              <button onClick={() => deleteGroup(g.id)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-coral text-white text-[9px] items-center justify-center hidden group-hover:flex">×</button>
            )}
          </div>
        ))}
        {isManager && !showGroupForm && (
          <button onClick={() => setShowGroupForm(true)} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-line text-textMuted hover:text-white hover:border-[#3A3F55]">
            + Neue Gruppe
          </button>
        )}
        {isManager && showGroupForm && (
          <div className="flex items-center gap-1.5">
            <input className="input !w-32 !py-1 text-xs" placeholder="Gruppenname" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createGroup()} autoFocus />
            <button onClick={createGroup} className="btn-ghost text-xs px-2 py-1">✓</button>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <textarea className="input" placeholder="Was gibt's Neues? Ein Erfolg, ein Tipp, ein Foto..." rows={3} value={newPost} onChange={(e) => setNewPost(e.target.value)} />
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {groups.length > 0 && (
            <select className="input !w-auto text-xs" value={newPostGroup} onChange={(e) => setNewPostGroup(e.target.value)}>
              <option value="">Allgemein</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <label className="btn-ghost text-xs cursor-pointer px-3 py-2">
            <Icon name="download" size={13} /> {newPostFile ? newPostFile.name.slice(0, 20) : "Datei anhängen"}
            <input type="file" className="hidden" onChange={(e) => setNewPostFile(e.target.files[0])} />
          </label>
          <button disabled={posting || !newPost.trim()} onClick={submitPost} className="btn ml-auto disabled:opacity-40">Posten</button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {visiblePosts.map((p) => {
          const kudos = kudosByPost[p.id] || { count: 0, mine: false };
          const comments = commentsByPost[p.id] || [];
          const authorName = profileNames[p.user_id] || "Unbenannt";
          return (
            <div key={p.id} className="card">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={authorName} size={34} />
                  <div>
                    <div className="font-semibold text-white text-sm">{authorName}</div>
                    <div className="text-[11px] text-textMuted">{new Date(p.created_at).toLocaleString("de-DE")}</div>
                  </div>
                </div>
                {p.user_id === selfId && (
                  <button onClick={() => deletePost(p.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                )}
              </div>
              <p className="text-sm text-white whitespace-pre-wrap mb-3">{p.content}</p>

              {p.attachment_url && p.attachment_type === "image" && (
                <img src={p.attachment_url} alt="" className="rounded-lg max-h-96 w-auto mb-3 border border-line" />
              )}
              {p.attachment_url && p.attachment_type === "video" && (
                <video src={p.attachment_url} controls className="rounded-lg max-h-96 w-full mb-3 border border-line" />
              )}
              {p.attachment_url && p.attachment_type === "file" && (
                <a href={p.attachment_url} target="_blank" rel="noreferrer" className="btn-ghost text-xs inline-flex mb-3">
                  <Icon name="download" size={13} /> Datei öffnen
                </a>
              )}

              <button onClick={() => toggleKudos(p.id)} className={`btn-ghost text-xs flex items-center gap-1.5 ${kudos.mine ? "text-amber border-amber/40" : ""}`}>
                <Icon name="flame" size={13} /> {kudos.count || 0}
              </button>

              {comments.length > 0 && (
                <div className="flex flex-col gap-2.5 mt-3 pt-3 border-t border-line">
                  {comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <Avatar name={profileNames[c.user_id] || "?"} size={22} />
                      <div className="text-xs">
                        <span className="font-semibold text-white">{profileNames[c.user_id] || "Unbenannt"}: </span>
                        <span className="text-textMuted">{c.content}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <input className="input flex-1 text-xs" placeholder="Kommentieren..." value={commentDrafts[p.id] || ""}
                  onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && submitComment(p.id)} />
                <button onClick={() => submitComment(p.id)} className="btn-ghost text-xs">Senden</button>
              </div>
            </div>
          );
        })}
        {visiblePosts.length === 0 && <p className="text-textMuted text-sm">Noch keine Beiträge hier — sei der/die Erste!</p>}
      </div>
    </Layout>
  );
}
