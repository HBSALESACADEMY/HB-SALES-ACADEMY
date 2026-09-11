// Formular für EINE Organisation — Stammdaten, Erscheinungsbild, Call
// Tracker, Benachrichtigungen, Termin-Formular, Team-Wettbewerb.
//
// Lag früher in pages/admin/organization.js. Herausgezogen, weil der
// Betreiber-Bereich (pages/admin/betreiber.js) dasselbe Formular für JEDE
// Kundenorganisation braucht — dort ist es dieselbe Maske, nur eben nicht
// für die eigene Organisation.
import { useEffect, useState } from "react";
import Icon from "./Icon";
import MailVorlagen from "./MailVorlagen";
import { resolveLeitfaden } from "../lib/leitfaden";
import { supabase } from "../lib/supabaseClient";
import { apiGet, apiPost } from "../lib/apiClient";
import { textColorForColors, blend } from "../lib/orgBranding";
import { DEFAULT_LEAD_FIELDS, RESERVED_FIELD_COLUMNS, resolveCoreRequired } from "../lib/leadFields";
import { DEFAULT_OBJECTION_CATEGORIES } from "../lib/objectionCategories";
import { getActiveOrgId } from "../lib/activeOrg";
import { goalMetricGroups } from "../lib/goalMetrics";

function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4;
  }
  return h * 60;
}

