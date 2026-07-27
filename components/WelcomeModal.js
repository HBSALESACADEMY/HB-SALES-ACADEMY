import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import { supabase } from "../lib/supabaseClient";

export default function WelcomeModal({ onClose }) {
  const [adminName, setAdminName] = useState(null);
  const [adminAvatar, setAdminAvatar] = useState(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("is_admin", true).limit(1).maybeSingle();
      setAdminName(data?.full_name || null);
      setAdminAvatar(data?.avatar_url || null);
    }
    load();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[220] p-4">
      <div className="card max-w-sm w-full">
        <div className="brand-stripe w-16 mb-4" />
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={adminName || "?"} src={adminAvatar} size={48} />
          <div>
            <div className="font-display font-semibold text-white">Herzlich willkommen! 👋</div>
            {adminName && <div className="text-xs text-textMuted">— {adminName}</div>}
          </div>
        </div>
        <p className="text-sm text-textMuted leading-relaxed mb-3">
          Schön, dass du da bist! Bei uns geht's um mehr als nur Vertrieb — wir wollen gemeinsam wachsen, uns
          gegenseitig unterstützen und Erfolge feiern.
        </p>
        <p className="text-sm text-textMuted leading-relaxed mb-5">
          Schau dich in der <b className="text-white">Community</b> um, vernetze dich mit deinem Team über{" "}
          <b className="text-white">Mitglieder</b>, und trau dich, Fragen zu stellen. Hier hilft jeder jedem.
          Viel Erfolg und einen tollen Start!
        </p>
        <button onClick={onClose} className="btn w-full justify-center">Los geht's!</button>
      </div>
    </div>
  );
}
