import { useState } from "react";
import Layout from "../components/Layout";
import Icon from "../components/Icon";

const KNOWLEDGE_BASE = [
  { tag: "Cialdini", title: "Reziprozität", body: "Wer zuerst gibt, erzeugt beim Gegenüber unbewusst das Bedürfnis, etwas zurückzugeben." },
  { tag: "Cialdini", title: "Knappheit", body: "Begrenzte Verfügbarkeit erhöht den wahrgenommenen Wert eines Angebots." },
  { tag: "Cialdini", title: "Autorität", body: "Erkennbare Fachkompetenz erhöht die Überzeugungskraft einer Aussage deutlich." },
  { tag: "Cialdini", title: "Soziale Bewährtheit", body: "Menschen orientieren sich am Verhalten anderer – Referenzen wirken als sozialer Beweis." },
  { tag: "Cialdini", title: "Konsistenz", body: "Menschen wollen zu früheren Aussagen und Handlungen konsistent bleiben." },
  { tag: "Kognitive Verzerrung", title: "Ankereffekt", body: "Die zuerst genannte Zahl prägt die Bewertung aller folgenden Zahlen." },
  { tag: "Kognitive Verzerrung", title: "Verlustaversion", body: "Ein Verlust wiegt psychologisch etwa doppelt so schwer wie ein gleich großer Gewinn." },
  { tag: "Kognitive Verzerrung", title: "Framing", body: "Dieselbe Information wirkt je nach Formulierung unterschiedlich." },
  { tag: "Kognitive Verzerrung", title: "Priming", body: "Vorausgehende Reize beeinflussen unbewusst spätere Bewertungen." },
  { tag: "Kognitive Verzerrung", title: "Verfügbarkeitsheuristik", body: "Leicht erinnerbare Ereignisse werden als wahrscheinlicher eingeschätzt." },
  { tag: "Kognitive Verzerrung", title: "Bestätigungsfehler", body: "Einmal gefasste Meinungen werden bevorzugt bestätigt, Widersprüchliches eher ignoriert." },
  { tag: "Beziehung", title: "Mirroring", body: "Dezentes Spiegeln von Tonfall und Tempo erzeugt unbewusst Verbundenheit." },
  { tag: "Beziehung", title: "Halo-Effekt", body: "Ein positiver erster Eindruck färbt auf die Bewertung aller anderen Eigenschaften ab." },
  { tag: "Beziehung", title: "Kongruenz", body: "Stimmen Worte und Körpersprache nicht überein, vertraut man eher der Körpersprache." },
  { tag: "Verhandlung", title: "Kontrastprinzip", body: "Eine Option wirkt attraktiver, je nachdem, womit sie unmittelbar zuvor verglichen wird." },
  { tag: "Verhandlung", title: "Reaktanz", body: "Menschen wehren sich gegen wahrgenommenen Druck, um ihre Entscheidungsfreiheit zu bewahren." },
  { tag: "Fragetechnik", title: "SPIN-Modell", body: "Situation-, Problem-, Implikations- und Need-payoff-Fragen führen strukturiert zum Bedarf." },
];

export default function Knowledge() {
  const [query, setQuery] = useState("");
  const filtered = KNOWLEDGE_BASE.filter((k) => k.title.toLowerCase().includes(query.toLowerCase()) || k.tag.toLowerCase().includes(query.toLowerCase()));

  return (
    <Layout>
      <h1 className="text-2xl font-display text-white mb-1">Wissensdatenbank</h1>
      <p className="text-textMuted text-sm mb-6">Psychologische Prinzipien zum Nachschlagen.</p>
      <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2.5 mb-5 bg-surface">
        <Icon name="search" size={15} />
        <input className="bg-transparent border-none outline-none text-sm flex-1 text-white" placeholder="Suche..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {filtered.length === 0 && <p className="text-textMuted text-sm">Keine Treffer.</p>}
        {filtered.map((k, i) => (
          <div key={i} className="card">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-amber">{k.tag}</div>
            <div className="font-display font-semibold text-[15px] text-white my-1.5">{k.title}</div>
            <div className="text-[13px] text-textMuted leading-relaxed">{k.body}</div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
