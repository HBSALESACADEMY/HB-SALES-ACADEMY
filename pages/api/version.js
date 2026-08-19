// Welcher Stand läuft gerade? Öffentlich und bewusst mager.
//
// Grund: "Ich sehe keine Änderung" liess sich bisher nicht beantworten, ohne
// in der Vercel-Oberfläche nachzusehen. Vercel setzt diese Variablen bei
// jedem Bau selbst; steht hier ein alter Commit, ist die Auslieferung das
// Problem und nicht der Code.
//
// Enthält nur, was ohnehin öffentlich ist (Commit-Kürzel, Zweig, Zeitpunkt) —
// keine Zugangsdaten, keine Nutzerdaten.
export default function handler(req, res) {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    commit: sha ? sha.slice(0, 7) : "lokal",
    zweig: process.env.VERCEL_GIT_COMMIT_REF || "lokal",
    nachricht: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    gebaut: process.env.VERCEL_DEPLOYMENT_ID ? "auf Vercel" : "lokal",
  });
}
