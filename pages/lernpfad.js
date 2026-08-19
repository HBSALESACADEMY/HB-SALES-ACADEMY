import { useEffect } from "react";
import { useRouter } from "next/router";

// Der persönliche Lernpfad ist keine eigene Seite mehr — er ist ein
// Abschnitt auf /courses. Kurse lagen vorher auf drei Reitern verteilt, und
// wer "Kurse" öffnete, sah gerade nicht alle seine Kurse.
//
// Die Route bleibt als Weiterleitung bestehen: gespeicherte Lesezeichen,
// Verweise in älteren E-Mails und ein womöglich noch vorhandener
// Navigationseintrag sollen nicht ins Leere laufen.
export default function LernpfadWeiterleitung() {
  const router = useRouter();
  useEffect(() => { router.replace("/courses"); }, [router]);
  return null;
}
