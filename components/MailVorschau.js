// Eine HTML-Mail so zeigen, wie sie beim Kunden aussieht.
//
// In einem abgeschotteten Rahmen und nicht direkt in der Seite: Das HTML
// einer Mail bringt eigene Schriften, Farben und Tabellen mit. Direkt
// eingesetzt, würde es die Academy umgestalten — und die Academy würde die
// Mail umgestalten, sodass die Vorschau etwas zeigt, das beim Kunden anders
// aussieht.
//
// sandbox="" ohne jede Freigabe: keine Skripte, keine Formulare, keine
// Navigation. Eine Vorschau muss nichts können ausser aussehen.
export default function MailVorschau({ html, hoehe = 420 }) {
  return (
    <div className="rounded-lg border border-line overflow-hidden bg-white">
      <iframe
        title="Vorschau der Mail"
        sandbox=""
        srcDoc={html || "<p style=\"font-family:sans-serif;color:#888;padding:16px\">Noch kein HTML.</p>"}
        style={{ width: "100%", height: hoehe, border: 0, display: "block", background: "#fff" }}
      />
      {/* Die Sicherheitsregeln der Academy lassen Bilder nur von eigenen
          Adressen zu. Beim Kunden gelten sie nicht — dort erscheinen die
          Bilder. Das muss dastehen, sonst sucht jemand einen Fehler, den
          es nicht gibt. */}
      <p className="text-[10px] text-textMuted px-2 py-1 border-t border-line bg-surface">
        Bilder von fremden Adressen zeigt diese Vorschau nicht an — beim Kunden erscheinen sie.
      </p>
    </div>
  );
}
