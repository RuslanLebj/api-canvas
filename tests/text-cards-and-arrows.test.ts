import { afterEach, describe, expect, it } from "vitest";
import { createEmptyDocument, useCanvasStore } from "../src/store";

afterEach(() => useCanvasStore.getState().replaceDocument(createEmptyDocument()));

describe("text cards and canvas arrows", () => {
  it("creates and edits a resizable text card", () => {
    const id = useCanvasStore.getState().addTextCard({ x: 140, y: 90 });
    useCanvasStore.getState().updateTextCard(id, {
      title: "Проверить возврат",
      text: "1. Создать платёж\n2. Выполнить возврат",
      color: "amber",
    });

    expect(useCanvasStore.getState().document.textCards[id]).toMatchObject({
      title: "Проверить возврат",
      text: "1. Создать платёж\n2. Выполнить возврат",
      color: "amber",
    });
    expect(useCanvasStore.getState().document.layouts).toContainEqual(
      expect.objectContaining({
        id: `note:${id}`,
        kind: "note",
        width: 320,
        height: 220,
      }),
    );
  });

  it("stores one arrow per direction and removes it with a deleted node", () => {
    const first = useCanvasStore.getState().addTextCard({ x: 0, y: 0 });
    const second = useCanvasStore.getState().addTextCard({ x: 500, y: 0 });
    const source = `note:${first}`;
    const target = `note:${second}`;

    useCanvasStore.getState().addCanvasArrow(source, target);
    useCanvasStore.getState().addCanvasArrow(source, target);
    expect(useCanvasStore.getState().document.arrows).toEqual([
      expect.objectContaining({ sourceNodeId: source, targetNodeId: target }),
    ]);

    useCanvasStore.getState().deleteTextCard(first);
    expect(useCanvasStore.getState().document.arrows).toHaveLength(0);
  });

  it("restores legacy canvases without notes and arrows", () => {
    const legacy = createEmptyDocument();
    delete (legacy as Partial<typeof legacy>).textCards;
    delete (legacy as Partial<typeof legacy>).arrows;

    useCanvasStore.getState().replaceDocument(legacy);

    expect(useCanvasStore.getState().document.textCards).toEqual({});
    expect(useCanvasStore.getState().document.arrows).toEqual([]);
  });
});
