// Die Belohnung am Ende eines Telefonblocks.
//
// Die Uhr zählt hoch, damit sie keinen Druck macht — und wenn die Zeit
// voll ist, soll etwas passieren, auf das man sich freut: ein kurzer
// Regen aus Hörern, einer für jede Anwahl, ein Wecker, dessen Zeiger sich
// dreht, und ein leiser Gong. Nach zwei Sekunden ist alles wieder weg.
//
// Alles handgebaut, wie schon das Konfetti (lib/confetti.js): keine
// Bibliothek, keine Bild- und keine Tondatei. Der Gong wird im Browser
// erzeugt. Das muss so sein — die Academy lädt nichts von fremden Servern
// (siehe next.config.js, script-src 'self').

/** Wie viele Hörer fallen: einer je Anwahl, bei 60 ist die Wand voll. */
export const HOERER_MAX = 60;

export function hoererZahl(anwahlen = 0) {
  const n = Math.floor(Number(anwahlen) || 0);
  if (n <= 0) return 0;
  return Math.min(HOERER_MAX, n);
}

/** Wie lange die ganze Feier dauert (ms) — danach ist der Bildschirm wieder leer. */
export const FEIER_DAUER = 2600;

const KEYFRAMES = `
@keyframes hb-hoerer-fall {
  0% { transform: translateY(-40px) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translateY(105vh) translateX(var(--hb-drift, 0px)) rotate(var(--hb-dreh, 180deg)); opacity: 0.9; }
}
@keyframes hb-wecker-auf {
  0% { transform: scale(0.4); opacity: 0; }
  15% { transform: scale(1.08); opacity: 1; }
  30% { transform: scale(1); opacity: 1; }
  75% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.15); opacity: 0; }
}
@keyframes hb-zeiger {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(1080deg); }
}
@keyframes hb-wecker-wackeln {
  0%, 100% { transform: rotate(-7deg); }
  50% { transform: rotate(7deg); }
}
`;

function sorgeFuerKeyframes() {
  if (document.getElementById("hb-blockfeier-keyframes")) return;
  const stil = document.createElement("style");
  stil.id = "hb-blockfeier-keyframes";
  stil.textContent = KEYFRAMES;
  document.head.appendChild(stil);
}

/**
 * Ein leiser Gong — zwei Töne, die ausklingen.
 *
 * Bewusst kein Weckerklingeln: Wer im Büro sitzt, soll sich freuen und
 * nicht zusammenzucken, und die Kollegin am Telefon soll es kaum hören.
 * Deshalb Sinustöne mit weichem Einsatz und Lautstärke 0.06.
 */
export function spieleGong() {
  try {
    const Klang = window.AudioContext || window.webkitAudioContext;
    if (!Klang) return false;
    const ton = new Klang();
    // Zwei Töne im Quintabstand, der zweite leicht versetzt.
    [[880, 0], [1318.5, 0.18]].forEach(([hz, ab], i) => {
      const quelle = ton.createOscillator();
      const lautstaerke = ton.createGain();
      quelle.type = "sine";
      quelle.frequency.value = hz;
      const start = ton.currentTime + ab;
      const spitze = i === 0 ? 0.06 : 0.045;
      lautstaerke.gain.setValueAtTime(0.0001, start);
      lautstaerke.gain.linearRampToValueAtTime(spitze, start + 0.05);
      lautstaerke.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
      quelle.connect(lautstaerke).connect(ton.destination);
      quelle.start(start);
      quelle.stop(start + 1.2);
    });
    // Den Kontext danach wieder schliessen, sonst bleibt er offen liegen.
    setTimeout(() => { try { ton.close(); } catch (e) { /* schon zu */ } }, 1800);
    return true;
  } catch (e) {
    // Kein Ton ist kein Fehler: Manche Browser erlauben ihn nur nach einem
    // Klick, und der Block endet auch von selbst.
    return false;
  }
}

