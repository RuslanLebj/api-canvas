import type { DragEvent } from "react";
import type { JsonValue } from "../../shared/types";
import { pointerFor } from "../../shared/generators";
import {
  allowFieldValueDrop,
  FieldValueDrag,
  readDroppedFieldValue,
} from "./FieldValueDrag";

function valueType(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array · ${value.length}`;
  return typeof value;
}

type SchemaRecord = Record<string, JsonValue>;

function schemaRecord(value: JsonValue | undefined): SchemaRecord {
  return value !== null && !Array.isArray(value) && typeof value === "object" ? value : {};
}

function schemaMatchesValue(schema: JsonValue, value: JsonValue): boolean {
  const record = schemaRecord(schema);
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    if (record.const !== undefined) return JSON.stringify(record.const) === JSON.stringify(value);
    if (Array.isArray(record.enum)) {
      return record.enum.some((item) => JSON.stringify(item) === JSON.stringify(value));
    }
    return true;
  }
  const properties = schemaRecord(record.properties);
  return Object.entries(properties).every(([key, child]) => {
    const constraint = schemaRecord(child);
    if (constraint.const === undefined && !Array.isArray(constraint.enum)) return true;
    if (!(key in value)) return false;
    if (constraint.const !== undefined) {
      return JSON.stringify(value[key]) === JSON.stringify(constraint.const);
    }
    return (constraint.enum as JsonValue[]).some(
      (item) => JSON.stringify(item) === JSON.stringify(value[key]),
    );
  });
}

function effectiveSchema(schema: JsonValue | undefined, value: JsonValue): SchemaRecord {
  const record = schemaRecord(schema);
  const variants = Array.isArray(record.oneOf)
    ? record.oneOf
    : Array.isArray(record.anyOf)
      ? record.anyOf
      : [];
  const selected = variants.find((variant) => schemaMatchesValue(variant, value));
  if (!selected) return record;
  const selectedRecord = schemaRecord(selected);
  return {
    ...record,
    ...selectedRecord,
    properties: {
      ...schemaRecord(record.properties),
      ...schemaRecord(selectedRecord.properties),
    },
  };
}

function ScalarInput({ value, schema, onChange }: { value: JsonValue; schema?: JsonValue; onChange: (value: JsonValue) => void }) {
  const onDrop = (event: DragEvent) => {
    const dropped = readDroppedFieldValue(event);
    if (dropped === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(dropped);
  };

  const scalarSchema = effectiveSchema(schema, value);
  const enumValues = scalarSchema.enum;
  if (Array.isArray(enumValues) && enumValues.length) {
    const selectedIndex = enumValues.findIndex(
      (item) => JSON.stringify(item) === JSON.stringify(value),
    );
    return (
      <select
        className="json-scalar-input enum-select nodrag"
        value={selectedIndex}
        onChange={(event) => onChange(enumValues[Number(event.target.value)])}
        onDragOver={allowFieldValueDrop}
        onDrop={onDrop}
      >
        {selectedIndex === -1 ? <option value={-1}>{String(value ?? "")}</option> : null}
        {enumValues.map((item, index) => (
          <option key={`${index}-${JSON.stringify(item)}`} value={index}>
            {item === null ? "null" : typeof item === "string" ? item : JSON.stringify(item)}
          </option>
        ))}
      </select>
    );
  }

  if (typeof value === "boolean") {
    return (
      <select
        className="json-scalar-input nodrag"
        value={String(value)}
        onChange={(event) => onChange(event.target.value === "true")}
        onDragOver={allowFieldValueDrop}
        onDrop={onDrop}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      className="json-scalar-input nodrag"
      type={typeof value === "number" ? "number" : "text"}
      value={value === null ? "" : String(value)}
      placeholder={value === null ? "null" : undefined}
      onChange={(event) => {
        if (typeof value === "number") {
          const number = Number(event.target.value);
          onChange(Number.isFinite(number) ? number : value);
        } else {
          onChange(event.target.value);
        }
      }}
      onDragOver={allowFieldValueDrop}
      onDrop={onDrop}
    />
  );
}

function EditableNode({
  label,
  value,
  onChange,
  schema,
  depth,
  onDelete,
  cardId,
  path,
}: {
  label: string;
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  schema?: JsonValue;
  depth: number;
  onDelete?: () => void;
  cardId?: string;
  path: string[];
}) {
  const currentSchema = effectiveSchema(schema, value);
  const field = cardId
    ? { cardId, target: path.length ? `body/${pointerFor(path)}` : "body" }
    : undefined;
  if (Array.isArray(value)) {
    return (
      <div className="json-branch">
        <div className="json-branch-title" style={{ paddingLeft: depth * 13 }}>
          <span>{label}</span><small>{valueType(value)}</small><FieldValueDrag value={value} field={field} />
          {onDelete ? <button className="json-delete-button nodrag" title="Удалить поле" onClick={onDelete}>×</button> : null}
        </div>
        {value.map((item, index) => (
          <EditableNode
            key={index}
            label={`[${index}]`}
            value={item}
            depth={depth + 1}
            schema={currentSchema.items}
            cardId={cardId}
            path={[...path, String(index)]}
            onChange={(next) => onChange(value.map((current, itemIndex) => itemIndex === index ? next : current))}
            onDelete={() => onChange(value.filter((_current, itemIndex) => itemIndex !== index))}
          />
        ))}
      </div>
    );
  }
  if (value !== null && typeof value === "object") {
    return (
      <div className="json-branch">
        {label && (
          <div className="json-branch-title" style={{ paddingLeft: depth * 13 }}>
            <span>{label}</span><small>object</small><FieldValueDrag value={value} field={field} />
            {onDelete ? <button className="json-delete-button nodrag" title="Удалить поле" onClick={onDelete}>×</button> : null}
          </div>
        )}
        {Object.entries(value).map(([key, item]) => (
          <EditableNode
            key={key}
            label={key}
            value={item}
            depth={label ? depth + 1 : depth}
            schema={schemaRecord(currentSchema.properties)[key]}
            cardId={cardId}
            path={[...path, key]}
            onChange={(next) => onChange({ ...value, [key]: next })}
            onDelete={() => {
              const next = { ...value };
              delete next[key];
              onChange(next);
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="json-field-row" style={{ paddingLeft: depth * 13 }}>
      <span className="json-field-name" title={label}>{label}</span>
      <small className="json-type-chip">{valueType(value)}</small>
      <ScalarInput value={value} schema={schema} onChange={onChange} />
      <FieldValueDrag value={value} field={field} />
      {onDelete ? <button className="json-delete-button nodrag" title="Удалить поле" onClick={onDelete}>×</button> : null}
    </div>
  );
}

export function JsonTreeEditor({ value, schema, onChange, cardId }: { value: JsonValue; schema?: JsonValue; onChange: (value: JsonValue) => void; cardId?: string }) {
  return <div className="json-tree-editor"><EditableNode label="" value={value} schema={schema} depth={0} path={[]} cardId={cardId} onChange={onChange} /></div>;
}

function ReadonlyNode({ label, value, depth }: { label: string; value: JsonValue; depth: number }) {
  if (Array.isArray(value)) {
    return (
      <div className="json-branch readonly">
        <div className="json-branch-title" style={{ paddingLeft: depth * 13 }}>
          <span>{label}</span><small>{valueType(value)}</small><FieldValueDrag value={value} />
        </div>
        {value.map((item, index) => <ReadonlyNode key={index} label={`[${index}]`} value={item} depth={depth + 1} />)}
      </div>
    );
  }
  if (value !== null && typeof value === "object") {
    return (
      <div className="json-branch readonly">
        {label && (
          <div className="json-branch-title" style={{ paddingLeft: depth * 13 }}>
            <span>{label}</span><small>object</small><FieldValueDrag value={value} />
          </div>
        )}
        {Object.entries(value).map(([key, item]) => (
          <ReadonlyNode key={key} label={key} value={item} depth={label ? depth + 1 : depth} />
        ))}
      </div>
    );
  }
  return (
    <div className="json-field-row readonly" style={{ paddingLeft: depth * 13 }}>
      <span className="json-field-name" title={label}>{label}</span>
      <small className="json-type-chip">{valueType(value)}</small>
      <code className="json-readonly-value">{value === null ? "null" : String(value)}</code>
      <FieldValueDrag value={value} title="Перетащить значение из ответа" />
    </div>
  );
}

export function JsonTreeViewer({ value }: { value: JsonValue }) {
  return <div className="json-tree-viewer"><ReadonlyNode label="" value={value} depth={0} /></div>;
}
