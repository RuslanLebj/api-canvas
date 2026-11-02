import type { GeneratorTemplate, JsonValue, RequestValues } from "./types";
import { createId } from "./id";

interface GenerationContext {
  named: Map<string, string>;
  now: Date;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

function formatDate(date: Date, pattern: string): string {
  const values: Record<string, string> = {
    yyyy: String(date.getUTCFullYear()).padStart(4, "0"),
    MM: String(date.getUTCMonth() + 1).padStart(2, "0"),
    dd: String(date.getUTCDate()).padStart(2, "0"),
    HH: String(date.getUTCHours()).padStart(2, "0"),
    mm: String(date.getUTCMinutes()).padStart(2, "0"),
    ss: String(date.getUTCSeconds()).padStart(2, "0"),
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => values[token]);
}

export function renderGenerator(
  template: string,
  context: GenerationContext = { named: new Map(), now: new Date() },
): JsonValue {
  const exactInt = template.match(/^\{int:(-?\d+):(-?\d+)\}$/);
  if (exactInt) {
    const min = Number(exactInt[1]);
    const max = Number(exactInt[2]);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  return template.replace(/\{([^{}]+)\}/g, (_whole, expression: string) => {
    if (expression === "uuid") return createId();
    if (expression.startsWith("uuid:")) {
      const name = expression.slice(5);
      const existing = context.named.get(`uuid:${name}`);
      if (existing) return existing;
      const value = createId();
      context.named.set(`uuid:${name}`, value);
      return value;
    }
    if (expression === "timestamp") return String(context.now.getTime());
    if (expression.startsWith("date:")) {
      return formatDate(context.now, expression.slice(5));
    }
    if (expression.startsWith("random:")) {
      const length = Math.max(1, Math.min(256, Number(expression.slice(7)) || 8));
      return randomString(length);
    }
    const intMatch = expression.match(/^int:(-?\d+):(-?\d+)$/);
    if (intMatch) {
      const min = Number(intMatch[1]);
      const max = Number(intMatch[2]);
      return String(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return `{${expression}}`;
  });
}

function setTarget(values: RequestValues, target: string, value: JsonValue): void {
  const parts = target
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  const location = parts.shift();
  if (!location) return;

  if (location === "header") {
    const entry = values.headers.find((header) => header.id === parts[0]);
    if (entry) entry.value = String(value);
    return;
  }
  let cursor: unknown =
    location === "path"
      ? values.path
      : location === "query"
        ? values.query
        : values.body;
  if (parts.length === 0) {
    if (location === "body") values.body = value;
    return;
  }
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (cursor == null || typeof cursor !== "object") return;
    cursor = (cursor as Record<string, unknown>)[parts[index]];
  }
  if (cursor != null && typeof cursor === "object") {
    const key = parts.at(-1)!;
    if (Object.prototype.hasOwnProperty.call(cursor, key)) {
      (cursor as Record<string, JsonValue>)[key] = value;
    }
  }
}

export function regenerateValues(
  source: RequestValues,
  generators: GeneratorTemplate[],
): RequestValues {
  const next = structuredClone(source);
  const context: GenerationContext = { named: new Map(), now: new Date() };
  for (const generator of generators) {
    if (generator.enabled) {
      setTarget(next, generator.target, renderGenerator(generator.template, context));
    }
  }
  return next;
}

export function pointerFor(parts: string[]): string {
  return parts
    .map((part) => part.replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/");
}

export function flattenValue(
  value: JsonValue,
  prefix = "body",
  path: string[] = [],
): Array<{ target: string; label: string; value: JsonValue }> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      flattenValue(item, prefix, [...path, String(index)]),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      flattenValue(item, prefix, [...path, key]),
    );
  }
  return [
    {
      target: `${prefix}/${pointerFor(path)}`.replace(/\/$/, ""),
      label: path.length ? path.join(".") : prefix,
      value,
    },
  ];
}
