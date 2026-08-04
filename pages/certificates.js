import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { apiGetBlob } from "../lib/apiClient";
import { triggerConfetti } from "../lib/confetti";
import { COURSES } from "../lib/curriculum";

export default function Certificates() {
  const [passedCourseIds, setPassedCourseIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("exam_results").select("course_id").eq("user_id", session.user.id).eq("passed", true);
      setPassedCourseIds(new Set((data || []).map((r) => r.course_id)));
      setLoading(false);
    }
    load();
  }, []);

  async function download(courseId) {
    setDownloadingId(courseId);
    try {
      const blob = await apiGetBlob(`/api/certificate?courseId=${courseId}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Zertifikat-${courseId}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      triggerConfetti();
    } catch (e) {
      alert(e.message);
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  const earned = COURSES.filter((c) => passedCourseIds.has(c.id));
  const remaining = COURSES.filter((c) => !passedCourseIds.has(c.id));

  return (
    <Layout>
      <h1 className="text-2xl font-display font-semibold brand-text-gradient mb-1">Meine Zertifikate</h1>
      <div className="brand-stripe w-16 mb-4" />

      {earned.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-textMain font-semibold mb-1">Noch kein Zertifikat verdient.</p>
          <p className="text-textMuted text-sm">Schließe die Prüfung eines Kurses erfolgreich ab, um dein erstes Zertifikat freizuschalten.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {earned.map((c) => (
            <div key={c.id} className="card flex items-center gap-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${c.accent}22` }}>
                <Icon name="award" size={20} color={c.accent} />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-textMain">{c.title}</div>
                <div className="text-xs text-textMuted">Zertifikat erhalten</div>
              </div>
              <button disabled={downloadingId === c.id} onClick={() => download(c.id)} className="btn text-xs disabled:opacity-40">
                <Icon name="download" size={13} /> {downloadingId === c.id ? "Wird erstellt..." : "Herunterladen"}
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining.length > 0 && (
        <>
          <div className="text-xs text-textMuted uppercase tracking-wide mb-2.5">Noch offen</div>
          <div className="flex flex-col gap-2">
            {remaining.map((c) => (
              <div key={c.id} className="card !py-3 flex items-center gap-3 opacity-50">
                <Icon name="award" size={16} />
                <span className="text-sm text-textMain flex-1">{c.title}</span>
                <span className="text-xs text-textMuted">Noch nicht bestanden</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
