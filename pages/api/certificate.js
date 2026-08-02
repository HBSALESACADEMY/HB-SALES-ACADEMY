import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";
import { requireUser } from "../../lib/supabaseServer";
import { getAdminSupabase } from "../../lib/supabaseAdmin";
import { resolveCourse } from "../../lib/resolveCourse";
import { hexToRgb, blend, textColorForColors } from "../../lib/colorMath";

function hexToPdfColor(hex) {
  const c = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
  return rgb(c.r / 255, c.g / 255, c.b / 255);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;

  try {
    const { courseId } = req.query;
    const course = await resolveCourse(courseId, getAdminSupabase());
    if (!course) return res.status(404).json({ error: "Kurs nicht gefunden." });

    const { data: exam } = await auth.client
      .from("exam_results")
      .select("*")
      .eq("course_id", courseId)
      .eq("passed", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!exam) return res.status(403).json({ error: "Kein bestandenes Prüfungsergebnis für diesen Kurs gefunden." });

    const { data: profile } = await auth.client.from("profiles").select("full_name, organization_id").eq("id", auth.user.id).maybeSingle();
    const name = (profile && profile.full_name) || auth.user.email || "Teilnehmer";

    let org = null;
    if (profile?.organization_id) {
      const { data } = await auth.client.from("organizations")
        .select("name, logo_url, primary_color, background_color, text_color, muted_color")
        .eq("id", profile.organization_id).maybeSingle();
      org = data;
    }
    const orgLogoUrl = org?.logo_url || null;
    const orgName = org?.name || "HB Sales Academy";

    // Gleiche Farb-Herleitung wie lib/orgBranding.js für die App selbst:
    // explizite Organisationsfarbe hat Vorrang, sonst automatischer,
    // WCAG-geprüfter Kontrast gegen den (ggf. eigenen) Hintergrund — das
    // Zertifikat bleibt dadurch immer lesbar, egal welche Farben gewählt wurden.
    const bgHex = org?.background_color || "#0A0C13";
    const accentHex = org?.primary_color || "#E8368F";
    const textHex = org?.text_color || textColorForColors([bgHex]);
    const mutedHex = org?.muted_color || blend(textHex, bgHex, 0.42);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // A4 landscape
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const bg = hexToPdfColor(bgHex);
    const amber = hexToPdfColor(accentHex);
    const white = hexToPdfColor(textHex);
    const muted = hexToPdfColor(mutedHex);

    page.drawRectangle({ x: 0, y: 0, width, height, color: bg });

    // Decorative border
    const margin = 24;
    page.drawRectangle({
      x: margin, y: margin, width: width - margin * 2, height: height - margin * 2,
      borderColor: amber, borderWidth: 2, color: undefined,
    });
    page.drawRectangle({
      x: margin + 8, y: margin + 8, width: width - (margin + 8) * 2, height: height - (margin + 8) * 2,
      borderColor: amber, borderWidth: 0.75, color: undefined,
    });

    // Organisations-Logo verwenden, falls vorhanden — sonst Standard-Logo als
    // Fallback für unbrandete Organisationen oder nicht einbettbare Formate.
    let logoImage = null;
    if (orgLogoUrl) {
      try {
        const logoResp = await fetch(orgLogoUrl);
        if (logoResp.ok) {
          const contentType = logoResp.headers.get("content-type") || "";
          const bytes = Buffer.from(await logoResp.arrayBuffer());
          if (contentType.includes("png")) logoImage = await pdfDoc.embedPng(bytes);
          else if (contentType.includes("jpeg") || contentType.includes("jpg")) logoImage = await pdfDoc.embedJpg(bytes);
        }
      } catch (e) {
        // Fällt unten auf das Standard-Logo zurück.
      }
    }
    if (!logoImage) {
      const logoBytes = fs.readFileSync(path.join(process.cwd(), "public", "logo.png"));
      logoImage = await pdfDoc.embedPng(logoBytes);
    }
    const logoAspect = logoImage.width / logoImage.height;

    const centerText = (text, y, font, size, color) => {
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
    };

    const drawLogo = (y, drawHeight) => {
      const drawWidth = drawHeight * logoAspect;
      page.drawImage(logoImage, { x: (width - drawWidth) / 2, y, width: drawWidth, height: drawHeight });
    };

    drawLogo(height - 128, 46);
    centerText("Zertifikat", height - 150, fontBold, 34, white);
    centerText("über den erfolgreichen Abschluss des Kurses", height - 190, fontRegular, 13, muted);
    centerText(course.title, height - 230, fontBold, 26, amber);

    centerText("verliehen an", height - 290, fontRegular, 12, muted);
    centerText(name, height - 325, fontBold, 24, white);

    const scorePct = exam.score;
    centerText(
      "Ergebnis Kursprüfung: " + scorePct + " % · Bestanden am " + new Date(exam.created_at).toLocaleDateString("de-DE"),
      height - 365, fontRegular, 12, muted
    );

    centerText(
      "Dieses Zertifikat bestätigt, dass die Inhalte des Kurses \"" + course.title + "\"",
      height - 410, fontItalic, 11, muted
    );
    centerText(
      `im Rahmen der ${orgName} erfolgreich durchlaufen und in einer Kursprüfung nachgewiesen wurden.`,
      height - 428, fontItalic, 11, muted
    );

    page.drawLine({ start: { x: width / 2 - 90, y: 90 }, end: { x: width / 2 + 90, y: 90 }, thickness: 1, color: amber });
    drawLogo(66, 20);

    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Zertifikat-${course.id}.pdf"`);
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "PDF konnte nicht erstellt werden." });
  }
}
