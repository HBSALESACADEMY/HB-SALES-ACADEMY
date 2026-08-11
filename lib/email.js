// Zentraler E-Mail-Versand über die Resend-API (resend.com), per fetch statt
// eigenem SDK — keine zusätzliche Abhängigkeit nötig. Ohne gesetzten
// RESEND_API_KEY wird der Versand übersprungen statt zu crashen, damit die
// App auch ohne konfigurierten E-Mail-Versand normal funktioniert.
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("E-Mail-Versand übersprungen (RESEND_API_KEY nicht gesetzt):", subject, "an", to);
    return { skipped: true };
  }
  const from = process.env.RESEND_FROM_EMAIL || "HB Sales Academy <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
    });
    if (!res.ok) {
      console.error("E-Mail-Versand fehlgeschlagen: to=", JSON.stringify(to), res.status, await res.text());
      return { error: true };
    }
    return { ok: true };
  } catch (e) {
    console.error("E-Mail-Versand fehlgeschlagen:", e.message);
    return { error: true };
  }
}
