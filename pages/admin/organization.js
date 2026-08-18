import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Icon from "../../components/Icon";
import AdminTabs from "../../components/AdminTabs";
import { supabase } from "../../lib/supabaseClient";
import { apiGet, apiPost } from "../../lib/apiClient";
import { textColorForColors, blend } from "../../lib/orgBranding";
import { DEFAULT_LEAD_FIELDS, RESERVED_FIELD_COLUMNS } from "../../lib/leadFields";
import { DEFAULT_OBJECTION_CATEGORIES } from "../../lib/objectionCategories";
import { getActiveOrgId } from "../../lib/activeOrg";

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
function OrgEditor({ org, isOwnOrg, onSaved, onDeleted, canDelete }) {
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
  const [useCustomCategories, setUseCustomCategories] = useState(Array.isArray(org.objection_categories) && org.objection_categories.length > 0);
  const [categories, setCategories] = useState(
    Array.isArray(org.objection_categories) && org.objection_categories.length ? org.objection_categories : DEFAULT_OBJECTION_CATEGORIES
  );
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
      key: f.key, label: f.label.trim(), type: f.type, ...(f.type === "text" && f.multiline ? { multiline: true } : {}),
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
      objection_categories: useCustomCategories && cleanCategories.length ? cleanCategories : null,
      lead_field_config: useCustomLeadFields && cleanLeadFields.length ? cleanLeadFields : null,
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
      <label className="block text-xs text-textMuted mb-1.5">Name</label>
      <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Firmenname" />

      <label className="block text-xs text-textMuted mb-1.5">Firmencode (Login/Registrierung)</label>
      <input className="input mb-4" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="firmencode" />

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

      {error && <p className="text-coral text-xs mb-3">{error}</p>}
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
  );
}

