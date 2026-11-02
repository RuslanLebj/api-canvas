import type { CanvasDocument, HeaderEntry } from "../shared/types";

export const REDACTED = "[REDACTED — введите значение локально]";

function secretHeaders(entries: HeaderEntry[]): Map<string, string> {
  return new Map(
    entries
      .filter((entry) => entry.secret && entry.value)
      .map((entry) => [entry.name.toLowerCase(), entry.value]),
  );
}

export function sanitizeForExport(source: CanvasDocument): CanvasDocument {
  const document = structuredClone(source);
  for (const template of Object.values(document.templates)) {
    for (const header of template.values.headers) {
      if (header.secret) header.value = REDACTED;
    }
  }
  for (const headerSet of Object.values(document.headerSets)) {
    for (const header of headerSet.headers) {
      if (header.secret) header.value = REDACTED;
    }
  }
  for (const card of Object.values(document.cards)) {
    const attached = card.headerSetId ? source.headerSets[card.headerSetId]?.headers ?? [] : [];
    const secrets = secretHeaders([
      ...attached,
      ...card.values.headers,
      ...card.localHeaders,
    ]);
    for (const header of [...card.values.headers, ...card.localHeaders]) {
      if (header.secret) header.value = REDACTED;
    }
    for (const run of card.history) {
      for (const [name, value] of Object.entries(run.request.headers)) {
        if (secrets.has(name.toLowerCase())) run.request.headers[name] = REDACTED;
        const secret = secrets.get(name.toLowerCase());
        if (secret) run.curl = run.curl.split(secret).join(REDACTED);
        if (value && secret && value !== secret) run.curl = run.curl.split(value).join(REDACTED);
      }
    }
  }
  return document;
}

export function downloadDocument(document: CanvasDocument): void {
  const safe = sanitizeForExport(document);
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
  const link = window.document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${document.name.replace(/[^a-zа-я0-9_-]+/gi, "-") || "api-canvas"}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function readDocument(file: File): Promise<CanvasDocument> {
  const parsed = JSON.parse(await file.text()) as Partial<CanvasDocument>;
  if (parsed.schemaVersion !== 1 || !parsed.id || !parsed.cards || !parsed.layouts) {
    throw new Error("Файл не является поддерживаемым API Canvas документом.");
  }
  return parsed as CanvasDocument;
}
