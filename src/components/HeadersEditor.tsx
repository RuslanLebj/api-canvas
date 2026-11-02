import type { HeaderEntry } from "../../shared/types";
import { createHeaderEntry, isSecretHeader } from "../../shared/types";
import { FieldValueDrag } from "./FieldValueDrag";

interface Props {
  entries: HeaderEntry[];
  onChange: (entries: HeaderEntry[]) => void;
  title?: string;
  compact?: boolean;
  requiredNames?: Set<string>;
  fieldCardId?: string;
}

export function HeadersEditor({ entries, onChange, title, compact, requiredNames, fieldCardId }: Props) {
  const update = (id: string, patch: Partial<HeaderEntry>) => {
    onChange(
      entries.map((entry) => {
        if (entry.id !== id) return entry;
        const next = { ...entry, ...patch };
        if (patch.name !== undefined && !entry.secret) next.secret = isSecretHeader(patch.name);
        return next;
      }),
    );
  };

  return (
    <section className={`headers-editor ${compact ? "compact" : ""}`}>
      {title && <div className="section-label">{title}</div>}
      {entries.map((entry) => (
        <div className={`header-row nodrag ${requiredNames?.size ? "with-required" : ""} ${fieldCardId ? "linkable" : ""}`} key={entry.id}>
          {requiredNames?.size ? (
            <span className="required-mark" title={requiredNames.has(entry.name) ? "Обязательное по OpenAPI" : ""}>
              {requiredNames.has(entry.name) ? "*" : ""}
            </span>
          ) : null}
          <input
            aria-label="Header name"
            className="header-name"
            value={entry.name}
            placeholder="Header"
            onChange={(event) => update(entry.id, { name: event.target.value })}
          />
          <input
            aria-label={`Header ${entry.name || "value"}`}
            className="header-value"
            value={entry.value}
            placeholder="Value"
            onChange={(event) => update(entry.id, { value: event.target.value })}
          />
          {fieldCardId ? (
            <FieldValueDrag
              value={entry.value}
              field={{ cardId: fieldCardId, target: `header/${entry.id}` }}
            />
          ) : null}
          <button
            className={`icon-button ${entry.secret ? "active" : ""}`}
            title={entry.secret ? "Секрет: исключается из экспорта" : "Пометить секретным"}
            onClick={() => update(entry.id, { secret: !entry.secret })}
          >
            ◉
          </button>
          <button
            className="icon-button danger"
            title="Удалить header"
            onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button className="text-button nodrag" onClick={() => onChange([...entries, createHeaderEntry()])}>
        + Добавить header
      </button>
    </section>
  );
}
