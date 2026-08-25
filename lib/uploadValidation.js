// Client-seitige Vorprüfung von Datei-Uploads (Typ + Größe). Ersetzt keine
// serverseitigen Kontrollen (siehe Bucket-Einstellungen im Supabase-Dashboard),
// verhindert aber im normalen Nutzungsfall, dass beliebig große oder
// potenziell gefährliche Dateien überhaupt erst hochgeladen werden.

const MAX_POST_MB = 20;
const MAX_CHAT_MB = 25;
// Gemini nimmt Audio als inline base64 entgegen (kein separater Upload-
// Dienst) — base64 bläht die Größe um ca. 1/3 auf, daher hier bewusst
// kleiner als die anderen Obergrenzen, um innerhalb des Anfrage-Limits zu bleiben.
const MAX_RECORDING_MB = 15;

// Ausführbare/potenziell gefährliche Dateitypen — im Chat sind bewusst viele
// Dateitypen erlaubt (PDFs, Office-Dokumente etc. für den Vertriebsalltag),
// aber keine ausführbaren Dateien.
const DANGEROUS_EXTENSIONS = ["exe", "bat", "cmd", "com", "scr", "msi", "sh", "apk", "jar", "dll", "ps1", "vbs", "js", "jse", "wsf"];

function extensionOf(file) {
  return (file.name || "").split(".").pop()?.toLowerCase() || "";
}

// Für Community-Beiträge: nur Bild/Video, wie in der Oberfläche kommuniziert.
export function validatePostAttachment(file) {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return "Nur Bilder oder Videos können angehängt werden.";
  }
  if (file.size > MAX_POST_MB * 1024 * 1024) {
    return `Datei ist zu groß (max. ${MAX_POST_MB} MB).`;
  }
  return null;
}

// Für Chat-Anhänge: breiter gefasst (Dokumente etc.), aber keine ausführbaren
// Dateien und eine Obergrenze für die Größe.
export function validateChatAttachment(file) {
  if (DANGEROUS_EXTENSIONS.includes(extensionOf(file))) {
    return "Dieser Dateityp ist aus Sicherheitsgründen nicht erlaubt.";
  }
  if (file.size > MAX_CHAT_MB * 1024 * 1024) {
    return `Datei ist zu groß (max. ${MAX_CHAT_MB} MB).`;
  }
  return null;
}

// Endungen, die wir als Aufnahme akzeptieren. Nötig, weil das Handy oft
// GAR KEINEN Dateityp mitschickt: eine Sprachnotiz aus iCloud, eine
// WhatsApp-Datei oder etwas aus dem Datei-Manager kommt regelmässig mit
// leerem type oder als "application/octet-stream" an. Die Prüfung auf
// "audio/..." lehnte solche Dateien ab — auf dem Rechner fiel das nie auf.
export const AUDIO_ENDUNGEN = ["mp3", "m4a", "mp4", "aac", "wav", "ogg", "oga", "opus", "amr", "3gp", "3gpp", "caf", "webm", "flac", "aiff", "aif", "wma"];

export function istAudioDatei(file) {
  if ((file?.type || "").startsWith("audio/")) return true;
  // Sprachaufnahmen vom iPhone kommen zum Teil als video/mp4 oder
  // video/quicktime an, obwohl gar kein Bild darin ist.
  if ((file?.type || "").startsWith("video/") && AUDIO_ENDUNGEN.includes(extensionOf(file))) return true;
  const typLeer = !file?.type || file.type === "application/octet-stream";
  return typLeer && AUDIO_ENDUNGEN.includes(extensionOf(file));
}

// Für hochgeladene Anruf-Aufnahmen (pages/recordings.js).
export function validateRecordingUpload(file) {
  if (!istAudioDatei(file)) {
    return "Das sieht nicht nach einer Audio-Datei aus. Erlaubt sind z.B. MP3, M4A, WAV, AAC, OGG oder OPUS.";
  }
  if (file.size > MAX_RECORDING_MB * 1024 * 1024) {
    return `Aufnahme ist zu groß (${Math.round(file.size / 1024 / 1024)} MB, erlaubt sind ${MAX_RECORDING_MB} MB). Kürze die Aufnahme oder nimm sie in geringerer Qualität auf.`;
  }
  return null;
}
