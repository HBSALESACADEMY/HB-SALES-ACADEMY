import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import { supabase } from "../../lib/supabaseClient";

const COLOR_HEX = { amber: "#F0B23E", teal: "#3FBFA6", coral: "#E5716A", violet: "#9E8CF0" };

export default function FolderView() {
  const router = useRouter();
  const { id } = router.query;
  const [folder, setFolder] = useState(null);
  const [courses, setCourses] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data: nav } = await supabase.from("nav_items").select("*").eq("id", id).maybeSingle();
      const { data: cs } = await supabase.from("custom_courses").select("*").eq("nav_item_id", id).order("order_index");
      setFolder(nav);
      setCourses(cs || []);
      const { data: ms } = await supabase.from("custom_modules").select("course_id");
      const c = {};
      (ms || []).forEach((m) => { c[m.course_id] = (c[m.course_id] || 0) + 1; });
      setCounts(c);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display text-white mb-1">{folder?.label || "Ordner"}</h1>
      <p className="text-textMuted text-sm mb-6">Von euren Managern angelegte Kurse in diesem Bereich.</p>
      {courses.length === 0 ? (
        <p className="text-textMuted text-sm">Noch keine Kurse in diesem Ordner.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {courses.map((c) => (
            <div key={c.id} className="card flex items-center gap-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl transition"
              onClick={() => router.push(`/custom-courses/${c.id}`)}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,.06)", color: COLOR_HEX[c.color] }}>
                <Icon name="book" />
              </div>
              <div className="flex-1">
                <div className="font-display text-base font-semibold text-white">{c.title}</div>
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
