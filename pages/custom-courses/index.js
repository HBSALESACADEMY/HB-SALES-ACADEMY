import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import { supabase } from "../../lib/supabaseClient";

const COLOR_HEX = { amber: "var(--org-accent, #CE3A5C)", teal: "#00E5C7", coral: "#FF4D6D", violet: "var(--org-color-1, #4C5DC9)" };

export default function CustomCoursesIndex() {
  const router = useRouter();
  const [courses, setCourses] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: cs } = await supabase.from("custom_courses").select("*").order("order_index");
      setCourses(cs || []);
      const { data: ms } = await supabase.from("custom_modules").select("course_id");
      const c = {};
      (ms || []).forEach((m) => { c[m.course_id] = (c[m.course_id] || 0) + 1; });
      setCounts(c);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Eigene Inhalte</h1>
      <div className="brand-stripe w-16 mb-4" />
      <p className="text-textMuted text-sm mb-6">Zusätzliche Kurse, von euren Managern angelegt — inklusive Videos, falls vorhanden.</p>
      {loading ? (
        <p className="text-textMuted text-sm">Lädt...</p>
      ) : courses.length === 0 ? (
        <p className="text-textMuted text-sm">Noch keine eigenen Kurse vorhanden.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {courses.map((c) => (
            <div key={c.id} className="card flex items-center gap-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition"
              onClick={() => router.push(`/custom-courses/${c.id}`)}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,.06)", color: COLOR_HEX[c.color] }}>
                <Icon name="book" />
              </div>
              <div className="flex-1">
                <div className="font-display text-base font-semibold text-textMain">{c.title}</div>
                <div className="text-xs text-textMuted mt-0.5">{c.description}</div>
              </div>
              <span className="font-mono text-xs text-textMuted">{counts[c.id] || 0} Module</span>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
