// Was ein Profil braucht, damit es eines ist.
//
// Ohne diese Angaben entstehen Karteileichen: Konten, die im Organigramm,
// in der Mitgliederliste und in der Rangliste als "Unbenannt" ohne Bild
// stehen. Für ein Werkzeug, in dem man sich gegenseitig zuordnen und
// erreichen können muss, ist das der Unterschied zwischen einem Team und
// einer Liste von Zeilen.
//
// Bewusst KURZ gehalten: vier Felder, eine Minute. Kurzvorstellung, Webseite
// und soziale Netzwerke bleiben freiwillig — unter Zwang schreibt dort
// niemand etwas Brauchbares hinein. Die Rollenbezeichnung setzt die Führung
// im Organigramm; selbst gewählt widerspräche sie ihr nur.
export const PFLICHTFELDER = [
  { key: "avatar_url", label: "Profilfoto" },
  { key: "full_name", label: "Vollständiger Name" },
  { key: "geburtstag", label: "Geburtsdatum" },
  { key: "phone", label: "Telefonnummer" },
];

export function fehlendeProfilangaben(profil) {
  if (!profil) return PFLICHTFELDER.map((f) => f.label);
  return PFLICHTFELDER
    .filter((f) => {
      const wert = profil[f.key];
      if (f.key === "full_name") {
        // Ein Nachname gehört dazu — "Tom" allein hilft niemandem beim
        // Zuordnen, und genau dafür ist das Feld da.
        return !String(wert || "").trim().includes(" ");
      }
      return !String(wert || "").trim();
    })
    .map((f) => f.label);
}

export function profilVollstaendig(profil) {
  return fehlendeProfilangaben(profil).length === 0;
}
