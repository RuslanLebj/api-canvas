import type { CanvasDocument, ExecuteRequest, HeaderEntry, RequestCard } from "../shared/types";
import { getCardService } from "./services";

function mergeHeaders(...groups: HeaderEntry[][]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const group of groups) {
    for (const header of group) {
      if (!header.enabled || !header.name.trim()) continue;
      const name = header.name.trim();
      const previous = Object.keys(result).find((key) => key.toLowerCase() === name.toLowerCase());
      if (previous) delete result[previous];
      result[name] = header.value;
    }
  }
  return result;
}

export function buildCardRequest(document: CanvasDocument, card: RequestCard): ExecuteRequest {
  const service = getCardService(document, card);
  if (!service?.baseUrl) throw new Error("Укажите Base URL сервиса карточки.");
  const headerSet = card.headerSetId ? document.headerSets[card.headerSetId] : undefined;
  return {
    baseUrl: service.baseUrl,
    method: card.operationSnapshot.method,
    pathTemplate: card.operationSnapshot.path,
    path: card.values.path,
    query: card.values.query,
    headers: mergeHeaders(headerSet?.headers ?? [], card.values.headers, card.localHeaders),
    body: card.values.body,
    timeoutMs: 30_000,
  };
}
