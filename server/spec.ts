import { load as loadYaml } from "js-yaml";
import type {
  HeaderEntry,
  HttpMethod,
  JsonValue,
  NormalizedOperation,
  NormalizedServer,
  ParameterDefinition,
  RequestValues,
  ResolvedSpec,
} from "../shared/types";
import { createHeaderEntry } from "../shared/types";
import { toTransportUrl } from "./transport-url";

type AnyRecord = Record<string, any>;

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

export class SpecProblem extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code: "SPEC_AUTH_REQUIRED" | "SPEC_INVALID" | "FETCH_FAILED" =
      "SPEC_INVALID",
  ) {
    super(message);
  }
}

function asRecord(value: unknown): AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function parseDocument(text: string): AnyRecord | null {
  try {
    const parsed = JSON.parse(text);
    return asRecord(parsed);
  } catch {
    try {
      return asRecord(loadYaml(text));
    } catch {
      return null;
    }
  }
}

function isOpenApi3(document: AnyRecord): boolean {
  return typeof document.openapi === "string" && document.openapi.startsWith("3.");
}

async function fetchDocument(
  url: string,
  headers: Record<string, string>,
): Promise<{ response: Response; text: string }> {
  let response: Response;
  try {
    response = await fetch(toTransportUrl(url), {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new SpecProblem(
      `Не удалось загрузить ${url}: ${error instanceof Error ? error.message : String(error)}`,
      502,
      "FETCH_FAILED",
    );
  }
  const text = await response.text();
  return { response, text };
}

function absoluteUrl(candidate: string, base: string): string | null {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return null;
  }
}

function extractCandidates(text: string, pageUrl: string): string[] {
  const values = new Set<string>();
  const patterns = [
    /(?:configUrl|url)\s*:\s*["']([^"']+)["']/g,
    /data-(?:spec-)?url=["']([^"']+)["']/g,
    /[?&]url=([^&"']+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const decoded = decodeURIComponent(match[1]);
      const url = absoluteUrl(decoded, pageUrl);
      if (url) values.add(url);
    }
  }
  const page = new URL(pageUrl);
  const trimmed = page.pathname.replace(/\/$/, "");
  for (const path of [
    trimmed.replace(/\/(docs|swagger-ui|swagger)$/i, "/openapi.json"),
    "/openapi.json",
    "/swagger/v1/swagger.json",
    `${trimmed}/openapi.json`,
  ]) {
    values.add(new URL(path, page.origin).toString());
  }
  values.delete(pageUrl);
  return [...values];
}

export async function discoverOpenApi(
  inputUrl: string,
  headers: Record<string, string> = {},
): Promise<{ document: AnyRecord; documentUrl: string }> {
  let normalized: string;
  try {
    normalized = new URL(inputUrl).toString();
  } catch {
    throw new SpecProblem("Укажите корректный абсолютный http(s) URL.");
  }

  const queue = [normalized];
  const visited = new Set<string>();
  let authStatus: number | undefined;
  let lastError = "По указанному адресу не найдена OpenAPI 3.x схема.";

  while (queue.length > 0 && visited.size < 12) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    let result: Awaited<ReturnType<typeof fetchDocument>>;
    try {
      result = await fetchDocument(url, headers);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }
    if (result.response.status === 401 || result.response.status === 403) {
      authStatus = result.response.status;
      continue;
    }
    const location = result.response.headers.get("location");
    if (location) {
      const redirected = absoluteUrl(location, url);
      if (redirected) queue.push(redirected);
    }
    if (!result.response.ok) {
      lastError = `${url} вернул ${result.response.status}.`;
      queue.push(...extractCandidates(result.text, url));
      continue;
    }

    const parsed = parseDocument(result.text);
    if (parsed && isOpenApi3(parsed)) {
      return { document: parsed, documentUrl: url };
    }
    if (parsed) {
      const configUrls: string[] = [];
      if (typeof parsed.url === "string") configUrls.push(parsed.url);
      if (Array.isArray(parsed.urls)) {
        for (const item of parsed.urls) {
          if (typeof item?.url === "string") configUrls.push(item.url);
        }
      }
      for (const candidate of configUrls) {
        const absolute = absoluteUrl(candidate, url);
        if (absolute) queue.push(absolute);
      }
    }
    queue.push(...extractCandidates(result.text, url));
  }

  if (authStatus) {
    throw new SpecProblem(
      "OpenAPI-схема требует headers авторизации.",
      authStatus,
      "SPEC_AUTH_REQUIRED",
    );
  }
  throw new SpecProblem(lastError, 422, "SPEC_INVALID");
}

function jsonPointer(root: AnyRecord, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((value, key) => asRecord(value)[key], root);
}

function mergeSchema(left: AnyRecord, right: AnyRecord): AnyRecord {
  const merged = { ...left, ...right };
  if (left.properties || right.properties) {
    merged.properties = { ...asRecord(left.properties), ...asRecord(right.properties) };
  }
  if (left.required || right.required) {
    merged.required = [...new Set([...(left.required ?? []), ...(right.required ?? [])])];
  }
  return merged;
}

function resolveSchema(
  raw: unknown,
  root: AnyRecord,
  stack = new Set<string>(),
): AnyRecord {
  let schema = asRecord(raw);
  let activeStack = stack;
  if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/")) {
    if (stack.has(schema.$ref)) return { type: "object", title: schema.$ref.split("/").at(-1) };
    const nextStack = new Set(stack).add(schema.$ref);
    schema = mergeSchema(resolveSchema(jsonPointer(root, schema.$ref), root, nextStack), schema);
    activeStack = nextStack;
    delete schema.$ref;
  }
  if (Array.isArray(schema.allOf)) {
    schema = schema.allOf.reduce(
      (result: AnyRecord, item: unknown) => mergeSchema(result, resolveSchema(item, root, stack)),
      { ...schema, allOf: undefined },
    );
  }
  const variant = schema.oneOf?.[0] ?? schema.anyOf?.[0];
  if (variant) schema = mergeSchema(resolveSchema(variant, root, activeStack), schema);
  if (Array.isArray(schema.oneOf)) {
    schema.oneOf = schema.oneOf.map((item: unknown) => resolveSchema(item, root, activeStack));
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf = schema.anyOf.map((item: unknown) => resolveSchema(item, root, activeStack));
  }
  if (schema.properties) {
    schema.properties = Object.fromEntries(
      Object.entries(asRecord(schema.properties)).map(([name, child]) => [
        name,
        resolveSchema(child, root, activeStack),
      ]),
    );
  }
  if (schema.items) schema.items = resolveSchema(schema.items, root, activeStack);
  return schema;
}

