import Dexie, { type EntityTable } from "dexie";
import type { CanvasDocument } from "../shared/types";

class CanvasDatabase extends Dexie {
  canvases!: EntityTable<CanvasDocument, "id">;

  constructor() {
    super("api-canvas");
    this.version(1).stores({ canvases: "id, updatedAt, specInputUrl" });
  }
}

export const database = new CanvasDatabase();

export async function loadLatestDocument(): Promise<CanvasDocument | undefined> {
  return database.canvases.orderBy("updatedAt").last();
}

export async function saveDocument(document: CanvasDocument): Promise<void> {
  await database.canvases.put(structuredClone(document));
}
