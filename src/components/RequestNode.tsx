import { useLayoutEffect, useRef, useState } from "react";
import { NodeResizer, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import type { HeaderEntry, JsonValue, RunRecord } from "../../shared/types";
import { execute } from "../api";
import { useCanvasStore } from "../store";
import { HeadersEditor } from "./HeadersEditor";
import { JsonTreeViewer } from "./JsonTree";
import { ValuesEditor } from "./ValuesEditor";
import { CanvasArrowHandles } from "./CanvasArrowHandles";
import { copyText } from "../clipboard";

type RequestFlowNode = Node<{ entityId: string }, "request">;

function mergeHeaders(...groups: HeaderEntry[][]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const group of groups) {
    for (const header of group) {
      if (!header.enabled || !header.name.trim()) continue;
      const previous = Object.keys(result).find((name) => name.toLowerCase() === header.name.toLowerCase());
      if (previous) delete result[previous];
      result[header.name.trim()] = header.value;
    }
  }
  return result;
}

function RunDetails({ item, onDelete }: { item: RunRecord; onDelete: () => void }) {
  let responseJson: JsonValue | undefined;
  if (item.response?.bodyKind === "json" && item.response.body) {
    try {
      responseJson = JSON.parse(item.response.body) as JsonValue;
    } catch {
      responseJson = undefined;
    }
  }

  return (
    <div className="run-details">
      <div className="response-first">
        <div className="detail-title">
          <span>RESPONSE</span>
          <button className="icon-button danger" onClick={onDelete}>×</button>
        </div>
        {item.error ? <pre className="error-output">{item.error}</pre> : (
          <>
            <div className="response-meta">
              {item.response?.status} {item.response?.statusText} · {item.durationMs} ms
            </div>
            {responseJson !== undefined ? (
              <JsonTreeViewer value={responseJson} />
            ) : (
              <pre>{item.response?.body || "(пустой ответ)"}</pre>
            )}
            <details>
              <summary>Response headers</summary>
              <pre>{JSON.stringify(item.response?.headers, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
      <details className="curl-details">
        <summary className="curl-toggle">CURL</summary>
        <div className="curl-block">
          <div className="detail-title">
            <span>СФОРМИРОВАННЫЙ ЗАПРОС</span>
            <button className="text-button" onClick={() => void copyText(item.curl)}>
              Копировать
            </button>
          </div>
          <pre>{item.curl}</pre>
        </div>
      </details>
    </div>
  );
}

export function RequestNode({ id, data, selected }: NodeProps<RequestFlowNode>) {
  const document = useCanvasStore((state) => state.document);
  const card = document.cards[data.entityId];
  const updateNodeInternals = useUpdateNodeInternals();
  const update = useCanvasStore((state) => state.updateCard);
  const updateValues = useCanvasStore((state) => state.updateCardValues);
  const regenerate = useCanvasStore((state) => state.regenerateCard);
  const duplicate = useCanvasStore((state) => state.duplicateCard);
  const remove = useCanvasStore((state) => state.deleteCard);
  const addRun = useCanvasStore((state) => state.addRun);
  const deleteRun = useCanvasStore((state) => state.deleteRun);
  const clearHistory = useCanvasStore((state) => state.clearHistory);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [card, id, updateNodeInternals]);

  if (!card) return null;

  const headerSet = card.headerSetId ? document.headerSets[card.headerSetId] : undefined;
  const operation = document.spec?.operations.find((item) => item.key === card.operationKey);
  const run = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    try {
      const result = await execute(
        {
          baseUrl: document.baseUrl,
          method: card.operationSnapshot.method,
          pathTemplate: card.operationSnapshot.path,
          path: card.values.path,
          query: card.values.query,
          headers: mergeHeaders(headerSet?.headers ?? [], card.values.headers, card.localHeaders),
          body: card.values.body,
          timeoutMs: 30_000,
        },
        controller.signal,
      );
      addRun(card.id, result);
    } catch (error) {
      if ((error as Error).name !== "AbortError") window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
      abortRef.current = undefined;
    }
  };

  return (
    <div className={`canvas-node request-node ${selected ? "selected" : ""} ${card.collapsed ? "collapsed" : ""}`}>
      <NodeResizer minWidth={420} minHeight={card.collapsed ? 96 : 420} isVisible={selected && !card.collapsed} />
      <CanvasArrowHandles />
      <header className="request-header">
        <div className="request-heading">
          <span className={`method method-${card.operationSnapshot.method.toLowerCase()}`}>
            {card.operationSnapshot.method}
          </span>
          <div>
            <input
              className="request-card-name nodrag"
              value={card.name ?? card.operationSnapshot.summary}
              aria-label="Название карточки"
              placeholder={card.operationSnapshot.summary}
              onChange={(event) => update(card.id, { name: event.target.value })}
              onBlur={(event) => {
                if (!event.target.value.trim()) {
                  update(card.id, { name: card.operationSnapshot.summary });
                }
              }}
            />
            <code>{card.operationSnapshot.path}</code>
          </div>
        </div>
        <div className="node-actions nodrag">
          <button className="icon-button" title="Свернуть" onClick={() => update(card.id, { collapsed: !card.collapsed })}>
            {card.collapsed ? "▾" : "▴"}
          </button>
          <button className="icon-button" title="Копировать карточку" onClick={() => duplicate(card.id)}>⧉</button>
          <button className="icon-button danger" title="Удалить" onClick={() => remove(card.id)}>×</button>
        </div>
      </header>
      {card.stale && <div className="stale-banner">Роут отсутствует в обновлённой схеме</div>}
      {!card.collapsed && (
        <>
          <div className="request-toolbar nodrag">
            <button className="secondary-button" onClick={() => regenerate(card.id)} disabled={!card.generators.some((item) => item.enabled)}>
              ↻ Перегенерировать
            </button>
            {running ? (
              <button className="danger-button" onClick={() => abortRef.current?.abort()}>Остановить</button>
            ) : (
              <button className="run-button" onClick={run}>▶ Выполнить</button>
            )}
          </div>
          <div className="node-scroll request-scroll nowheel nodrag">
            {headerSet && (
              <div className="attached-set">
                <span>◉ {headerSet.name}</span>
                <button className="icon-button" onClick={() => update(card.id, { headerSetId: undefined })}>×</button>
              </div>
            )}
            {!headerSet && Object.keys(document.headerSets).length > 0 && (
              <label className="attach-select">
                <span>HEADER SET</span>
                <select
                  value=""
                  onChange={(event) => update(card.id, { headerSetId: event.target.value || undefined })}
                >
                  <option value="">Подключить набор…</option>
                  {Object.values(document.headerSets).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            )}
            <ValuesEditor
              values={card.values}
              cardId={card.id}
              parameters={operation?.parameters}
              bodyRequired={operation?.bodyRequired}
              bodySchema={operation?.bodySchema}
              onChange={(values) => updateValues(card.id, values)}
              compact
            />
            <HeadersEditor
              entries={card.localHeaders}
              title="ЛОКАЛЬНЫЕ HEADERS"
              compact
              onChange={(localHeaders) => update(card.id, { localHeaders })}
            />
            <section className="history-section">
              <div className="history-title">
                <span>ПОСЛЕДНИЙ ОТВЕТ</span>
                <div className="history-actions">
                  {card.history.length > 0 && <button className="text-button" onClick={() => clearHistory(card.id)}>Очистить</button>}
                </div>
              </div>
              {card.history.length === 0 && <div className="empty-history">Запусков ещё не было</div>}
              {card.history[0] && (
                <article className="run-record latest-run">
                  <div className="run-summary latest-summary">
                    <span className={`status-dot ${card.history[0].error ? "error" : card.history[0].response && card.history[0].response.status < 400 ? "ok" : "warn"}`} />
                    <strong>{card.history[0].error ? "ERROR" : card.history[0].response?.status}</strong>
                    <span>{new Date(card.history[0].startedAt).toLocaleTimeString("ru-RU")}</span>
                    <span>{card.history[0].durationMs} ms</span>
                    <span />
                  </div>
                  <RunDetails item={card.history[0]} onDelete={() => deleteRun(card.id, card.history[0].id)} />
                </article>
              )}
              {card.history.length > 0 && (
                <details className="history-details">
                  <summary className="history-toggle">История · {card.history.length}</summary>
                  <section className="history-archive">
                    <div className="section-label">ИСТОРИЯ ЗАПУСКОВ</div>
                    {card.history.map((item) => (
                      <details className="run-record" key={item.id}>
                        <summary className="run-summary">
                          <span className={`status-dot ${item.error ? "error" : item.response && item.response.status < 400 ? "ok" : "warn"}`} />
                          <strong>{item.error ? "ERROR" : item.response?.status}</strong>
                          <span>{new Date(item.startedAt).toLocaleTimeString("ru-RU")}</span>
                          <span>{item.durationMs} ms</span>
                          <span className="run-chevron">▾</span>
                        </summary>
                        <RunDetails item={item} onDelete={() => deleteRun(card.id, item.id)} />
                      </details>
                    ))}
                  </section>
                </details>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
