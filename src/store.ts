import { create } from "zustand";
import type {
  CanvasDocument,
  CanvasNodeLayout,
  FieldReference,
  HeaderSetNode,
  NormalizedOperation,
  OperationTemplate,
  RequestCard,
  RequestValues,
  ResolvedSpec,
  RunRecord,
  ScenarioColor,
  ScenarioGroupNode,
  TextCardNode,
} from "../shared/types";
import { createHeaderEntry } from "../shared/types";
import { regenerateValues } from "../shared/generators";
import { propagateFieldLinks, wouldCreateFieldLinkCycle } from "../shared/field-links";
import { createId } from "../shared/id";

function now(): string {
  return new Date().toISOString();
}

export function createEmptyDocument(): CanvasDocument {
  const timestamp = now();
  return {
    schemaVersion: 1,
    id: createId(),
    name: "Новый API canvas",
    createdAt: timestamp,
    updatedAt: timestamp,
    specInputUrl: "",
    baseUrl: "",
    selectedServerUrl: "",
    templates: {},
    cards: {},
    headerSets: {},
    scenarioGroups: {},
    textCards: {},
    fieldLinks: [],
    arrows: [],
    layouts: [],
  };
}

function normalizeDocument(source: CanvasDocument): CanvasDocument {
  const document = structuredClone(source);
  document.scenarioGroups ??= {};
  document.textCards ??= {};
  document.fieldLinks ??= [];
  document.arrows ??= [];
  document.fieldLinks = document.fieldLinks.filter(
    (link) => document.cards[link.source.cardId] && document.cards[link.target.cardId],
  );
  const layoutIds = new Set(document.layouts.map((layout) => layout.id));
  document.arrows = document.arrows.filter(
    (arrow) => layoutIds.has(arrow.sourceNodeId) && layoutIds.has(arrow.targetNodeId),
  );
  for (const card of Object.values(document.cards)) {
    card.name ||= card.operationSnapshot.summary;
  }
  return document;
}

function defaultTemplate(operation: NormalizedOperation): OperationTemplate {
  const example = operation.examples[0];
  return {
    operationKey: operation.key,
    exampleName: example?.name ?? "По умолчанию",
    values: structuredClone(example?.values ?? { path: {}, query: {}, headers: [], body: null }),
    generators: [],
    updatedAt: now(),
  };
}

interface CanvasState {
  document: CanvasDocument;
  hydrated: boolean;
  saveState: "saved" | "saving" | "error";
  activeTemplateKey?: string;
  setHydrated: (value: boolean) => void;
  replaceDocument: (document: CanvasDocument) => void;
  setSaveState: (state: CanvasState["saveState"]) => void;
  applySpec: (spec: ResolvedSpec, inputUrl: string) => void;
  setBaseUrl: (value: string) => void;
  setName: (value: string) => void;
  openTemplate: (key?: string) => void;
  saveTemplate: (template: OperationTemplate) => void;
  addCard: (operation: NormalizedOperation, position: { x: number; y: number }) => void;
  updateCard: (id: string, patch: Partial<RequestCard>) => void;
  updateCardValues: (id: string, values: RequestValues) => void;
  regenerateCard: (id: string) => void;
  duplicateCard: (id: string) => void;
  deleteCard: (id: string) => void;
  addRun: (cardId: string, run: RunRecord) => void;
  deleteRun: (cardId: string, runId: string) => void;
  clearHistory: (cardId: string) => void;
  addHeaderSet: (position: { x: number; y: number }, seed?: { name?: string; headers?: HeaderSetNode["headers"] }) => string;
  updateHeaderSet: (id: string, patch: Partial<HeaderSetNode>) => void;
  deleteHeaderSet: (id: string) => void;
  addScenarioGroup: (position: { x: number; y: number }) => string;
  updateScenarioGroup: (id: string, patch: Partial<ScenarioGroupNode>) => void;
  deleteScenarioGroup: (id: string) => void;
  addTextCard: (position: { x: number; y: number }) => string;
  updateTextCard: (id: string, patch: Partial<TextCardNode>) => void;
  deleteTextCard: (id: string) => void;
  deleteCanvasNodes: (layoutIds: string[]) => void;
  connectHeaderSet: (cardId: string, headerSetId?: string) => void;
  connectFields: (source: FieldReference, target: FieldReference) => "connected" | "cycle" | "missing";
  deleteFieldLinks: (ids: string[]) => void;
  addCanvasArrow: (sourceNodeId: string, targetNodeId: string) => void;
  deleteCanvasArrows: (ids: string[]) => void;
  setLayouts: (layouts: CanvasNodeLayout[]) => void;
}

