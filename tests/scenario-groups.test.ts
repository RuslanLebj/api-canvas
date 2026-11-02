import { afterEach, describe, expect, it } from "vitest";
import { createEmptyDocument, useCanvasStore } from "../src/store";
import type { NormalizedOperation } from "../shared/types";

afterEach(() => {
  useCanvasStore.getState().replaceDocument(createEmptyDocument());
});

describe("scenario groups", () => {
  it("creates, renames, recolors and removes a visual scenario area", () => {
    useCanvasStore.getState().replaceDocument(createEmptyDocument());
    const id = useCanvasStore.getState().addScenarioGroup({ x: 120, y: 80 });

    expect(useCanvasStore.getState().document.scenarioGroups[id]).toMatchObject({
      name: "Новый сценарий",
      color: "teal",
    });
    expect(useCanvasStore.getState().document.layouts).toContainEqual(
      expect.objectContaining({ kind: "group", entityId: id, width: 900, height: 560 }),
    );

    useCanvasStore.getState().updateScenarioGroup(id, {
      name: "Возврат платежа",
      color: "purple",
    });
    expect(useCanvasStore.getState().document.scenarioGroups[id]).toMatchObject({
      name: "Возврат платежа",
      color: "purple",
    });

    useCanvasStore.getState().deleteScenarioGroup(id);
    expect(useCanvasStore.getState().document.scenarioGroups[id]).toBeUndefined();
    expect(useCanvasStore.getState().document.layouts).toHaveLength(0);
  });

  it("deletes several selected request cards in one store update", () => {
    const operation: NormalizedOperation = {
      key: "GET /items",
      method: "GET",
      path: "/items",
      summary: "Items",
      tags: ["Demo"],
      deprecated: false,
      parameters: [],
      bodyRequired: false,
      examples: [{
        name: "default",
        values: { path: {}, query: {}, headers: [], body: null },
      }],
    };
    useCanvasStore.getState().addCard(operation, { x: 20, y: 20 });
    useCanvasStore.getState().addCard(operation, { x: 80, y: 80 });
    const requestLayouts = useCanvasStore.getState().document.layouts.filter(
      (layout) => layout.kind === "request",
    );

    useCanvasStore.getState().deleteCanvasNodes(requestLayouts.map((layout) => layout.id));

    expect(Object.keys(useCanvasStore.getState().document.cards)).toHaveLength(0);
    expect(useCanvasStore.getState().document.layouts).toHaveLength(0);
  });
});
