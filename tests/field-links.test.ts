import { afterEach, describe, expect, it } from "vitest";
import type { NormalizedOperation, RequestValues } from "../shared/types";
import { createEmptyDocument, useCanvasStore } from "../src/store";

const operation: NormalizedOperation = {
  key: "POST /chain",
  method: "POST",
  path: "/chain",
  summary: "Chain",
  tags: ["Test"],
  deprecated: false,
  parameters: [],
  bodyRequired: true,
  examples: [{
    name: "default",
    values: { path: {}, query: {}, headers: [], body: { id: "initial" } },
  }],
};

function cardIds(): string[] {
  return Object.keys(useCanvasStore.getState().document.cards);
}

function values(id: string, value: string): RequestValues {
  const current = useCanvasStore.getState().document.cards[id].values;
  return { ...structuredClone(current), body: { id: value } };
}

afterEach(() => useCanvasStore.getState().replaceDocument(createEmptyDocument()));

describe("live field links", () => {
  it("propagates a root edit through the whole chain", () => {
    useCanvasStore.getState().addCard(operation, { x: 0, y: 0 });
    useCanvasStore.getState().addCard(operation, { x: 600, y: 0 });
    useCanvasStore.getState().addCard(operation, { x: 1200, y: 0 });
    const [first, second, third] = cardIds();

    expect(useCanvasStore.getState().connectFields(
      { cardId: first, target: "body/id" },
      { cardId: second, target: "body/id" },
    )).toBe("connected");
    expect(useCanvasStore.getState().connectFields(
      { cardId: second, target: "body/id" },
      { cardId: third, target: "body/id" },
    )).toBe("connected");

    useCanvasStore.getState().updateCardValues(first, values(first, "changed-at-root"));

    expect(useCanvasStore.getState().document.cards[second].values.body).toEqual({ id: "changed-at-root" });
    expect(useCanvasStore.getState().document.cards[third].values.body).toEqual({ id: "changed-at-root" });
  });

  it("replaces an existing input link and rejects cycles", () => {
    useCanvasStore.getState().addCard(operation, { x: 0, y: 0 });
    useCanvasStore.getState().addCard(operation, { x: 600, y: 0 });
    useCanvasStore.getState().addCard(operation, { x: 1200, y: 0 });
    const [first, second, third] = cardIds();
    const target = { cardId: second, target: "body/id" };

    useCanvasStore.getState().connectFields({ cardId: first, target: "body/id" }, target);
    useCanvasStore.getState().connectFields({ cardId: third, target: "body/id" }, target);
    expect(useCanvasStore.getState().document.fieldLinks).toHaveLength(1);
    expect(useCanvasStore.getState().document.fieldLinks[0].source.cardId).toBe(third);

    useCanvasStore.getState().connectFields(target, { cardId: first, target: "body/id" });
    expect(useCanvasStore.getState().connectFields(
      { cardId: first, target: "body/id" },
      target,
    )).toBe("cycle");
  });

  it("removes links together with a deleted card", () => {
    useCanvasStore.getState().addCard(operation, { x: 0, y: 0 });
    useCanvasStore.getState().addCard(operation, { x: 600, y: 0 });
    const [first, second] = cardIds();
    useCanvasStore.getState().connectFields(
      { cardId: first, target: "body/id" },
      { cardId: second, target: "body/id" },
    );

    useCanvasStore.getState().deleteCard(first);

    expect(useCanvasStore.getState().document.fieldLinks).toHaveLength(0);
  });
});
