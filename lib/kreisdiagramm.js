// Die Rechnung hinter einem Kreisdiagramm — getrennt von der Darstellung,
// damit sie prüfbar ist.
//
// Zwei Fallen stecken darin: ein Wert, der 100 % ausmacht, lässt sich nicht
// als Kreisbogen zeichnen (Anfang und Ende liegen aufeinander, der Bogen
// verschwindet), und Werte mit 0 dürfen keinen unsichtbaren Strich
// hinterlassen, der die Farben durcheinanderbringt.
export function kreisSegmente(werte, radius = 100) {
  const positive = (werte || []).filter((w) => Number(w.value) > 0);
  const summe = positive.reduce((s, w) => s + Number(w.value), 0);
  if (!summe) return { summe: 0, segmente: [], vollkreis: null };

  // Genau ein Wert: ein voller Kreis statt eines Bogens.
  if (positive.length === 1) {
    return { summe, segmente: [], vollkreis: { ...positive[0], anteil: 1 } };
  }

  let winkel = -Math.PI / 2; // oben beginnen, im Uhrzeigersinn
  const segmente = positive.map((w) => {
    const anteil = Number(w.value) / summe;
    const start = winkel;
    const ende = winkel + anteil * Math.PI * 2;
    winkel = ende;
    const x1 = radius + radius * Math.cos(start);
    const y1 = radius + radius * Math.sin(start);
    const x2 = radius + radius * Math.cos(ende);
    const y2 = radius + radius * Math.sin(ende);
    const grosserBogen = anteil > 0.5 ? 1 : 0;
    return {
      ...w,
      anteil,
      pfad: `M ${radius} ${radius} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${grosserBogen} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
    };
  });
  return { summe, segmente, vollkreis: null };
}

export function prozent(anteil) {
  return `${Math.round(anteil * 100)} %`;
}
