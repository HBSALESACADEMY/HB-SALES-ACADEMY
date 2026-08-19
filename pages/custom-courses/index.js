import { useEffect } from "react";
import { useRouter } from "next/router";

// Die eigenen Kurse der Organisation stehen jetzt als Abschnitt auf
// /courses. Die Route bleibt als Weiterleitung bestehen, damit gespeicherte
// Verweise nicht ins Leere laufen — die einzelnen Kurse liegen weiterhin
// unter /custom-courses/[id].
export default function EigeneKurseWeiterleitung() {
  const router = useRouter();
  useEffect(() => { router.replace("/courses"); }, [router]);
  return null;
}
