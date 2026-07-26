import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";

export default function Community() {
  const [selfId, setSelfId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [profileNames, setProfileNames] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [kudosByPost, setKudosByPost] = useState({});
  const [newPost, setNewPost] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const [{ data: posts }, { data: comments }, { data: kudos }, { data: profiles }] = await Promise.all([
      supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("community_comments").select("*").order("created_at", { ascending: true }),
      supabase.from("community_kudos").select("*"),
      supabase.from("profiles").select("id, full_name").eq("status", "approved"),
    ]);

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
    await supabase.from("community_posts").insert({ user_id: session.user.id, content: newPost.trim() });
    setNewPost("");
    setPosting(false);
    await load();
  }

  async function toggleKudos(postId) {
    const { data: { session } } = await supabase.auth.getSession();
    const mine = kudosByPost[postId]?.mine;
    if (mine) {
      await supabase.from("community_kudos").delete().eq("post_id", postId).eq("user_id", session.user.id);
    } else {
      await supabase.from("community_kudos").insert({ post_id: postId, user_id: session.user.id });
    }
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

  return (
    <Layout>
      <h1 className="text-2xl font-display text-white mb-1">Community</h1>
      <p className="text-textMuted text-sm mb-6">Teilt Erfolge, Tipps und Erfahrungen mit dem ganzen Team.</p>

      <div className="card mb-6">
        <textarea className="input" placeholder="Was gibt's Neues? Ein Erfolg, ein Tipp, eine Frage..." rows={3} value={newPost} onChange={(e) => setNewPost(e.target.value)} />
        <button disabled={posting || !newPost.trim()} onClick={submitPost} className="btn mt-2 disabled:opacity-40">Posten</button>
      </div>

      <div className="flex flex-col gap-4">
        {posts.map((p) => {
          const kudos = kudosByPost[p.id] || { count: 0, mine: false };
          const comments = commentsByPost[p.id] || [];
          return (
            <div key={p.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-white text-sm">{profileNames[p.user_id] || "Unbenannt"}</div>
                  <div className="text-[11px] text-textMuted">{new Date(p.created_at).toLocaleString("de-DE")}</div>
                </div>
                {p.user_id === selfId && (
                  <button onClick={() => deletePost(p.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                )}
              </div>
              <p className="text-sm text-white whitespace-pre-wrap mb-3">{p.content}</p>
              <button onClick={() => toggleKudos(p.id)} className={`btn-ghost text-xs flex items-center gap-1.5 ${kudos.mine ? "text-amber border-amber/40" : ""}`}>
                <Icon name="flame" size={13} /> {kudos.count || 0}
              </button>

              {comments.length > 0 && (
                <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-line">
                  {comments.map((c) => (
                    <div key={c.id} className="text-xs">
                      <span className="font-semibold text-white">{profileNames[c.user_id] || "Unbenannt"}: </span>
                      <span className="text-textMuted">{c.content}</span>
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
        {posts.length === 0 && <p className="text-textMuted text-sm">Noch keine Beiträge — sei der/die Erste!</p>}
      </div>
    </Layout>
  );
}
