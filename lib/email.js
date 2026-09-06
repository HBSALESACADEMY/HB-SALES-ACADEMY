// Zentraler E-Mail-Versand über die Resend-API (resend.com), per fetch statt
// eigenem SDK — keine zusätzliche Abhängigkeit nötig. Ohne gesetzten
// RESEND_API_KEY wird der Versand übersprungen statt zu crashen, damit die
// App auch ohne konfigurierten E-Mail-Versand normal funktioniert.
// Aus der Antwort von Resend den lesbaren Teil holen. Die Rohantwort ist
// JSON und in einer Fehlermeldung auf dem Bildschirm unbrauchbar.
function kurzeMeldung(body) {
  try {
    const daten = JSON.parse(body);
    return daten?.message || daten?.error?.message || body.slice(0, 300);
  } catch (e) {
    return String(body || "").slice(0, 300);
  }
}

export async function sendEmail({ to, subject, html, fromName, fromEmail, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("E-Mail-Versand übersprungen (RESEND_API_KEY nicht gesetzt):", subject, "an", to);
    return { skipped: true };
  }
  // RESEND_FROM_EMAIL darf entweder nur die Adresse ("noreply@domain.de")
  // oder "Name <adresse>" enthalten — der Name-Teil wird durch fromName
  // (z.B. den Organisationsnamen) ersetzt, falls übergeben.
  const configuredFrom = process.env.RESEND_FROM_EMAIL || "HB Sales Academy <onboarding@resend.dev>";
  // Eine eigene Adresse der Organisation hat Vorrang (migration_142). Sie
  // muss bei Resend verifiziert sein — steht dort eine fremde Domain, lehnt
  // Resend die Mail ab, und zwar für ALLE Mails dieser Organisation.
  const fromAddress = (fromEmail && fromEmail.includes("@"))
    ? fromEmail.trim()
    : (configuredFrom.match(/<(.+)>/)?.[1] || configuredFrom);
  const from = fromName ? `${fromName} <${fromAddress}>` : configuredFrom;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        // Antworten landen dort, wo sie hingehören — auch wenn der Absender
        // aus technischen Gründen eine andere Adresse tragen muss.
        ...(replyTo && replyTo.includes("@") ? { reply_to: replyTo.trim() } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("E-Mail-Versand fehlgeschlagen: " + JSON.stringify({ to, status: res.status, body }));
      // Der Text von Resend wird mitgegeben, nicht nur ein Fehler-Flag: bei
      // einer nicht verifizierten Domain steht dort genau, was fehlt — und
      // ohne diese Auskunft sucht man an der falschen Stelle.
      return { error: true, status: res.status, meldung: kurzeMeldung(body), absender: from };
    }
    return { ok: true, absender: from };
  } catch (e) {
    console.error("E-Mail-Versand fehlgeschlagen:", e.message);
    return { error: true, meldung: e.message, absender: from };
  }
}