function exampleFromSchema(raw: unknown, root: AnyRecord, depth = 0): JsonValue {
  if (depth > 8) return null;
  const schema = resolveSchema(raw, root);
  if (schema.example !== undefined) return structuredClone(schema.example) as JsonValue;
  if (schema.default !== undefined) return structuredClone(schema.default) as JsonValue;
  if (schema.const !== undefined) return structuredClone(schema.const) as JsonValue;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0] as JsonValue;

  const inferredType = schema.type ?? (schema.properties ? "object" : undefined);
  if (inferredType === "object" || schema.properties) {
    return Object.fromEntries(
      Object.entries(asRecord(schema.properties)).map(([name, child]) => [
        name,
        exampleFromSchema(child, root, depth + 1),
      ]),
    );
  }
  if (inferredType === "array") {
    return [exampleFromSchema(schema.items, root, depth + 1)];
  }
  if (inferredType === "integer" || inferredType === "number") return schema.minimum ?? 0;
  if (inferredType === "boolean") return true;
  if (inferredType === "string") {
    if (schema.format === "uuid") return "00000000-0000-4000-8000-000000000000";
    if (schema.format === "date") return "2026-01-01";
    if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
    if (schema.format === "email") return "user@example.com";
    if (schema.format === "uri") return "https://example.com";
    return schema.title || "string";
  }
  return null;
}

function resolveObject(raw: unknown, root: AnyRecord): AnyRecord {
  const record = asRecord(raw);
  if (typeof record.$ref === "string") {
    return { ...asRecord(jsonPointer(root, record.$ref)), ...record, $ref: undefined };
  }
  return record;
}

function parameterExample(parameter: AnyRecord, root: AnyRecord): JsonValue {
  if (parameter.example !== undefined) return parameter.example as JsonValue;
  const firstExample = Object.values(asRecord(parameter.examples))[0];
  if (firstExample) {
    const resolved = resolveObject(firstExample, root);
    if (resolved.value !== undefined) return resolved.value as JsonValue;
  }
  return exampleFromSchema(parameter.schema, root);
}

function hasExplicitParameterExample(parameter: AnyRecord, root: AnyRecord): boolean {
  if (parameter.example !== undefined || Object.keys(asRecord(parameter.examples)).length > 0) {
    return true;
  }
  const schema = resolveSchema(parameter.schema, root);
  return (
    schema.example !== undefined ||
    schema.default !== undefined ||
    schema.const !== undefined ||
    (Array.isArray(schema.enum) && schema.enum.length > 0)
  );
}

