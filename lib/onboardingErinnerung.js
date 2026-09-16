import { ladeOnboarding } from "./onboardingStand.js";
import { ladeVerknuepfungen, sendePersoenlich } from "./telegramPersoenlich.js";
import { erinnerungsText, fertigText } from "./onboarding.js";
import { berlinHeute } from "./woche.js";

// Jeden Morgen: überfällige Onboarding-Schritte melden und fertige
// Onboardings abschliessen.
//
// Persönlich per Telegram (lib/telegramPersoenlich.js), nicht an eine
// Gruppe: Ein überfälliger Schritt geht die neue Person und die Leitung an,
// die sie ins Onboarding geholt hat — nicht das ganze Team.
//
// Jeder überfällige Schritt wird EINMAL gemeldet. Eine Mahnung, die jeden
// Tag wiederkommt, liest nach drei Tagen niemand mehr.
export async function erinnereAnOnboarding(admin, jetzt = new Date()) {
  const { data: offen, error } = await admin.from("onboarding_zuweisungen")
    .select("organization_id").is("abgeschlossen_am", null);
  if (error) return { erinnert: 0, fertig: 0, grund: error.message };

  const heute = berlinHeute(jetzt);
  let erinnert = 0;
  let fertig = 0;

  for (const orgId of [...new Set((offen || []).map((z) => z.organization_id))]) {
    const { zuweisungen } = await ladeOnboarding(admin, { orgId, nurOffene: true });
    const chats = await ladeVerknuepfungen(admin,
      [...new Set(zuweisungen.flatMap((z) => [z.user_id, z.zugewiesen_von]).filter(Boolean))]);
    const leitungVon = (z) => (z.zugewiesen_von && z.zugewiesen_von !== z.user_id ? chats.get(z.zugewiesen_von) : null);

    for (const z of zuweisungen) {
      const name = z.person.full_name;

      if (z.stand.fertig) {
        const { error: abschlussFehler } = await admin.from("onboarding_zuweisungen")
          .update({ abgeschlossen_am: jetzt.toISOString() }).eq("id", z.id);
        if (abschlussFehler) { console.error("Onboarding abschliessen fehlgeschlagen:", abschlussFehler.message); continue; }
        if (chats.get(z.user_id)) await sendePersoenlich(admin, chats.get(z.user_id), fertigText({ name }));
        if (leitungVon(z)) await sendePersoenlich(admin, leitungVon(z), fertigText({ name, fuerLeitung: true }));
        fertig += 1;
        continue;
      }

      const bisher = z.erinnert && typeof z.erinnert === "object" ? z.erinnert : {};
      const neu = z.stand.liste.filter((x) => x.ueberfaellig && !bisher[x.schritt.id]);
      if (!neu.length) continue;

      // Die Person bekommt nur, was sie selbst erledigen kann. Einen Schritt,
      // den die Leitung abhaken muss, bei ihr anzumahnen, wäre ein Vorwurf
      // für etwas, das nicht in ihrer Hand liegt.
      const fuerPerson = neu.filter((x) => x.automatisch || x.schritt.wer === "vertrieb");
      const eintrag = (x) => ({ titel: x.schritt.titel, faelligAm: x.faelligAm });
      if (fuerPerson.length && chats.get(z.user_id)) {
        await sendePersoenlich(admin, chats.get(z.user_id), erinnerungsText({ name, eintraege: fuerPerson.map(eintrag) }));
      }
      if (leitungVon(z)) {
        await sendePersoenlich(admin, leitungVon(z), erinnerungsText({ name, eintraege: neu.map(eintrag), fuerLeitung: true }));
      }

      const vermerkt = { ...bisher };
      neu.forEach((x) => { vermerkt[x.schritt.id] = heute; });
      const { error: vermerkFehler } = await admin.from("onboarding_zuweisungen").update({ erinnert: vermerkt }).eq("id", z.id);
      if (vermerkFehler) console.error("Onboarding-Erinnerung nicht vermerkt:", vermerkFehler.message);
      erinnert += neu.length;
    }
  }

  return { erinnert, fertig };
}
