import { describe, expect, it } from "vitest";
import { sanitizeForExport, REDACTED } from "../src/export";
import { createEmptyDocument } from "../src/store";
import { createHeaderEntry } from "../shared/types";

describe("safe export", () => {
  it("redacts secret header sets, request snapshots and curl", () => {
    const document = createEmptyDocument();
    const headerSetId = crypto.randomUUID();
    const cardId = crypto.randomUUID();
    const secret = createHeaderEntry("Authorization", "Bearer top-secret");
    document.headerSets[headerSetId] = { id: headerSetId, name: "Auth", headers: [secret] };
    document.cards[cardId] = {
      id: cardId,
      name: "My request",
      operationKey: "GET /me",
      operationSnapshot: { key: "GET /me", method: "GET", path: "/me", summary: "Me" },
      values: { path: {}, query: {}, headers: [], body: null },
      generators: [],
      localHeaders: [],
      headerSetId,
      collapsed: false,
      stale: false,
      history: [
        {
          id: crypto.randomUUID(),
          startedAt: new Date().toISOString(),
          durationMs: 1,
          curl: "curl --header 'Authorization: Bearer top-secret'",
          request: { method: "GET", url: "https://example.com/me", headers: { Authorization: "Bearer top-secret" }, body: null },
        },
      ],
    };
    const safe = sanitizeForExport(document);
    expect(safe.headerSets[headerSetId].headers[0].value).toBe(REDACTED);
    expect(safe.cards[cardId].history[0].request.headers.Authorization).toBe(REDACTED);
    expect(safe.cards[cardId].history[0].curl).not.toContain("top-secret");
  });
});