function normalizeParameters(
  pathParameters: unknown,
  operationParameters: unknown,
  root: AnyRecord,
): { definitions: ParameterDefinition[]; values: RequestValues } {
  const combined = new Map<string, AnyRecord>();
  for (const raw of [...(Array.isArray(pathParameters) ? pathParameters : []), ...(Array.isArray(operationParameters) ? operationParameters : [])]) {
    const parameter = resolveObject(raw, root);
    if (["path", "query", "header"].includes(parameter.in) && parameter.name) {
      combined.set(`${parameter.in}:${parameter.name}`, parameter);
    }
  }
  const values: RequestValues = { path: {}, query: {}, headers: [], body: null };
  const definitions = [...combined.values()].map((parameter) => {
    const schema = resolveSchema(parameter.schema, root);
    const required = parameter.in === "path" || Boolean(parameter.required);
    const example = hasExplicitParameterExample(parameter, root)
      ? parameterExample(parameter, root)
      : null;
    if (parameter.in === "header") {
      const header = createHeaderEntry(parameter.name, String(example ?? ""));
      header.enabled = example !== null;
      values.headers.push(header);
    } else {
      values[parameter.in as "path" | "query"][parameter.name] = example;
    }
    return {
      name: parameter.name,
      location: parameter.in,
      required,
      description: parameter.description,
      type: schema.type ?? "string",
      format: schema.format,
      enum: Array.isArray(schema.enum) ? (structuredClone(schema.enum) as JsonValue[]) : undefined,
      example,
    } as ParameterDefinition;
  });
  return { definitions, values };
}

function bodyExamples(operation: AnyRecord, root: AnyRecord): Array<{ name: string; summary?: string; body: JsonValue }> {
  const requestBody = resolveObject(operation.requestBody, root);
  const content = asRecord(requestBody.content)["application/json"];
  if (!content) return [{ name: "По умолчанию", body: null }];
  const media = asRecord(content);
  const examples: Array<{ name: string; summary?: string; body: JsonValue }> = Object.entries(
    asRecord(media.examples),
  ).map(([name, raw]) => {
    const example = resolveObject(raw, root);
    return {
      name,
      summary: example.summary,
      body: structuredClone(example.value ?? exampleFromSchema(media.schema, root)) as JsonValue,
    };
  });
  if (media.example !== undefined) {
    examples.unshift({ name: "example", body: structuredClone(media.example) as JsonValue });
  }
  if (examples.length === 0) {
    examples.push({ name: "По умолчанию", body: exampleFromSchema(media.schema, root) });
  }
  return examples;
}

function normalizeServers(raw: unknown, documentUrl: string): NormalizedServer[] {
  const servers = Array.isArray(raw) && raw.length ? raw : [{ url: "/" }];
  return servers.flatMap((entry) => {
    const server = asRecord(entry);
    if (typeof server.url !== "string") return [];
    const variables = asRecord(server.variables);
    const substituted = server.url.replace(/\{([^}]+)\}/g, (_: string, name: string) =>
      String(asRecord(variables[name]).default ?? `{${name}}`),
    );
    let resolvedUrl = substituted;
    try {
      resolvedUrl = new URL(substituted, documentUrl).toString().replace(/\/$/, "");
    } catch {
      // Keep the OpenAPI value editable in the UI.
    }
    return [
      {
        url: server.url,
        resolvedUrl,
        description: server.description,
        variables,
      },
    ];
  });
}

function normalizeOperations(document: AnyRecord): NormalizedOperation[] {
  const operations: NormalizedOperation[] = [];
  for (const [path, rawPathItem] of Object.entries(asRecord(document.paths))) {
    const pathItem = resolveObject(rawPathItem, document);
    for (const method of METHODS) {
      if (!pathItem[method]) continue;
      const operation = resolveObject(pathItem[method], document);
      const { definitions, values } = normalizeParameters(
        pathItem.parameters,
        operation.parameters,
        document,
      );
      const examples = bodyExamples(operation, document).map((example) => ({
        name: example.name,
        summary: example.summary,
        values: { ...structuredClone(values), body: example.body },
      }));
      const requestBody = resolveObject(operation.requestBody, document);
      const bodySchema = asRecord(requestBody.content)["application/json"]?.schema;
      operations.push({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase() as HttpMethod,
        path,
        operationId: operation.operationId,
        summary: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
        description: operation.description,
        tags: Array.isArray(operation.tags) && operation.tags.length ? operation.tags : ["Без тега"],
        deprecated: Boolean(operation.deprecated),
        parameters: definitions,
        bodyRequired: Boolean(requestBody.required),
        bodySchema: bodySchema ? (resolveSchema(bodySchema, document) as JsonValue) : undefined,
        examples,
      });
    }
  }
  return operations.sort((a, b) => a.tags[0].localeCompare(b.tags[0]) || a.path.localeCompare(b.path));
}

export async function resolveSpec(
  inputUrl: string,
  headers: Record<string, string> = {},
): Promise<ResolvedSpec> {
  const { document, documentUrl } = await discoverOpenApi(inputUrl, headers);
  const operations = normalizeOperations(document);
  if (operations.length === 0) {
    throw new SpecProblem("В OpenAPI-схеме нет поддерживаемых HTTP-операций.", 422);
  }
  return {
    normalizationVersion: 2,
    sourceUrl: inputUrl,
    documentUrl,
    title: document.info?.title || "API",
    version: document.info?.version || "",
    openapiVersion: document.openapi,
    servers: normalizeServers(document.servers, documentUrl),
    operations,
    warnings: [],
  };
}
