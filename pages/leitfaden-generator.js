import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabaseClient";
import { apiPost } from "../lib/apiClient";
import { openProfile } from "../lib/profileModalBus";

const TYPES = [
  { id: "cold_call", label: "Cold Call" },
  { id: "closing_call", label: "Closing Call" },
];

function GuideContent({ content }) {
  return (
    <div className="flex flex-col gap-3">
      {(content?.phasen || []).map((p, i) => (
        <div key={i}>
          <div className="text-sm font-display font-semibold text-white">{p.phase}</div>
          {p.ziel && <div className="text-xs text-textMuted italic mb-1">{p.ziel}</div>}
          <ul className="text-xs text-textMuted list-disc pl-4 space-y-0.5">
            {(p.punkte || []).map((pt, j) => <li key={j}>{pt}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function GuideGenerator() {
  const [userId, setUserId] = useState(null);
  const [type, setType] = useState("cold_call");
  const [form, setForm] = useState({ produkt: "", zielgruppe: "", kontext: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentGuide, setCurrentGuide] = useState(null);
  const [guides, setGuides] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setUserId(session.user.id);
    const { data } = await supabase.from("guides").select("*").order("created_at", { ascending: false });
    const rows = data || [];
    setGuides(rows);
    const ids = Array.from(new Set(rows.map((g) => g.created_by)));
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
      const map = {};
      (profiles || []).forEach((p) => { map[p.id] = { name: p.full_name || "Unbenannt", avatar: p.avatar_url }; });
      setProfileMap(map);
    }
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    if (!form.produkt.trim() || !form.zielgruppe.trim()) { setError("Produkt/Angebot und Zielgruppe bitte ausfüllen."); return; }
    setLoading(true);
    setError("");
    setCurrentGuide(null);
    try {
      const { guide } = await apiPost("/api/guide-generate", { type, ...form });
      setCurrentGuide(guide);
      setGuides((prev) => [guide, ...prev]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function togglePublish(g) {
    const { error: err } = await supabase.from("guides").update({ is_published: !g.is_published }).eq("id", g.id);
    if (err) { setError(err.message); return; }
    setGuides((prev) => prev.map((x) => (x.id === g.id ? { ...x, is_published: !g.is_published } : x)));
    if (currentGuide?.id === g.id) setCurrentGuide((c) => ({ ...c, is_published: !g.is_published }));
  }

  async function deleteGuide(id) {
    if (!confirm("Leitfaden wirklich löschen?")) return;
    const { error: err } = await supabase.from("guides").delete().eq("id", id);
    if (err) { setError(err.message); return; }
    setGuides((prev) => prev.filter((g) => g.id !== id));
    if (currentGuide?.id === id) setCurrentGuide(null);
  }

  const myGuides = guides.filter((g) => g.created_by === userId);
  const teamGuides = guides.filter((g) => g.created_by !== userId);

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Leitfaden-Generator</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">
        Individueller Gesprächsleitfaden für Cold Calls und Closing Calls — kein starres Skript zum Ablesen,
        sondern Ziele und Stichpunkte pro Phase, die du in eigenen Worten nutzt.
      </p>

      <div className="card mb-5">
        <div className="inline-flex border border-line rounded-lg overflow-hidden mb-4">
          {TYPES.map((t) => (
            <button key={t.id} className={`px-3.5 py-2 text-[12.5px] font-semibold ${type === t.id ? "bg-amber text-white" : "bg-surface text-textMuted"}`} onClick={() => setType(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <input className="input mb-2" placeholder="Produkt / Angebot" value={form.produkt} onChange={(e) => setForm((f) => ({ ...f, produkt: e.target.value }))} />
        <input className="input mb-2" placeholder="Zielgruppe (wer wird angerufen?)" value={form.zielgruppe} onChange={(e) => setForm((f) => ({ ...f, zielgruppe: e.target.value }))} />
        <textarea className="input mb-3" rows={2} placeholder="Zusätzlicher Kontext (optional): Besonderheiten, bekannte Einwände, Ton..." value={form.kontext} onChange={(e) => setForm((f) => ({ ...f, kontext: e.target.value }))} />
        {error && <p className="text-coral text-xs mb-2">{error}</p>}
        <button className="btn" onClick={generate} disabled={loading}>{loading ? "Generiere..." : "Leitfaden generieren"}</button>
      </div>

      {currentGuide && (
        <div className="card mb-6" style={{ borderLeft: "4px solid var(--org-accent, #E8368F)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-semibold text-white text-sm">{currentGuide.title}</div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => togglePublish(currentGuide)} className="btn-ghost text-xs">
                {currentGuide.is_published ? "Privat machen" : "Im Team veröffentlichen"}
              </button>
              <button onClick={() => deleteGuide(currentGuide.id)} className="btn-ghost text-xs text-coral">Löschen</button>
            </div>
          </div>
          <GuideContent content={currentGuide.content} />
        </div>
      )}

      <div className="mb-6">
        <div className="text-xs text-textMuted uppercase tracking-wide mb-2.5">Meine Leitfäden</div>
        <div className="flex flex-col gap-3">
          {myGuides.map((g) => {
            const isOpen = expandedId === g.id;
            return (
              <div key={g.id} className="card">
                <button onClick={() => setExpandedId(isOpen ? null : g.id)} className="flex items-center justify-between w-full text-left">
                  <div>
                    <div className="font-semibold text-white text-sm">{g.title}</div>
                    <div className="text-xs text-textMuted mt-0.5">
                      {TYPES.find((t) => t.id === g.type)?.label} · {new Date(g.created_at).toLocaleDateString("de-DE")}
                      {g.is_published && <span className="text-teal"> · veröffentlicht</span>}
                    </div>
                  </div>
                  <Icon name="chevron" size={14} color="#5A5F72" />
                </button>
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <GuideContent content={g.content} />
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => togglePublish(g)} className="btn-ghost text-xs">
                        {g.is_published ? "Privat machen" : "Im Team veröffentlichen"}
                      </button>
                      <button onClick={() => deleteGuide(g.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {myGuides.length === 0 && <p className="text-textMuted text-sm">Noch keine eigenen Leitfäden generiert.</p>}
        </div>
      </div>

      {teamGuides.length > 0 && (
        <div>
          <div className="text-xs text-textMuted uppercase tracking-wide mb-2.5">Team-Leitfäden</div>
          <div className="flex flex-col gap-3">
            {teamGuides.map((g) => {
              const isOpen = expandedId === g.id;
              const author = profileMap[g.created_by];
              return (
                <div key={g.id} className="card">
                  <button onClick={() => setExpandedId(isOpen ? null : g.id)} className="flex items-center justify-between w-full text-left">
                    <div className="flex items-center gap-2.5">
                      <span onClick={(e) => { e.stopPropagation(); openProfile(g.created_by); }}>
                        <Avatar name={author?.name || "?"} src={author?.avatar} size={28} />
                      </span>
                      <div>
                        <div className="font-semibold text-white text-sm">{g.title}</div>
                        <div className="text-xs text-textMuted mt-0.5">
                          {TYPES.find((t) => t.id === g.type)?.label} · von {author?.name || "Unbenannt"}
                        </div>
                      </div>
                    </div>
                    <Icon name="chevron" size={14} color="#5A5F72" />
                  </button>
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-line">
                      <GuideContent content={g.content} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Layout>
  );
}
