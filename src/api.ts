import type {
  ApiErrorPayload,
  ExecuteRequest,
  ExecuteResponse,
  ResolvedSpec,
} from "../shared/types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: ApiErrorPayload["code"],
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json()) as T | ApiErrorPayload;
  if (!response.ok) {
    const error = payload as ApiErrorPayload;
    throw new ApiClientError(error.error || `HTTP ${response.status}`, response.status, error.code);
  }
  return payload as T;
}

export function resolveSpec(
  url: string,
  headers: Record<string, string> = {},
): Promise<ResolvedSpec> {
  return post("/internal/spec/resolve", { url, headers });
}

export function execute(input: ExecuteRequest, signal?: AbortSignal): Promise<ExecuteResponse> {
  return post("/internal/execute", input, signal);
}