function removeArrowsForLayouts(document: CanvasDocument, layoutIds: Iterable<string>): void {
  const deleted = new Set(layoutIds);
  document.arrows = document.arrows.filter(
    (arrow) => !deleted.has(arrow.sourceNodeId) && !deleted.has(arrow.targetNodeId),
  );
}

function propagateFromCard(document: CanvasDocument, cardId: string): void {
  const sources = new Map<string, FieldReference>();
  for (const link of document.fieldLinks) {
    if (link.source.cardId === cardId) sources.set(link.source.target, link.source);
  }
  for (const source of sources.values()) {
    propagateFieldLinks(document.cards, document.fieldLinks, source);
  }
}

function mutateDocument(
  state: CanvasState,
  mutate: (document: CanvasDocument) => void,
): Pick<CanvasState, "document" | "saveState"> {
  const document = structuredClone(state.document);
  mutate(document);
  document.updatedAt = now();
  return { document, saveState: "saving" };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  document: createEmptyDocument(),
  hydrated: false,
  saveState: "saved",
  setHydrated: (hydrated) => set({ hydrated }),
  replaceDocument: (document) =>
    set({ document: normalizeDocument(document), hydrated: true, saveState: "saved" }),
  setSaveState: (saveState) => set({ saveState }),
  applySpec: (spec, inputUrl) =>
    set((state) => {
      const isNewSource = Boolean(
        state.document.spec &&
          state.document.specInputUrl &&
          state.document.specInputUrl !== inputUrl,
      );
      const baseState = isNewSource
        ? { ...state, document: createEmptyDocument() }
        : state;
      return mutateDocument(baseState, (document) => {
        const existingKeys = new Set(spec.operations.map((operation) => operation.key));
        document.spec = spec;
        document.specInputUrl = inputUrl;
        document.name = spec.title;
        const firstServer = spec.servers[0]?.resolvedUrl ?? "";
        if (!document.baseUrl || document.selectedServerUrl === document.baseUrl) {
          document.baseUrl = firstServer;
          document.selectedServerUrl = firstServer;
        }
        for (const card of Object.values(document.cards)) {
          card.stale = !existingKeys.has(card.operationKey);
        }
      });
    }),
  setBaseUrl: (baseUrl) => set((state) => mutateDocument(state, (document) => void (document.baseUrl = baseUrl))),
  setName: (name) => set((state) => mutateDocument(state, (document) => void (document.name = name))),
  openTemplate: (activeTemplateKey) => set({ activeTemplateKey }),
  saveTemplate: (template) =>
    set((state) => ({
      ...mutateDocument(state, (document) => {
        document.templates[template.operationKey] = structuredClone(template);
      }),
      activeTemplateKey: undefined,
    })),
  addCard: (operation, position) =>
    set((state) =>
      mutateDocument(state, (document) => {
        const id = createId();
        const template = document.templates[operation.key] ?? defaultTemplate(operation);
        document.cards[id] = {
          id,
          name: operation.summary,
          operationKey: operation.key,
          operationSnapshot: {
            key: operation.key,
            method: operation.method,
            path: operation.path,
            summary: operation.summary,
            description: operation.description,
          },
          values: structuredClone(template.values),
          generators: structuredClone(template.generators),
          localHeaders: [],
          collapsed: false,
          stale: false,
          history: [],
        };
        document.layouts.push({
          id: `request:${id}`,
          kind: "request",
          entityId: id,
          position,
          width: 520,
        });
      }),
    ),
  updateCard: (id, patch) =>
    set((state) => mutateDocument(state, (document) => Object.assign(document.cards[id], structuredClone(patch)))),
  updateCardValues: (id, values) =>
    set((state) =>
      mutateDocument(state, (document) => {
        document.cards[id].values = structuredClone(values);
        propagateFromCard(document, id);
      }),
    ),
  regenerateCard: (id) =>
    set((state) =>
      mutateDocument(state, (document) => {
        const card = document.cards[id];
        card.values = regenerateValues(card.values, card.generators);
        propagateFromCard(document, id);
      }),
    ),
  duplicateCard: (id) =>
    set((state) =>
      mutateDocument(state, (document) => {
        const source = document.cards[id];
        const sourceLayout = document.layouts.find((layout) => layout.entityId === id);
        const copyId = createId();
        document.cards[copyId] = {
          ...structuredClone(source),
          id: copyId,
          history: [],
        };
        document.layouts.push({
          ...structuredClone(sourceLayout!),
          id: `request:${copyId}`,
          entityId: copyId,
          position: {
            x: (sourceLayout?.position.x ?? 0) + 48,
            y: (sourceLayout?.position.y ?? 0) + 48,
          },
        });
      }),
    ),
  deleteCard: (id) =>
    set((state) =>
      mutateDocument(state, (document) => {
        delete document.cards[id];
        document.fieldLinks = document.fieldLinks.filter(
          (link) => link.source.cardId !== id && link.target.cardId !== id,
        );
        removeArrowsForLayouts(document, [`request:${id}`]);
        document.layouts = document.layouts.filter((layout) => layout.entityId !== id);
      }),
    ),
  addRun: (cardId, run) =>
    set((state) => mutateDocument(state, (document) => void document.cards[cardId].history.unshift(run))),
  deleteRun: (cardId, runId) =>
    set((state) =>
      mutateDocument(state, (document) => {
        const card = document.cards[cardId];
        card.history = card.history.filter((run) => run.id !== runId);
      }),
    ),
  clearHistory: (cardId) =>
    set((state) => mutateDocument(state, (document) => void (document.cards[cardId].history = []))),
  addHeaderSet: (position, seed) => {
    const id = createId();
    set((state) =>
      mutateDocument(state, (document) => {
        document.headerSets[id] = {
          id,
          name: seed?.name || "Новый набор",
          headers: structuredClone(seed?.headers ?? [createHeaderEntry("Authorization", "Bearer ")]),
        };
        document.layouts.push({
          id: `headers:${id}`,
          kind: "headers",
          entityId: id,
          position,
          width: 340,
          height: 260,
        });
      }),
    );
    return id;
  },
  updateHeaderSet: (id, patch) =>
    set((state) => mutateDocument(state, (document) => Object.assign(document.headerSets[id], structuredClone(patch)))),
  deleteHeaderSet: (id) =>
    set((state) =>
      mutateDocument(state, (document) => {
        delete document.headerSets[id];
        removeArrowsForLayouts(document, [`headers:${id}`]);
        document.layouts = document.layouts.filter((layout) => layout.entityId !== id);
        Object.values(document.cards).forEach((card) => {
          if (card.headerSetId === id) delete card.headerSetId;
        });
      }),
    ),
  addScenarioGroup: (position) => {
    const id = createId();
    set((state) =>
      mutateDocument(state, (document) => {
        document.scenarioGroups[id] = {
          id,
          name: "Новый сценарий",
          color: "teal" satisfies ScenarioColor,
        };
        document.layouts.push({
          id: `group:${id}`,
          kind: "group",
          entityId: id,
          position,
          width: 900,
          height: 560,
        });
      }),
    );
    return id;
  },
  updateScenarioGroup: (id, patch) =>
    set((state) =>
      mutateDocument(state, (document) =>
        Object.assign(document.scenarioGroups[id], structuredClone(patch)),
      ),
    ),
  deleteScenarioGroup: (id) =>
    set((state) =>
      mutateDocument(state, (document) => {
        delete document.scenarioGroups[id];
        removeArrowsForLayouts(document, [`group:${id}`]);
        document.layouts = document.layouts.filter((layout) => layout.entityId !== id);
      }),
    ),
  addTextCard: (position) => {
    const id = createId();
    set((state) =>
      mutateDocument(state, (document) => {
        document.textCards[id] = {
          id,
          title: "Заметка",
          text: "",
          color: "teal",
        };
        document.layouts.push({
          id: `note:${id}`,
          kind: "note",
          entityId: id,
          position,
          width: 320,
          height: 220,
        });
      }),
    );
    return id;
  },
  updateTextCard: (id, patch) =>
    set((state) =>
      mutateDocument(state, (document) => Object.assign(document.textCards[id], structuredClone(patch))),
    ),
  deleteTextCard: (id) =>
    set((state) =>
      mutateDocument(state, (document) => {
        delete document.textCards[id];
        removeArrowsForLayouts(document, [`note:${id}`]);
        document.layouts = document.layouts.filter((layout) => layout.id !== `note:${id}`);
      }),
    ),
  deleteCanvasNodes: (layoutIds) =>
    set((state) =>
      mutateDocument(state, (document) => {
        const ids = new Set(layoutIds);
        const deletedCardIds = new Set<string>();
        for (const layout of document.layouts) {
          if (!ids.has(layout.id)) continue;
          if (layout.kind === "request") {
            deletedCardIds.add(layout.entityId);
            delete document.cards[layout.entityId];
          }
          if (layout.kind === "headers") delete document.headerSets[layout.entityId];
          if (layout.kind === "group") delete document.scenarioGroups[layout.entityId];
          if (layout.kind === "note") delete document.textCards[layout.entityId];
        }
        document.fieldLinks = document.fieldLinks.filter(
          (link) => !deletedCardIds.has(link.source.cardId) && !deletedCardIds.has(link.target.cardId),
        );
        removeArrowsForLayouts(document, ids);
        document.layouts = document.layouts.filter((layout) => !ids.has(layout.id));
      }),
    ),
  connectHeaderSet: (cardId, headerSetId) =>
    set((state) => mutateDocument(state, (document) => void (document.cards[cardId].headerSetId = headerSetId))),
  connectFields: (source, target) => {
    const current = get().document;
    if (!current.cards[source.cardId] || !current.cards[target.cardId]) return "missing";
    if (wouldCreateFieldLinkCycle(current.fieldLinks, source, target)) return "cycle";
    set((state) =>
      mutateDocument(state, (document) => {
        document.fieldLinks = document.fieldLinks.filter(
          (link) => !(link.target.cardId === target.cardId && link.target.target === target.target),
        );
        document.fieldLinks.push({ id: createId(), source, target });
        propagateFieldLinks(document.cards, document.fieldLinks, source);
      }),
    );
    return "connected";
  },
  deleteFieldLinks: (ids) =>
    set((state) =>
      mutateDocument(state, (document) => {
        const deleted = new Set(ids);
        document.fieldLinks = document.fieldLinks.filter((link) => !deleted.has(link.id));
      }),
    ),
  addCanvasArrow: (sourceNodeId, targetNodeId) => {
    if (sourceNodeId === targetNodeId) return;
    const current = get().document;
    if (!current.layouts.some((layout) => layout.id === sourceNodeId)) return;
    if (!current.layouts.some((layout) => layout.id === targetNodeId)) return;
    if (current.arrows.some(
      (arrow) => arrow.sourceNodeId === sourceNodeId && arrow.targetNodeId === targetNodeId,
    )) return;
    set((state) =>
      mutateDocument(state, (document) => {
        document.arrows.push({ id: createId(), sourceNodeId, targetNodeId });
      }),
    );
  },
  deleteCanvasArrows: (ids) =>
    set((state) =>
      mutateDocument(state, (document) => {
        const deleted = new Set(ids);
        document.arrows = document.arrows.filter((arrow) => !deleted.has(arrow.id));
      }),
    ),
  setLayouts: (layouts) =>
    set((state) => mutateDocument(state, (document) => void (document.layouts = structuredClone(layouts)))),
}));
