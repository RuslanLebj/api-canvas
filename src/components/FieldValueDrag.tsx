import type { DragEvent } from "react";
import { Handle, Position } from "@xyflow/react";
import type { JsonValue } from "../../shared/types";

export const FIELD_VALUE_MIME = "application/api-canvas-field-value";

export function readDroppedFieldValue(event: DragEvent): JsonValue | undefined {
  const raw = event.dataTransfer.getData(FIELD_VALUE_MIME);
  if (!raw) return undefined;
  try {
    return (JSON.parse(raw) as { value: JsonValue }).value;
  } catch {
    return undefined;
  }
}

export function allowFieldValueDrop(event: DragEvent): void {
  if (event.dataTransfer.types.includes(FIELD_VALUE_MIME)) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }
}

const FIELD_HANDLE_PREFIX = "field-link:";

export function fieldHandleId(kind: "source" | "target", target: string): string {
  return `${FIELD_HANDLE_PREFIX}${kind}:${encodeURIComponent(target)}`;
}

export function readFieldHandleId(id: string | null | undefined, kind: "source" | "target"): string | undefined {
  const prefix = `${FIELD_HANDLE_PREFIX}${kind}:`;
  if (!id?.startsWith(prefix)) return undefined;
  try {
    return decodeURIComponent(id.slice(prefix.length));
  } catch {
    return undefined;
  }
}

export function FieldValueDrag({
  value,
  title = "Перетащить значение",
  field,
}: {
  value: JsonValue;
  title?: string;
  field?: { cardId: string; target: string };
}) {
  return (
    <>
      {field ? (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id={fieldHandleId("target", field.target)}
            className="field-link-handle field-link-target"
            aria-label="Подключить значение к этому полю"
            title="Вход постоянной связи"
          />
          <Handle
            type="source"
            position={Position.Right}
            id={fieldHandleId("source", field.target)}
            className="field-link-handle field-link-source"
            aria-label="Связать значение этого поля"
            title="Выход постоянной связи"
          />
        </>
      ) : null}
      <button
        type="button"
        className="field-drag-handle nodrag"
        draggable
        title={field ? "Разово перенести значение" : title}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData(FIELD_VALUE_MIME, JSON.stringify({ value }));
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        ⠿
      </button>
    </>
  );
}
