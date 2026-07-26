// Kleiner, angenehmer "Erfolgs-Chime" beim Login — komplett synthetisiert,
// keine externe Audiodatei nötig. Browser erlauben Web-Audio-Start i.d.R. nur
// direkt im Zuge einer Nutzer-Interaktion (Klick auf "Anmelden" reicht dafür).
export function playLoginChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5–E5–G5, heller Dur-Dreiklang
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
    setTimeout(() => ctx.close(), 900);
  } catch (e) {
    // Audio ist nie kritisch für den Login-Vorgang — Fehler hier einfach ignorieren.
  }
}
