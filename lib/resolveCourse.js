import { COURSES } from "./curriculum.js";

// Zentrale Kurs-Auflösung: erst gegen die 7 festen Grundkurse prüfen, sonst
// aus personal_courses laden (KI-generierte, individuelle Kurse — siehe
// pages/api/personal-course-generate.js). Dadurch funktionieren die
// bestehenden Kurs-/Modul-/Prüfungsseiten sowie die Bewertungs-APIs
// unverändert für BEIDE Quellen, solange die Form gleich bleibt
// ({ id, title, desc, accent, examCase, modules }).
export function findStaticCourse(courseId) {
  return COURSES.find((c) => c.id === courseId) || null;
}

export async function resolveCourse(courseId, client) {
  const staticCourse = findStaticCourse(courseId);
  if (staticCourse) return staticCourse;
  const { data } = await client.from("personal_courses").select("*").eq("id", courseId).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    desc: data.description,
    accent: data.accent,
    examCase: data.exam_case,
    modules: data.modules,
    isPersonal: true,
  };
}
