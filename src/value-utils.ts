import { flattenValue, pointerFor } from "../shared/generators";
import type { JsonValue, RequestValues } from "../shared/types";

export interface FlatField {
  target: string;
  label: string;
  value: JsonValue;
}

export function flattenRequestValues(values: RequestValues): FlatField[] {
  return [
    ...Object.entries(values.path).map(([name, value]) => ({
      target: `path/${pointerFor([name])}`,
      label: `path.${name}`,
      value,
    })),
    ...Object.entries(values.query).map(([name, value]) => ({
      target: `query/${pointerFor([name])}`,
      label: `query.${name}`,
      value,
    })),
    ...values.headers.map((header) => ({
      target: `header/${header.id}`,
      label: `header.${header.name}`,
      value: header.value,
    })),
    ...(values.body === null ? [] : flattenValue(values.body)),
  ];
}

export function parseInputValue(value: string, previous: JsonValue): JsonValue {
  if (typeof previous === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : previous;
  }
  if (typeof previous === "boolean") return value === "true";
  if (previous === null) return value;
  return value;
}

export function updateRecordValue(
  source: Record<string, JsonValue>,
  key: string,
  value: string,
): Record<string, JsonValue> {
  return { ...source, [key]: parseInputValue(value, source[key]) };
}
