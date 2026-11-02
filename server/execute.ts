import type {
  ExecuteRequest,
  ExecuteResponse,
  JsonValue,
} from "../shared/types";
import { toTransportUrl } from "./transport-url";

export class ExecuteProblem extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function scalar(value: JsonValue): string {
  if (typeof value === "string") return value;
  if (value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function buildRequestUrl(input: ExecuteRequest): string {
  let path = input.pathTemplate.replace(/\{([^}]+)\}/g, (_whole, name: string) => {
    if (!(name in input.path)) {
      throw new ExecuteProblem(`Не заполнен path-параметр ${name}.`);
    }
    return encodeURIComponent(scalar(input.path[name]));
  });
  if (!path.startsWith("/")) path = `/${path}`;
  const url = new URL(`${input.baseUrl.replace(/\/$/, "")}${path}`);
  for (const [name, value] of Object.entries(input.query)) {
    if (value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(name, scalar(item)));
    } else {
      url.searchParams.append(name, scalar(value));
    }
  }
  return url.toString();
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: JsonValue,
): string {
  const chunks = [`curl --request ${method}`, `  --url ${shellQuote(url)}`];
  for (const [name, value] of Object.entries(headers)) {
    chunks.push(`  --header ${shellQuote(`${name}: ${value}`)}`);
  }
  if (body !== null && !["GET", "HEAD"].includes(method)) {
    chunks.push(`  --data ${shellQuote(JSON.stringify(body))}`);
  }
  return chunks.join(" \\\n");
}

export async function executeRequest(input: ExecuteRequest): Promise<ExecuteResponse> {
  if (!input.baseUrl) throw new ExecuteProblem("Не указан base URL.");
  let url: string;
  try {
    url = buildRequestUrl(input);
  } catch (error) {
    if (error instanceof ExecuteProblem) throw error;
    throw new ExecuteProblem("Не удалось сформировать URL запроса.");
  }
  const headers = { ...input.headers };
  const hasBody = input.body !== null && !["GET", "HEAD"].includes(input.method);
  if (hasBody && !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  const curl = buildCurl(input.method, url, headers, input.body);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const base = {
    id: crypto.randomUUID(),
    startedAt,
    durationMs: 0,
    curl,
    request: { method: input.method, url, headers, body: input.body },
  } satisfies Omit<ExecuteResponse, "durationMs"> & { durationMs: number };

  try {
    const response = await fetch(toTransportUrl(url), {
      method: input.method,
      headers,
      body: hasBody ? JSON.stringify(input.body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
    });
    const text = await response.text();
    let body = text;
    let bodyKind: "json" | "text" | "empty" = text ? "text" : "empty";
    if (text) {
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
        bodyKind = "json";
      } catch {
        bodyKind = "text";
      }
    }
    return {
      ...base,
      durationMs: Math.round(performance.now() - started),
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        bodyKind,
      },
    };
  } catch (error) {
    return {
      ...base,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
