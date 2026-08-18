import { useEffect, useState } from "react";
import { getCachedOrg } from "../components/Layout";
import { supabase } from "./supabaseClient.js";

// Gemeinsame Logik für Einwand-Trainer und Call-Tracker: beide laufen als
// eigenständiges HTML im iframe, außerhalb von Layout.js — Logo/Name/
// Markenfarben/Termin-Anleitung der Organisation müssen ihnen deshalb
// explizit per Query-Param mitgegeben werden, sonst zeigen sie das statisch
// hinterlegte Standard-Branding, egal welche Organisation gerade angemeldet
// ist (siehe buildOrgColorParams unten und lib/orgBranding.js für das
// Äquivalent im Haupt-App-Layout).
const COLOR_KEYS = ["primary_color", "secondary_color", "tertiary_color", "background_color", "surface_color", "text_color", "muted_color", "border_color"];

function pickColors(org) {
  const colors = {};
  COLOR_KEYS.forEach((k) => { if (org?.[k]) colors[k] = org[k]; });
  return colors;
}

export function useIframeOrgBranding() {
  const [logoUrl, setLogoUrl] = useState(null);
  const [orgName, setOrgName] = useState(null);
  const [colors, setColors] = useState({});
  const [bookingInstructions, setBookingInstructions] = useState(null);
  const [objectionCategories, setObjectionCategories] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Von Layout.js bereits aufgelöste Organisation übernehmen (respektiert
      // für Plattform-Admins die per Firmencode gewählte "aktive" Organisation
      // statt stur profiles.organization_id — sonst weicht das Branding hier
      // von der Sidebar ab). Nur bei komplett frischem Laden (Direktaufruf,
      // Reload) noch nicht gesetzt — dann denselben Auflösungsweg wie
      // Layout.js selbst nachbauen.
      const cached = getCachedOrg();
      if (cached) {
        if (mounted) {
          setLogoUrl(cached.logo_url || null);
          setOrgName(cached.name || null);
          setColors(pickColors(cached));
          setBookingInstructions(cached.booking_instructions || null);
          setObjectionCategories(Array.isArray(cached.objection_categories) && cached.objection_categories.length ? cached.objection_categories : null);
          setLoaded(true);
        }
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoaded(true); return; }
      const { data: profile } = await supabase.from("profiles").select("organization_id, is_platform_admin").eq("id", session.user.id).maybeSingle();
      const activeOrgId = (profile?.is_platform_admin && sessionStorage.getItem("hb_active_org_id")) || profile?.organization_id;
      if (activeOrgId) {
        const { data: org } = await supabase.from("organizations").select("*").eq("id", activeOrgId).maybeSingle();
        if (mounted && org) {
          setLogoUrl(org.logo_url || null);
          setOrgName(org.name || null);
          setColors(pickColors(org));
          setBookingInstructions(org.booking_instructions || null);
          setObjectionCategories(Array.isArray(org.objection_categories) && org.objection_categories.length ? org.objection_categories : null);
        }
      }
      if (mounted) setLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  return { logoUrl, orgName, colors, bookingInstructions, objectionCategories, loaded };
}

// Baut die Farb-Query-Params für die iframe-URL. Fehlt ein Wert, bleibt der
// jeweilige Standardton in call-tracker.html/einwand-trainer.html stehen
// (gleiches Fallback-Prinzip wie lib/orgBranding.js).
export function buildOrgColorParams(colors) {
  const params = new URLSearchParams();
  if (colors.secondary_color) params.set("grad1", colors.secondary_color);
  if (colors.primary_color) params.set("grad2", colors.primary_color);
  if (colors.tertiary_color) params.set("grad3", colors.tertiary_color);
  if (colors.background_color) params.set("bg", colors.background_color);
  if (colors.surface_color) { params.set("panel", colors.surface_color); params.set("panel2", colors.surface_color); }
  if (colors.border_color) params.set("line", colors.border_color);
  if (colors.text_color) params.set("white", colors.text_color);
  if (colors.muted_color) params.set("muted", colors.muted_color);
  return params;
}
