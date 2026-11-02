import { useEffect, useRef, useState } from "react";
import type { HeaderEntry } from "../../shared/types";
import { createHeaderEntry } from "../../shared/types";
import { ApiClientError, resolveSpec } from "../api";
import { downloadDocument, readDocument } from "../export";
import { useCanvasStore } from "../store";
import { HeadersEditor } from "./HeadersEditor";

function entriesToRecord(entries: HeaderEntry[]): Record<string, string> {
  return Object.fromEntries(entries.filter((item) => item.enabled && item.name.trim()).map((item) => [item.name, item.value]));
}

export function Topbar() {
  const document = useCanvasStore((state) => state.document);
  const saveState = useCanvasStore((state) => state.saveState);
  const applySpec = useCanvasStore((state) => state.applySpec);
  const setBaseUrl = useCanvasStore((state) => state.setBaseUrl);
  const replaceDocument = useCanvasStore((state) => state.replaceDocument);
  const addHeaderSet = useCanvasStore((state) => state.addHeaderSet);
  const [url, setUrl] = useState(document.specInputUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [authHeaders, setAuthHeaders] = useState<HeaderEntry[]>([createHeaderEntry("Authorization", "Bearer ")]);
  const [saveAuth, setSaveAuth] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoRefreshRef = useRef(false);

  const connect = async (headers: Record<string, string> = {}) => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      const spec = await resolveSpec(url.trim(), headers);
      applySpec(spec, url.trim());
      setAuthRequired(false);
      if (saveAuth && Object.keys(headers).length > 0) {
        addHeaderSet({ x: 80, y: 80 }, { name: "Swagger auth", headers: authHeaders });
      }
    } catch (caught) {
      const problem = caught as ApiClientError;
      setError(problem.message);
      setAuthRequired(problem.code === "SPEC_AUTH_REQUIRED");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      autoRefreshRef.current ||
      !document.spec ||
      (document.spec.normalizationVersion ?? 0) >= 2 ||
      !url.trim()
    ) {
      return;
    }
    autoRefreshRef.current = true;
    void connect();
  }, [document.spec, url]);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div><strong>API Canvas</strong><small>{document.spec ? `${document.spec.title} · OpenAPI ${document.spec.openapiVersion}` : "локальный request workspace"}</small></div>
        </div>
        <div className="swagger-control">
          <span className="control-label">SWAGGER / OPENAPI</span>
          <input
            value={url}
            placeholder="https://service.example.com/docs"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && connect()}
          />
          <button className="connect-button" disabled={loading || !url.trim()} onClick={() => connect()}>
            {loading ? "Загрузка…" : document.spec ? "Обновить" : "Подключить"}
          </button>
        </div>
        <div className="environment-control">
          <span className="control-label">BASE URL</span>
          <select
            aria-label="OpenAPI server"
            value={document.spec?.servers.some((server) => server.resolvedUrl === document.baseUrl) ? document.baseUrl : "custom"}
            disabled={!document.spec}
            onChange={(event) => {
              if (event.target.value !== "custom") setBaseUrl(event.target.value);
            }}
          >
            {(document.spec?.servers ?? []).map((server) => (
              <option key={server.resolvedUrl} value={server.resolvedUrl}>{server.description || server.resolvedUrl}</option>
            ))}
            <option value="custom">Вручную</option>
          </select>
          <input
            aria-label="Base URL"
            value={document.baseUrl}
            placeholder="https://api.example.com"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </div>
        <div className="top-actions">
          <span className={`save-state ${saveState}`}><i />{saveState === "saved" ? "Сохранено" : saveState === "saving" ? "Сохранение" : "Ошибка"}</span>
          <button className="toolbar-button" disabled={!document.spec} onClick={() => downloadDocument(document)}>⇩ Экспорт</button>
          <button className="toolbar-button" onClick={() => fileRef.current?.click()}>⇧ Импорт</button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const imported = await readDocument(file);
                replaceDocument(imported);
                setUrl(imported.specInputUrl);
              } catch (caught) {
                window.alert(caught instanceof Error ? caught.message : String(caught));
              }
              event.target.value = "";
            }}
          />
        </div>
      </header>
      {error && !authRequired && <div className="top-error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
      {authRequired && (
        <div className="auth-panel">
          <div className="auth-copy">
            <strong>Схема требует авторизацию</strong>
            <span>{error}</span>
          </div>
          <div className="auth-fields">
            <HeadersEditor compact entries={authHeaders} onChange={setAuthHeaders} />
            <label className="save-auth"><input type="checkbox" checked={saveAuth} onChange={(event) => setSaveAuth(event.target.checked)} />Сохранить набором на canvas</label>
          </div>
          <button className="primary-button" disabled={loading} onClick={() => connect(entriesToRecord(authHeaders))}>Повторить</button>
          <button className="icon-button" onClick={() => setAuthRequired(false)}>×</button>
        </div>
      )}
    </>
  );
}
