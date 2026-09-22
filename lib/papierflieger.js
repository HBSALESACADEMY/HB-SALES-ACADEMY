// Der Papierflieger, wenn eine Mail rausgeht.
//
// "Mail ist raus" als Meldung stimmt, aber man fühlt es nicht. Ein Brief,
// den man abschickt, verlässt die Hand — und genau das fehlt am
// Bildschirm. Deshalb fliegt der Flieger quer durchs Bild und ist nach
// gut einer Sekunde weg.
//
// Gezeichnet mit demselben Umriss wie das Senden-Icon (components/Icon.js),
// damit es dieselbe Handschrift ist und nicht ein zweiter Stil daneben.
// Kein Emoji, kein Bild, keine Bibliothek: Die Academy lädt nichts von
// fremden Servern (next.config.js, script-src 'self').

export const FLUG_DAUER = 1500;

const KEYFRAMES = `
@keyframes hb-flieger-flug {
  0% { transform: translate(0, 0) rotate(-8deg) scale(0.7); opacity: 0; }
  12% { opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate(var(--hb-weit, 60vw), var(--hb-hoch, -40vh)) rotate(6deg) scale(1.15); opacity: 0; }
}
@keyframes hb-flieger-spur {
  0% { transform: rotate(-24deg) scaleX(0); opacity: 0; }
  25% { opacity: 0.5; }
  100% { transform: rotate(-24deg) scaleX(1); opacity: 0; }
}
`;

function sorgeFuerKeyframes() {
  if (document.getElementById("hb-flieger-keyframes")) return;
  const stil = document.createElement("style");
  stil.id = "hb-flieger-keyframes";
  stil.textContent = KEYFRAMES;
  document.head.appendChild(stil);
}

function fliegerSvg(groesse) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(groesse));
  svg.setAttribute("height", String(groesse));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  // Derselbe Umriss wie Icon "send": die Knickkante und der Flieger.
  const kante = document.createElementNS("http://www.w3.org/2000/svg", "line");
  [["x1", "22"], ["y1", "2"], ["x2", "11"], ["y2", "13"]].forEach(([a, w]) => kante.setAttribute(a, w));
  const flieger = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  flieger.setAttribute("points", "22 2 15 22 11 13 2 9 22 2");
  // Gefüllt, damit er beim Fliegen nicht durchsichtig aussieht.
  flieger.setAttribute("fill", "currentColor");
  flieger.setAttribute("fill-opacity", "0.22");
  svg.appendChild(flieger);
  svg.appendChild(kante);
  return svg;
}

/**
 * Einen Papierflieger losschicken.
 *
 * @param von     Das Element, von dem er startet (der Senden-Knopf). Ohne
 *                Angabe startet er links unten in der Mitte — dann sieht
 *                man ihn trotzdem, statt gar nichts.
 * @returns true, wenn er unterwegs ist.
 */
export function zeigePapierflieger({ von = null } = {}) {
  if (typeof document === "undefined") return false;
  sorgeFuerKeyframes();
  const ruhig = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  const buehne = document.createElement("div");
  buehne.style.position = "fixed";
  buehne.style.inset = "0";
  buehne.style.pointerEvents = "none";
  buehne.style.overflow = "hidden";
  buehne.style.zIndex = "9997";
  buehne.setAttribute("aria-hidden", "true");

  // Startpunkt: der Knopf, der gedrückt wurde. Der Flieger kommt damit
  // aus der Hand und nicht aus einer Ecke.
  let x = window.innerWidth * 0.3;
  let y = window.innerHeight * 0.6;
  if (von && typeof von.getBoundingClientRect === "function") {
    const platz = von.getBoundingClientRect();
    if (platz.width || platz.height) {
      x = platz.left + platz.width / 2;
      y = platz.top + platz.height / 2;
    }
  }

  const flug = document.createElement("div");
  flug.style.position = "absolute";
  flug.style.left = `${x - 17}px`;
  flug.style.top = `${y - 17}px`;
  flug.style.width = "34px";
  flug.style.height = "34px";
  flug.style.color = "var(--org-accent, #CE3A5C)";
  // Nach rechts oben aus dem Bild — aber nur so weit, dass er auch auf
  // einem schmalen Handy noch sichtbar fliegt.
  flug.style.setProperty("--hb-weit", `${Math.max(180, window.innerWidth - x - 40)}px`);
  flug.style.setProperty("--hb-hoch", `${-Math.max(120, y - 40)}px`);
  flug.style.animation = ruhig
    ? "hb-flieger-flug 0.9s ease-out forwards"
    : "hb-flieger-flug 1.2s cubic-bezier(.3,.1,.5,1) forwards";
  flug.appendChild(fliegerSvg(34));
  buehne.appendChild(flug);

  // Eine dünne Spur, die ihm nachläuft — nur wenn Bewegung erlaubt ist.
  if (!ruhig) {
    const spur = document.createElement("div");
    spur.style.position = "absolute";
    spur.style.left = `${x}px`;
    spur.style.top = `${y}px`;
    spur.style.height = "2px";
    spur.style.width = "90px";
    spur.style.borderRadius = "2px";
    spur.style.transformOrigin = "0 50%";
    spur.style.background = "linear-gradient(90deg, transparent, var(--org-accent, #CE3A5C))";
    // Die Drehung steht auch in den Keyframes: Eine Animation auf
    // "transform" ersetzt den Wert hier, sonst läge die Spur waagerecht.
    spur.style.transform = "rotate(-24deg) scaleX(0)";
    spur.style.animation = "hb-flieger-spur 0.9s ease-out forwards";
    buehne.appendChild(spur);
  }

  document.body.appendChild(buehne);
  setTimeout(() => buehne.remove(), FLUG_DAUER);
  return true;
}
