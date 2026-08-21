import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout, { patchCachedProfile } from "../components/Layout";
import InfoCard from "../components/InfoCard";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { openProfile } from "../lib/profileModalBus";
import { validatePostAttachment } from "../lib/uploadValidation";
import { getActiveOrgId } from "../lib/activeOrg";
import { effectiveStreak } from "../lib/streak";
import { loescheGeprueft, aendereGeprueft } from "../lib/loeschen";

const REACTION_TYPES = [
  { key: "flame", emoji: "🔥" },
  { key: "thumbsup", emoji: "👍" },
  { key: "heart", emoji: "❤️" },
  { key: "laugh", emoji: "😂" },
];

function totalReactions(entry) {
  if (!entry) return 0;
  return Object.values(entry.counts || {}).reduce((a, b) => a + b, 0);
}

export default function Community() {
  const router = useRouter();
  const [selfId, setSelfId] = useState(null);
  const [friendIds, setFriendIds] = useState(new Set());
  const [isManager, setIsManager] = useState(false);
  // Deckt sich mit der community_posts_update_own_or_manager-RLS-Policy
  // (anders als isManager: KEINE trainer-Rolle, sonst würde ein Anpinnen-
  // Klick durch eine trainer-Rolle serverseitig an der RLS scheitern).
  const [canModerate, setCanModerate] = useState(false);
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
  // Mention-Autocomplete (@Name): "compose" für das Post-Feld, sonst die
  // post.id des Kommentarfelds. mentionStart ist die Zeichenposition des "@".
  const [mentionTarget, setMentionTarget] = useState(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const postTextareaRef = useRef(null);
  const commentInputRefs = useRef({});
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [mentionNotifications, setMentionNotifications] = useState([]);
  const [activeHashtag, setActiveHashtag] = useState(null);
  const [highlightPostId, setHighlightPostId] = useState(null);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [pollOptionsByPost, setPollOptionsByPost] = useState({});
  const [pollVotesByPost, setPollVotesByPost] = useState({});
  const [newPollOptions, setNewPollOptions] = useState(["", ""]);
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollDurationHours, setPollDurationHours] = useState("24");
  const [pollCustomExpiry, setPollCustomExpiry] = useState("");

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSelfId(session.user.id);

    const { data: me } = await supabase.from("profiles").select("role, organization_id, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle();
    setIsManager(me?.role === "manager" || me?.role === "trainer" || !!me?.is_admin || !!me?.is_platform_admin);
    setCanModerate(me?.role === "manager" || !!me?.is_admin || !!me?.is_platform_admin);
    // Plattform-Admins können per Firmencode "als" eine andere Organisation
    // eingeloggt sein (sessionStorage) — dann zählt für "Meine Organisation"
    // und die Highlights die AKTIVE Organisation, nicht die eigene Heimat-Org.
    setMyOrgId(getActiveOrgId(me));

    const [{ data: groups }, { data: posts }, { data: comments }, { data: kudos }, { data: commentKudos }, { data: profiles }, { data: friendships }, { data: mentions }, { data: pollOptions }, { data: pollVotes }] = await Promise.all([
      supabase.from("community_groups").select("*").order("created_at"),
      supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(80),
      supabase.from("community_comments").select("*").order("created_at", { ascending: true }),
      supabase.from("community_kudos").select("*"),
      supabase.from("community_comment_kudos").select("*"),
      // organization_id + streak_count zusätzlich geladen — für die
      // Trennung "Meine Organisation"/"Global" und die Kudos-Wall.
      supabase.from("profiles").select("id, full_name, avatar_url, organization_id, streak_count, last_challenge_date").eq("status", "approved"),
      supabase.from("friendships").select("*").eq("status", "accepted").or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`),
      supabase.from("community_notifications").select("*").eq("user_id", session.user.id).eq("read", false).order("created_at", { ascending: false }).limit(20),
      supabase.from("community_poll_options").select("*").order("position"),
      supabase.from("community_poll_votes").select("*"),
    ]);

    const optByPost = {};
    (pollOptions || []).forEach((o) => { optByPost[o.post_id] = optByPost[o.post_id] || []; optByPost[o.post_id].push(o); });
    setPollOptionsByPost(optByPost);

    const votesByPost = {};
    (pollVotes || []).forEach((v) => {
      votesByPost[v.post_id] = votesByPost[v.post_id] || { countByOption: {}, mineOptionId: null };
      votesByPost[v.post_id].countByOption[v.option_id] = (votesByPost[v.post_id].countByOption[v.option_id] || 0) + 1;
      if (v.user_id === session.user.id) votesByPost[v.post_id].mineOptionId = v.option_id;
    });
    setPollVotesByPost(votesByPost);

    setMentionNotifications(mentions || []);
    if (mentions?.length) {
      // Direkt als gelesen markieren, sobald sie geladen/angezeigt werden —
      // dasselbe simple "beim Betreten gesehen"-Muster wie last_seen_community_at.
      await supabase.from("community_notifications").update({ read: true }).eq("user_id", session.user.id).eq("read", false);
    }

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
      kByPost[k.post_id] = kByPost[k.post_id] || { counts: {}, mine: null };
      kByPost[k.post_id].counts[k.reaction] = (kByPost[k.post_id].counts[k.reaction] || 0) + 1;
      if (k.user_id === session.user.id) kByPost[k.post_id].mine = k.reaction;
    });
    setKudosByPost(kByPost);

    const kByComment = {};
    (commentKudos || []).forEach((k) => {
      kByComment[k.comment_id] = kByComment[k.comment_id] || { counts: {}, mine: null };
      kByComment[k.comment_id].counts[k.reaction] = (kByComment[k.comment_id].counts[k.reaction] || 0) + 1;
      if (k.user_id === session.user.id) kByComment[k.comment_id].mine = k.reaction;
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

  // Direktsprung aus einer Erwähnungs-Benachrichtigung (z.B. vom Dashboard,
  // ?postId=...) — zum passenden Beitrag scrollen und kurz hervorheben.
  useEffect(() => {
    const postId = router.query.postId;
    if (!postId || !posts.length) return;
    const el = document.getElementById(`post-${postId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightPostId(postId);
      const t = setTimeout(() => setHighlightPostId(null), 4000);
      return () => clearTimeout(t);
    }
  }, [router.query.postId, posts]);

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

  // Findet ein aktives "@..."-Muster direkt vor der Cursor-Position (ohne
  // Leerzeichen dazwischen), damit während des Tippens Vorschläge erscheinen.
  function detectMention(text, caret) {
    const upto = text.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return null;
    const between = upto.slice(at + 1);
    if (/\s/.test(between)) return null;
    return { start: at, query: between };
  }

  function handleMentionChange(target, text, caret) {
    const m = detectMention(text, caret);
    if (m) {
      setMentionTarget(target);
      setMentionStart(m.start);
      setMentionQuery(m.query);
    } else if (mentionTarget === target) {
      setMentionTarget(null);
    }
  }

  // Vorschlagsliste richtet sich danach, ob der Beitrag/Kommentar organisations-
  // intern oder global sichtbar ist bzw. wird — global geteilte Inhalte können
  // auch Mitglieder anderer Organisationen erwähnen, org-interne nur die eigenen.
  const mentionScopeGlobal = mentionTarget === "compose"
    ? shareGlobally
    : mentionTarget != null && posts.find((p) => p.id === mentionTarget)?.visibility === "global";
  const mentionPool = mentionScopeGlobal ? allProfiles : allProfiles.filter((p) => (p.organization_id || null) === myOrgId);
  const mentionResults = mentionTarget == null ? [] : mentionPool
    .filter((p) => p.id !== selfId && (!mentionQuery || (p.full_name || "").toLowerCase().includes(mentionQuery.toLowerCase())))
    .slice(0, 6);

  function selectMention(profile) {
    const name = profile.full_name || "Unbenannt";
    const insertion = `@${name} `;
    if (mentionTarget === "compose") {
      const next = newPost.slice(0, mentionStart) + insertion + newPost.slice(mentionStart + 1 + mentionQuery.length);
      setNewPost(next);
      requestAnimationFrame(() => postTextareaRef.current?.focus());
    } else {
      const postId = mentionTarget;
      const current = commentDrafts[postId] || "";
      const next = current.slice(0, mentionStart) + insertion + current.slice(mentionStart + 1 + mentionQuery.length);
      setCommentDrafts((prev) => ({ ...prev, [postId]: next }));
      requestAnimationFrame(() => commentInputRefs.current[postId]?.focus());
    }
    setMentionTarget(null);
    setMentionQuery("");
    setMentionStart(-1);
  }

  function knownNames() {
    return allProfiles.map((p) => ({ id: p.id, name: p.full_name })).filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
  }

  // Wer per @Name im Text erwähnt wurde (für Benachrichtigungen beim Senden),
  // ohne sich selbst — man muss sich nicht selbst benachrichtigen.
  function extractMentionedIds(text) {
    const names = knownNames();
    if (!text || !names.length) return [];
    const pattern = new RegExp("@(" + names.map((n) => n.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?!\\S)", "g");
    const ids = new Set();
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const found = names.find((n) => n.name === match[1]);
      if (found && found.id !== selfId) ids.add(found.id);
    }
    return [...ids];
  }

  function extractHashtags(text) {
    if (!text) return [];
    const tags = new Set();
    const pattern = /#([\p{L}\p{N}_]+)/gu;
    let match;
    while ((match = pattern.exec(text)) !== null) tags.add(match[1].toLowerCase());
    return [...tags];
  }

  // Hebt "@Name" (bekannte Profile) und "#Hashtag" im angezeigten Text
  // hervor — @Name ist zum Profil klickbar, #Hashtag filtert den Feed.
  function renderContent(text) {
    if (!text) return text;
    const names = knownNames();
    const mentionAlt = names.length ? names.map((n) => n.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") : null;
    const pattern = new RegExp((mentionAlt ? `@(${mentionAlt})(?!\\S)|` : "") + `#([\\p{L}\\p{N}_]+)`, "gu");
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      if (match[1]) {
        const found = names.find((n) => n.name === match[1]);
        parts.push(
          <span key={match.index} className="text-amber font-semibold cursor-pointer hover:underline" onClick={() => openProfile(found.id)}>
            @{match[1]}
          </span>
        );
      } else if (match[2]) {
        const tag = match[2];
        parts.push(
          <span key={match.index} className="text-violet font-semibold cursor-pointer hover:underline" onClick={() => setActiveHashtag((cur) => (cur === tag.toLowerCase() ? null : tag.toLowerCase()))}>
            #{tag}
          </span>
        );
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  }

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

    let pollExpiresAt = null;
    if (showPollForm) {
      if (pollDurationHours === "custom") {
        pollExpiresAt = pollCustomExpiry ? new Date(pollCustomExpiry).toISOString() : null;
      } else if (pollDurationHours !== "unlimited") {
        pollExpiresAt = new Date(Date.now() + Number(pollDurationHours) * 60 * 60 * 1000).toISOString();
      }
    }

    const { data: newRow, error: insErr } = await supabase.from("community_posts").insert({
      user_id: session.user.id,
      content: newPost.trim(),
      group_id: newPostGroup || null,
      attachment_url,
      attachment_type,
      visibility: shareGlobally ? "global" : "org",
      organization_id: myOrgId,
      poll_expires_at: showPollForm ? pollExpiresAt : null,
    }).select().single();
    setPosting(false);
    if (insErr) { setError(insErr.message); return; }

    const mentionedIds = extractMentionedIds(newPost);
    if (mentionedIds.length) {
      await supabase.from("community_notifications").insert(
        mentionedIds.map((uid) => ({ user_id: uid, actor_id: session.user.id, type: "mention_post", post_id: newRow.id }))
      );
    }

    const pollLabels = newPollOptions.map((o) => o.trim()).filter(Boolean);
    if (showPollForm && pollLabels.length >= 2) {
      await supabase.from("community_poll_options").insert(
        pollLabels.map((label, i) => ({ post_id: newRow.id, label, position: i }))
      );
    }

    // Erst nach bestätigtem Speichern leeren — sonst geht ein fehlgeschlagener
    // Beitrag komplett verloren, während die Oberfläche "erfolgreich" wirkt.
    setNewPost("");
    setNewPostFile(null);
    setShareGlobally(false);
    setShowPollForm(false);
    setNewPollOptions(["", ""]);
    setPollDurationHours("24");
    setPollCustomExpiry("");
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
    const loeschFehler = await loescheGeprueft(supabase.from("community_groups").delete().eq("id", id), "Diese Gruppe darf nur löschen, wer sie angelegt hat.");
    const err = loeschFehler ? { message: loeschFehler } : null;
    if (err) { setError(err.message); return; }
    if (activeGroup === id) setActiveGroup("all");
    await load();
  }

  // Reaktionen nur lokal aktualisieren statt die ganze Seite neu zu laden —
  // ein voller load() würde kurz die Ladeanzeige zeigen und die Liste
  // unmounten, wodurch man beim Scrollen zurück nach oben "fliegt".
  async function setReaction(postId, reaction) {
    const { data: { session } } = await supabase.auth.getSession();
    const mine = kudosByPost[postId]?.mine;
    if (mine) await supabase.from("community_kudos").delete().eq("post_id", postId).eq("user_id", session.user.id);
    if (mine !== reaction) {
      const { error: err } = await supabase.from("community_kudos").insert({ post_id: postId, user_id: session.user.id, reaction });
      if (err) { setError(err.message); return; }
    }
    setKudosByPost((prev) => {
      const current = prev[postId] || { counts: {}, mine: null };
      const counts = { ...current.counts };
      if (mine) counts[mine] = Math.max(0, (counts[mine] || 0) - 1);
      if (mine !== reaction) counts[reaction] = (counts[reaction] || 0) + 1;
      return { ...prev, [postId]: { counts, mine: mine === reaction ? null : reaction } };
    });
  }

  async function setCommentReaction(commentId, reaction) {
    const { data: { session } } = await supabase.auth.getSession();
    const mine = kudosByComment[commentId]?.mine;
    if (mine) await supabase.from("community_comment_kudos").delete().eq("comment_id", commentId).eq("user_id", session.user.id);
    if (mine !== reaction) {
      const { error: err } = await supabase.from("community_comment_kudos").insert({ comment_id: commentId, user_id: session.user.id, reaction });
      if (err) { setError(err.message); return; }
    }
    setKudosByComment((prev) => {
      const current = prev[commentId] || { counts: {}, mine: null };
      const counts = { ...current.counts };
      if (mine) counts[mine] = Math.max(0, (counts[mine] || 0) - 1);
      if (mine !== reaction) counts[reaction] = (counts[reaction] || 0) + 1;
      return { ...prev, [commentId]: { counts, mine: mine === reaction ? null : reaction } };
    });
  }

  async function submitComment(postId) {
    const text = commentDrafts[postId];
    if (!text?.trim()) return;
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const { data: newComment, error: err } = await supabase.from("community_comments").insert({ post_id: postId, user_id: session.user.id, content: text.trim() }).select().single();
    if (err) { setError(err.message); return; }

    const mentionedIds = extractMentionedIds(text.trim());
    if (mentionedIds.length) {
      await supabase.from("community_notifications").insert(
        mentionedIds.map((uid) => ({ user_id: uid, actor_id: session.user.id, type: "mention_comment", post_id: postId, comment_id: newComment.id }))
      );
    }

    // Erst nach bestätigtem Speichern leeren — sonst geht ein fehlgeschlagener
    // Kommentar komplett verloren.
    setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    await load();
  }

  async function deletePost(postId) {
    setError("");
    const loeschFehler = await loescheGeprueft(supabase.from("community_posts").delete().eq("id", postId), "Diesen Beitrag darf nur löschen, wer ihn verfasst hat, oder ein Admin.");
    const err = loeschFehler ? { message: loeschFehler } : null;
    if (err) { setError(err.message); return; }
    await load();
  }

  function startEditPost(p) {
    setEditingPostId(p.id);
    setEditDraft(p.content);
  }

  async function saveEditPost(postId) {
    if (!editDraft.trim()) return;
    setError("");
    const { error: err } = await supabase.from("community_posts").update({ content: editDraft.trim() }).eq("id", postId);
    if (err) { setError(err.message); return; }
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, content: editDraft.trim() } : p)));
    setEditingPostId(null);
  }

  async function togglePin(p) {
    setError("");
    const err = await aendereGeprueft(supabase.from("community_posts").update({ pinned: !p.pinned }).eq("id", p.id), "Das Anheften wurde abgelehnt — das dürfen nur Manager und Admins.");
    if (err) { setError(err); return; }
    setPosts((prev) => prev.map((row) => (row.id === p.id ? { ...row, pinned: !p.pinned } : row)));
  }

  function updatePollOptionDraft(index, value) {
    setNewPollOptions((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  async function votePoll(postId, optionId) {
    const { data: { session } } = await supabase.auth.getSession();
    const mineOptionId = pollVotesByPost[postId]?.mineOptionId;
    if (mineOptionId) await supabase.from("community_poll_votes").delete().eq("post_id", postId).eq("user_id", session.user.id);
    if (mineOptionId !== optionId) {
      const { error: err } = await supabase.from("community_poll_votes").insert({ post_id: postId, option_id: optionId, user_id: session.user.id });
      if (err) { setError(err.message); return; }
    }
    setPollVotesByPost((prev) => {
      const current = prev[postId] || { countByOption: {}, mineOptionId: null };
      const countByOption = { ...current.countByOption };
      if (mineOptionId) countByOption[mineOptionId] = Math.max(0, (countByOption[mineOptionId] || 0) - 1);
      if (mineOptionId !== optionId) countByOption[optionId] = (countByOption[optionId] || 0) + 1;
      return { ...prev, [postId]: { countByOption, mineOptionId: mineOptionId === optionId ? null : optionId } };
    });
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  // "Meine Organisation" zeigt alles aus der eigenen Organisation (auch
  // Beiträge, die zusätzlich global geteilt wurden). "Global" zeigt nur
  // bewusst organisationsübergreifend geteilte Beiträge, unabhängig von der
  // Organisation der Autorin/des Autors.
  // organization_id ist die beim Erstellen AKTIVE Organisation (siehe
  // migration_62) — Fallback auf orgByUserId nur für den Fall, dass die
  // Migration in dieser Umgebung noch nicht eingespielt wurde.
  const scopedPosts = posts.filter((p) => scope === "global" ? p.visibility === "global" : (p.organization_id || orgByUserId[p.user_id]) === myOrgId);
  const visiblePosts = (activeGroup === "all" ? scopedPosts : scopedPosts.filter((p) => p.group_id === activeGroup))
    .filter((p) => !searchQuery.trim() || p.content.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((p) => !activeHashtag || extractHashtags(p.content).includes(activeHashtag))
    // Angepinnte Beiträge zuerst, danach wie gewohnt chronologisch.
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  // Häufigste Hashtags aus den aktuell sichtbaren (scope-/gruppengefilterten)
  // Beiträgen, für die Vorschlags-Chips.
  const trendingHashtags = (() => {
    const counts = {};
    (activeGroup === "all" ? scopedPosts : scopedPosts.filter((p) => p.group_id === activeGroup)).forEach((p) => {
      extractHashtags(p.content).forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag);
  })();

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Community</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Teilt Erfolge, Tipps, Fotos und Erfahrungen — standardmäßig nur mit eurer Organisation, optional auch global.</p>

      <InfoCard>
        Mit <strong>@Name</strong> könnt ihr jemanden erwähnen (Vorschläge erscheinen beim Tippen) — die Person bekommt beim nächsten Besuch eine Benachrichtigung.
        Mit <strong>#Stichwort</strong> setzt ihr ein Hashtag, das oben als Filter-Chip anklickbar wird.
        Mit 🔥👍❤️😂 könnt ihr auf Beiträge und Kommentare reagieren.
        Manager/Admins können wichtige Beiträge <strong>anpinnen</strong> (📌, erscheinen zuerst) und ihr könnt beim Posten eine <strong>Umfrage</strong> anhängen.
        Eigene Beiträge lassen sich nachträglich bearbeiten oder löschen.
      </InfoCard>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      {mentionNotifications.length > 0 && (
        <div className="card border border-amber/40 mb-4">
          <div className="font-semibold text-textMain text-sm mb-2">Du wurdest erwähnt</div>
          <div className="flex flex-col gap-1.5">
            {mentionNotifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  const el = document.getElementById(`post-${n.post_id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="text-left text-xs text-textMuted hover:text-textMain"
              >
                <span className="text-amber font-semibold">{profileMap[n.actor_id]?.name || "Jemand"}</span>{" "}
                hat dich {n.type === "mention_comment" ? "in einem Kommentar" : "in einem Beitrag"} erwähnt
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card flex items-center gap-2 mb-4">
        <Icon name="search" size={15} />
        <input className="bg-transparent border-none outline-none text-sm flex-1 text-textMain" placeholder="Beiträge durchsuchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {trendingHashtags.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {trendingHashtags.map((tag) => (
            <button key={tag} onClick={() => setActiveHashtag((cur) => (cur === tag ? null : tag))}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${activeHashtag === tag ? "bg-violet text-white border-violet" : "border-line text-textMuted hover:text-textMain hover:border-line"}`}>
              #{tag}
            </button>
          ))}
          {activeHashtag && (
            <button onClick={() => setActiveHashtag(null)} className="text-xs text-textMuted hover:text-textMain">Filter zurücksetzen</button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setScope("org")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${scope === "org" ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-line"}`}>
          Meine Organisation
        </button>
        <button onClick={() => setScope("global")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${scope === "global" ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-line"}`}>
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
                <div className="text-xs text-textMuted">Meiste Reaktionen diese Woche</div>
              </div>
            )}
            {kudosWall.topXp && (
              <div className="text-center">
                <div className="text-lg">📈</div>
                <div className="text-sm text-textMain font-semibold">{kudosWall.topXp.name}</div>
                <div className="text-xs text-textMuted">Meiste XP diese Woche</div>
              </div>
            )}
            {kudosWall.topStreak && (
              <div className="text-center">
                <div className="text-lg">⚡</div>
                <div className="text-sm text-textMain font-semibold">{kudosWall.topStreak.name}</div>
                <div className="text-xs text-textMuted">Längste Serie</div>
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
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${activeGroup === "all" ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-line"}`}>
          Alle
        </button>
        {groups.map((g) => (
          <div key={g.id} className="relative group">
            <button onClick={() => setActiveGroup(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${activeGroup === g.id ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain hover:border-line"}`}>
              {g.name}
            </button>
            {isManager && (
              <button onClick={() => deleteGroup(g.id)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-coral text-textMain text-[9px] items-center justify-center hidden group-hover:flex">×</button>
            )}
          </div>
        ))}
        {isManager && !showGroupForm && (
          <button onClick={() => setShowGroupForm(true)} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-line text-textMuted hover:text-textMain hover:border-line">
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

      <div className="card mb-6 relative">
        <textarea
          ref={postTextareaRef}
          className="input"
          placeholder="Was gibt's Neues? Ein Erfolg, ein Tipp, ein Foto... (@ erwähnt jemanden, # setzt ein Hashtag)"
          rows={3}
          value={newPost}
          onChange={(e) => { setNewPost(e.target.value); handleMentionChange("compose", e.target.value, e.target.selectionStart); }}
          onKeyUp={(e) => handleMentionChange("compose", e.target.value, e.target.selectionStart)}
          onBlur={() => setTimeout(() => setMentionTarget((t) => (t === "compose" ? null : t)), 150)}
        />
        {mentionTarget === "compose" && mentionResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-line bg-[var(--card-bg,#1a1d29)] shadow-lg">
            {mentionResults.map((p) => (
              <button key={p.id} onMouseDown={(e) => { e.preventDefault(); selectMention(p); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs hover:bg-white/5">
                <Avatar name={p.full_name || "?"} src={p.avatar_url} size={20} /> {p.full_name || "Unbenannt"}
              </button>
            ))}
          </div>
        )}
        {showPollForm && (
          <div className="flex flex-col gap-1.5 mt-2.5 border-t border-line pt-2.5">
            <div className="text-xs text-textMuted mb-0.5">Umfrage-Optionen (mind. 2):</div>
            {newPollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input className="input !py-1.5 text-xs flex-1" placeholder={`Option ${i + 1}`} value={opt} onChange={(e) => updatePollOptionDraft(i, e.target.value)} />
                {newPollOptions.length > 2 && (
                  <button onClick={() => setNewPollOptions((prev) => prev.filter((_, idx) => idx !== i))} className="btn-ghost text-xs !px-1.5 text-coral">×</button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 flex-wrap">
              {newPollOptions.length < 6 && (
                <button onClick={() => setNewPollOptions((prev) => [...prev, ""])} className="btn-ghost text-xs">+ Option</button>
              )}
              <label className="flex items-center gap-1.5 text-xs text-textMuted">
                Läuft ab:
                <select className="input !w-auto !py-1 text-xs" value={pollDurationHours} onChange={(e) => setPollDurationHours(e.target.value)}>
                  <option value="1">nach 1 Stunde</option>
                  <option value="24">nach 1 Tag</option>
                  <option value="72">nach 3 Tagen</option>
                  <option value="168">nach 1 Woche</option>
                  <option value="unlimited">nie</option>
                  <option value="custom">eigenes Datum...</option>
                </select>
              </label>
              {pollDurationHours === "custom" && (
                <input
                  type="datetime-local"
                  className="input !w-auto !py-1 text-xs"
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  value={pollCustomExpiry}
                  onChange={(e) => setPollCustomExpiry(e.target.value)}
                />
              )}
              <button onClick={() => { setShowPollForm(false); setNewPollOptions(["", ""]); }} className="btn-ghost text-xs text-coral">Umfrage entfernen</button>
            </div>
          </div>
        )}
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
          {!showPollForm && (
            <button onClick={() => setShowPollForm(true)} className="btn-ghost text-xs">📊 Umfrage</button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-textMuted cursor-pointer select-none">
            <input type="checkbox" checked={shareGlobally} onChange={(e) => setShareGlobally(e.target.checked)} />
            Auch in der globalen Community teilen
          </label>
          <button disabled={posting || !newPost.trim() || (showPollForm && pollDurationHours === "custom" && !pollCustomExpiry)} onClick={submitPost} className="btn ml-auto disabled:opacity-40">Posten</button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {visiblePosts.map((p) => {
          const kudos = kudosByPost[p.id] || { counts: {}, mine: null };
          const comments = commentsByPost[p.id] || [];
          const authorName = profileMap[p.user_id]?.name || "Unbenannt";
          const canEditThis = p.user_id === selfId;
          const canDeleteThis = p.user_id === selfId || canModerate;
          const pollOptions = pollOptionsByPost[p.id] || [];
          const pollVotes = pollVotesByPost[p.id] || { countByOption: {}, mineOptionId: null };
          const pollTotal = Object.values(pollVotes.countByOption).reduce((a, b) => a + b, 0);
          return (
            <div key={p.id} id={`post-${p.id}`} className={`card ${highlightPostId === p.id ? "ring-2 ring-amber" : p.pinned ? "border border-amber/40" : friendIds.has(p.user_id) ? "border border-violet/25" : ""}`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5 cursor-pointer hover:opacity-80" onClick={() => openProfile(p.user_id)}>
                  <Avatar name={authorName} src={profileMap[p.user_id]?.avatar} size={34} />
                  <div>
                    <div className="font-semibold text-textMain text-sm flex items-center gap-1.5">
                      {authorName}
                      {friendIds.has(p.user_id) && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet/15 text-violet font-semibold">Freund</span>}
                      {p.pinned && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber/15 text-amber font-semibold">📌 Angepinnt</span>}
                    </div>
                    <div className="text-[11px] text-textMuted">{new Date(p.created_at).toLocaleString("de-DE")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canModerate && (
                    <button onClick={() => togglePin(p)} className="btn-ghost text-xs">{p.pinned ? "Lösen" : "Anpinnen"}</button>
                  )}
                  {canEditThis && editingPostId !== p.id && (
                    <button onClick={() => startEditPost(p)} className="btn-ghost text-xs">Bearbeiten</button>
                  )}
                  {canDeleteThis && (
                    <button onClick={() => deletePost(p.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                  )}
                </div>
              </div>

              {editingPostId === p.id ? (
                <div className="mb-3">
                  <textarea className="input" rows={3} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                  <div className="flex items-center gap-2 mt-1.5">
                    <button disabled={!editDraft.trim()} onClick={() => saveEditPost(p.id)} className="btn-ghost text-xs disabled:opacity-40">Speichern</button>
                    <button onClick={() => setEditingPostId(null)} className="btn-ghost text-xs">Abbrechen</button>
                  </div>
                </div>
              ) : (
                <>
                <p className="text-sm text-textMain whitespace-pre-wrap mb-3">{renderContent(p.content)}</p>
                {/* Beiträge, die aus einem Skript-Kommentar entstanden sind
                    (migration_91), führen zurück zum Skript — sonst wüsste
                    niemand, worüber hier eigentlich geredet wird. */}
                {p.script_id && (
                  <button onClick={() => router.push("/scripts")}
                    className="btn-ghost text-xs mb-3 inline-flex items-center gap-1.5">
                    📄 Zum Skript in der Bibliothek
                  </button>
                )}
                </>
              )}

              {pollOptions.length > 0 && (() => {
                const pollExpired = p.poll_expires_at && new Date(p.poll_expires_at) < new Date();
                return (
                  <div className="mb-3">
                    <div className="flex flex-col gap-1.5">
                      {pollOptions.map((o) => {
                        const count = pollVotes.countByOption[o.id] || 0;
                        const pct = pollTotal > 0 ? Math.round((count / pollTotal) * 100) : 0;
                        const mine = pollVotes.mineOptionId === o.id;
                        return (
                          <button
                            key={o.id}
                            disabled={pollExpired}
                            onClick={() => votePoll(p.id, o.id)}
                            className={`relative text-left text-xs rounded-lg border px-3 py-2 overflow-hidden ${mine ? "border-amber" : "border-line"} ${pollExpired ? "cursor-default opacity-80" : ""}`}
                          >
                            <div className="absolute inset-y-0 left-0 bg-amber/15" style={{ width: `${pct}%` }} />
                            <div className="relative flex items-center justify-between gap-2">
                              <span className={mine ? "text-amber font-semibold" : "text-textMain"}>{o.label}</span>
                              <span className="text-textMuted flex-shrink-0">{pct}% ({count})</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-textMuted mt-1">
                      {pollExpired
                        ? "Umfrage beendet"
                        : p.poll_expires_at
                        ? `Läuft bis ${new Date(p.poll_expires_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                        : "Läuft unbegrenzt"}
                    </div>
                  </div>
                );
              })()}

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

              <div className="flex items-center gap-1">
                {REACTION_TYPES.map((r) => {
                  const count = kudos.counts?.[r.key] || 0;
                  const mine = kudos.mine === r.key;
                  return (
                    <button key={r.key} onClick={() => setReaction(p.id, r.key)} className={`btn-ghost !px-1.5 !py-1 text-xs flex items-center gap-1 ${mine ? "text-amber border-amber/40" : ""}`}>
                      <span>{r.emoji}</span>{count > 0 && <span>{count}</span>}
                    </button>
                  );
                })}
              </div>

              {comments.length > 0 && (() => {
                // Meiste Reaktionen zuerst; bei Gleichstand bleibt die
                // chronologische Reihenfolge erhalten (stabile Sortierung).
                const sortedComments = [...comments].sort((a, b) => totalReactions(kudosByComment[b.id]) - totalReactions(kudosByComment[a.id]));
                const topCount = totalReactions(kudosByComment[sortedComments[0]?.id]);
                return (
                  <div className="flex flex-col gap-2.5 mt-3 pt-3 border-t border-line">
                    {sortedComments.map((c) => {
                      const cKudos = kudosByComment[c.id] || { counts: {}, mine: null };
                      const cTotal = totalReactions(cKudos);
                      const isTop = topCount > 0 && cTotal === topCount;
                      return (
                        <div key={c.id} className="flex items-start gap-2">
                          <button onClick={() => openProfile(c.user_id)} className="flex-shrink-0">
                            <Avatar name={profileMap[c.user_id]?.name || "?"} src={profileMap[c.user_id]?.avatar} size={22} />
                          </button>
                          <div className="text-xs flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-textMain cursor-pointer hover:underline" onClick={() => openProfile(c.user_id)}>{profileMap[c.user_id]?.name || "Unbenannt"}:</span>
                              <span className="text-textMuted">{renderContent(c.content)}</span>
                              {isTop && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber/15 text-amber font-semibold flex-shrink-0">🏆 Top-Antwort</span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 mt-1">
                              {REACTION_TYPES.map((r) => {
                                const count = cKudos.counts?.[r.key] || 0;
                                const mine = cKudos.mine === r.key;
                                return (
                                  <button key={r.key} onClick={() => setCommentReaction(c.id, r.key)} className={`btn-ghost !py-0.5 !px-1 text-[10px] inline-flex items-center gap-0.5 ${mine ? "text-amber border-amber/40" : ""}`}>
                                    <span>{r.emoji}</span>{count > 0 && <span>{count}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="flex items-center gap-2 mt-3 relative">
                <input
                  ref={(el) => { commentInputRefs.current[p.id] = el; }}
                  className="input flex-1 text-xs"
                  placeholder="Kommentieren... (@ um jemanden zu erwähnen)"
                  value={commentDrafts[p.id] || ""}
                  onChange={(e) => { setCommentDrafts((prev) => ({ ...prev, [p.id]: e.target.value })); handleMentionChange(p.id, e.target.value, e.target.selectionStart); }}
                  onKeyUp={(e) => e.key !== "Enter" && handleMentionChange(p.id, e.target.value, e.target.selectionStart)}
                  onKeyDown={(e) => e.key === "Enter" && submitComment(p.id)}
                  onBlur={() => setTimeout(() => setMentionTarget((t) => (t === p.id ? null : t)), 150)}
                />
                <button onClick={() => submitComment(p.id)} className="btn-ghost text-xs">Senden</button>
                {mentionTarget === p.id && mentionResults.length > 0 && (
                  <div className="absolute z-10 bottom-full mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-line bg-[var(--card-bg,#1a1d29)] shadow-lg">
                    {mentionResults.map((mp) => (
                      <button key={mp.id} onMouseDown={(e) => { e.preventDefault(); selectMention(mp); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs hover:bg-white/5">
                        <Avatar name={mp.full_name || "?"} src={mp.avatar_url} size={20} /> {mp.full_name || "Unbenannt"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {visiblePosts.length === 0 && <p className="text-textMuted text-sm">Noch keine Beiträge hier — sei der/die Erste!</p>}
      </div>
    </Layout>
  );
}
