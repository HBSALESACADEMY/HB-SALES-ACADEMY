import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import AdminTabs from "../../components/AdminTabs";
import SidebarStruktur from "../../components/SidebarStruktur";
import Aufklapper from "../../components/Aufklapper";
import { supabase } from "../../lib/supabaseClient";
import { getActiveOrgId } from "../../lib/activeOrg";
import { loescheGeprueft, aendereGeprueft } from "../../lib/loeschen";
import { pfadAusOeffentlicherUrl } from "../../lib/speicherPfad";

const COLORS = ["amber", "teal", "coral", "violet"];
const COLOR_HEX = { amber: "var(--org-accent, #CE3A5C)", teal: "#00E5C7", coral: "#FF4D6D", violet: "var(--org-color-1, #4C5DC9)" };

export default function ContentAdmin() {
  const router = useRouter();
  const [isManager, setIsManager] = useState(true);
  // Die Sidebar-Struktur liegt hier eingeklappt (früher eine eigene Seite).
  const [strukturOffen, setStrukturOffen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [modulesByCourse, setModulesByCourse] = useState({});
  const [error, setError] = useState("");

  const [newCourse, setNewCourse] = useState({ title: "", description: "", color: "amber", navItemId: "" });
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [folders, setFolders] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState(null);

  const [moduleDrafts, setModuleDrafts] = useState({}); // courseId -> { title, content, file, uploading }

  const [editingCourseId, setEditingCourseId] = useState(null);
  const [courseEditForm, setCourseEditForm] = useState(null);
  const [savingCourseEdit, setSavingCourseEdit] = useState(false);

  const [editingModuleId, setEditingModuleId] = useState(null);
  const [moduleEditForm, setModuleEditForm] = useState(null);
  const [savingModuleEdit, setSavingModuleEdit] = useState(false);

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

  async function deleteCourse(c) {
    const mods = modulesByCourse[c.id] || [];
    const zusatz = mods.length ? ` Die ${mods.length} enthaltenen Module werden mitgelöscht.` : "";
    if (!confirm(`Kurs „${c.title}“ wirklich löschen?${zusatz}`)) return;
    setError("");
    const loeschFehler = await loescheGeprueft(supabase.from("custom_courses").delete().eq("id", c.id));
    if (loeschFehler) { setError(loeschFehler); return; }
    // Die Modulzeilen verschwinden per Kaskade, die Dateien nicht.
    await dateienEntfernen(mods);
    await load();
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

  // Video und Anhang liegen im Speicher, nicht in der Zeile. Wird nur die
  // Zeile gelöscht, bleibt die Datei für immer liegen — dieselbe Regel wie
  // bei den Aufnahmen (siehe pages/termine.js).
  async function dateienEntfernen(module) {
    const videos = [], dateien = [];
    (Array.isArray(module) ? module : [module]).forEach((m) => {
      const v = pfadAusOeffentlicherUrl(m?.video_url, "course-videos");
      const d = pfadAusOeffentlicherUrl(m?.file_url, "content-files");
      if (v) videos.push(v);
      if (d) dateien.push(d);
    });
    if (videos.length) await supabase.storage.from("course-videos").remove(videos);
    if (dateien.length) await supabase.storage.from("content-files").remove(dateien);
  }

  async function deleteModule(m) {
    if (!confirm(`Modul „${m.title}“ wirklich löschen? Video und Anhang werden mit entfernt.`)) return;
    setError("");
    const loeschFehler = await loescheGeprueft(supabase.from("custom_modules").delete().eq("id", m.id));
    if (loeschFehler) { setError(loeschFehler); return; }
    // Erst nach der erfolgreichen Löschung — sonst wäre die Datei weg und
    // das Modul stünde noch da.
    await dateienEntfernen(m);
    await load();
  }

  // Reihenfolge: die Module tauschen ihre Plätze. Zwei Änderungen, beide
  // geprüft — eine abgelehnte Änderung meldet sonst keinen Fehler.
  async function verschiebeModul(m, richtung) {
    const liste = modulesByCourse[m.course_id] || [];
    const i = liste.findIndex((x) => x.id === m.id);
    const j = i + richtung;
    if (i === -1 || j < 0 || j >= liste.length) return;
    const anderes = liste[j];
    setError("");
    const f1 = await aendereGeprueft(
      supabase.from("custom_modules").update({ order_index: anderes.order_index }).eq("id", m.id),
      "Die Reihenfolge konnte nicht geändert werden."
    );
    if (f1) { setError(f1); return; }
    const f2 = await aendereGeprueft(
      supabase.from("custom_modules").update({ order_index: m.order_index }).eq("id", anderes.id),
      "Die Reihenfolge konnte nicht geändert werden."
    );
    if (f2) { setError(f2); return; }
    await load();
  }

  function startEditCourse(c) {
    setEditingCourseId(c.id);
    setCourseEditForm({ title: c.title, description: c.description || "", color: c.color, navItemId: c.nav_item_id || "" });
  }

  async function saveEditCourse(id) {
    if (!courseEditForm.title.trim() || !courseEditForm.navItemId) return;
    setSavingCourseEdit(true);
    setError("");
    const fehler = await aendereGeprueft(supabase.from("custom_courses").update({
      title: courseEditForm.title.trim(),
      description: courseEditForm.description.trim(),
      color: courseEditForm.color,
      nav_item_id: courseEditForm.navItemId,
    }).eq("id", id), "Diesen Kurs darf nur bearbeiten, wer ihn angelegt hat, oder eine Führungsrolle.");
    setSavingCourseEdit(false);
    if (fehler) { setError(fehler); return; }
    setEditingCourseId(null);
    setCourseEditForm(null);
    await load();
  }

  function startEditModule(m) {
    setEditingModuleId(m.id);
    setModuleEditForm({
      title: m.title, content: m.content || "", file: null, attachment: null,
      existingVideoUrl: m.video_url, existingFileUrl: m.file_url, existingFileName: m.file_name,
      // Entfernen ist etwas anderes als Ersetzen — beides muss gehen.
      videoEntfernen: false, anhangEntfernen: false,
      courseId: m.course_id,
    });
  }

  async function saveEditModule(id) {
    if (!moduleEditForm.title.trim()) return;
    setSavingModuleEdit(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let videoUrl = moduleEditForm.videoEntfernen ? null : moduleEditForm.existingVideoUrl;
      let fileUrl = moduleEditForm.anhangEntfernen ? null : moduleEditForm.existingFileUrl;
      let fileName = moduleEditForm.anhangEntfernen ? null : moduleEditForm.existingFileName;
      // Was aus dem Speicher verschwinden soll, erst NACH der erfolgreichen
      // Änderung — sonst ist die Datei weg und der Verweis steht noch.
      const altVideo = (moduleEditForm.videoEntfernen || moduleEditForm.file) ? moduleEditForm.existingVideoUrl : null;
      const altAnhang = (moduleEditForm.anhangEntfernen || moduleEditForm.attachment) ? moduleEditForm.existingFileUrl : null;

      if (moduleEditForm.file) {
        const ext = moduleEditForm.file.name.split(".").pop();
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("course-videos").upload(path, moduleEditForm.file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("course-videos").getPublicUrl(path);
        videoUrl = pub.publicUrl;
      }
      if (moduleEditForm.attachment) {
        const ext = (moduleEditForm.attachment.name.split(".").pop() || "bin").toLowerCase();
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("content-files").upload(path, moduleEditForm.attachment);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("content-files").getPublicUrl(path);
        fileUrl = pub.publicUrl;
        fileName = moduleEditForm.attachment.name;
      }

      // Umhängen in einen anderen Kurs: hinten anstellen, sonst hätte das
      // Modul dort denselben Platz wie ein bereits vorhandenes.
      const altesModul = (modulesByCourse[moduleEditForm.courseId] || []).find((x) => x.id === id);
      const wechselt = !altesModul;
      const aenderung = {
        title: moduleEditForm.title.trim(),
        content: moduleEditForm.content.trim() || null,
        video_url: videoUrl,
        file_url: fileUrl,
        file_name: fileName,
        course_id: moduleEditForm.courseId,
      };
      if (wechselt) aenderung.order_index = (modulesByCourse[moduleEditForm.courseId] || []).length;

      const fehler = await aendereGeprueft(
        supabase.from("custom_modules").update(aenderung).eq("id", id),
        "Dieses Modul darf nur bearbeiten, wer es angelegt hat, oder eine Führungsrolle."
      );
      if (fehler) throw new Error(fehler);

      if (altVideo || altAnhang) await dateienEntfernen({ video_url: altVideo, file_url: altAnhang });

      setEditingModuleId(null);
      setModuleEditForm(null);
      await load();
    } catch (e) {
      setError(e.message || "Fehler beim Speichern des Moduls.");
    } finally {
      setSavingModuleEdit(false);
    }
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
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Inhalte verwalten</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <p className="text-textMuted text-sm mb-6">Hier füllst du einen Ordner mit <strong className="text-textMain">Kursen und Inhalten</strong> (Module, Text, Video, Anhänge). Den Ordner selbst — also den Reiter in der Sidebar — legst du unter „Sidebar & eigene Ordner" an.</p>
      {/* Aufklappbar statt eigene Seite: man braucht das genau dann, wenn
          man einen Kurs anlegen will und merkt, dass der Ordner fehlt —
          also hier, ohne den Platz wegzunehmen, wenn alles da ist. */}
      <button onClick={() => setStrukturOffen((v) => !v)} aria-expanded={strukturOffen}
        className="btn-ghost text-xs mb-3">
        ⚙️ Sidebar & eigene Ordner {strukturOffen ? "schliessen" : "anpassen"}
      </button>
      <Aufklapper offen={strukturOffen}>
        <div className="mb-6">
          <SidebarStruktur />
        </div>
      </Aufklapper>

      {error && <div className="card border border-coral/40 text-coral text-sm mb-4">{error}</div>}

      <div className="card mb-6">
        <div className="font-semibold text-textMain text-sm mb-3">Neuen Kurs anlegen</div>
        <div className="flex flex-col gap-2.5">
          <input className="input" placeholder="Titel" value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} />
          <textarea className="input" placeholder="Kurzbeschreibung" rows={2} value={newCourse.description} onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })} />
          {folders.length === 0 ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-coral">Noch kein Ordner vorhanden. Leg zuerst einen Ordner an, bevor du einen Kurs erstellst.</p>
              <button onClick={() => setStrukturOffen(true)} className="btn-ghost text-xs flex-shrink-0">Ordner anlegen</button>
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
              {editingCourseId === c.id ? (
                <div className="flex flex-col gap-2.5 mb-3 border-b border-line pb-3">
                  <input className="input" placeholder="Titel" value={courseEditForm.title} onChange={(e) => setCourseEditForm({ ...courseEditForm, title: e.target.value })} />
                  <textarea className="input" placeholder="Kurzbeschreibung" rows={2} value={courseEditForm.description} onChange={(e) => setCourseEditForm({ ...courseEditForm, description: e.target.value })} />
                  <select className="input" value={courseEditForm.navItemId} onChange={(e) => setCourseEditForm({ ...courseEditForm, navItemId: e.target.value })}>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <div className="flex items-center gap-2">
                    {COLORS.map((col) => (
                      <button key={col} onClick={() => setCourseEditForm({ ...courseEditForm, color: col })}
                        className={`w-7 h-7 rounded-full border-2 ${courseEditForm.color === col ? "border-white" : "border-transparent"}`}
                        style={{ background: COLOR_HEX[col] }} title={col} />
                    ))}
                    <button disabled={savingCourseEdit} onClick={() => { setEditingCourseId(null); setCourseEditForm(null); }} className="btn-ghost text-xs ml-auto disabled:opacity-40">Abbrechen</button>
                    <button disabled={savingCourseEdit || !courseEditForm.title.trim()} onClick={() => saveEditCourse(c.id)} className="btn text-xs disabled:opacity-40">{savingCourseEdit ? "Speichert..." : "Speichern"}</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-display text-base font-semibold text-textMain">{c.title}</div>
                    <div className="text-xs text-textMuted mt-0.5">{c.description}</div>
                    <div className="text-[10px] uppercase tracking-wide text-teal mt-1">{folders.find((f) => f.id === c.nav_item_id)?.label || "Ohne Ordner"}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => startEditCourse(c)} className="btn-ghost text-xs">Bearbeiten</button>
                    <button onClick={() => deleteCourse(c)} className="btn-ghost text-xs text-coral">Kurs löschen</button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 mb-3">
                {mods.map((m) => {
                  if (editingModuleId === m.id) {
                    return (
                      <div key={m.id} className="border border-line rounded-lg px-3 py-2.5 flex flex-col gap-2">
                        <input className="input" placeholder="Modultitel" value={moduleEditForm.title} onChange={(e) => setModuleEditForm({ ...moduleEditForm, title: e.target.value })} />
                        <textarea className="input" placeholder="Inhalt / Beschreibung" rows={2} value={moduleEditForm.content} onChange={(e) => setModuleEditForm({ ...moduleEditForm, content: e.target.value })} />
                        {/* In welchem Kurs das Modul steht, lässt sich hier
                            ändern — dafür muss es nicht neu angelegt werden. */}
                        <select className="input" value={moduleEditForm.courseId}
                          onChange={(e) => setModuleEditForm({ ...moduleEditForm, courseId: e.target.value })}>
                          {courses.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
                        </select>
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className={`btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5 ${moduleEditForm.videoEntfernen ? "opacity-40" : ""}`}>
                            <Icon name="chat" size={12} /> {moduleEditForm.file ? moduleEditForm.file.name : (moduleEditForm.existingVideoUrl && !moduleEditForm.videoEntfernen ? "Video ersetzen" : "Video (optional)")}
                            <input type="file" accept="video/*" className="hidden" onChange={(e) => setModuleEditForm({ ...moduleEditForm, file: e.target.files[0], videoEntfernen: false })} />
                          </label>
                          {moduleEditForm.existingVideoUrl && !moduleEditForm.file && (
                            <button onClick={() => setModuleEditForm({ ...moduleEditForm, videoEntfernen: !moduleEditForm.videoEntfernen })}
                              className={`btn-ghost text-xs ${moduleEditForm.videoEntfernen ? "text-amber" : "text-coral"}`}>
                              {moduleEditForm.videoEntfernen ? "Video doch behalten" : "Video entfernen"}
                            </button>
                          )}
                          <label className={`btn-ghost text-xs cursor-pointer inline-flex items-center gap-1.5 ${moduleEditForm.anhangEntfernen ? "opacity-40" : ""}`}>
                            <Icon name="download" size={12} /> {moduleEditForm.attachment ? moduleEditForm.attachment.name : (moduleEditForm.existingFileUrl && !moduleEditForm.anhangEntfernen ? "Anhang ersetzen" : "Datei anhängen (optional)")}
                            <input type="file" className="hidden" onChange={(e) => setModuleEditForm({ ...moduleEditForm, attachment: e.target.files[0], anhangEntfernen: false })} />
                          </label>
                          {moduleEditForm.existingFileUrl && !moduleEditForm.attachment && (
                            <button onClick={() => setModuleEditForm({ ...moduleEditForm, anhangEntfernen: !moduleEditForm.anhangEntfernen })}
                              className={`btn-ghost text-xs ${moduleEditForm.anhangEntfernen ? "text-amber" : "text-coral"}`}>
                              {moduleEditForm.anhangEntfernen ? "Anhang doch behalten" : "Anhang entfernen"}
                            </button>
                          )}
                          <button disabled={savingModuleEdit} onClick={() => { setEditingModuleId(null); setModuleEditForm(null); }} className="btn-ghost text-xs ml-auto disabled:opacity-40">Abbrechen</button>
                          <button disabled={savingModuleEdit || !moduleEditForm.title.trim()} onClick={() => saveEditModule(m.id)} className="btn text-xs disabled:opacity-40">{savingModuleEdit ? "Speichert..." : "Speichern"}</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className="flex items-center gap-3 border border-line rounded-lg px-3 py-2">
                      <Icon name="book" size={14} />
                      <span className="text-sm flex-1">{m.title}</span>
                      {m.video_url && <span className="text-[10px] uppercase text-teal border border-teal/40 rounded px-1.5 py-0.5">Video</span>}
                      {m.file_url && (
                        <a href={m.file_url} target="_blank" rel="noreferrer" className="btn-ghost text-xs inline-flex items-center gap-1">
                          <Icon name="download" size={11} /> {m.file_name || "Anhang"}
                        </a>
                      )}
                      <span className="flex items-center gap-0.5">
                        <button onClick={() => verschiebeModul(m, -1)} disabled={mods[0]?.id === m.id}
                          title="Nach oben" className="btn-ghost text-xs disabled:opacity-25">↑</button>
                        <button onClick={() => verschiebeModul(m, 1)} disabled={mods[mods.length - 1]?.id === m.id}
                          title="Nach unten" className="btn-ghost text-xs disabled:opacity-25">↓</button>
                      </span>
                      <button onClick={() => startEditModule(m)} className="btn-ghost text-xs">Bearbeiten</button>
                      <button onClick={() => deleteModule(m)} className="btn-ghost text-xs text-coral">Löschen</button>
                    </div>
                  );
                })}
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
