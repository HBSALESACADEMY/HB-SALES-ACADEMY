// Kleiner CSV-Helfer — kein npm-Paket nötig für simple Tabellen-Exporte.

function escapeCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(";")];
  rows.forEach((row) => lines.push(row.map(escapeCell).join(";")));
  // BOM voranstellen, damit Excel Umlaute korrekt als UTF-8 erkennt.
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(filename, headers, rows) {
  const csv = toCsv(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
