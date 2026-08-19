// Formular für EINE Organisation — Stammdaten, Erscheinungsbild, Call
// Tracker, Benachrichtigungen, Termin-Formular, Team-Wettbewerb.
//
// Lag früher in pages/admin/organization.js. Herausgezogen, weil der
// Betreiber-Bereich (pages/admin/betreiber.js) dasselbe Formular für JEDE
// Kundenorganisation braucht — dort ist es dieselbe Maske, nur eben nicht
// für die eigene Organisation.
import { useEffect, useState } from "react";
import Icon from "./Icon";
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
  const [telegramChatId, setTelegramChatId] = useState(org.telegram_chat_id || "");
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
      telegram_chat_id: telegramChatId.trim() || null,
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

      <Abschnitt id="calltracker" aktiv={bereich} titel="Call Tracker" hinweis="Anleitung beim Terminieren und die Kategorien für Einwände.">
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

      <Abschnitt id="benachrichtigungen" aktiv={bereich} titel="Benachrichtigungen" hinweis="Wohin Meldungen über neue Termine und Erinnerungen gehen.">
      <label className="block text-xs text-textMuted mb-1.5">Telegram für Termin-Benachrichtigungen (optional)</label>
      <input className="input mb-1" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)}
        placeholder="z. B. -1001234567890" />
      <p className="text-[11px] text-textMuted mb-5">
        Ist hier eine Chat-ID hinterlegt, gehen „Neuer Termin" und „Team erinnern" zusätzlich zur E-Mail auch dorthin —
        am besten in eine Telegram-Gruppe des Vertriebsteams. Dazu <strong>@HBSalesAcademy_bot</strong> in die Gruppe
        einladen und die Chat-ID eintragen (Gruppen-IDs beginnen mit einem Minus). Leer lassen = nur E-Mail.
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
