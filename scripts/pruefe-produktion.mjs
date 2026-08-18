// Prüft die Academy so, wie sie tatsächlich ausgeliefert wird.
//
// Warum es das gibt: In der Entwicklung sind die Sicherheitsregeln (CSP)
// bewusst abgeschaltet, weil Next.js' Hot Reload sonst nicht läuft (siehe
// next.config.js). Dadurch kann eine Änderung lokal einwandfrei laufen und
// in der echten Academy trotzdem blockiert werden.
//
// Genau das ist passiert: Das Skript, das die gespeicherte Hell/Dunkel-
// Einstellung wiederherstellt, war eingebettet und wurde in der
// ausgelieferten Academy blockiert. Die Einstellung "merkte sich nichts" —
// und weil lokal alles funktionierte, hat die Suche Tage gedauert.
//
// Aufruf:  npm run pruefe
// (baut, startet die echte Fassung und prüft sie; beendet sich mit
//  Fehlercode, wenn etwas nicht stimmt)

import { spawn } from "node:child_process";

const PORT = 3123;
const BASIS = `http://localhost:${PORT}`;

// Seiten, die ohne Anmeldung erreichbar sind. Alles dahinter braucht eine
// Sitzung und lässt sich hier nicht sinnvoll prüfen.
const SEITEN = ["/login", "/reset-password", "/agb", "/datenschutz"];

let fehler = 0;
const meldung = (ok, text) => {
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "FEHLER"}  ${text}`);
};

async function warteAufServer(versuche = 60) {
  for (let i = 0; i < versuche; i++) {
    try {
      const res = await fetch(BASIS + "/login");
      if (res.ok) return true;
    } catch (e) { /* noch nicht bereit */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function pruefeSeite(pfad) {
  const res = await fetch(BASIS + pfad);
  const html = await res.text();
  const csp = res.headers.get("content-security-policy") || "";

  meldung(res.ok, `${pfad} — Seite lädt (${res.status})`);
  meldung(!!csp, `${pfad} — Sicherheitsregeln werden mitgeliefert`);

  // Der eigentliche Kern: eingebettete Skripte werden von script-src 'self'
  // blockiert. <script type="application/json"> zählt nicht — das ist reine
  // Datenablage und wird nie ausgeführt.
  const eingebettet = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(([, attrs]) => !/type=["']application\/json["']/.test(attrs));
  const strikt = /script-src[^;]*'self'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp);
  meldung(
    !(strikt && eingebettet.length),
    `${pfad} — keine eingebetteten Skripte, die von den Regeln blockiert würden` +
      (eingebettet.length ? ` (gefunden: ${eingebettet.length})` : "")
  );
}

async function main() {
  console.log("Baue die auszuliefernde Fassung...");
  await new Promise((fertig, abbruch) => {
    const bau = spawn("npx", ["next", "build"], { stdio: "inherit" });
    bau.on("exit", (code) => (code === 0 ? fertig() : abbruch(new Error("Build fehlgeschlagen"))));
  });

  console.log(`\nStarte sie auf Port ${PORT}...`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore" });
  try {
    if (!await warteAufServer()) throw new Error("Server ist nicht gestartet.");
    console.log("\nPrüfe:\n");
    for (const pfad of SEITEN) await pruefeSeite(pfad);

    // Die Datei, die die Hell/Dunkel-Einstellung wiederherstellt, muss
    // erreichbar sein — sonst greift die Einstellung nie.
    const theme = await fetch(BASIS + "/theme-init.js");
    meldung(theme.ok, `/theme-init.js — Hell/Dunkel-Einstellung wird geladen (${theme.status})`);
  } finally {
    server.kill();
  }

  console.log(fehler === 0 ? "\nAlles in Ordnung.\n" : `\n${fehler} Punkt(e) zu prüfen.\n`);
  process.exit(fehler === 0 ? 0 : 1);
}

main().catch((e) => { console.error("\nAbgebrochen:", e.message); process.exit(1); });
