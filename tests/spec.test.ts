import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverOpenApi, resolveSpec, SpecProblem } from "../server/spec";

const schema = {
  openapi: "3.1.0",
  info: { title: "Demo", version: "1.0" },
  servers: [
    {
      url: "https://{tenant}.example.com/api",
      variables: { tenant: { default: "demo" } },
    },
  ],
  paths: {
    "/orders/{orderId}": {
      parameters: [
        {
          name: "orderId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      post: {
        tags: ["Orders"],
        summary: "Create order",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOrder" },
              examples: { normal: { summary: "Normal", value: { id: "example-id", amount: 5 } } },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
      get: {
        summary: "Get order",
        parameters: [
          { name: "filter", in: "query", schema: { type: "string", enum: ["open", "closed"] } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    schemas: {
      CreateOrder: {
        allOf: [
          { type: "object", properties: { id: { type: "string", format: "uuid" } } },
          { type: "object", properties: { amount: { type: "integer", enum: [5, 10], default: 5 } } },
        ],
      },
    },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("OpenAPI discovery and normalization", () => {
  it("discovers a schema linked by Swagger UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/docs")) {
        return new Response("SwaggerUIBundle({ url: '/openapi.json' })", { status: 200 });
      }
      return new Response(JSON.stringify(schema), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const result = await discoverOpenApi("https://service.example.com/docs");
    expect(result.documentUrl).toBe("https://service.example.com/openapi.json");
  });

  it("normalizes servers, parameters, refs and named examples", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(schema), { status: 200 })));
    const result = await resolveSpec("https://service.example.com/openapi.json");
    expect(result.title).toBe("Demo");
    expect(result.servers[0].resolvedUrl).toBe("https://demo.example.com/api");
    const post = result.operations.find((item) => item.method === "POST")!;
    const get = result.operations.find((item) => item.method === "GET")!;
    expect(post.key).toBe("POST /orders/{orderId}");
    expect(post.examples[0].values.body).toEqual({ id: "example-id", amount: 5 });
    expect(post.examples[0].values.path.orderId).toBeNull();
    expect(get.examples[0].values.query).toEqual({ filter: "open", limit: 10 });
    expect(get.parameters.find((item) => item.name === "filter")?.enum).toEqual(["open", "closed"]);
    expect((post.bodySchema as any).properties.amount.enum).toEqual([5, 10]);
  });

  it("reports that authentication headers are required", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unauthorized", { status: 401 })));
    await expect(discoverOpenApi("https://service.example.com/openapi.json")).rejects.toMatchObject({
      code: "SPEC_AUTH_REQUIRED",
      status: 401,
    });
  });
});
