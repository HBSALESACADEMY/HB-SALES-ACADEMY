import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout, { patchCachedProfile } from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { validatePostAttachment } from "../lib/uploadValidation";
import { effectiveStreak } from "../lib/streak";

export default function Community() {
  const router = useRouter();
  const [selfId, setSelfId] = useState(null);
  const [friendIds, setFriendIds] = useState(new Set());
  const [isManager, setIsManager] = useState(false);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState("all"); // "all" | group.id
  // "org" = nur die eigene Organisation (Standard, strikt getrennt von
  // anderen Organisationen), "global" = organisationsübergreifend geteilte Beiträge.
  const [scope, setScope] = useState("org");
  const [myOrgId, setMyOrgId] = useState(null);
  const [orgByUserId, setOrgByUserId] = useState({});
  const [posts, setPosts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileMap, setProfileMap] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [kudosByPost, setKudosByPost] = useState({});
  const [kudosByComment, setKudosByComment] = useState({});
  const [kudosWall, setKudosWall] = useState(null);
  const [weekKudosRaw, setWeekKudosRaw] = useState([]);
  const [weekXpRaw, setWeekXpRaw] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [newPost, setNewPost] = useState("");
  const [newPostGroup, setNewPostGroup] = useState("");
  const [newPostFile, setNewPostFile] = useState(null);
  const [shareGlobally, setShareGlobally] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showGroupForm, setShowGroupForm] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const { data: me } = await supabase.from("profiles").select("role, organization_id, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle();
    setIsManager(me?.role === "manager" || me?.role === "trainer" || !!me?.is_admin || !!me?.is_platform_admin);
    // Plattform-Admins können per Firmencode "als" eine andere Organisation
    // eingeloggt sein (sessionStorage) — dann zählt für "Meine Organisation"
    // und die Highlights die AKTIVE Organisation, nicht die eigene Heimat-Org.
    const activeOrgId = (me?.is_platform_admin && sessionStorage.getItem("hb_active_org_id")) || me?.organization_id;
    setMyOrgId(activeOrgId || null);

    const [{ data: groups }, { data: posts }, { data: comments }, { data: kudos }, { data: commentKudos }, { data: profiles }, { data: friendships }] = await Promise.all([
      supabase.from("community_groups").select("*").order("created_at"),
      supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(80),
      supabase.from("community_comments").select("*").order("created_at", { ascending: true }),
      supabase.from("community_kudos").select("*"),
      supabase.from("community_comment_kudos").select("*"),
      // organization_id + streak_count zusätzlich geladen — für die
      // Trennung "Meine Organisation"/"Global" und die Kudos-Wall.
      supabase.from("profiles").select("id, full_name, avatar_url, organization_id, streak_count, last_challenge_date").eq("status", "approved"),
      supabase.from("friendships").select("*").eq("status", "accepted").or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`),
    ]);

    setFriendIds(new Set((friendships || []).map((f) => f.requester_id === session.user.id ? f.addressee_id : f.requester_id)));

    setGroups(groups || []);

    const names = {};
    const orgById = {};
    (profiles || []).forEach((p) => { names[p.id] = { name: p.full_name || "Unbenannt", avatar: p.avatar_url }; orgById[p.id] = p.organization_id; });
    setProfileMap(names);
    setOrgByUserId(orgById);

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

    const kByComment = {};
    (commentKudos || []).forEach((k) => {
      kByComment[k.comment_id] = kByComment[k.comment_id] || { count: 0, mine: false };
      kByComment[k.comment_id].count += 1;
      if (k.user_id === session.user.id) kByComment[k.comment_id].mine = true;
    });
    setKudosByComment(kByComment);

    setPosts(posts || []);
    setLoading(false);

    // Kudos-Wall: Highlights der Woche — Rohdaten laden, die tatsächliche
    // Berechnung passiert scope-abhängig (Meine Organisation/Global) in
    // einem eigenen Effekt weiter unten, ohne bei jedem Tab-Wechsel neu zu laden.
    const weekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    })();
    const postAuthorByPostId = {};
    (posts || []).forEach((p) => { postAuthorByPostId[p.id] = p.user_id; });

    const [{ data: weekKudos }, { data: weekXp }] = await Promise.all([
      supabase.from("community_kudos").select("post_id, created_at").gt("created_at", weekStart),
      supabase.from("xp_log").select("user_id, amount").gt("created_at", weekStart),
    ]);

    setWeekKudosRaw((weekKudos || []).map((k) => ({ ...k, author: postAuthorByPostId[k.post_id] })));
    setWeekXpRaw(weekXp || []);
    setAllProfiles(profiles || []);

    const seenAt = new Date().toISOString();
    await supabase.from("profiles").update({ last_seen_community_at: seenAt }).eq("id", session.user.id);
    // Ohne dies bleibt der veraltete Zeitstempel im Modul-Level-Cache von
    // Layout.js hängen (siehe cachedProfile dort) — die Badge-Berechnung
    // würde dann nach dem Verlassen dieser Seite weiterhin mit dem alten
    // last_seen_community_at rechnen und fälschlich "ungelesen" anzeigen.
    patchCachedProfile({ last_seen_community_at: seenAt });
  }

  useEffect(() => { load(); }, []);

  // Direktsprung aus der Sidebar (z.B. /community?group=Einwandbehandlung)
  // wählt die passende Gruppe per Namen vor, sobald die Gruppen geladen sind.
  useEffect(() => {
    const groupName = router.query.group;
    if (!groupName || !groups.length) return;
    const match = groups.find((g) => g.name === groupName);
    if (match) setActiveGroup(match.id);
  }, [router.query.group, groups]);

  // Kudos-Wall — bewusst IMMER auf die eigene Organisation beschränkt, auch
  // wenn der Feed gerade auf "Global" steht: Highlights der Woche sollen nie
  // organisationsübergreifend Personen zeigen.
  useEffect(() => {
    const inScope = (userId) => orgByUserId[userId] === myOrgId;
    const nameFor = (id) => profileMap[id]?.name || "Unbenannt";

    const kudosByAuthor = {};
    weekKudosRaw.forEach((k) => {
      if (!k.author || !inScope(k.author)) return;
      kudosByAuthor[k.author] = (kudosByAuthor[k.author] || 0) + 1;
    });
    const xpByUser = {};
    weekXpRaw.forEach((r) => {
      if (!inScope(r.user_id)) return;
      xpByUser[r.user_id] = (xpByUser[r.user_id] || 0) + r.amount;
    });
    const scopedProfiles = allProfiles.filter((p) => inScope(p.id));
    // Abgelaufene Serien zählen hier nicht mit — der echte DB-Wert wird erst
    // korrigiert, sobald die betroffene Person sich wieder einloggt (siehe
    // components/Layout.js), bis dahin würde sonst eine "tote" Serie gewinnen.
    const topStreak = scopedProfiles.reduce((best, p) => {
      const days = effectiveStreak(p.streak_count, p.last_challenge_date);
      return (!best || days > best.days) ? { ...p, days } : best;
    }, null);

    const topKudos = Object.entries(kudosByAuthor).sort((a, b) => b[1] - a[1])[0];
    const topXp = Object.entries(xpByUser).sort((a, b) => b[1] - a[1])[0];

    setKudosWall({
      topKudos: topKudos ? { name: nameFor(topKudos[0]), count: topKudos[1] } : null,
      topXp: topXp ? { name: nameFor(topXp[0]), amount: topXp[1] } : null,
      topStreak: topStreak && topStreak.days > 0 ? { name: topStreak.full_name, days: topStreak.days } : null,
    });
  }, [orgByUserId, myOrgId, weekKudosRaw, weekXpRaw, allProfiles, profileMap]);

  // Echtzeit: neue Beiträge, Kommentare und Kudos erscheinen automatisch.
  useEffect(() => {
    const channel = supabase
      .channel("community-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "community_kudos" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comment_kudos" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function submitPost() {
    if (!newPost.trim()) return;
    setPosting(true);
    setError("");
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
      } else {
        setError(upErr.message);
        setPosting(false);
        return;
      }
    }

    const { error: insErr } = await supabase.from("community_posts").insert({
      user_id: session.user.id,
      content: newPost.trim(),
      group_id: newPostGroup || null,
      attachment_url,
      attachment_type,
      visibility: shareGlobally ? "global" : "org",
    });
    setPosting(false);
    if (insErr) { setError(insErr.message); return; }
    // Erst nach bestätigtem Speichern leeren — sonst geht ein fehlgeschlagener
    // Beitrag komplett verloren, während die Oberfläche "erfolgreich" wirkt.
    setNewPost("");
    setNewPostFile(null);
    setShareGlobally(false);
    await load();
  }

  async function createGroup() {
    if (!newGroupName.trim()) return;
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("community_groups").insert({ name: newGroupName.trim(), created_by: session.user.id });
    if (err) { setError(err.message); return; }
    setNewGroupName("");
    setShowGroupForm(false);
    await load();
  }

  async function deleteGroup(id) {
    setError("");
    const { error: err } = await supabase.from("community_groups").delete().eq("id", id);
    if (err) { setError(err.message); return; }
    if (activeGroup === id) setActiveGroup("all");
    await load();
  }

  async function toggleKudos(postId) {
    const { data: { session } } = await supabase.auth.getSession();
    const mine = kudosByPost[postId]?.mine;
    const { error: err } = mine
      ? await supabase.from("community_kudos").delete().eq("post_id", postId).eq("user_id", session.user.id)
      : await supabase.from("community_kudos").insert({ post_id: postId, user_id: session.user.id });
    if (err) { setError(err.message); return; }
    await load();
  }

  async function toggleCommentKudos(commentId) {
    const { data: { session } } = await supabase.auth.getSession();
    const mine = kudosByComment[commentId]?.mine;
    const { error: err } = mine
      ? await supabase.from("community_comment_kudos").delete().eq("comment_id", commentId).eq("user_id", session.user.id)
      : await supabase.from("community_comment_kudos").insert({ comment_id: commentId, user_id: session.user.id });
    if (err) { setError(err.message); return; }
    await load();
  }

  async function submitComment(postId) {
    const text = commentDrafts[postId];
    if (!text?.trim()) return;
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("community_comments").insert({ post_id: postId, user_id: session.user.id, content: text.trim() });
    if (err) { setError(err.message); return; }
    // Erst nach bestätigtem Speichern leeren — sonst geht ein fehlgeschlagener
    // Kommentar komplett verloren.
    setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    await load();
  }

  async function deletePost(postId) {
    setError("");
    const { error: err } = await supabase.from("community_posts").delete().eq("id", postId);
    if (err) { setError(err.message); return; }
    await load();
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  // "Meine Organisation" zeigt alles aus der eigenen Organisation (auch
  // Beiträge, die zusätzlich global geteilt wurden). "Global" zeigt nur
  // bewusst organisationsübergreifend geteilte Beiträge, unabhängig von der
  // Organisation der Autorin/des Autors.
  const scopedPosts = posts.filter((p) => scope === "global" ? p.visibility === "global" : orgByUserId[p.user_id] === myOrgId);
  const visiblePosts = (activeGroup === "all" ? scopedPosts : scopedPosts.filter((p) => p.group_id === activeGroup))
    .filter((p) => !searchQuery.trim() || p.content.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <Layout>
      <h1 className="text-2xl font-display font-semibold brand-text-gradient mb-1">Community</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Teilt Erfolge, Tipps, Fotos und Erfahrungen — standardmäßig nur mit eurer Organisation, optional auch global.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card flex items-center gap-2 mb-4">
        <Icon name="search" size={15} />
        <input className="bg-transparent border-none outline-none text-sm flex-1 text-textMain" placeholder="Beiträge durchsuchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setScope("org")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${scope === "org" ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-[#3A3F55]"}`}>
          Meine Organisation
        </button>
        <button onClick={() => setScope("global")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${scope === "global" ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-[#3A3F55]"}`}>
          Global
        </button>
      </div>

      {scope === "org" && kudosWall && (kudosWall.topKudos || kudosWall.topXp || kudosWall.topStreak) && (
        <div className="card mb-5">
          <div className="font-semibold text-textMain text-sm mb-3">✨ Highlights der Woche</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {kudosWall.topKudos && (
              <div className="text-center">
                <div className="text-lg">🔥</div>
                <div className="text-sm text-textMain font-semibold">{kudosWall.topKudos.name}</div>
                <div className="text-xs text-textMuted">{kudosWall.topKudos.count} Kudos erhalten</div>
              </div>
            )}
            {kudosWall.topXp && (
              <div className="text-center">
                <div className="text-lg">📈</div>
                <div className="text-sm text-textMain font-semibold">{kudosWall.topXp.name}</div>
                <div className="text-xs text-textMuted">{kudosWall.topXp.amount} XP diese Woche</div>
              </div>
            )}
            {kudosWall.topStreak && (
              <div className="text-center">
                <div className="text-lg">⚡</div>
                <div className="text-sm text-textMain font-semibold">{kudosWall.topStreak.name}</div>
                <div className="text-xs text-textMuted">{kudosWall.topStreak.days} Tage Serie</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Group tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button onClick={() => router.push("/members")}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-line text-textMuted hover:text-textMain hover:border-[var(--org-color-1,#35406E)]">
          👥 Alle Mitglieder
        </button>
        <button onClick={() => setActiveGroup("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${activeGroup === "all" ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-[#3A3F55]"}`}>
          Alle
        </button>
        {groups.map((g) => (
          <div key={g.id} className="relative group">
            <button onClick={() => setActiveGroup(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${activeGroup === g.id ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-[#3A3F55]"}`}>
              {g.name}
            </button>
            {isManager && (
              <button onClick={() => deleteGroup(g.id)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-coral text-textMain text-[9px] items-center justify-center hidden group-hover:flex">×</button>
            )}
          </div>
        ))}
        {isManager && !showGroupForm && (
          <button onClick={() => setShowGroupForm(true)} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-line text-textMuted hover:text-textMain hover:border-[#3A3F55]">
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
            <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              const err = validatePostAttachment(file);
              if (err) { alert(err); e.target.value = ""; return; }
              setNewPostFile(file);
            }} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-textMuted cursor-pointer select-none">
            <input type="checkbox" checked={shareGlobally} onChange={(e) => setShareGlobally(e.target.checked)} />
            Auch in der globalen Community teilen
          </label>
          <button disabled={posting || !newPost.trim()} onClick={submitPost} className="btn ml-auto disabled:opacity-40">Posten</button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {visiblePosts.map((p) => {
          const kudos = kudosByPost[p.id] || { count: 0, mine: false };
          const comments = commentsByPost[p.id] || [];
          const authorName = profileMap[p.user_id]?.name || "Unbenannt";
          return (
            <div key={p.id} className={`card ${friendIds.has(p.user_id) ? "border border-violet/25" : ""}`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5 cursor-pointer hover:opacity-80" onClick={() => openProfile(p.user_id)}>
                  <Avatar name={authorName} src={profileMap[p.user_id]?.avatar} size={34} />
                  <div>
                    <div className="font-semibold text-textMain text-sm flex items-center gap-1.5">
                      {authorName}
                      {friendIds.has(p.user_id) && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet/15 text-violet font-semibold">Freund</span>}
                    </div>
                    <div className="text-[11px] text-textMuted">{new Date(p.created_at).toLocaleString("de-DE")}</div>
                  </div>
                </div>
                {p.user_id === selfId && (
                  <button onClick={() => deletePost(p.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                )}
              </div>
              <p className="text-sm text-textMain whitespace-pre-wrap mb-3">{p.content}</p>

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

              {comments.length > 0 && (() => {
                // Meiste Likes zuerst; bei Gleichstand bleibt die
                // chronologische Reihenfolge erhalten (stabile Sortierung).
                const sortedComments = [...comments].sort((a, b) => (kudosByComment[b.id]?.count || 0) - (kudosByComment[a.id]?.count || 0));
                const topCount = kudosByComment[sortedComments[0]?.id]?.count || 0;
                return (
                  <div className="flex flex-col gap-2.5 mt-3 pt-3 border-t border-line">
                    {sortedComments.map((c) => {
                      const cKudos = kudosByComment[c.id] || { count: 0, mine: false };
                      const isTop = topCount > 0 && cKudos.count === topCount;
                      return (
                        <div key={c.id} className="flex items-start gap-2">
                          <button onClick={() => openProfile(c.user_id)} className="flex-shrink-0">
                            <Avatar name={profileMap[c.user_id]?.name || "?"} src={profileMap[c.user_id]?.avatar} size={22} />
                          </button>
                          <div className="text-xs flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-textMain cursor-pointer hover:underline" onClick={() => openProfile(c.user_id)}>{profileMap[c.user_id]?.name || "Unbenannt"}:</span>
                              <span className="text-textMuted">{c.content}</span>
                              {isTop && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber/15 text-amber font-semibold flex-shrink-0">🏆 Top-Antwort</span>
                              )}
                            </div>
                            <button onClick={() => toggleCommentKudos(c.id)} className={`btn-ghost !py-0.5 !px-1.5 text-[10px] mt-1 inline-flex items-center gap-1 ${cKudos.mine ? "text-amber border-amber/40" : ""}`}>
                              <Icon name="flame" size={10} /> {cKudos.count || 0}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
