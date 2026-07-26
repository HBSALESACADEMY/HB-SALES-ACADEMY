import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Avatar from "./Avatar";
import { supabase } from "../lib/supabaseClient";

const FIELD_LABELS = {
  website: "Webseite",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  phone: "Telefon",
};

export default function ProfileModal({ userId, onClose }) {
  const router = useRouter();
  const [selfId, setSelfId] = useState(null);
  const [target, setTarget] = useState(null);
  const [friendship, setFriendship] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setSelfId(session.user.id);

      const [{ data: profile }, { data: fr }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("friendships").select("*")
          .or(`and(requester_id.eq.${session.user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${session.user.id})`)
          .maybeSingle(),
      ]);
      setTarget(profile);
      setFriendship(fr);
      setLoading(false);
    }
    if (userId) load();
  }, [userId]);

  if (!userId) return null;

  const isSelf = selfId === userId;
  const isFriend = friendship?.status === "accepted";
  const visibility = target?.contact_visibility || {};

  async function sendRequest() {
    setBusy(true);
    await supabase.from("friendships").insert({ requester_id: selfId, addressee_id: userId });
    const { data: fr } = await supabase.from("friendships").select("*")
      .or(`and(requester_id.eq.${selfId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${selfId})`).maybeSingle();
    setFriendship(fr);
    setBusy(false);
  }

  async function respond(status) {
    setBusy(true);
    await supabase.from("friendships").update({ status }).eq("id", friendship.id);
    setFriendship((f) => ({ ...f, status }));
    setBusy(false);
  }

  function fieldVisible(key) {
    return isSelf || visibility[key] !== "friends" || isFriend;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        {loading || !target ? (
          <p className="text-textMuted text-sm py-6 text-center">Lädt...</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Avatar name={target.full_name || "?"} src={target.avatar_url} size={56} />
                <div>
                  <div className="font-display font-semibold text-white">{target.full_name || "Unbenannt"}</div>
                  {fieldVisible("role_title") && (target.role_title || target.company_name) && (
                    <div className="text-xs text-textMuted">{[target.role_title, target.company_name].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="text-textMuted hover:text-white text-lg leading-none">×</button>
            </div>

            {target.bio && fieldVisible("bio") && <p className="text-sm text-textMuted mb-4">{target.bio}</p>}

            <div className="flex flex-col gap-1.5 mb-4">
              {["website", "instagram", "linkedin", "phone"].map((key) => {
                if (!target[key] || !fieldVisible(key)) return null;
                let href = null;
                if (key === "website") href = target.website.startsWith("http") ? target.website : `https://${target.website}`;
                if (key === "instagram") href = `https://instagram.com/${target.instagram.replace("@", "")}`;
                if (key === "linkedin") href = target.linkedin.startsWith("http") ? target.linkedin : `https://${target.linkedin}`;
                return (
                  <div key={key} className="text-xs flex items-center gap-2">
                    <span className="text-textMuted w-16 flex-shrink-0">{FIELD_LABELS[key]}</span>
                    {href ? <a href={href} target="_blank" rel="noreferrer" className="text-amber hover:underline">{target[key]}</a> : <span className="text-white">{target[key]}</span>}
                  </div>
                );
              })}
              {!["website", "instagram", "linkedin", "phone"].some((k) => target[k] && fieldVisible(k)) && (
                <p className="text-xs text-textMuted">Keine öffentlichen Kontaktdaten.</p>
              )}
            </div>

            {!isSelf && (
              <div className="flex items-center gap-2 pt-3 border-t border-line">
                {!friendship && (
                  <button disabled={busy} onClick={sendRequest} className="btn-ghost text-xs flex-1 disabled:opacity-40">Anfrage senden</button>
                )}
                {friendship?.status === "pending" && friendship.requester_id === selfId && (
                  <span className="text-xs text-textMuted flex-1 text-center">Angefragt...</span>
                )}
                {friendship?.status === "pending" && friendship.addressee_id === selfId && (
                  <>
                    <button disabled={busy} onClick={() => respond("accepted")} className="btn-ghost text-xs flex-1 text-teal border-teal/40 disabled:opacity-40">Annehmen</button>
                    <button disabled={busy} onClick={() => respond("declined")} className="btn-ghost text-xs flex-1 text-coral border-coral/40 disabled:opacity-40">Ablehnen</button>
                  </>
                )}
                {friendship?.status === "declined" && (
                  <button disabled={busy} onClick={sendRequest} className="btn-ghost text-xs flex-1 disabled:opacity-40">Erneut anfragen</button>
                )}
                {isFriend && (
                  <button onClick={() => { onClose(); router.push(`/messages?to=${userId}`); }} className="btn text-xs flex-1 justify-center">Nachricht schreiben</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
