import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import { supabase } from "../../lib/supabaseClient";

export default function CustomCourseDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data: c } = await supabase.from("custom_courses").select("*").eq("id", id).maybeSingle();
      const { data: ms } = await supabase.from("custom_modules").select("*").eq("course_id", id).order("order_index");
      setCourse(c);
      setModules(ms || []);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;
  if (!course) return <Layout><p className="text-textMuted text-sm">Kurs nicht gefunden.</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">{course.title}</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">{course.description}</p>

      <div className="flex flex-col gap-4">
        {modules.map((m) => (
          <div key={m.id} className="card">
            <div className="font-display text-base font-semibold text-textMain mb-2">{m.title}</div>
            {m.video_url && (
              <video controls className="w-full rounded-lg mb-3" src={m.video_url} />
            )}
            {m.content && <p className="text-sm text-textMuted whitespace-pre-wrap">{m.content}</p>}
            {m.file_url && (
              <a href={m.file_url} target="_blank" rel="noreferrer" className="btn-ghost text-xs mt-2.5 inline-flex items-center gap-1.5 w-fit">
                <Icon name="download" size={12} /> {m.file_name || "Anhang herunterladen"}
              </a>
            )}
          </div>
        ))}
        {modules.length === 0 && <p className="text-textMuted text-sm">Noch keine Module in diesem Kurs.</p>}
      </div>
    </Layout>
  );
}
