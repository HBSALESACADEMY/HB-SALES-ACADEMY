// Einfacher globaler Mechanismus, um von JEDER Seite aus das Profil-Popup zu
// öffnen, ohne dass jede Komponente eine Prop-Kette oder React-Context braucht.
// Layout.js hört auf dieses Event und rendert dann das ProfileModal.
export function openProfile(userId) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hb:open-profile", { detail: userId }));
  }
}
