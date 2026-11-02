import { describe, expect, it } from "vitest";
import { buildCurl, buildRequestUrl } from "../server/execute";
import type { ExecuteRequest } from "../shared/types";

const request: ExecuteRequest = {
  baseUrl: "https://api.example.com/",
  method: "POST",
  pathTemplate: "/users/{userId}/orders",
  path: { userId: "a b" },
  query: { tag: ["one", "two"], ignored: null },
  headers: { Authorization: "Bearer secret" },
  body: { amount: 10 },
};

describe("request construction", () => {
  it("encodes path and repeated query values", () => {
    expect(buildRequestUrl(request)).toBe(
      "https://api.example.com/users/a%20b/orders?tag=one&tag=two",
    );
  });

  it("builds a reproducible bash curl", () => {
    const curl = buildCurl("POST", buildRequestUrl(request), request.headers, request.body);
    expect(curl).toContain("curl --request POST");
    expect(curl).toContain("Authorization: Bearer secret");
    expect(curl).toContain("{\"amount\":10}");
  });
});