function toHex(r, g, b) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// Bis zu 3 markante, deutlich unterschiedliche Farben aus einem Bild erkennen
// (Histogramm-Binning + Hue-Sortierung für einen stimmigen Verlauf) — keine
// externe Bibliothek nötig, alles per <canvas>.
function extractDominantColors(imgEl, count = 3) {
  const size = 60;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const step = 24;
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${Math.round(r / step)}_${Math.round(g / step)}_${Math.round(b / step)}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count += 1;
    buckets.set(key, bucket);
  }
  if (buckets.size === 0) return [];

  const byFrequency = Array.from(buckets.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, b]) => ({ r: Math.round(b.r / b.count), g: Math.round(b.g / b.count), b: Math.round(b.b / b.count) }));

  const picked = [];
  const minDistance = 60;
  for (const c of byFrequency) {
    if (picked.length >= count) break;
    const tooClose = picked.some((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < minDistance);
    if (!tooClose) picked.push(c);
  }
  for (const c of byFrequency) {
    if (picked.length >= count) break;
    if (!picked.includes(c)) picked.push(c);
  }

  return picked
    .map((c) => ({ ...c, hue: rgbToHue(c.r, c.g, c.b) }))
    .sort((a, b) => a.hue - b.hue)
    .map((c) => toHex(c.r, c.g, c.b));
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // Umlaute/Akzente entfernen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Das Formular ist lang — ohne Gliederung sucht man einzelne Einstellungen
// (das Telegram-Feld war so nicht auffindbar). Deshalb klar getrennte
// Abschnitte mit Überschrift statt einer durchgehenden Liste.
const BEREICHE = [
  ["grunddaten", "Grunddaten"],
  ["erscheinung", "Erscheinungsbild"],
  ["calltracker", "Call Tracker"],
  ["leitfaden", "Gesprächsablauf"],
  ["aufnahmen", "Aufnahmen"],
  ["mailvorlagen", "E-Mail"],
  ["benachrichtigungen", "Benachrichtigungen"],
  ["formular", "Termin-Formular"],
  ["team", "Team-Wettbewerb"],
  ["vorschau", "Vorschau"],
];

// Ein Dutzend Einstellungen untereinander war unübersichtlich — jetzt ein
// Menü: sichtbar ist immer nur der gewählte Bereich. Die Reiter zeigen
// zugleich, was es überhaupt gibt, statt dass man scrollend danach sucht.
function Bereichsmenue({ aktiv, onWechsel }) {
  return (
    <div className="flex items-center gap-1.5 mb-4 flex-wrap">
      {BEREICHE.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onWechsel(key)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${aktiv === key ? "bg-amber text-[var(--org-button-text,#fff)] border-amber" : "border-line text-textMuted hover:text-textMain"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Abschnitt({ id, aktiv, titel, hinweis, children }) {
  if (aktiv !== id) return null;
  return (
    <div>
      <div className="font-display font-semibold text-textMain text-sm mb-1">{titel}</div>
      {hinweis && <p className="text-[11px] text-textMuted mb-3">{hinweis}</p>}
      {children}
    </div>
  );
}

function uniqueCategoryKey(label, existingKeys) {
  const base = slugify(label) || "kategorie";
  let key = base, n = 2;
  while (existingKeys.includes(key)) { key = `${base}-${n}`; n++; }
  return key;
}

// Wiederverwendbares Formular für Name/Firmencode/Logo/Markenfarben einer
// Organisation — für die eigene Organisation (mit Reload danach, damit das
// Branding sofort überall greift) UND, für Plattform-Admins, für JEDE
// fremde Organisation (ohne Reload, nur die Liste wird aktualisiert).
export default function OrgEditor({ org, isOwnOrg, onSaved, onDeleted, canDelete }) {
  const [name, setName] = useState(org.name || "");
  const [slug, setSlug] = useState(org.slug || "");
  const [logoUrl, setLogoUrl] = useState(org.logo_url || "");
  const [secondaryColor, setSecondaryColor] = useState(org.secondary_color || "#4C5DC9");
  const [primaryColor, setPrimaryColor] = useState(org.primary_color || "#CE3A5C");
  const [tertiaryColor, setTertiaryColor] = useState(org.tertiary_color || "#B2314F");
  const [backgroundColor, setBackgroundColor] = useState(org.background_color || "#14151C");
  const [surfaceColor, setSurfaceColor] = useState(org.surface_color || "#171A24");
  const [textColor, setTextColor] = useState(org.text_color || "#EDEDF4");
  const [useCustomSurface, setUseCustomSurface] = useState(!!(org.background_color || org.surface_color || org.text_color));
  const [bookingInstructions, setBookingInstructions] = useState(org.booking_instructions || "");
  const [bookingUrl, setBookingUrl] = useState(org.booking_url || "");
  const [telegramChatId, setTelegramChatId] = useState(org.telegram_chat_id || "");
  const [telegramMarketingId, setTelegramMarketingId] = useState(org.telegram_marketing_chat_id || "");
  const [telegramBestaetigungId, setTelegramBestaetigungId] = useState(org.telegram_bestaetigung_chat_id || "");
  const [telegramAbschlussId, setTelegramAbschlussId] = useState(org.telegram_abschluss_chat_id || "");
  // Chat-Kennungen suchen und ausprobieren. Ohne beides lautet die
  // Anleitung "ruf api.telegram.org/bot SCHLÜSSEL /getUpdates auf" — den
  // Bot-Schlüssel in eine Adresszeile zu tippen ist für eine Kennung, die
  // man einmal braucht, ein schlechter Tausch.
  const [chatSuche, setChatSuche] = useState(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [telegramStand, setTelegramStand] = useState(null);
  // Wie die eingetragenen Gruppen heissen. In den Feldern steht sonst nur
  // eine nackte Nummer, und eine Kennung im falschen Feld merkt man erst,
  // wenn die Nachricht in der falschen Gruppe steht.
  const [chatNamen, setChatNamen] = useState({});
  const [gruppenCode, setGruppenCode] = useState(null);
  const [vorlagen, setVorlagen] = useState(Array.isArray(org.email_vorlagen) ? org.email_vorlagen : []);
  const [absender, setAbsender] = useState(org.email_absender || "");
  // Die Dateien der Organisation, damit eine Vorlage feste Anhänge tragen
  // kann. Hochgeladen werden sie im E-Mail-Marketing — hier nur ausgewählt.
  const [orgAnhaenge, setOrgAnhaenge] = useState([]);
  const [signatur, setSignatur] = useState(org.email_signatur || "");
  // Der Ablauf, der beim Gespräch mit der Entscheidung erscheint.
  const [leitfaden, setLeitfaden] = useState(() => resolveLeitfaden(org));
  const [aufnahmeFrist, setAufnahmeFrist] = useState(
    Number.isFinite(org.aufnahme_frist_tage) ? String(org.aufnahme_frist_tage) : "30"
  );

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("email_anhaenge").select("id, name").order("created_at", { ascending: false });
      setOrgAnhaenge(data || []);
    })();
  }, []);
  // Ergebnis der Probemail — im Klartext, nicht als Häkchen.
  const [testStand, setTestStand] = useState(null);
  const [testBusy, setTestBusy] = useState(false);
  const [antwortAn, setAntwortAn] = useState(org.email_antwort_an || "");
  const [rankingMetric, setRankingMetric] = useState(org.team_ranking_metric || "xp");
  const [bereich, setBereich] = useState("grunddaten");
  const [useCustomCategories, setUseCustomCategories] = useState(Array.isArray(org.objection_categories) && org.objection_categories.length > 0);
  const [categories, setCategories] = useState(
    Array.isArray(org.objection_categories) && org.objection_categories.length ? org.objection_categories : DEFAULT_OBJECTION_CATEGORIES
  );
  // Welche der Grundfelder Pflicht sind (Name/Termin sind immer Pflicht).
  const [coreRequired, setCoreRequired] = useState(() => resolveCoreRequired(org));
  const [useCustomLeadFields, setUseCustomLeadFields] = useState(Array.isArray(org.lead_field_config) && org.lead_field_config.length > 0);
  const [leadFields, setLeadFields] = useState(
    Array.isArray(org.lead_field_config) && org.lead_field_config.length ? org.lead_field_config : DEFAULT_LEAD_FIELDS
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function pickLogoFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploadingLogo(true);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const colors = extractDominantColors(img, 3);
      if (colors.length === 3) {
        setSecondaryColor(colors[0]); setPrimaryColor(colors[1]); setTertiaryColor(colors[2]);
      } else if (colors.length === 2) {
        setSecondaryColor(colors[0]); setPrimaryColor(colors[1]);
      } else if (colors.length === 1) {
        setPrimaryColor(colors[0]);
      }
      URL.revokeObjectURL(objectUrl);

      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${org.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("org-logos").upload(path, file, { contentType: file.type });
      if (upErr) { setError(upErr.message); setUploadingLogo(false); return; }
      const { data: pub } = supabase.storage.from("org-logos").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      setUploadingLogo(false);
    };
    img.onerror = () => { setError("Bild konnte nicht gelesen werden."); setUploadingLogo(false); };
    img.src = objectUrl;
  }

  function updateCategoryLabel(i, label) {
    setCategories((prev) => prev.map((c, idx) => (idx === i ? { ...c, label } : c)));
  }
  function addCategory() {
    setCategories((prev) => [...prev, { key: uniqueCategoryKey("Neue Kategorie", prev.map((c) => c.key)), label: "" }]);
  }
  function removeCategory(i) {
    setCategories((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function resetCategories() {
    setCategories(DEFAULT_OBJECTION_CATEGORIES);
    setUseCustomCategories(false);
  }

  function updateLeadField(i, patch) {
    setLeadFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addLeadField() {
    // Reservierte Schlüssel (siehe lib/leadFields.js) dürfen nie für ein
    // neues Zusatzfeld vergeben werden — sonst würde es fälschlich in eine
    // feste Spalte statt in custom_fields schreiben.
    const existing = [...leadFields.map((f) => f.key), ...Object.keys(RESERVED_FIELD_COLUMNS)];
    setLeadFields((prev) => [...prev, { key: uniqueCategoryKey("Neues Feld", existing), label: "", type: "text" }]);
  }
  function removeLeadField(i) {
    setLeadFields((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function resetLeadFields() {
    setLeadFields(DEFAULT_LEAD_FIELDS);
    setUseCustomLeadFields(false);
  }

  // Die Gruppen holen, die der Bot kennt. Der Schlüssel bleibt auf dem
  // Server — herein kommen nur Name, Art und Kennung.
  async function sucheChats() {
    setChatBusy(true);
    setTelegramStand(null);
    try {
      // Die Organisation mitgeben: ein Plattform-Admin verwaltet hier auch
      // fremde Organisationen, und der Nachweis gilt je Organisation.
      const { chats, namen, code } = await apiGet(
        `/api/admin/telegram-chats?orgId=${encodeURIComponent(org.id)}&ids=${encodeURIComponent(eingetrageneChats.join(","))}`);
      setGruppenCode(code || null);
      // Einzelchats sind hier nicht gemeint: die Meldungen gehen an ein
      // Team, nicht an eine Person.
      setChatSuche({ chats: (chats || []).filter((c) => c.art !== "private") });
      setChatNamen(namen || {});
    } catch (e) {
      setChatSuche({ fehler: e?.message || "Die Suche ist fehlgeschlagen." });
    }
    setChatBusy(false);
  }

  // Der Name einer eingetragenen Gruppe, sobald er bekannt ist.
  function chatName(id) {
    const k = String(id || "").trim();
    return k ? chatNamen[k] : null;
  }

  // Eine Testnachricht in den Kanal. Eine falsch eingetragene Kennung
  // merkt man sonst erst, wenn die erste echte Meldung ausbleibt — und
  // eine ausbleibende Meldung sieht aus wie "es gab nichts zu melden".
  async function testeKanal(chatId, zweck) {
    setChatBusy(true);
    setTelegramStand(null);
    try {
      await apiPost("/api/admin/telegram-test", { chatId: chatId.trim(), zweck });
      setTelegramStand({ ok: true, text: "Testnachricht ist raus — steht sie in der Gruppe, stimmt die Chat-ID." });
    } catch (e) {
      setTelegramStand({ ok: false, text: e?.message || "Die Testnachricht konnte nicht verschickt werden." });
    }
    setChatBusy(false);
  }

  const eingetrageneChats = [telegramChatId, telegramMarketingId, telegramBestaetigungId, telegramAbschlussId]
    .map((x) => x.trim()).filter(Boolean);

  async function save() {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true); setError(""); setSaved(false);
    const cleanCategories = categories.filter((c) => c.label.trim()).map((c) => ({ key: c.key, label: c.label.trim() }));
    const cleanLeadFields = leadFields.filter((f) => f.label.trim()).map((f) => ({
      key: f.key, label: f.label.trim(), type: f.type,
      ...(f.type === "text" && f.multiline ? { multiline: true } : {}),
      ...(f.required ? { required: true } : {}),
    }));
    const { error: err } = await supabase.from("organizations").update({
      name: name.trim(),
      slug: slugify(slug.trim()),
      logo_url: logoUrl.trim() || null,
      secondary_color: secondaryColor,
      primary_color: primaryColor,
      tertiary_color: tertiaryColor,
      background_color: useCustomSurface ? backgroundColor : null,
      surface_color: useCustomSurface ? surfaceColor : null,
      text_color: useCustomSurface ? textColor : null,
      booking_instructions: bookingInstructions.trim() || null,
      booking_url: bookingUrl.trim() || null,
      telegram_chat_id: telegramChatId.trim() || null,
      telegram_marketing_chat_id: telegramMarketingId.trim() || null,
      telegram_bestaetigung_chat_id: telegramBestaetigungId.trim() || null,
      telegram_abschluss_chat_id: telegramAbschlussId.trim() || null,
      // Nur vollständige Vorlagen: eine ohne Text steht sonst in der
      // Auswahl und liefert eine leere Mail.
      email_vorlagen: vorlagen.filter((v) => v.name?.trim() && v.text?.trim()),
      email_absender: absender.trim() || null,
      // 0 heisst ausdrücklich "keine Frist" — deshalb wird die Null hier
      // nicht wie ein leeres Feld behandelt.
      aufnahme_frist_tage: Math.max(0, Math.min(3650, parseInt(aufnahmeFrist, 10) || 0)),
      // Schritte ohne Titel fliegen raus; eine leere Liste heisst
      // ausdrücklich "kein Leitfaden" und wird so gespeichert.
      gespraechsleitfaden: leitfaden.filter((s) => s.titel?.trim()).map((s) => ({
        titel: s.titel.trim(), hinweis: (s.hinweis || "").trim() || null,
      })),
      email_antwort_an: antwortAn.trim() || null,
      email_signatur: signatur.trim() || null,
      team_ranking_metric: rankingMetric === "xp" ? null : rankingMetric,
      objection_categories: useCustomCategories && cleanCategories.length ? cleanCategories : null,
      lead_field_config: useCustomLeadFields && cleanLeadFields.length ? cleanLeadFields : null,
      lead_core_required: coreRequired,
    }).eq("id", org.id);
    setSaving(false);
    if (err) {
      setError(err.code === "23505" ? "Dieser Firmencode ist schon vergeben." : err.message);
      return;
    }
    setSaved(true);
    if (isOwnOrg) { setTimeout(() => window.location.reload(), 900); }
    else { onSaved?.(); setTimeout(() => setSaved(false), 1500); }
  }

  async function deleteOrg() {
    if (!confirm(`Organisation "${name}" wirklich löschen? Geht nur, wenn sie keine Mitglieder mehr hat.`)) return;
    setDeleting(true); setError("");
    try {
      await apiPost("/api/platform/delete-organization", { organizationId: org.id });
      onDeleted?.();
    } catch (e) {
      setError(e.message);
    }
    setDeleting(false);
  }

  return (
    <div>
      <Bereichsmenue aktiv={bereich} onWechsel={setBereich} />

      <Abschnitt id="grunddaten" aktiv={bereich} titel="Grunddaten">
      <label className="block text-xs text-textMuted mb-1.5">Name</label>
      <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Firmenname" />

      <label className="block text-xs text-textMuted mb-1.5">Firmencode (Login/Registrierung)</label>
      <input className="input mb-4" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="firmencode" />

      </Abschnitt>

      <Abschnitt id="erscheinung" aktiv={bereich} titel="Erscheinungsbild" hinweis="Logo und Farben — gelten überall in der Academy für diese Organisation.">
      <label className="block text-xs text-textMuted mb-1.5">Logo</label>
      <div className="flex items-center gap-3 mb-4">
        {logoUrl && <img src={logoUrl} alt="Logo-Vorschau" className="h-12 w-auto rounded" onError={(e) => { e.target.style.display = "none"; }} />}
        <label className="btn-ghost text-xs cursor-pointer">
          {uploadingLogo ? "Lädt hoch..." : "Logo hochladen"}
          <input type="file" accept="image/*" className="hidden" onChange={pickLogoFile} disabled={uploadingLogo} />
        </label>
      </div>
      <p className="text-[11px] text-textMuted mb-4">Beim Hochladen werden bis zu 3 markante Farben aus dem Logo erkannt und unten als kompletter Marken-Verlauf vorgeschlagen — danach frei anpassbar.</p>

      <label className="block text-xs text-textMuted mb-1.5">Markenverlauf (Anfang → Mitte → Ende)</label>
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-2">
          <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
          <span className="text-xs text-textMuted font-mono">{secondaryColor}</span>
        </div>
        <div className="flex items-center gap-2">
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
          <span className="text-xs text-textMuted font-mono">{primaryColor}</span>
        </div>
        <div className="flex items-center gap-2">
          <input type="color" value={tertiaryColor} onChange={(e) => setTertiaryColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
          <span className="text-xs text-textMuted font-mono">{tertiaryColor}</span>
        </div>
      </div>
      <div className="h-2 rounded-full mb-5" style={{ background: `linear-gradient(90deg, ${secondaryColor} 0%, ${primaryColor} 55%, ${tertiaryColor} 100%)` }} />

      <label className="flex items-center gap-2 text-xs text-textMuted mb-4 cursor-pointer select-none">
        <input type="checkbox" checked={useCustomSurface} onChange={(e) => setUseCustomSurface(e.target.checked)} />
        Auch Hintergrund, Kartenfläche und Textfarbe anpassen (sonst bleibt das HB-Standarddesign für diese Flächen erhalten)
      </label>

      {useCustomSurface && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-xs text-textMuted mb-1.5">Hintergrund</label>
            <div className="flex items-center gap-2">
              <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
              <span className="text-xs text-textMuted font-mono">{backgroundColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-textMuted mb-1.5">Karten / Fläche</label>
            <div className="flex items-center gap-2">
              <input type="color" value={surfaceColor} onChange={(e) => setSurfaceColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
              <span className="text-xs text-textMuted font-mono">{surfaceColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-textMuted mb-1.5">Textfarbe</label>
            <div className="flex items-center gap-2">
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-10 w-14 rounded border border-line bg-transparent cursor-pointer" />
              <span className="text-xs text-textMuted font-mono">{textColor}</span>
            </div>
          </div>
          <p className="text-[11px] text-textMuted sm:col-span-3">Textfarbe wird automatisch für ausreichenden Kontrast auf Hintergrund/Fläche geprüft, sofern hier nichts eingetragen wird — die manuelle Auswahl hat aber immer Vorrang.</p>
        </div>
      )}

      </Abschnitt>

      <Abschnitt id="leitfaden" aktiv={bereich} titel="Gesprächsablauf" hinweis="Was im Call Tracker erscheint, sobald die Entscheidung am Telefon ist.">
      <p className="text-[11px] text-textMuted mb-3">
        Diese Schritte sieht ein Vertriebler in dem Moment, in dem der Entscheider drangeht — direkt erreicht
        oder durchgestellt. Es ist eine Gedächtnisstütze im Gespräch, kein Schulungsmaterial: kurz halten. Wer
        im Telefonat einen Absatz lesen muss, liest ihn nicht, sondern redet einfach los. Beim Vorzimmer
        erscheint nichts — dort geht es nur ums Durchkommen.
      </p>
      {leitfaden.map((schritt, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded-full bg-surfaceRaised text-textMuted text-xs flex items-center justify-center flex-shrink-0">
            {i + 1}
          </span>
          <input className="input !py-1.5 text-xs" placeholder="Schritt, z. B. Pitch" value={schritt.titel || ""}
            onChange={(e) => setLeitfaden((l) => l.map((x, j) => (j === i ? { ...x, titel: e.target.value } : x)))} />
          <input className="input !py-1.5 text-xs" placeholder="Kurzer Hinweis (optional)" value={schritt.hinweis || ""}
            onChange={(e) => setLeitfaden((l) => l.map((x, j) => (j === i ? { ...x, hinweis: e.target.value } : x)))} />
          <button onClick={() => setLeitfaden((l) => l.filter((_, j) => j !== i))}
            className="btn-ghost text-xs text-coral flex-shrink-0">×</button>
        </div>
      ))}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => setLeitfaden((l) => [...l, { titel: "", hinweis: "" }])} className="btn-ghost text-xs">
          + Schritt
        </button>
        {leitfaden.length > 0 && (
          <button onClick={() => setLeitfaden([])} className="btn-ghost text-xs text-textMuted">
            Leitfaden abschalten
          </button>
        )}
        {leitfaden.length === 0 && (
          <span className="text-[11px] text-textMuted">Abgeschaltet — im Call Tracker erscheint nichts.</span>
        )}
      </div>

      </Abschnitt>

      <Abschnitt id="aufnahmen" aktiv={bereich} titel="Aufnahmen" hinweis="Wie lange Gesprächsaufnahmen gespeichert bleiben.">
      <label className="block text-xs text-textMuted mb-1.5">Aufbewahrung in Tagen</label>
      <input className="input mb-1 !w-32" type="number" min="0" max="3650" value={aufnahmeFrist}
        onChange={(e) => setAufnahmeFrist(e.target.value)} />
      <p className="text-[11px] text-textMuted mb-5">
        Nach dieser Zeit werden Aufnahmen samt Datei automatisch gelöscht — einmal täglich, ohne dass jemand
        daran denken muss. <strong>30 Tage</strong> sind die Voreinstellung: Coaching passiert zeitnah oder gar
        nicht, und danach ist eine Aufnahme kein Lernmaterial mehr, sondern nur noch ein Datenbestand.
        Einzelne Aufnahmen lassen sich als Musterbeispiel davon ausnehmen. <strong>0</strong> schaltet die Frist
        ab — dann wächst der Speicher unbegrenzt, und im kostenlosen Tarif ist bei 1 GB Schluss.
      </p>

      </Abschnitt>

      <Abschnitt id="calltracker" aktiv={bereich} titel="Call Tracker" hinweis="Anleitung beim Terminieren und die Kategorien für Einwände.">
      <label className="block text-xs text-textMuted mb-1.5">Buchungslink der Organisation (optional)</label>
      <p className="text-[11px] text-textMuted mb-2">
        Erscheint im Call Tracker beim Terminieren als Knopf „Kalender öffnen" — z. B. euer cal.com-Link.
        Wer unter „Mein Profil" einen eigenen Link hinterlegt, sieht stattdessen seinen.
      </p>
      <input className="input mb-5" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)}
        placeholder="cal.com/eure-firma/erstgespraech" />

      <label className="block text-xs text-textMuted mb-1.5">Termin-Anleitung im Call Tracker (optional)</label>
      <p className="text-[11px] text-textMuted mb-2">Wird im Call Tracker beim Schritt „Termin vereinbaren" angezeigt — eine Zeile pro Punkt. Leer lassen für eine allgemeine Standard-Anleitung ohne Tool-Namen.</p>
      <textarea
        className="input mb-5"
        rows={3}
        value={bookingInstructions}
        onChange={(e) => setBookingInstructions(e.target.value)}
        placeholder={'Buchungslink im eigenen System öffnen und Terminoptionen raussuchen\nFragen: „Passt es Ihnen/dir besser am Termin X oder Termin Y?"\nTermin im Kalender eintragen und bestätigen'}
      />

      <label className="flex items-center gap-2 text-xs text-textMuted mb-3 cursor-pointer select-none">
        <input type="checkbox" checked={useCustomCategories} onChange={(e) => setUseCustomCategories(e.target.checked)} />
        Eigene Einwand-Kategorien im Call Tracker verwenden (sonst gelten die 6 Standard-Kategorien)
      </label>
      {useCustomCategories && (
        <div className="mb-5">
          {categories.map((c, i) => (
            <div key={c.key} className="flex items-center gap-2 mb-2">
              <input className="input flex-1" value={c.label} onChange={(e) => updateCategoryLabel(i, e.target.value)} placeholder="Kategorie-Name" />
              <button type="button" onClick={() => removeCategory(i)} disabled={categories.length <= 1} className="btn-ghost text-xs text-coral disabled:opacity-30 flex-shrink-0">Entfernen</button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <button type="button" onClick={addCategory} className="btn-ghost text-xs">+ Kategorie hinzufügen</button>
            <button type="button" onClick={resetCategories} className="btn-ghost text-xs text-textMuted">Auf Standard zurücksetzen</button>
          </div>
          <p className="text-[11px] text-textMuted mt-2">Erscheinen im Call Tracker beim Schritt „Was war der Grund?" und in der Einwand-Verteilung. Die letzte Kategorie dient als Sammelpunkt für „Ohne Angabe zählen".</p>
        </div>
      )}

      </Abschnitt>

      <Abschnitt id="mailvorlagen" aktiv={bereich} titel="E-Mail" hinweis="Absender, Antwortadresse und Textbausteine für das E-Mail-Marketing.">
      <label className="block text-xs text-textMuted mb-1.5">Antwortadresse (empfohlen)</label>
      <input className="input mb-1" value={antwortAn} onChange={(e) => setAntwortAn(e.target.value)}
        placeholder="z. B. vertrieb@deine-firma.de" />
      <p className="text-[11px] text-textMuted mb-4">
        Hier landen die Antworten eurer Kontakte. Das darf <strong>jede</strong> Adresse sein, auch eine GMX- oder
        Gmail-Adresse — sie steht nicht im Absender, sondern nur dort, wo die Antwort hingeht. Für die meisten ist
        genau das gemeint, wenn sie „mit meiner Adresse verschicken“ sagen, und es funktioniert ohne jede
        technische Einrichtung.
      </p>

      <label className="block text-xs text-textMuted mb-1.5">Absenderadresse (nur mit verifizierter Domain)</label>
      <input className="input mb-1" value={absender} onChange={(e) => setAbsender(e.target.value)}
        placeholder="z. B. info@deine-firma.de" />
      <p className="text-[11px] text-textMuted mb-5">
        Was im Absender steht. <strong className="text-textMain">Achtung:</strong> Die Domain dieser Adresse muss
        beim Mailversand (Resend) hinterlegt und per DNS bestätigt sein. Trägst du hier eine beliebige Adresse
        ein, lehnt der Versand ab — und dann geht <strong>gar keine</strong> Mail dieser Organisation mehr raus,
        auch keine Termin-Benachrichtigung. Im Zweifel leer lassen und nur die Antwortadresse oben setzen.
      </p>

      {/* Eine falsche Absenderadresse legt den Versand der ganzen
          Organisation still lahm — auch die Termin-Benachrichtigungen.
          Ohne diesen Knopf merkt man das erst, wenn eine Kundenmail nicht
          ankommt, und sucht dann an der falschen Stelle. */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs text-textMain font-semibold">Einstellungen prüfen</span>
          <button
            onClick={async () => {
              setTestBusy(true);
              setTestStand(null);
              try {
                setTestStand(await apiPost("/api/test-mail", {}));
              } catch (e) {
                setTestStand({ ok: false, text: e?.message || "Die Testmail konnte nicht ausgelöst werden." });
              }
              setTestBusy(false);
            }}
            disabled={testBusy}
            className="btn-ghost text-xs ml-auto disabled:opacity-40">
            {testBusy ? "Wird verschickt…" : "Testmail an mich senden"}
          </button>
        </div>
        <p className="text-[11px] text-textMuted">
          Schickt eine Probemail an deine eigene Anmeldeadresse — mit genau den Einstellungen von hier. Erst
          speichern, dann prüfen: der Knopf liest, was in der Datenbank steht, nicht was gerade im Formular
          getippt ist.
        </p>
        {testStand && (
          <p className={`text-[11px] mt-2 ${testStand.ok ? "text-teal" : "text-coral"}`}>
            {testStand.text}
          </p>
        )}
      </div>

      <label className="block text-xs text-textMuted mb-1.5">Standardschluss unter jeder Mail</label>
      <textarea className="input !py-1.5 text-xs mb-1" rows={4} value={signatur}
        onChange={(e) => setSignatur(e.target.value)}
        placeholder={"Mit freundlichen Grüßen\n{{vertriebler}}\n{{organisation}}\nMusterstraße 1 · 12345 Musterstadt"} />
      <p className="text-[11px] text-textMuted mb-5">
        Kommt automatisch unter jede Mail. Hierhin gehören Grussformel, Name und Organisation — dann stehen sie
        genau einmal und für alle Vorlagen gleich. Die Vorlagen selbst enden mit dem letzten inhaltlichen Satz;
        wiederholen sie den Gruss, steht er beim Kunden zweimal.
      </p>

      <p className="text-[11px] text-textMuted mb-3">Diese Vorlagen stehen im E-Mail-Marketing zur Auswahl.</p>
      <div className="mb-5">
        <MailVorlagen vorlagen={vorlagen} onChange={setVorlagen} anhaenge={orgAnhaenge} signatur={signatur} />
      </div>

      </Abschnitt>

      <Abschnitt id="benachrichtigungen" aktiv={bereich} titel="Benachrichtigungen" hinweis="Wohin Meldungen über neue Termine und Erinnerungen gehen.">

      {/* Welche Meldung wohin geht — einmal als Tabelle. Vorher stand das
          verteilt unter den vier Feldern, und die Frage "wo landet ein
          Abschluss" liess sich nur beantworten, indem man alle vier
          Hinweistexte las. */}
      <div className="card !py-2.5 mb-4">
        <div className="text-xs text-textMain font-semibold mb-2">Welche Meldung geht wohin</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <tbody className="text-textMuted">
              {[
                ["Neuer Termin, verschoben, abgesagt", "Termine"],
                ["Team erinnern", "Termine"],
                ["Tagesbericht", "Termine"],
                ["E-Mail-Kontakt aus dem Gespräch", "E-Mail"],
                ["Follow-up zugewiesen oder fällig", "E-Mail"],
                ["Setting Call bestätigt", "Bestätigungen"],
                ["Closing Call bestätigt", "Bestätigungen"],
                ["Check-in erledigt", "Bestätigungen"],
                ["Follow-up erledigt", "Bestätigungen"],
                ["Morgens: Termine von morgen ohne Bestätigung", "Bestätigungen"],
                ["Kunde geworden", "Abschlüsse"],
              ].map(([was, wohin]) => (
                <tr key={was} className="border-t border-line">
                  <td className="py-1 pr-3">{was}</td>
                  <td className="py-1 text-textMain whitespace-nowrap">{wohin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-textMuted mt-2">
          Bleibt ein Feld leer, läuft die Meldung über den Kanal „Termine“ mit. Ist auch der leer, geht sie
          nur per E-Mail raus, soweit es für diese Meldung eine gibt.
        </p>
      </div>

      {/* Die Kennung suchen, statt sie irgendwo abzuschreiben. Der
          Bot-Schlüssel bleibt dabei auf dem Server. */}
      <div className="card !py-2.5 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-textMain font-semibold flex-1">Chat-IDs finden und prüfen</span>
          <button type="button" onClick={sucheChats} disabled={chatBusy} className="btn-ghost text-xs disabled:opacity-40">
            {chatBusy ? "Sucht…" : "Gruppen suchen"}
          </button>
        </div>
        {/* Die Anleitung als Schrittfolge statt als Absatz: Wer eine Gruppe
            anbindet, macht das einmal im Jahr und liest dabei mit — ein
            Fliesstext zwingt ihn, sich die Reihenfolge selbst
            herauszuziehen. */}
        <ol className="text-[11px] text-textMuted mt-2 flex flex-col gap-1 list-decimal pl-4">
          <li>In Telegram eine Gruppe anlegen, zum Beispiel „Vertrieb Terminbestätigungen“.</li>
          <li><strong>@HBSalesAcademy_bot</strong> in die Gruppe einladen.</li>
          <li>
            In der Gruppe den Code dieser Organisation schreiben, zusammen mit der Erwähnung des Bots
            {gruppenCode ? " (siehe unten)" : ""}.
          </li>
          <li>Hier auf <strong>Gruppen suchen</strong> klicken. Die Gruppe erscheint mit ihrer Kennung.</li>
          <li>Auf den Knopf des passenden Kanals klicken — Termine, E-Mail, Bestätigungen oder Abschlüsse.</li>
          <li>Unten auf <strong>Speichern</strong> klicken. Vorher gilt nichts.</li>
          <li>Mit <strong>Test</strong> neben dem Feld prüfen: kommt die Nachricht in der Gruppe an, stimmt alles.</li>
        </ol>

        {gruppenCode && (
          <p className="text-xs text-textMain bg-surfaceRaised rounded-lg px-3 py-2 mt-2">
            In der Gruppe schreiben: <strong className="font-mono">{gruppenCode} @HBSalesAcademy_bot</strong>
          </p>
        )}

        <p className="text-[11px] text-textMuted mt-2">
          Warum der Code: Ein Bot bedient alle Organisationen dieser Academy. Gelistet wird deshalb nur, wo
          dieser Code in den letzten 30 Minuten stand — so findet niemand die Gruppen einer anderen
          Organisation. Der Bot sieht aus Datenschutzgründen ohnehin nur Nachrichten, die ihn nennen.
          Ein Bot genügt für alle Organisationen; für eine neue lädst du denselben Bot in deren Gruppen ein.
        </p>
        <p className="text-[11px] text-textMuted mt-1">
          Die Suche holt ausserdem die Namen der schon eingetragenen Gruppen und schreibt sie unter die Felder
          — in einer nackten Nummer sieht man nicht, welche Gruppe gemeint ist.
        </p>
        {chatSuche?.fehler && <p className="text-[11px] text-coral mt-2">{chatSuche.fehler}</p>}
        {chatSuche?.chats?.length === 0 && (
          <p className="text-[11px] text-textMuted mt-2">
            Keine Gruppe gefunden. Gelistet wird nur, wo der Code oben in den letzten 30 Minuten stand —
            schreibe ihn in der Gruppe zusammen mit @HBSalesAcademy_bot und suche gleich danach erneut.
          </p>
        )}
        {/* Ein Klick setzt die Kennung in eines der Felder darunter — und
            sagt das auch. Vorher passierte es lautlos: das Feld lag ein
            Stück weiter unten, nichts bestätigte den Klick, und weil vor
            dem Speichern nichts gilt, sah es aus, als täte der Knopf
            nichts. */}
        {chatSuche?.chats?.map((c) => (
          <div key={c.id} className="flex items-center gap-2 flex-wrap text-xs mt-2 pt-2 border-t border-line">
            <span className="text-textMain flex-1 min-w-0 truncate">{c.titel}</span>
            <span className="font-mono text-textMuted flex-shrink-0">{c.id}</span>
            {[
              ["Termine", telegramChatId, setTelegramChatId],
              ["E-Mail", telegramMarketingId, setTelegramMarketingId],
              ["Bestätigungen", telegramBestaetigungId, setTelegramBestaetigungId],
              ["Abschlüsse", telegramAbschlussId, setTelegramAbschlussId],
            ].map(([label, wert, setzen]) => {
              const drin = wert.trim() === c.id;
              return (
                <button key={label} type="button"
                  onClick={() => { setzen(c.id); setTelegramStand({ ok: true, text: `„${c.titel}“ steht jetzt bei ${label}. Unten auf „Speichern“ klicken, sonst gilt es nicht.` }); }}
                  className={`btn-ghost text-[11px] flex-shrink-0 ${drin ? "text-teal border-teal/50" : ""}`}>
                  {drin ? "✓ " : ""}{label}
                </button>
              );
            })}
          </div>
        ))}
        {telegramStand && (
          <p className={`text-[11px] mt-2 ${telegramStand.ok ? "text-teal" : "text-coral"}`}>{telegramStand.text}</p>
        )}
      </div>

      <label className="block text-xs text-textMuted mb-1.5">Telegram für Termin-Benachrichtigungen (optional)</label>
      <div className="flex items-center gap-2 mb-1">
        <input className="input flex-1" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)}
          placeholder="z. B. -1001234567890" />
        <button type="button" onClick={() => testeKanal(telegramChatId, "allgemein")} disabled={chatBusy || !telegramChatId.trim()}
          className="btn-ghost text-xs flex-shrink-0 disabled:opacity-40">Test</button>
      </div>
      {chatName(telegramChatId) && (
        <p className="text-[11px] text-teal">Gruppe: {chatName(telegramChatId)}</p>
      )}
      <p className="text-[11px] text-textMuted mb-5">
        Ist hier eine Chat-ID hinterlegt, gehen „Neuer Termin" und „Team erinnern" zusätzlich zur E-Mail auch dorthin —
        am besten in eine Telegram-Gruppe des Vertriebsteams. Dazu <strong>@HBSalesAcademy_bot</strong> in die Gruppe
        einladen und die Chat-ID eintragen (Gruppen-IDs beginnen mit einem Minus). Leer lassen = nur E-Mail.
      </p>

      <label className="block text-xs text-textMuted mb-1.5">Telegram für E-Mail-Kontakte (optional)</label>
      <div className="flex items-center gap-2 mb-1">
        <input className="input flex-1" value={telegramMarketingId} onChange={(e) => setTelegramMarketingId(e.target.value)}
          placeholder="z. B. -1009876543210" />
        <button type="button" onClick={() => testeKanal(telegramMarketingId, "marketing")} disabled={chatBusy || !telegramMarketingId.trim()}
          className="btn-ghost text-xs flex-shrink-0 disabled:opacity-40">Test</button>
      </div>
      {chatName(telegramMarketingId) && (
        <p className="text-[11px] text-teal">Gruppe: {chatName(telegramMarketingId)}</p>
      )}
      <p className="text-[11px] text-textMuted mb-5">
        Bittet jemand im Gespräch um Unterlagen, geht die Meldung hierhin — mit Adresse, Notiz und dem Namen des
        Vertrieblers. Diese Meldungen haben einen anderen Adressaten als „Termin verschoben“: hier muss jemand
        eine Mail schreiben. In einem gemeinsamen Kanal gehen beide Sorten unter. Leer lassen = sie laufen über
        den Kanal darüber mit.
      </p>

      <label className="block text-xs text-textMuted mb-1.5">Telegram für Terminbestätigungen (optional)</label>
      <div className="flex items-center gap-2 mb-1">
        <input className="input flex-1" value={telegramBestaetigungId} onChange={(e) => setTelegramBestaetigungId(e.target.value)}
          placeholder="z. B. -1005555555555" />
        <button type="button" onClick={() => testeKanal(telegramBestaetigungId, "bestaetigung")} disabled={chatBusy || !telegramBestaetigungId.trim()}
          className="btn-ghost text-xs flex-shrink-0 disabled:opacity-40">Test</button>
      </div>
      {chatName(telegramBestaetigungId) && (
        <p className="text-[11px] text-teal">Gruppe: {chatName(telegramBestaetigungId)}</p>
      )}
      <p className="text-[11px] text-textMuted mb-5">
        Zwei Sorten Meldung gehen hierhin. Jeden Morgen die Liste der Termine von MORGEN, die noch niemand
        bestätigt hat — mit Uhrzeit, Kunde und zuständigem Vertriebler. Und jede einzelne Bestätigung, sobald
        jemand den Haken setzt. Steht morgens nichts Offenes an, kommt auch keine Nachricht: eine tägliche
        „nichts zu tun“-Meldung wird nach einer Woche weggewischt, und mit ihr die, auf die es ankommt.
        Leer lassen = sie laufen über den allgemeinen Kanal mit.
      </p>

      <label className="block text-xs text-textMuted mb-1.5">Telegram für Abschlüsse (optional)</label>
      <div className="flex items-center gap-2 mb-1">
        <input className="input flex-1" value={telegramAbschlussId} onChange={(e) => setTelegramAbschlussId(e.target.value)}
          placeholder="z. B. -1007777777777" />
        <button type="button" onClick={() => testeKanal(telegramAbschlussId, "abschluss")} disabled={chatBusy || !telegramAbschlussId.trim()}
          className="btn-ghost text-xs flex-shrink-0 disabled:opacity-40">Test</button>
      </div>
      {chatName(telegramAbschlussId) && (
        <p className="text-[11px] text-teal">Gruppe: {chatName(telegramAbschlussId)}</p>
      )}
      <p className="text-[11px] text-textMuted mb-5">
        Nur „Kunde geworden“. Ein Kanal, in dem ausschliesslich gute Nachrichten stehen, wird gelesen — im
        allgemeinen Kanal lag der Abschluss zwischen Verschiebungen und Absagen. Leer lassen = er läuft dort mit.
      </p>

      </Abschnitt>

      <Abschnitt id="formular" aktiv={bereich} titel="Termin-Formular" hinweis="Welche Felder beim Erfassen eines Termins erscheinen und welche davon Pflicht sind.">
      <label className="block text-xs text-textMuted mb-1.5">Pflichtfelder im Termin-Formular</label>
      <div className="flex items-center gap-4 mb-1 flex-wrap">
        {[["phone", "Telefon"], ["email", "E-Mail"]].map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-textMuted">
            <input type="checkbox" checked={coreRequired[key]}
              onChange={(e) => setCoreRequired((prev) => ({ ...prev, [key]: e.target.checked }))} />
            {label} ist Pflicht
          </label>
        ))}
      </div>
      <p className="text-[11px] text-textMuted mb-5">
        Name und Termin-Zeitpunkt bleiben immer Pflicht — ohne Namen hat der Eintrag keine Bezeichnung in der Liste,
        ohne Zeitpunkt taucht er im Kalender und in den Zeitraum-Filtern nirgends auf.
      </p>

      <label className="flex items-center gap-2 text-xs text-textMuted mb-3 cursor-pointer select-none">
        <input type="checkbox" checked={useCustomLeadFields} onChange={(e) => setUseCustomLeadFields(e.target.checked)} />
        Eigene Zusatzfelder im Termin-Formular verwenden (sonst gelten Unternehmen, Webseite, Ist Entscheider, Notiz)
      </label>
      {useCustomLeadFields && (
        <div className="mb-5">
          {leadFields.map((f, i) => (
            <div key={f.key} className="flex items-center gap-2 mb-2 flex-wrap">
              <input className="input flex-1 min-w-[140px]" value={f.label} onChange={(e) => updateLeadField(i, { label: e.target.value })} placeholder="Feld-Name" />
              <select className="input !w-auto text-xs" value={f.type} onChange={(e) => updateLeadField(i, { type: e.target.value })}>
                <option value="text">Text</option>
                <option value="checkbox">Ja/Nein</option>
              </select>
              {f.type === "text" && (
                <label className="flex items-center gap-1.5 text-xs text-textMuted flex-shrink-0">
                  <input type="checkbox" checked={!!f.multiline} onChange={(e) => updateLeadField(i, { multiline: e.target.checked })} /> Mehrzeilig
                </label>
              )}
              <label className="flex items-center gap-1.5 text-xs text-textMuted flex-shrink-0">
                <input type="checkbox" checked={!!f.required} onChange={(e) => updateLeadField(i, { required: e.target.checked })} /> Pflichtfeld
              </label>
              <button type="button" onClick={() => removeLeadField(i)} disabled={leadFields.length <= 1} className="btn-ghost text-xs text-coral disabled:opacity-30 flex-shrink-0">Entfernen</button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <button type="button" onClick={addLeadField} className="btn-ghost text-xs">+ Feld hinzufügen</button>
            <button type="button" onClick={resetLeadFields} className="btn-ghost text-xs text-textMuted">Auf Standard zurücksetzen</button>
          </div>
          <p className="text-[11px] text-textMuted mt-2">Erscheinen im Call Tracker beim Erfassen eines Termins sowie unter „Termine" beim Hinzufügen/Bearbeiten. Name, Telefon, E-Mail und Termin-Zeitpunkt bleiben immer fest.</p>
        </div>
      )}

      </Abschnitt>

      <Abschnitt id="team" aktiv={bereich} titel="Team-Wettbewerb" hinweis="Woran sich die Team-Rangliste auf der Seite „Mein Team“ misst.">
      <label className="block text-xs text-textMuted mb-1.5">Maßstab der Rangliste</label>
      <select className="input mb-1" value={rankingMetric} onChange={(e) => setRankingMetric(e.target.value)}>
        <option value="xp">XP (Lern-Aktivität)</option>
        {goalMetricGroups().map((gruppe) => (
          <optgroup key={gruppe.name} label={gruppe.name}>
            {gruppe.metriken.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </optgroup>
        ))}
      </select>
      <p className="text-[11px] text-textMuted mb-5">
        Gezählt wird immer die laufende Woche ab Montag, über alle Mitglieder eines Teams zusammen.
        Mit <strong>XP</strong> gewinnt das Team, das am fleissigsten trainiert — mit <strong>Anwahlen</strong>
        oder <strong>Terminiert</strong> das Team, das am meisten am Telefon erreicht.
        Sinnvoll ist meist derselbe Maßstab, auf den auch die Team-Ziele gesetzt sind.
      </p>

      </Abschnitt>

      <Abschnitt id="vorschau" aktiv={bereich} titel="Vorschau" hinweis="So sieht das Branding für die Mitglieder aus.">
      <label className="block text-xs text-textMuted mb-1.5">Vorschau</label>
      <div
        className="rounded-xl border p-4 mb-5"
        style={{
          background: useCustomSurface ? surfaceColor : "linear-gradient(180deg, #22242F 0%, #1C1E29 100%)",
          borderColor: "var(--org-line, #2F3242)",
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-9 w-auto rounded" onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <div className="h-9 w-9 rounded bg-surfaceRaised" />
          )}
          <div
            className="font-display font-bold text-lg"
            style={{
              background: `linear-gradient(90deg, ${secondaryColor} 0%, ${primaryColor} 60%, ${tertiaryColor} 100%)`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}
          >
            {name.trim() || "Deine Organisation"}
          </div>
        </div>
        <p className="text-sm mb-3" style={{ color: useCustomSurface ? (textColor || textColorForColors([surfaceColor])) : "#EDEDF4" }}>
          So sieht Fließtext auf deiner Kartenfläche aus.
        </p>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            className="text-[13.5px] font-semibold px-4 py-2.5 rounded-lg"
            style={{
              background: `linear-gradient(120deg, ${secondaryColor} 0%, ${primaryColor} 55%, ${tertiaryColor} 100%)`,
              color: textColorForColors([secondaryColor, primaryColor, tertiaryColor]),
            }}
          >
            Beispiel-Button
          </button>
          <span className="text-[11px] uppercase tracking-wide rounded px-1.5 py-0.5" style={{ color: primaryColor, borderWidth: 1, borderStyle: "solid", borderColor: primaryColor }}>
            Badge
          </span>
        </div>
        <p className="text-[11px] mt-2.5" style={{ color: useCustomSurface ? blend(textColorForColors([surfaceColor]), surfaceColor, 0.42) : "#8D90A6" }}>
          So erscheinen Logo, Marken-Verlauf, Buttons, Hintergrund und Text später in der ganzen Plattform.
        </p>
      </div>
      </Abschnitt>


      {/* Speichern und Fehler bewusst AUSSERHALB der Bereiche: sie müssen
          sichtbar bleiben, egal welcher Reiter gerade gewählt ist. Gespeichert
          wird immer das ganze Formular, nicht nur der sichtbare Bereich. */}
      <div className="mt-5 pt-5 border-t border-line">
        {error && <p className="text-coral text-xs mb-3">{error}</p>}
        <p className="text-[11px] text-textMuted mb-2">Speichern übernimmt die Änderungen aus allen Bereichen.</p>
      <div className="flex items-center gap-2">
        <button disabled={saving || uploadingLogo} onClick={save} className="btn disabled:opacity-40">
          {saving ? "Speichert..." : saved ? "Gespeichert!" : "Speichern"}
        </button>
        {canDelete && (
          <button disabled={deleting} onClick={deleteOrg} className="btn-ghost text-xs text-coral disabled:opacity-40">
            {deleting ? "Löscht..." : "Organisation löschen"}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