export default function AdminOrganization() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState(null);

  const [allOrgs, setAllOrgs] = useState([]);
  const [expandedOrgId, setExpandedOrgId] = useState(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerEmail, setNewManagerEmail] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createError, setCreateError] = useState("");
  const [justCreatedSlug, setJustCreatedSlug] = useState(null);
  const [copiedSlug, setCopiedSlug] = useState(null);

  const [members, setMembers] = useState([]);
  const [memberOrgs, setMemberOrgs] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [moveTargets, setMoveTargets] = useState({});
  const [movingId, setMovingId] = useState(null);
  const [managerTargets, setManagerTargets] = useState({});
  const [settingManagerId, setSettingManagerId] = useState(null);
  const [managerError, setManagerError] = useState("");
  const [moveError, setMoveError] = useState("");

  async function loadAllOrgs() {
    const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
    setAllOrgs(data || []);
  }

  async function loadMembers() {
    setMembersLoading(true);
    setMoveError("");
    try {
      const { members: m, organizations: o } = await apiGet("/api/platform/members");
      setMembers(m);
      setMemberOrgs(o);
    } catch (e) {
      setMoveError(e.message);
    }
    setMembersLoading(false);
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: me } = await supabase.from("profiles").select("is_admin, is_platform_admin, organization_id").eq("id", session.user.id).maybeSingle();
      if (!me?.is_admin) { setIsAdmin(false); setLoading(false); return; }
      // Für Plattform-Admins, die per Firmencode "als" eine andere
      // Organisation unterwegs sind: me.organization_id ist nur deren eigene
      // Heimat-Organisation — ohne getActiveOrgId würde man hier immer die
      // eigene statt der gerade aktiv verwalteten Organisation laden UND
      // beim Speichern versehentlich überschreiben (gleicher Grund wie bei
      // nav_items/community_posts, siehe migration_53/65).
      const activeOrgId = getActiveOrgId(me);
      const { data: orgData } = await supabase.from("organizations").select("*").eq("id", activeOrgId).maybeSingle();
      if (orgData) setOrg(orgData);
      if (me.is_platform_admin) {
        setIsPlatformAdmin(true);
        await Promise.all([loadAllOrgs(), loadMembers()]);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function createOrg() {
    if (!newOrgName.trim() || !newManagerName.trim() || !newManagerEmail.trim() || !newManagerPassword) return;
    setCreatingOrg(true);
    setCreateError("");
    setJustCreatedSlug(null);

    try {
      const { org: created } = await apiPost("/api/platform/create-organization", {
        name: newOrgName.trim(),
        managerName: newManagerName.trim(),
        managerEmail: newManagerEmail.trim(),
        managerPassword: newManagerPassword,
      });
      setNewOrgName("");
      setNewManagerName("");
      setNewManagerEmail("");
      setNewManagerPassword("");
      setJustCreatedSlug(created.slug);
      await Promise.all([loadAllOrgs(), loadMembers()]);
    } catch (e) {
      setCreateError(e.message);
    }
    setCreatingOrg(false);
  }

  function copySlug(s) {
    navigator.clipboard.writeText(s);
    setCopiedSlug(s);
    setTimeout(() => setCopiedSlug((x) => (x === s ? null : x)), 1500);
  }

  async function moveMember(memberId) {
    const targetOrgId = moveTargets[memberId];
    if (!targetOrgId) return;
    setMovingId(memberId);
    setMoveError("");
    try {
      await apiPost("/api/platform/reassign-member", { targetId: memberId, organizationId: targetOrgId });
      await loadMembers();
    } catch (e) {
      setMoveError(e.message);
    }
    setMovingId(null);
  }

  async function setOrgManager(organizationId) {
    const newManagerId = managerTargets[organizationId];
    if (!newManagerId) return;
    setSettingManagerId(organizationId);
    setManagerError("");
    try {
      await apiPost("/api/platform/set-org-manager", { organizationId, newManagerId });
      setManagerTargets((prev) => ({ ...prev, [organizationId]: "" }));
      await loadMembers();
    } catch (e) {
      setManagerError(e.message);
    }
    setSettingManagerId(null);
  }

  if (loading) return <Layout><p className="text-textMuted text-sm">Lädt...</p></Layout>;

  if (!isAdmin) {
    return (
      <Layout>
        <h1 className="text-2xl font-display text-textMain mb-1">Organisation</h1>
        <p className="text-textMuted text-sm">Diese Ansicht ist nur für Admin-Konten verfügbar.</p>
      </Layout>
    );
  }

  const orgNameById = {};
  memberOrgs.forEach((o) => { orgNameById[o.id] = o.name; });

  return (
    <Layout>
      <h1 className="text-2xl font-display font-medium brand-text-gradient mb-1">Organisation</h1>
      <div className="brand-stripe w-16 mb-4" />
      <AdminTabs />
      <p className="text-textMuted text-sm mb-6">Name, Firmencode, Logo und Markenfarben eurer Organisation — für alle Mitglieder eurer Organisation sichtbar.</p>

      {org && (
        <div className="card mb-6">
          <OrgEditor org={org} isOwnOrg />
        </div>
      )}

      {isPlatformAdmin && (
        <>
          <div className="card mb-6">
            <div className="font-semibold text-textMain text-sm mb-3">Neuen Kunden einrichten</div>
            <p className="text-textMuted text-xs mb-3">Legt die Organisation UND direkt einen Organisations-Manager-Account an, mit dem sich der Kunde sofort anmelden und eigene Nutzer freigeben kann.</p>
            <div className="flex flex-col gap-2 max-w-sm">
              <div>
                <label className="text-xs text-textMuted mb-1 block">Firmenname</label>
                <input className="input" placeholder="Firmenname des Kunden" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-textMuted mb-1 block">Name des Organisations-Managers</label>
                <input className="input" placeholder="Vor- und Nachname" value={newManagerName} onChange={(e) => setNewManagerName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-textMuted mb-1 block">E-Mail des Organisations-Managers</label>
                <input className="input" type="email" placeholder="manager@kunde.de" value={newManagerEmail} onChange={(e) => setNewManagerEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-textMuted mb-1 block">Passwort des Organisations-Managers</label>
                <input className="input" type="password" placeholder="Mindestens 10 Zeichen" value={newManagerPassword} onChange={(e) => setNewManagerPassword(e.target.value)} minLength={10} />
              </div>
              <button disabled={creatingOrg || !newOrgName.trim() || !newManagerName.trim() || !newManagerEmail.trim() || !newManagerPassword} onClick={createOrg} className="btn text-xs disabled:opacity-40 self-start mt-1">
                {creatingOrg ? "Legt an..." : "Anlegen"}
              </button>
            </div>
            {createError && <p className="text-coral text-xs mt-2">{createError}</p>}
            {justCreatedSlug && (
              <p className="text-teal text-sm mt-3">
                Angelegt! Firmencode: <span className="font-mono font-semibold">{justCreatedSlug}</span> — Firmencode und Zugangsdaten dem Organisations-Manager geben. Das Passwort kann er später selbst in seinem Profil ändern.
              </p>
            )}
          </div>

          <div className="text-xs text-textMuted uppercase tracking-wide mb-2.5">Alle Organisationen</div>
          <div className="flex flex-col gap-2.5 mb-6">
            {allOrgs.map((o) => {
              const isOpen = expandedOrgId === o.id;
              return (
                <div key={o.id} className="card">
                  <div className="flex items-center gap-3.5">
                    <button onClick={() => setExpandedOrgId(isOpen ? null : o.id)} className="flex items-center gap-3.5 flex-1 min-w-0 text-left">
                      {o.logo_url && <img src={o.logo_url} alt="" className="h-8 w-auto rounded flex-shrink-0" onError={(e) => { e.target.style.display = "none"; }} />}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-textMain text-sm">{o.name}</div>
                        <div className="text-xs text-textMuted mt-0.5">
                          Code: <span className="font-mono">{o.slug}</span> · angelegt {new Date(o.created_at).toLocaleDateString("de-DE")}
                        </div>
                      </div>
                      <Icon name="chevron" size={14} color="#5B5E70" />
                    </button>
                    <button onClick={() => copySlug(o.slug)} className="btn-ghost text-xs flex-shrink-0">
                      {copiedSlug === o.slug ? "Kopiert!" : "Code kopieren"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-line">
                      <OrgEditor
                        org={o}
                        isOwnOrg={false}
                        canDelete
                        onSaved={loadAllOrgs}
                        onDeleted={() => { setExpandedOrgId(null); loadAllOrgs(); loadMembers(); }}
                      />

                      <div className="mt-4 pt-4 border-t border-line">
                        <div className="text-xs text-textMuted uppercase tracking-wide mb-2">Organisations-Manager</div>
                        {(() => {
                          const orgMembers = members.filter((m) => m.organization_id === o.id && m.status === "approved");
                          // Eine Organisation kann mehrere Manager haben — früher
                          // wurde hier nur einer angezeigt und beim Festlegen der
                          // bisherige still zurückgestuft.
                          const manager = orgMembers.filter((m) => m.role === "manager" && m.is_admin);
                          const candidates = orgMembers.filter((m) => !manager.some((x) => x.id === m.id));
                          const selected = managerTargets[o.id] || "";
                          const busy = settingManagerId === o.id;
                          return (
                            <>
                              {manager.length > 0 ? (
                                <ul className="text-sm text-textMain mb-2 flex flex-col gap-0.5">
                                  {manager.map((m) => <li key={m.id}>{m.full_name || "Unbenannt"}</li>)}
                                </ul>
                              ) : (
                                <p className="text-sm text-textMuted mb-2">— noch kein Organisations-Manager —</p>
                              )}
                              {candidates.length > 0 ? (
                                <div className="flex items-center gap-2">
                                  <select className="input flex-1" value={selected} onChange={(e) => setManagerTargets((prev) => ({ ...prev, [o.id]: e.target.value }))}>
                                    <option value="">Weitere Person wählen...</option>
                                    {candidates.map((c) => <option key={c.id} value={c.id}>{c.full_name || "Unbenannt"}</option>)}
                                  </select>
                                  <button disabled={!selected || busy} onClick={() => setOrgManager(o.id)} className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0">
                                    {busy ? "Ernennt..." : "Ernennen"}
                                  </button>
                                </div>
                              ) : (
                                <p className="text-textMuted text-xs">Alle freigegebenen Mitglieder sind bereits Manager.</p>
                              )}
                              <p className="text-[11px] text-textMuted mt-2">
                                Ernennen stuft niemanden zurück. Rechte entziehen geht gezielt unter „Verwaltung → Nutzer".
                              </p>
                              {managerError && <p className="text-coral text-xs mt-2">{managerError}</p>}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card">
            <div className="font-semibold text-textMain text-sm mb-3">Mitglieder zwischen Organisationen verteilen</div>
            {moveError && <p className="text-coral text-xs mb-3">{moveError}</p>}
            {membersLoading ? (
              <p className="text-textMuted text-sm">Lädt...</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-textMain truncate">{m.full_name || "Unbenannt"}</div>
                      <div className="text-[11px] text-textMuted">
                        aktuell: {orgNameById[m.organization_id] || "?"} · {m.role}{m.is_admin ? " · Admin" : ""} · {m.status}
                      </div>
                    </div>
                    <select
                      className="input !w-auto text-xs"
                      value={moveTargets[m.id] ?? m.organization_id}
                      onChange={(e) => setMoveTargets((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    >
                      {memberOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <button
                      disabled={movingId === m.id || (moveTargets[m.id] ?? m.organization_id) === m.organization_id}
                      onClick={() => moveMember(m.id)}
                      className="btn-ghost text-xs disabled:opacity-40 flex-shrink-0"
                    >
                      {movingId === m.id ? "..." : "Verschieben"}
                    </button>
                  </div>
                ))}
                {members.length === 0 && <p className="text-textMuted text-sm">Keine Mitglieder gefunden.</p>}
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
