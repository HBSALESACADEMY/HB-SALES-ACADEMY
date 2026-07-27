// Kurzer Konfetti-/Feuerwerk-Effekt, komplett handgebaut (keine externe Bibliothek
// oder Bilddatei nötig). Erzeugt ~60 kleine bunte Rechtecke, die fallen/rotieren
// und sich nach ~2.2s selbst wieder entfernen.
export function triggerConfetti() {
  if (typeof document === "undefined") return;
  const colors = ["#E8368F", "#7B2FF7", "#FF6B35", "#00E5C7", "#F0B23E"];
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";
  container.style.overflow = "hidden";
  document.body.appendChild(container);

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("div");
    const size = 6 + Math.random() * 6;
    const startX = Math.random() * 100;
    const duration = 1.6 + Math.random() * 1.2;
    const delay = Math.random() * 0.3;
    const rotation = Math.random() * 360;
    const drift = (Math.random() - 0.5) * 200;

    piece.style.position = "absolute";
    piece.style.left = `${startX}vw`;
    piece.style.top = "-20px";
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 0.6}px`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = "1px";
    piece.style.opacity = "0.95";
    piece.style.transform = `rotate(${rotation}deg)`;
    piece.style.animation = `hb-confetti-fall ${duration}s ease-in ${delay}s forwards`;
    piece.style.setProperty("--drift", `${drift}px`);
    container.appendChild(piece);
  }

  if (!document.getElementById("hb-confetti-keyframes")) {
    const style = document.createElement("style");
    style.id = "hb-confetti-keyframes";
    style.textContent = `
      @keyframes hb-confetti-fall {
        to {
          top: 105vh;
          transform: translateX(var(--drift)) rotate(720deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => container.remove(), 3200);
}