function weckerElement(ruhig) {
  const wecker = document.createElement("div");
  wecker.style.position = "absolute";
  wecker.style.left = "50%";
  wecker.style.top = "38%";
  wecker.style.marginLeft = "-56px";
  wecker.style.marginTop = "-56px";
  wecker.style.width = "112px";
  wecker.style.height = "112px";
  wecker.style.borderRadius = "50%";
  wecker.style.border = "5px solid rgb(var(--theme-text-rgb, 240 241 248))";
  wecker.style.background = "rgb(var(--theme-surface-raised-rgb, 33 36 49))";
  wecker.style.boxShadow = "0 18px 40px rgba(0,0,0,0.45)";
  wecker.style.animation = ruhig
    ? "hb-wecker-auf 1.4s ease-out forwards"
    : "hb-wecker-auf 2.2s ease-out forwards";

  // Die zwei Glocken oben — damit es ein Wecker ist und nicht nur ein Kreis.
  [-38, 38].forEach((x) => {
    const glocke = document.createElement("div");
    glocke.style.position = "absolute";
    glocke.style.top = "-16px";
    glocke.style.left = `calc(50% + ${x}px)`;
    glocke.style.width = "26px";
    glocke.style.height = "20px";
    glocke.style.marginLeft = "-13px";
    glocke.style.borderRadius = "50% 50% 0 0";
    glocke.style.background = "rgb(var(--theme-text-rgb, 240 241 248))";
    glocke.style.transform = `rotate(${x < 0 ? -25 : 25}deg)`;
    wecker.appendChild(glocke);
  });

  const zeiger = (laenge, breite, dauer) => {
    const z = document.createElement("div");
    z.style.position = "absolute";
    z.style.left = "50%";
    z.style.bottom = "50%";
    z.style.width = `${breite}px`;
    z.style.marginLeft = `${-breite / 2}px`;
    z.style.height = `${laenge}px`;
    z.style.borderRadius = "2px";
    z.style.background = "var(--org-accent, #CE3A5C)";
    z.style.transformOrigin = "50% 100%";
    if (!ruhig) z.style.animation = `hb-zeiger ${dauer}s linear infinite`;
    return z;
  };
  wecker.appendChild(zeiger(42, 5, 1.1));
  wecker.appendChild(zeiger(30, 5, 2.4));

  if (!ruhig) {
    const huelle = document.createElement("div");
    huelle.style.position = "absolute";
    huelle.style.inset = "0";
    huelle.style.animation = "hb-wecker-wackeln 0.22s ease-in-out 6";
    huelle.appendChild(wecker);
    return huelle;
  }
  return wecker;
}

/**
 * Die Feier zeigen: Hörerregen, Wecker, Gong.
 *
 * @param anwahlen  Anwahlen in diesem Block — sie bestimmen, wie voll es wird.
 * @param ton       false schaltet den Gong ab (Einstellung im Telefonblock).
 * @returns Die Zahl der Hörer, die gefallen sind — für die Prüfung.
 */
export function zeigeBlockFeier({ anwahlen = 0, ton = true } = {}) {
  if (typeof document === "undefined") return 0;
  sorgeFuerKeyframes();
  // Wer im System "weniger Bewegung" eingestellt hat, bekommt den Wecker
  // ohne Regen und ohne Wackeln — aber er bekommt ihn.
  const ruhig = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  const buehne = document.createElement("div");
  buehne.style.position = "fixed";
  buehne.style.inset = "0";
  buehne.style.pointerEvents = "none";
  buehne.style.overflow = "hidden";
  buehne.style.zIndex = "9998";
  buehne.setAttribute("aria-hidden", "true");

  const anzahl = ruhig ? 0 : hoererZahl(anwahlen);
  for (let i = 0; i < anzahl; i += 1) {
    const hoerer = document.createElement("div");
    hoerer.textContent = "📞";
    // Die Emoji-Schrift ausdrücklich nennen: Die Academy bringt ihre
    // Schriften selbst mit (Work Sans, Fraunces), und ohne diese Reihe
    // sucht der Browser den Hörer in einer Schrift, die keinen hat.
    hoerer.style.fontFamily = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    hoerer.style.position = "absolute";
    hoerer.style.left = `${Math.random() * 98}vw`;
    hoerer.style.top = "-40px";
    hoerer.style.fontSize = `${18 + Math.random() * 16}px`;
    hoerer.style.setProperty("--hb-drift", `${(Math.random() - 0.5) * 160}px`);
    hoerer.style.setProperty("--hb-dreh", `${(Math.random() - 0.5) * 720}deg`);
    hoerer.style.animation = `hb-hoerer-fall ${1.5 + Math.random() * 0.9}s ease-in ${Math.random() * 0.5}s forwards`;
    buehne.appendChild(hoerer);
  }

  buehne.appendChild(weckerElement(ruhig));
  document.body.appendChild(buehne);
  if (ton) spieleGong();
  setTimeout(() => buehne.remove(), FEIER_DAUER);
  return anzahl;
}
