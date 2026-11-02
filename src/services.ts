import type { ApiService, CanvasDocument, RequestCard } from "../shared/types";

export function templateKey(serviceId: string | undefined, operationKey: string): string {
  return serviceId ? JSON.stringify([serviceId, operationKey]) : operationKey;
}

export function getCardService(document: CanvasDocument, card: RequestCard): ApiService | undefined {
  return card.serviceId ? document.services[card.serviceId] : undefined;
}

export function selectService(document: CanvasDocument, serviceId: string): void {
  const service = document.services[serviceId];
  if (!service) return;
  document.activeServiceId = serviceId;
  document.spec = service.spec;
  document.specInputUrl = service.specInputUrl;
  document.baseUrl = service.baseUrl;
  document.selectedServerUrl = service.selectedServerUrl;
}
