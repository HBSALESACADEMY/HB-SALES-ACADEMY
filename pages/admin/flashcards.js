import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import AIBadge from "../../components/AIBadge";
import AdminTabs from "../../components/AdminTabs";
import { supabase } from "../../lib/supabaseClient";
import { apiPost } from "../../lib/apiClient";
import { COURSES } from "../../lib/curriculum";
import { loescheGeprueft } from "../../lib/loeschen";

export default function FlashcardsAdmin() {
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(null); // courseId currently generating
  const [genMessage, setGenMessage] = useState("");

  const [draft, setDraft] = useState({ tag: "", front: "", back: "", file: null });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const [{ data: me }, { data: ownTeams }] = await Promise.all([
      supabase.from("profiles").select("role, is_admin, is_platform_admin").eq("id", session.user.id).maybeSingle(),
      supabase.from("teams").select("id").eq("created_by", session.user.id).limit(1),
    ]);
    // Teamleads dürfen Flashcards genauso verwalten wie Manager/Trainer/
    // Admins — siehe is_team_lead() in der RLS-Policy (migration_52).
    const isTeamLead = (ownTeams || []).length > 0;
    if (!me || (me.role !== "manager" && me.role !== "trainer" && !me.is_admin && !me.is_platform_admin && !isTeamLead)) {
      setIsManager(false);
      setLoading(false);
      return;
    }
    const { data: cs, error: cErr } = await supabase.from("flashcards").select("*").order("tag").order("created_at");
    if (cErr) setError(cErr.message);
    setCards(cs || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generateForCourse(courseId) {
    setGenerating(courseId);
    setGenMessage("");
    setError("");
    try {
      const { cards: created } = await apiPost("/api/flashcards-generate", { courseId });
      setGenMessage(`${created.length} Karte${created.length === 1 ? "" : "n"} erstellt.`);
      await load();
    } catch (e) {
      setError(e.message || "Fehler bei der Generierung.");
    }
    setGenerating(null);
  }

  async function addCard() {
    if (!draft.tag.trim() || !draft.front.trim() || !draft.back.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();

      let fileUrl = null, fileName = null;
      if (draft.file) {
        // Nur die Dateiendung im Pfad — Supabase Storage lehnt manche
        // Sonderzeichen im vollen Dateinamen mit "Invalid key" ab.
        const ext = (draft.file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("content-files").upload(path, draft.file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("content-files").getPublicUrl(path);
        fileUrl = pub.publicUrl;
        fileName = draft.file.name;
      }

      const { error: err } = await supabase.from("flashcards").insert({
        tag: draft.tag.trim(), front: draft.front.trim(), back: draft.back.trim(),
        file_url: fileUrl, file_name: fileName, created_by: session.user.id,
      });
      if (err) throw err;
      setDraft({ tag: "", front: "", back: "", file: null });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  async function deleteCard(id) {
    setError("");
    const loeschFehler = await loescheGeprueft(supabase.from("flashcards").delete().eq("id", id));
    const err = loeschFehler ? { message: loeschFehler } : null;
    if (err) setError(err.message);
    else await load();
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Flashcards verwalten</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager, Trainer, Teamleads und Admins verfügbar.</p>
      </Layout>
    );
  }

  const grouped = {};
  cards.forEach((c) => { grouped[c.tag] = grouped[c.tag] || []; grouped[c.tag].push(c); });

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Flashcards verwalten</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <p className="text-textMuted text-sm mb-6">Lass Lernkarten automatisch aus den Kursinhalten generieren, oder lege sie manuell an. Neue Karten erscheinen sofort für alle Vertriebler:innen deiner Organisation unter "Flashcards".</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}
      {genMessage && <div className="card border border-teal/40 text-teal text-sm mb-4">{genMessage}</div>}

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3 flex items-center gap-2">
          Automatisch aus Kursinhalten generieren
          <AIBadge title="Die Karten werden von einer KI entworfen — vor Veröffentlichung prüfen/anpassen." />
        </div>
        <div className="flex flex-col gap-2">
          {COURSES.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border border-line rounded-lg px-3 py-2">
              <span className="text-sm flex-1">{c.title}</span>
              <span className="text-[10.5px] text-textMuted">{c.modules.length} Module</span>
              <button disabled={generating === c.id} onClick={() => generateForCourse(c.id)} className="btn-ghost text-xs py-1.5 disabled:opacity-40">
                {generating === c.id ? "Generiert..." : "Karten generieren"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Manuell hinzufügen</div>
        <div className="flex flex-col gap-2.5">
          <input className="input" placeholder="Tag (z.B. Modultitel)" value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} />
          <textarea className="input" placeholder="Frage (Vorderseite)" rows={2} value={draft.front} onChange={(e) => setDraft({ ...draft, front: e.target.value })} />
          <textarea className="input" placeholder="Antwort (Rückseite)" rows={2} value={draft.back} onChange={(e) => setDraft({ ...draft, back: e.target.value })} />
          <label className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5 w-fit">
            <Icon name="download" size={12} /> {draft.file ? draft.file.name : "Datei anhängen (optional)"}
            <input type="file" className="hidden" onChange={(e) => setDraft({ ...draft, file: e.target.files[0] || null })} />
          </label>
          <button disabled={saving} onClick={addCard} className="btn self-start disabled:opacity-40">{saving ? "Speichert..." : "Karte hinzufügen"}</button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {Object.keys(grouped).length === 0 && <p className="text-textMuted text-sm">Noch keine Flashcards angelegt.</p>}
        {Object.entries(grouped).map(([tag, list]) => (
          <div key={tag} className="card">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-amber mb-3">{tag} · {list.length} Karte{list.length === 1 ? "" : "n"}</div>
            <div className="flex flex-col gap-2">
              {list.map((c) => (
                <div key={c.id} className="flex items-start gap-3 border border-line rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-textMain">{c.front}</p>
                    <p className="text-xs text-textMuted mt-1">{c.back}</p>
                    {c.file_url && (
                      <a href={c.file_url} target="_blank" rel="noreferrer" className="text-[11px] text-teal inline-flex items-center gap-1 mt-1">
                        <Icon name="download" size={10} /> {c.file_name || "Anhang"}
                      </a>
                    )}
                  </div>
                  <button onClick={() => deleteCard(c.id)} className="btn-ghost text-xs text-coral flex-shrink-0">Löschen</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
