import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import { supabase } from "../../lib/supabaseClient";
import { getActiveOrgId } from "../../lib/activeOrg";

const COLORS = ["amber", "teal", "coral", "violet"];
const COLOR_HEX = { amber: "var(--org-accent, #CE3A5C)", teal: "#00E5C7", coral: "#FF4D6D", violet: "var(--org-color-1, #4C5DC9)" };

export default function ContentAdmin() {
  const router = useRouter();
  const [isManager, setIsManager] = useState(true);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [modulesByCourse, setModulesByCourse] = useState({});
  const [error, setError] = useState("");

  const [newCourse, setNewCourse] = useState({ title: "", description: "", color: "amber", navItemId: "" });
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [folders, setFolders] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState(null);

  const [moduleDrafts, setModuleDrafts] = useState({}); // courseId -> { title, content, file, uploading }

  async function load() {
    setLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const [{ data: me }, { data: ownTeams }] = await Promise.all([
      supabase.from("profiles").select("role, is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle(),
      supabase.from("teams").select("id").eq("created_by", session.user.id).limit(1),
    ]);
    // Teamleads dürfen eigene Kurse/Module genauso verwalten wie Manager/
    // Trainer/Admins — siehe is_team_lead() in der RLS-Policy (migration_52).
    const isTeamLead = (ownTeams || []).length > 0;
    if (!me || (me.role !== "manager" && me.role !== "trainer" && !me.is_admin && !me.is_platform_admin && !isTeamLead)) {
      setIsManager(false);
      setLoading(false);
      return;
    }
    const orgId = getActiveOrgId(me);
    setActiveOrgId(orgId);

    // Beides auf die gerade AKTIVE Organisation eingegrenzt — sonst würden
    // Plattform-Admins hier Kurse/Ordner aller Organisationen gemischt sehen
    // (siehe migration_53).
    const { data: cs, error: cErr } = orgId
      ? await supabase.from("custom_courses").select("*").eq("organization_id", orgId).order("order_index")
      : await supabase.from("custom_courses").select("*").order("order_index");
    if (cErr) setError(cErr.message);
    setCourses(cs || []);

    const { data: fld } = orgId
      ? await supabase.from("nav_items").select("*").eq("is_builtin", false).eq("organization_id", orgId).order("order_index")
      : await supabase.from("nav_items").select("*").eq("is_builtin", false).order("order_index");
    setFolders(fld || []);
    setNewCourse((prev) => ({ ...prev, navItemId: prev.navItemId || (fld && fld[0] ? fld[0].id : "") }));

    const { data: ms } = await supabase.from("custom_modules").select("*").order("order_index");
    const grouped = {};
    (ms || []).forEach((m) => {
      grouped[m.course_id] = grouped[m.course_id] || [];
      grouped[m.course_id].push(m);
    });
    setModulesByCourse(grouped);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createCourse() {
    if (!newCourse.title.trim() || !newCourse.navItemId) return;
    setCreatingCourse(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("custom_courses").insert({
      title: newCourse.title.trim(),
      description: newCourse.description.trim(),
      color: newCourse.color,
      nav_item_id: newCourse.navItemId,
      order_index: courses.length,
      created_by: session.user.id,
      organization_id: activeOrgId,
    });
    if (err) setError(err.message);
    else { setNewCourse({ title: "", description: "", color: "amber", navItemId: newCourse.navItemId }); await load(); }
    setCreatingCourse(false);
  }

  async function deleteCourse(id) {
    setError("");
    const { error: err } = await supabase.from("custom_courses").delete().eq("id", id);
    if (err) setError(err.message);
    else await load();
  }

  function setDraft(courseId, patch) {
    setModuleDrafts((prev) => ({ ...prev, [courseId]: { ...prev[courseId], ...patch } }));
  }

  async function addModule(courseId) {
    const draft = moduleDrafts[courseId] || {};
    if (!draft.title?.trim()) return;
    setDraft(courseId, { uploading: true });
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let videoUrl = null, fileUrl = null, fileName = null;

      if (draft.file) {
        const ext = draft.file.name.split(".").pop();
        const path = `${courseId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("course-videos").upload(path, draft.file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("course-videos").getPublicUrl(path);
        videoUrl = pub.publicUrl;
      }

      if (draft.attachment) {
        // Nur die Dateiendung im Pfad — Supabase Storage lehnt manche
        // Sonderzeichen im vollen Dateinamen mit "Invalid key" ab. Ordner-
        // Präfix ist die eigene Nutzer-ID (nicht die Kurs-ID) — das ist
        // der Präfix, den die content-files-Upload-Policy voraussetzt.
        const ext = (draft.attachment.name.split(".").pop() || "bin").toLowerCase();
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("content-files").upload(path, draft.attachment);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("content-files").getPublicUrl(path);
        fileUrl = pub.publicUrl;
        fileName = draft.attachment.name;
      }

      const existing = modulesByCourse[courseId] || [];
      const { error: insErr } = await supabase.from("custom_modules").insert({
        course_id: courseId,
        title: draft.title.trim(),
        content: draft.content?.trim() || null,
        video_url: videoUrl,
        file_url: fileUrl,
        file_name: fileName,
        order_index: existing.length,
        created_by: session.user.id,
      });
      if (insErr) throw insErr;

      setModuleDrafts((prev) => ({ ...prev, [courseId]: { title: "", content: "", file: null, attachment: null, uploading: false } }));
      await load();
    } catch (e) {
      setError(e.message || "Fehler beim Hinzufügen des Moduls.");
      setDraft(courseId, { uploading: false });
    }
  }

  async function deleteModule(id) {
    setError("");
    const { error: err } = await supabase.from("custom_modules").delete().eq("id", id);
    if (err) setError(err.message);
    else await load();
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isManager) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Inhalte verwalten</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Manager, Trainer, Teamleads und Admins verfügbar.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-display font-bold brand-text-gradient mb-1">Inhalte verwalten</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Hier füllst du einen Ordner mit <strong className="text-textMain">Kursen und Inhalten</strong> (Module, Text, Video, Anhänge). Den Ordner selbst — also den Reiter in der Sidebar — legst du unter „Navigation verwalten" an.</p>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Neuen Kurs anlegen</div>
        <div className="flex flex-col gap-2.5">
          <input className="input" placeholder="Titel" value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} />
          <textarea className="input" placeholder="Kurzbeschreibung" rows={2} value={newCourse.description} onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })} />
          {folders.length === 0 ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-coral">Noch kein Ordner vorhanden. Leg zuerst einen Ordner an, bevor du einen Kurs erstellst.</p>
              <button onClick={() => router.push("/admin/navigation")} className="btn-ghost text-xs flex-shrink-0">Zu „Navigation verwalten"</button>
            </div>
          ) : (
            <select className="input" value={newCourse.navItemId} onChange={(e) => setNewCourse({ ...newCourse, navItemId: e.target.value })}>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setNewCourse({ ...newCourse, color: c })}
                className={`w-7 h-7 rounded-full border-2 ${newCourse.color === c ? "border-white" : "border-transparent"}`}
                style={{ background: COLOR_HEX[c] }} title={c} />
            ))}
            <button disabled={creatingCourse || !newCourse.navItemId} onClick={createCourse} className="btn ml-auto disabled:opacity-40">Kurs anlegen</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {courses.map((c) => {
          const mods = modulesByCourse[c.id] || [];
          const draft = moduleDrafts[c.id] || { title: "", content: "", file: null };
          return (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-display text-base font-semibold text-textMain">{c.title}</div>
                  <div className="text-xs text-textMuted mt-0.5">{c.description}</div>
                  <div className="text-[10px] uppercase tracking-wide text-teal mt-1">{folders.find((f) => f.id === c.nav_item_id)?.label || "Ohne Ordner"}</div>
                </div>
                <button onClick={() => deleteCourse(c.id)} className="btn-ghost text-xs text-coral flex-shrink-0">Kurs löschen</button>
              </div>

              <div className="flex flex-col gap-2 mb-3">
                {mods.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 border border-line rounded-lg px-3 py-2">
                    <Icon name="book" size={14} />
                    <span className="text-sm flex-1">{m.title}</span>
                    {m.video_url && <span className="text-[10px] uppercase text-teal border border-teal/40 rounded px-1.5 py-0.5">Video</span>}
                    {m.file_url && (
                      <a href={m.file_url} target="_blank" rel="noreferrer" className="btn-ghost text-xs inline-flex items-center gap-1">
                        <Icon name="download" size={11} /> {m.file_name || "Anhang"}
                      </a>
                    )}
                    <button onClick={() => deleteModule(m.id)} className="btn-ghost text-xs text-coral">Löschen</button>
                  </div>
                ))}
                {mods.length === 0 && <p className="text-xs text-textMuted">Noch keine Module.</p>}
              </div>

              <div className="border-t border-line pt-3 flex flex-col gap-2">
                <input className="input" placeholder="Modultitel" value={draft.title || ""} onChange={(e) => setDraft(c.id, { title: e.target.value })} />
                <textarea className="input" placeholder="Inhalt / Beschreibung" rows={2} value={draft.content || ""} onChange={(e) => setDraft(c.id, { content: e.target.value })} />
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5">
                    <Icon name="chat" size={12} /> {draft.file ? draft.file.name : "Video (optional)"}
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => setDraft(c.id, { file: e.target.files[0] })} />
                  </label>
                  <label className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5">
                    <Icon name="download" size={12} /> {draft.attachment ? draft.attachment.name : "Datei anhängen (optional)"}
                    <input type="file" className="hidden" onChange={(e) => setDraft(c.id, { attachment: e.target.files[0] })} />
                  </label>
                  <button disabled={draft.uploading} onClick={() => addModule(c.id)} className="btn disabled:opacity-40 ml-auto">
                    {draft.uploading ? "Lädt hoch..." : "Modul hinzufügen"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {courses.length === 0 && <p className="text-textMuted text-sm">Noch keine eigenen Kurse angelegt.</p>}
      </div>
    </Layout>
  );
}
