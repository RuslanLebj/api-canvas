import { describe, expect, it } from "vitest";
import { regenerateValues, renderGenerator } from "../shared/generators";
import type { RequestValues } from "../shared/types";

describe("generator templates", () => {
  it("reuses a named uuid within one regeneration", () => {
    const values: RequestValues = {
      path: { first: "old", second: "old" },
      query: {},
      headers: [],
      body: null,
    };
    const result = regenerateValues(values, [
      { target: "path/first", enabled: true, template: "order-{uuid:shared}" },
      { target: "path/second", enabled: true, template: "{uuid:shared}" },
    ]);
    expect(String(result.path.first).slice(6)).toBe(result.path.second);
    expect(result.path.first).not.toBe(values.path.first);
  });

  it("keeps an exact integer token numeric", () => {
    const value = renderGenerator("{int:10:10}");
    expect(value).toBe(10);
    expect(typeof value).toBe("number");
  });

  it("supports dates, timestamps and random suffixes", () => {
    expect(renderGenerator("d-{date:yyyyMMdd}")).toMatch(/^d-\d{8}$/);
    expect(renderGenerator("{timestamp}")).toMatch(/^\d{13}$/);
    expect(renderGenerator("x-{random:12}")).toMatch(/^x-[A-Za-z0-9]{12}$/);
  });

  it("does not recreate a field removed by another OpenAPI example", () => {
    const values: RequestValues = {
      path: {},
      query: {},
      headers: [],
      body: { basis: { moneyBookTransactionId: "inside-basis" } },
    };
    const result = regenerateValues(values, [
      { target: "body/moneyBookTransactionId", enabled: true, template: "{uuid}" },
    ]);
    expect(result.body).toEqual({ basis: { moneyBookTransactionId: "inside-basis" } });
  });
});
