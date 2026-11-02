import type { JsonValue, ParameterDefinition, RequestValues } from "../../shared/types";
import { HeadersEditor } from "./HeadersEditor";
import {
  allowFieldValueDrop,
  FieldValueDrag,
  readDroppedFieldValue,
} from "./FieldValueDrag";
import { JsonTreeEditor } from "./JsonTree";
import { updateRecordValue } from "../value-utils";
import { pointerFor } from "../../shared/generators";

interface Props {
  values: RequestValues;
  onChange: (values: RequestValues) => void;
  compact?: boolean;
  parameters?: ParameterDefinition[];
  bodyRequired?: boolean;
  bodySchema?: JsonValue;
  cardId?: string;
}

function KeyValueSection({
  title,
  values,
  onChange,
  requiredNames = new Set<string>(),
  parameters = [],
  cardId,
  location,
}: {
  title: string;
  values: Record<string, JsonValue>;
  onChange: (value: Record<string, JsonValue>) => void;
  requiredNames?: Set<string>;
  parameters?: ParameterDefinition[];
  cardId?: string;
  location: "path" | "query";
}) {
  if (Object.keys(values).length === 0) return null;
  return (
    <section className="value-section">
      <div className="section-label">{title}</div>
      {Object.entries(values).map(([name, value]) => {
        const parameter = parameters.find((item) => item.name === name);
        const enumValues = parameter?.enum;
        const selectedEnumIndex = enumValues?.findIndex(
          (item) => JSON.stringify(item) === JSON.stringify(value),
        );
        return <label className="field-row nodrag" key={name}>
          <span title={name}>{name}{requiredNames.has(name) ? <b className="required-mark"> *</b> : null}</span>
          {enumValues?.length ? (
            <select
              className="enum-select"
              value={selectedEnumIndex ?? -1}
              onChange={(event) => onChange({
                ...values,
                [name]: enumValues[Number(event.target.value)],
              })}
            >
              {selectedEnumIndex === -1 ? <option value={-1}>{String(value ?? "")}</option> : null}
              {enumValues.map((item, index) => (
                <option key={`${index}-${JSON.stringify(item)}`} value={index}>
                  {item === null ? "null" : typeof item === "string" ? item : JSON.stringify(item)}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}
              onChange={(event) => onChange(updateRecordValue(values, name, event.target.value))}
              onDragOver={allowFieldValueDrop}
              onDrop={(event) => {
                const dropped = readDroppedFieldValue(event);
                if (dropped === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                onChange({ ...values, [name]: dropped });
              }}
            />
          )}
          <FieldValueDrag
            value={value}
            field={cardId ? { cardId, target: `${location}/${pointerFor([name])}` } : undefined}
          />
        </label>;
      })}
    </section>
  );
}

export function ValuesEditor({ values, onChange, compact, parameters = [], bodyRequired, bodySchema, cardId }: Props) {
  return (
    <div className={`values-editor ${compact ? "compact" : ""}`}>
      <KeyValueSection
        title="PATH"
        values={values.path}
        requiredNames={new Set(parameters.filter((item) => item.location === "path" && item.required).map((item) => item.name))}
        parameters={parameters.filter((item) => item.location === "path")}
        cardId={cardId}
        location="path"
        onChange={(path) => onChange({ ...values, path })}
      />
      <KeyValueSection
        title="QUERY"
        values={values.query}
        requiredNames={new Set(parameters.filter((item) => item.location === "query" && item.required).map((item) => item.name))}
        parameters={parameters.filter((item) => item.location === "query")}
        cardId={cardId}
        location="query"
        onChange={(query) => onChange({ ...values, query })}
      />
      {values.headers.length > 0 && (
        <HeadersEditor
          entries={values.headers}
          title="HEADERS ИЗ ОПЕРАЦИИ"
          compact
          requiredNames={new Set(parameters.filter((item) => item.location === "header" && item.required).map((item) => item.name))}
          fieldCardId={cardId}
          onChange={(headers) => onChange({ ...values, headers })}
        />
      )}
      {values.body !== null && (
        <section className="value-section">
          <div className="section-label">JSON BODY{bodyRequired ? <b className="required-mark"> *</b> : null}</div>
          <JsonTreeEditor
            value={values.body}
            schema={bodySchema}
            cardId={cardId}
            onChange={(body) => onChange({ ...values, body })}
          />
        </section>
      )}
    </div>
  );
}
