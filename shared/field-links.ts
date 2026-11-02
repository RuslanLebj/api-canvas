import type { FieldLink, FieldReference, JsonValue, RequestCard, RequestValues } from "./types";

function decodeTarget(target: string): { location: string; parts: string[] } {
  const [location = "", ...parts] = target
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  return { location, parts };
}

export function fieldReferenceKey(reference: FieldReference): string {
  return `${reference.cardId}\u0000${reference.target}`;
}

export function getFieldValue(values: RequestValues, target: string): JsonValue | undefined {
  const { location, parts } = decodeTarget(target);
  if (location === "header") {
    return values.headers.find((header) => header.id === parts[0])?.value;
  }
  let cursor: unknown =
    location === "path" ? values.path : location === "query" ? values.query : values.body;
  if (parts.length === 0) return cursor as JsonValue;
  for (const part of parts) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor as JsonValue;
}

export function setFieldValue(values: RequestValues, target: string, value: JsonValue): boolean {
  const { location, parts } = decodeTarget(target);
  if (location === "header") {
    const entry = values.headers.find((header) => header.id === parts[0]);
    if (!entry) return false;
    const next = String(value ?? "");
    if (entry.value === next) return false;
    entry.value = next;
    return true;
  }

  if (parts.length === 0) {
    if (location !== "body" || JSON.stringify(values.body) === JSON.stringify(value)) return false;
    values.body = structuredClone(value);
    return true;
  }

  let cursor: unknown =
    location === "path" ? values.path : location === "query" ? values.query : values.body;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (cursor === null || typeof cursor !== "object") return false;
    cursor = (cursor as Record<string, unknown>)[parts[index]];
  }
  if (cursor === null || typeof cursor !== "object") return false;
  const key = parts.at(-1)!;
  if (!Object.prototype.hasOwnProperty.call(cursor, key)) return false;
  const record = cursor as Record<string, JsonValue>;
  if (JSON.stringify(record[key]) === JSON.stringify(value)) return false;
  record[key] = structuredClone(value);
  return true;
}

export function wouldCreateFieldLinkCycle(links: FieldLink[], source: FieldReference, target: FieldReference): boolean {
  const sourceKey = fieldReferenceKey(source);
  const targetKey = fieldReferenceKey(target);
  if (sourceKey === targetKey) return true;
  const outgoing = new Map<string, string[]>();
  for (const link of links) {
    if (fieldReferenceKey(link.target) === targetKey) continue;
    const key = fieldReferenceKey(link.source);
    outgoing.set(key, [...(outgoing.get(key) ?? []), fieldReferenceKey(link.target)]);
  }
  const pending = [targetKey];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.shift()!;
    if (current === sourceKey) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export function propagateFieldLinks(
  cards: Record<string, RequestCard>,
  links: FieldLink[],
  source: FieldReference,
): void {
  const outgoing = new Map<string, FieldLink[]>();
  for (const link of links) {
    const key = fieldReferenceKey(link.source);
    outgoing.set(key, [...(outgoing.get(key) ?? []), link]);
  }
  const pending = [...(outgoing.get(fieldReferenceKey(source)) ?? [])];
  const visited = new Set<string>();
  while (pending.length) {
    const link = pending.shift()!;
    if (visited.has(link.id)) continue;
    visited.add(link.id);
    const sourceCard = cards[link.source.cardId];
    const targetCard = cards[link.target.cardId];
    if (!sourceCard || !targetCard) continue;
    const value = getFieldValue(sourceCard.values, link.source.target);
    if (value === undefined) continue;
    setFieldValue(targetCard.values, link.target.target, value);
    pending.push(...(outgoing.get(fieldReferenceKey(link.target)) ?? []));
  }
}
