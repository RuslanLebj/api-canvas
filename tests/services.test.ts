import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasDocument, NormalizedOperation, ResolvedSpec } from "../shared/types";
import { createHeaderEntry } from "../shared/types";
import { createEmptyDocument, useCanvasStore } from "../src/store";
import { buildCardRequest } from "../src/request";
import { templateKey } from "../src/services";
import { readDocument, sanitizeForExport, REDACTED } from "../src/export";

const operation: NormalizedOperation = {
  key: "POST /items", method: "POST", path: "/items", summary: "Create item",
  tags: [], deprecated: false, parameters: [], bodyRequired: true,
  examples: [{ name: "default", values: { path: {}, query: {}, headers: [], body: { id: "initial" } } }],
};

function spec(host: string): ResolvedSpec {
  return {
    normalizationVersion: 2, sourceUrl: `https://${host}/docs`, documentUrl: `https://${host}/openapi.json`,
    title: host, version: "1", openapiVersion: "3.1.0", warnings: [],
    servers: [{ url: "/", resolvedUrl: `https://${host}` }], operations: [structuredClone(operation)],
  };
}

const store = () => useCanvasStore.getState();
function addService(host: string): string {
  store().applySpec(spec(host), `https://${host}/docs`);
  return store().document.activeServiceId!;
}
function addCard(): string {
  store().addCard(operation, { x: 0, y: 0 });
  return Object.keys(store().document.cards).at(-1)!;
}

beforeEach(() => store().replaceDocument(createEmptyDocument()));

describe("multiple API services", () => {
  it("retains the canvas and routes each card to its own API after switching and editing another API", () => {
    const first = addService("accounts.example.com");
    const firstCard = addCard();
    const groupId = store().addScenarioGroup({ x: 0, y: 0 });
    const originalId = store().document.id;
    const second = addService("payments.example.com");
    const secondCard = addCard();
    store().setBaseUrl("https://payments.example.com/v2");
    const document = store().document;
    expect(document.id).toBe(originalId);
    expect(document.scenarioGroups[groupId]).toBeDefined();
    expect(document.cards[firstCard].serviceId).toBe(first);
    expect(document.cards[secondCard].serviceId).toBe(second);
    expect(buildCardRequest(document, document.cards[firstCard]).baseUrl).toBe("https://accounts.example.com");
    expect(buildCardRequest(document, document.cards[secondCard]).baseUrl).toBe("https://payments.example.com/v2");
    store().setActiveService(first);
    expect(store().document.baseUrl).toBe("https://accounts.example.com");
    store().setActiveService(second);
    expect(store().document.baseUrl).toBe("https://payments.example.com/v2");
  });

  it("isolates templates and headers for identical method/path pairs", () => {
    const first = addService("accounts.example.com");
    const secret = createHeaderEntry("Authorization", "Bearer accounts-only");
    store().saveTemplate({ operationKey: operation.key, exampleName: "custom", updatedAt: "now",
      values: { path: {}, query: {}, headers: [secret], body: { id: "accounts" } }, generators: [] });
    const firstCard = addCard();
    addService("payments.example.com");
    const secondCard = addCard();
    let document = store().document;
    expect(buildCardRequest(document, document.cards[secondCard]).headers).toEqual({});
    expect(document.cards[secondCard].values.body).toEqual({ id: "initial" });
    expect(buildCardRequest(document, document.cards[firstCard]).headers.Authorization).toBe("Bearer accounts-only");
    store().setActiveService(first);
    const copy = addCard();
    document = store().document;
    expect(document.cards[copy].values.body).toEqual({ id: "accounts" });
    expect(sanitizeForExport(document).templates[templateKey(first, operation.key)].values.headers[0].value).toBe(REDACTED);
  });

  it("refreshes only the matching service, retains custom base URLs and recognizes alternate docs URLs", () => {
    const first = addService("accounts.example.com");
    const firstCard = addCard();
    const second = addService("payments.example.com");
    const secondCard = addCard();
    store().setActiveService(first);
    store().setBaseUrl("https://accounts.example.com/custom");
    store().applySpec({ ...spec("accounts.example.com"), operations: [] }, "https://accounts.example.com/openapi.json");
    const document = store().document;
    expect(Object.keys(document.services)).toHaveLength(2);
    expect(document.cards[firstCard].stale).toBe(true);
    expect(document.cards[secondCard].stale).toBe(false);
    expect(document.services[first].baseUrl).toBe("https://accounts.example.com/custom");
    expect(document.services[second].spec.operations).toHaveLength(1);
  });

  it("preserves cross-service field links, duplication and routing through JSON export/import", async () => {
    addService("accounts.example.com");
    const firstCard = addCard();
    addService("payments.example.com");
    const secondCard = addCard();
    store().connectFields({ cardId: firstCard, target: "body/id" }, { cardId: secondCard, target: "body/id" });
    store().updateCardValues(firstCard, { ...store().document.cards[firstCard].values, body: { id: "shared-id" } });
    expect(store().document.cards[secondCard].values.body).toEqual({ id: "shared-id" });
    store().duplicateCard(firstCard);
    const copy = Object.values(store().document.cards).at(-1)!;
    expect(copy.serviceId).toBe(store().document.cards[firstCard].serviceId);
    const safe = sanitizeForExport(store().document);
    const imported = await readDocument({ text: async () => JSON.stringify(safe) } as File);
    store().replaceDocument(imported);
    const document = store().document;
    expect(Object.keys(document.services)).toHaveLength(2);
    expect(document.fieldLinks).toHaveLength(1);
    expect(buildCardRequest(document, document.cards[firstCard]).baseUrl).toBe("https://accounts.example.com");
    expect(buildCardRequest(document, document.cards[secondCard]).baseUrl).toBe("https://payments.example.com");
  });

  it("migrates an existing single-API dashboard without losing cards, templates, links or history", () => {
    store().addCard(operation, { x: 150, y: 250 });
    const old = structuredClone(store().document);
    const card = Object.values(old.cards)[0];
    card.history = [{ id: "old-run", startedAt: "now", durationMs: 1, curl: "curl old",
      request: { method: "POST", url: "https://accounts.example.com/items", headers: {}, body: null } }];
    old.spec = spec("accounts.example.com");
    old.specInputUrl = "https://accounts.example.com/docs";
    old.baseUrl = "https://accounts.example.com/custom";
    old.templates[operation.key] = { operationKey: operation.key, exampleName: "old", updatedAt: "then",
      values: structuredClone(card.values), generators: [] };
    delete (old as Partial<CanvasDocument>).services;
    store().replaceDocument(old);
    const id = store().document.activeServiceId!;
    addService("payments.example.com");
    const document = store().document;
    expect(document.id).toBe(old.id);
    expect(document.layouts).toEqual(old.layouts);
    expect(document.cards[card.id].history).toEqual(card.history);
    expect(document.templates[templateKey(id, operation.key)].exampleName).toBe("old");
    expect(buildCardRequest(document, document.cards[card.id]).baseUrl).toBe(old.baseUrl);
    store().replaceDocument(JSON.parse(JSON.stringify(document)));
    expect(Object.keys(store().document.services)).toHaveLength(2);
  });

  it("never sends a card with a missing service to the currently selected API", () => {
    addService("accounts.example.com");
    const id = addCard();
    addService("payments.example.com");
    store().updateCard(id, { serviceId: "missing" });
    const document = store().document;
    expect(() => buildCardRequest(document, document.cards[id])).toThrow("Base URL");
  });
});
