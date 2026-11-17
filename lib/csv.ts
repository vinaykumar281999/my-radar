import { parseContact } from "@/lib/contact";

type Cell = string | number | null | undefined;

/**
 * Spreadsheet apps run cells starting with = + - @ as formulas. Neutralize
 * those with a leading apostrophe, except real @handles and phone numbers,
 * which are harmless and would look wrong escaped.
 */
function safeCell(value: Cell) {
  const text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !parseContact(text)) return `'${text}`;
  return text;
}

function quote(text: string) {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]) {
  return [header, ...rows].map((row) => row.map((c) => quote(safeCell(c))).join(",")).join("\r\n");
}

/** Download a CSV in the browser (with a BOM so Excel reads UTF-8 names correctly). */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvFilename(kind: string) {
  return `radar-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
}
