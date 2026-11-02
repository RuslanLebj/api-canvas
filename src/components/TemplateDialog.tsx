import { useEffect, useMemo, useState } from "react";
import type {
  GeneratorTemplate,
  OperationTemplate,
} from "../../shared/types";
import { useCanvasStore } from "../store";
import { flattenRequestValues } from "../value-utils";
import { ValuesEditor } from "./ValuesEditor";

function suggestedTemplate(label: string, value: unknown): string {
  if (typeof value === "number") return "{int:1:999999}";
  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) return "{uuid}";
  if (/id$|\.id$|Id$/.test(label)) return "{uuid}";
  return "{random:8}";
}

export function TemplateDialog() {
  const operationKey = useCanvasStore((state) => state.activeTemplateKey);
  const document = useCanvasStore((state) => state.document);
  const close = useCanvasStore((state) => state.openTemplate);
  const save = useCanvasStore((state) => state.saveTemplate);
  const operation = document.spec?.operations.find((item) => item.key === operationKey);
  const existing = operationKey ? document.templates[operationKey] : undefined;
  const initial = useMemo<OperationTemplate | undefined>(() => {
    if (!operation) return undefined;
    const example = operation.examples[0];
    return existing
      ? structuredClone(existing)
      : {
          operationKey: operation.key,
          exampleName: example?.name ?? "По умолчанию",
          values: structuredClone(example?.values ?? { path: {}, query: {}, headers: [], body: null }),
          generators: [],
          updatedAt: new Date().toISOString(),
        };
  }, [operation, existing]);
  const [template, setTemplate] = useState(initial);

  useEffect(() => {
    setTemplate(initial);
  }, [initial]);

  if (!operation || !template) return null;
  const fields = flattenRequestValues(template.values);

  const toggleGenerator = (target: string, label: string, value: unknown, enabled: boolean) => {
    const current = template.generators.find((generator) => generator.target === target);
    const next: GeneratorTemplate = current ?? {
      target,
      enabled,
      template: suggestedTemplate(label, value),
    };
    next.enabled = enabled;
    setTemplate({
      ...template,
      generators: [...template.generators.filter((item) => item.target !== target), next],
    });
  };

  const updateGenerator = (target: string, value: string) => {
    setTemplate({
      ...template,
      generators: template.generators.map((generator) =>
        generator.target === target ? { ...generator, template: value } : generator,
      ),
    });
  };

  const chooseExample = (name: string) => {
    const example = operation.examples.find((item) => item.name === name)!;
    const validTargets = new Set(flattenRequestValues(example.values).map((field) => field.target));
    setTemplate({
      ...template,
      exampleName: name,
      values: structuredClone(example.values),
      generators: template.generators.filter((generator) => validTargets.has(generator.target)),
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => close(undefined)}>
      <div className="template-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div>
            <span className={`method method-${operation.method.toLowerCase()}`}>{operation.method}</span>
            <h2>{operation.summary}</h2>
            <code>{operation.path}</code>
          </div>
          <button className="icon-button" onClick={() => close(undefined)}>×</button>
        </header>
        <div className="dialog-content">
          {operation.examples.length > 1 && (
            <label className="select-field">
              <span>Пример OpenAPI</span>
              <select value={template.exampleName} onChange={(event) => chooseExample(event.target.value)}>
                {operation.examples.map((example) => (
                  <option key={example.name} value={example.name}>{example.summary || example.name}</option>
                ))}
              </select>
            </label>
          )}
          <ValuesEditor
            values={template.values}
            parameters={operation.parameters}
            bodyRequired={operation.bodyRequired}
            bodySchema={operation.bodySchema}
            onChange={(values) => setTemplate({ ...template, values })}
          />
          <section className="generator-section">
            <div className="section-label">ПЕРЕГЕНЕРАЦИЯ ПОЛЕЙ</div>
            <p className="hint">Токены: {'{uuid}'}, {'{uuid:name}'}, {'{random:8}'}, {'{int:1:999}'}, {'{timestamp}'}, {'{date:yyyyMMdd}'}</p>
            {fields.length === 0 && <div className="empty-small">В примере нет скалярных полей.</div>}
            {fields.map((field) => {
              const generator = template.generators.find((item) => item.target === field.target);
              return (
                <div className="generator-row" key={field.target}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(generator?.enabled)}
                      onChange={(event) => toggleGenerator(field.target, field.label, field.value, event.target.checked)}
                    />
                    <span>{field.label}</span>
                  </label>
                  <input
                    disabled={!generator?.enabled}
                    value={generator?.template ?? suggestedTemplate(field.label, field.value)}
                    onChange={(event) => updateGenerator(field.target, event.target.value)}
                  />
                </div>
              );
            })}
          </section>
        </div>
        <footer className="dialog-footer">
          <button className="secondary-button" onClick={() => close(undefined)}>Отмена</button>
          <button className="primary-button" onClick={() => save({ ...template, updatedAt: new Date().toISOString() })}>
            Сохранить шаблон
          </button>
        </footer>
      </div>
    </div>
  );
}
