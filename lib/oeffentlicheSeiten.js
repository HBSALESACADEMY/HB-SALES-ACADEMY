// Welche Seiten ohne Anmeldung erreichbar sind — und damit die einzigen,
// die eine Suchmaschine sehen darf.
//
// Alles andere steht hinter der Anmeldung und wird mit "noindex" gemeldet
// (siehe pages/_app.js). Der Grund ist nicht Eitelkeit: In der Academy
// stehen Namen von Kund:innen, Auswertungen und Gesprächsnotizen. Ein
// Suchmaschinen-Eintrag dazu wäre ein Datenschutzvorfall — auch dann, wenn
// die Seite ohne Anmeldung leer bliebe.
//
// Bewusst als Liste dessen, was ERLAUBT ist: Eine Liste des Verbotenen
// vergisst man bei der nächsten neuen Seite.
export const OEFFENTLICHE_PFADE = [
  "/login",
  "/reset-password",
  "/agb",
  "/datenschutz",
  "/impressum",
];

export function darfInDenIndex(pfad) {
  const sauber = String(pfad || "").split("?")[0].replace(/\/+$/, "") || "/";
  return OEFFENTLICHE_PFADE.includes(sauber);
}

/** Die vollständige Adresse einer Seite — für Sitemap und canonical. */
export function seitenAdresse(pfad, basis = process.env.NEXT_PUBLIC_APP_URL || "") {
  const stamm = String(basis || "").trim().replace(/\/+$/, "");
  if (!stamm) return null;
  return `${stamm}${pfad}`;
}
