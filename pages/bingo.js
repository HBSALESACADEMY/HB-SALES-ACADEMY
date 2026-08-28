import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Icon from "../components/Icon";
import InfoCard from "../components/InfoCard";
import BereichsTabs, { UEBEN } from "../components/BereichsTabs";
import LogoHintergrund from "../components/LogoHintergrund";
import { apiGet, apiPost } from "../lib/apiClient";
import { triggerConfetti } from "../lib/confetti";
import { GROESSE, FELDER, MITTE, PUNKTE, gewinnFelder, freiePlaetze } from "../lib/bingo";

// Cold Call Bingo — das Spiel für die Telefonier-Session.
//
// Der Kern ist nicht das Raster, sondern das gegenseitige Zustecken: Wörter,
// die auf der eigenen Karte stehen, hat jemand anderes ausgesucht. Deshalb
// steht der Teil-Link oben und nicht in einer Ecke.
export default function Bingo() {
  const router = useRouter();
  const [karte, setKarte] = useState(null);
  const [fremd, setFremd] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [wort, setWort] = useState("");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [kopiert, setKopiert] = useState(false);

  const fuer = typeof router.query.fuer === "string" ? router.query.fuer : null;

  const laden = useCallback(async () => {
    try {
      const daten = await apiGet(`/api/bingo${fuer ? `?fuer=${fuer}` : ""}`);
      setKarte(daten.karte);
      setFremd(!!daten.fremd);
      setFehler("");
    } catch (e) {
      setFehler(e.message || "Die Karte konnte nicht geladen werden.");
    }
    setLaedt(false);
  }, [fuer]);

  useEffect(() => { if (router.isReady) laden(); }, [router.isReady, laden]);

  const abgehakt = (karte?.felder || []).filter((f) => f.abgehakt).map((f) => f.position);
  const treffer = gewinnFelder(abgehakt);
  const offen = karte ? freiePlaetze(karte.felder).length : 0;

  async function abhaken(position) {
    if (fremd || busy) return;
    setBusy(true);
    try {
      const daten = await apiPost("/api/bingo", { aktion: "abhaken", position });
      setKarte(daten.karte);
      if (daten.bingo) {
        triggerConfetti();
        spieleTon();
        setMeldung(daten.punkte >= PUNKTE.bingo ? `BINGO! +${daten.punkte} Punkte` : "BINGO!");
      } else if (daten.punkte) {
        setMeldung(`+${daten.punkte} Punkte`);
      }
      setTimeout(() => setMeldung(""), 2500);
    } catch (e) {
      setFehler(e.message);
    }
    setBusy(false);
  }

  // Kurzer Fanfaren-Ton, im Browser erzeugt: eine Tondatei müsste geladen
  // werden und wäre bei abgeschaltetem Ton trotzdem im Gepäck.
  function spieleTon() {
    try {
      const Kontext = window.AudioContext || window.webkitAudioContext;
      if (!Kontext) return;
      const kontext = new Kontext();
      [523, 659, 784, 1047].forEach((hz, i) => {
        const ton = kontext.createOscillator();
        const lautstaerke = kontext.createGain();
        ton.type = "triangle";
        ton.frequency.value = hz;
        ton.connect(lautstaerke);
        lautstaerke.connect(kontext.destination);
        const start = kontext.currentTime + i * 0.12;
        lautstaerke.gain.setValueAtTime(0.0001, start);
        lautstaerke.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        lautstaerke.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        ton.start(start);
        ton.stop(start + 0.4);
      });
      setTimeout(() => kontext.close(), 1200);
    } catch (e) { /* ohne Ton weiter */ }
  }

  async function zustecken() {
    const text = wort.trim();
    if (!text) return;
    setBusy(true);
    setFehler("");
    try {
      await apiPost("/api/bingo", { aktion: "zustecken", fuer: fuer || karte?.besitzer_id, wort: text });
      setWort("");
      setMeldung("Wort zugesteckt");
      setTimeout(() => setMeldung(""), 2000);
      await laden();
    } catch (e) {
      setFehler(e.message);
    }
    setBusy(false);
  }

  async function fuehreAus(aktion) {
    setBusy(true);
    setFehler("");
    try {
      const daten = await apiPost("/api/bingo", { aktion });
      setKarte(daten.karte);
    } catch (e) {
      setFehler(e.message);
    }
    setBusy(false);
  }

  function teile() {
    const link = `${window.location.origin}/bingo?fuer=${karte?.besitzer_id}`;
    navigator.clipboard?.writeText(link).then(
      () => { setKopiert(true); setTimeout(() => setKopiert(false), 2500); },
      () => setFehler("Kopieren nicht möglich — Link: " + link)
    );
  }

  if (laedt) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Cold Call Bingo</h1>
      <div className="brand-stripe w-16 mb-4" />
      <BereichsTabs tabs={UEBEN} />

      {!fremd && (
        <InfoCard>
          Deine Kolleg:innen stecken dir Sätze zu, die am Telefon fallen könnten — <strong>„Kein Interesse"</strong>,
          <strong> „Schicken Sie mal was"</strong>. Fällt so ein Satz im Gespräch, tippst du das Feld an.
          Fünf in einer Reihe sind ein <strong>Bingo</strong>. Es gibt {PUNKTE.wort} Punkte je Feld,
          {" "}{PUNKTE.zusteller} für die Person, die das Wort zugesteckt hat, und {PUNKTE.bingo} extra fürs Bingo.
        </InfoCard>
      )}

      {fehler && <div className="card border border-coral/40 text-coral text-sm mb-4">{fehler}</div>}

      {/* Fremde Karte: hier wird nur zugesteckt, nicht gespielt. */}
      {fremd ? (
        <div className="card mb-5 border-amber/40">
          <div className="text-sm font-semibold text-amber mb-1">Karte von {karte?.besitzer}</div>
          <p className="text-xs text-textMuted mb-3">
            Steck {karte?.besitzer} einen Satz zu, den er oder sie am Telefon hören könnte.
            Wird er abgehakt, bekommst du {PUNKTE.zusteller} Punkte.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input className="input !w-auto flex-1 min-w-[200px]" maxLength={60} placeholder="z. B. „Kein Budget“"
              value={wort} onChange={(e) => setWort(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && zustecken()} />
            <button onClick={zustecken} disabled={busy || !wort.trim()} className="btn text-xs disabled:opacity-40">Zustecken</button>
          </div>
          {meldung && <p className="text-teal text-xs mt-2">{meldung}</p>}
          <p className="text-[11px] text-textMuted mt-3">Noch {offen} freie Felder auf dieser Karte.</p>
        </div>
      ) : (
        <div className="card mb-5">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-semibold text-textMain text-sm">Deine Karte teilen</span>
            <span className="text-[11px] text-textMuted">{offen} von {FELDER - 1} Feldern noch frei</span>
            <button onClick={teile} className="btn-ghost text-xs ml-auto">
              <Icon name="copy" size={12} /> {kopiert ? "Link kopiert ✓" : "Link kopieren"}
            </button>
          </div>
          <p className="text-xs text-textMuted mb-3">
            Schick den Link ins Team — wer ihn öffnet, kann dir ein Wort zustecken. Du siehst danach, von wem es kam.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input className="input !w-auto flex-1 min-w-[200px]" maxLength={60} placeholder="Eigenes Wort ergänzen"
              value={wort} onChange={(e) => setWort(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && zustecken()} />
            <button onClick={zustecken} disabled={busy || !wort.trim()} className="btn-ghost text-xs disabled:opacity-40">Hinzufügen</button>
            {offen > 0 && (
              <button onClick={() => fuehreAus("auffuellen")} disabled={busy} className="btn text-xs disabled:opacity-40">
                Restliche {offen} Felder auffüllen
              </button>
            )}
            <button onClick={() => { if (confirm("Neue Karte? Alle Wörter und Haken verschwinden.")) fuehreAus("neu"); }}
              disabled={busy} className="btn-ghost text-xs text-coral disabled:opacity-40">Neue Karte</button>
          </div>
        </div>
      )}

      {/* Das Raster. Quadratische Felder, damit es auch auf dem Handy als
          Karte lesbar bleibt und nicht als Liste zerfällt. */}
      <div className="card relative overflow-hidden">
        <LogoHintergrund breite="w-1/2" hoehe="max-h-[60%]" />
        <div className="relative grid gap-1.5" style={{ gridTemplateColumns: `repeat(${GROESSE}, minmax(0, 1fr))` }}>
          {Array.from({ length: FELDER }, (_, i) => {
            const feld = (karte?.felder || []).find((f) => f.position === i);
            const istMitte = i === MITTE;
            const an = istMitte || feld?.abgehakt;
            const gewinn = treffer.has(i);
            return (
              <button
                key={i}
                onClick={() => !istMitte && feld && abhaken(i)}
                disabled={fremd || istMitte || !feld || busy}
                className={`aspect-square rounded-lg border p-1.5 flex flex-col items-center justify-center text-center transition
                  ${an ? "text-[#0B0D13] font-semibold" : "text-textMain border-line hover:border-amber/60"}
                  ${!feld && !istMitte ? "opacity-40 border-dashed" : ""}`}
                style={an ? {
                  background: gewinn ? "#22C55E" : "#4ADE80",
                  borderColor: gewinn ? "#16A34A" : "#4ADE80",
                  boxShadow: gewinn ? "0 0 0 2px rgba(34,197,94,.35)" : "none",
                } : undefined}>
                {istMitte ? (
                  <>
                    <span className="text-[11px] leading-tight">FREI</span>
                    <span className="text-[9px] leading-tight opacity-80">Erster Call</span>
                  </>
                ) : feld ? (
                  <>
                    <span className="text-[11px] leading-tight break-words line-clamp-3">{feld.wort}</span>
                    {feld.von && <span className="text-[9px] leading-tight opacity-70 mt-0.5">Von: {feld.von}</span>}
                  </>
                ) : (
                  <span className="text-[10px] text-textMuted">frei</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rückmeldung: gross genug, um sie beim Telefonieren am Rand zu sehen. */}
      {meldung && !fremd && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-xl bg-teal text-[#0B0D13] font-display font-semibold shadow-lg">
          {meldung}
        </div>
      )}

      {karte?.bingo_at && !fremd && (
        <p className="text-xs text-teal mt-3">
          Bingo geschafft — der Bonus von {PUNKTE.bingo} Punkten ist gutgeschrieben. Weitere Reihen zählen als Wörter weiter.
        </p>
      )}
    </Layout>
  );
}
