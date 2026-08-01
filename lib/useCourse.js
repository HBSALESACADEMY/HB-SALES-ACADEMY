import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { findStaticCourse, resolveCourse } from "./resolveCourse";

// Client-Hook um lib/resolveCourse.js: für die 7 statischen Grundkurse ist
// "course" schon beim allerersten Render gesetzt (kein Unterschied zu vorher,
// als courseId direkt gegen COURSES geprüft wurde). Für personalisierte
// Kurse (courseId = UUID aus personal_courses) wird kurz nachgeladen.
export function useCourse(courseId) {
  const [course, setCourse] = useState(() => (courseId ? findStaticCourse(courseId) : null));
  const [loading, setLoading] = useState(() => !!courseId && !findStaticCourse(courseId));

  useEffect(() => {
    if (!courseId) return;
    const staticCourse = findStaticCourse(courseId);
    if (staticCourse) {
      setCourse(staticCourse);
      setLoading(false);
      return;
    }
    setLoading(true);
    resolveCourse(courseId, supabase).then((c) => {
      setCourse(c);
      setLoading(false);
    });
  }, [courseId]);

  return { course, loading };
}
