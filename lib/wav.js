// Rohes PCM in eine abspielbare WAV-Datei verpacken.
//
// Die Sprachausgabe von Gemini kommt als nacktes PCM (16 Bit, 24 kHz, mono)
// zurück — ohne Kopfdaten kann kein Browser damit etwas anfangen. Der
// WAV-Kopf ist 44 Byte und beschreibt genau das: Format, Kanäle, Rate.
//
// Reine Rechnung ohne Netz, deshalb prüfbar.
export function pcmZuWav(pcm, rate = 24000, kanaele = 1, bits = 16) {
  const daten = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm, "base64");
  const blockAusrichtung = (kanaele * bits) / 8;
  const byteRate = rate * blockAusrichtung;
  const kopf = Buffer.alloc(44);

  kopf.write("RIFF", 0);
  // Dateigrösse ab Byte 8 — also alles ausser "RIFF" und dieser Zahl selbst.
  kopf.writeUInt32LE(36 + daten.length, 4);
  kopf.write("WAVE", 8);
  kopf.write("fmt ", 12);
  kopf.writeUInt32LE(16, 16);          // Länge des fmt-Blocks
  kopf.writeUInt16LE(1, 20);           // 1 = unkomprimiertes PCM
  kopf.writeUInt16LE(kanaele, 22);
  kopf.writeUInt32LE(rate, 24);
  kopf.writeUInt32LE(byteRate, 28);
  kopf.writeUInt16LE(blockAusrichtung, 32);
  kopf.writeUInt16LE(bits, 34);
  kopf.write("data", 36);
  kopf.writeUInt32LE(daten.length, 40);

  return Buffer.concat([kopf, daten]);
}

// Aus "audio/L16;codec=pcm;rate=24000" die Abtastrate lesen. Gemini gibt sie
// im MIME-Typ mit; ohne Angabe gilt der Standard von 24 kHz.
export function rateAusMime(mime, standard = 24000) {
  const treffer = /rate=(\d+)/.exec(String(mime || ""));
  const wert = treffer ? Number(treffer[1]) : NaN;
  return Number.isFinite(wert) && wert > 0 ? wert : standard;
}
