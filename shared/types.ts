import { createId } from "./id";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface HeaderEntry {
  id: string;
  name: string;
  value: string;
  secret: boolean;
  enabled: boolean;
}

export interface ServerVariable {
  default: string;
  description?: string;
  enum?: string[];
}

export interface NormalizedServer {
  url: string;
  resolvedUrl: string;
  description?: string;
  variables?: Record<string, ServerVariable>;
}

export interface ParameterDefinition {
  name: string;
  location: "path" | "query" | "header";
  required: boolean;
  description?: string;
  type: string;
  format?: string;
  enum?: JsonValue[];
  example: JsonValue;
}

export interface RequestValues {
  path: Record<string, JsonValue>;
  query: Record<string, JsonValue>;
  headers: HeaderEntry[];
  body: JsonValue;
}

export interface OperationExample {
  name: string;
  summary?: string;
  values: RequestValues;
}

export interface NormalizedOperation {
  key: string;
  method: HttpMethod;
  path: string;
  operationId?: string;
  summary: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  parameters: ParameterDefinition[];
  bodyRequired: boolean;
  bodySchema?: JsonValue;
  examples: OperationExample[];
}

export interface ResolvedSpec {
  normalizationVersion?: number;
  sourceUrl: string;
  documentUrl: string;
  title: string;
  version: string;
  openapiVersion: string;
  servers: NormalizedServer[];
  operations: NormalizedOperation[];
  warnings: string[];
}

export interface GeneratorTemplate {
  target: string;
  enabled: boolean;
  template: string;
}

export interface OperationTemplate {
  operationKey: string;
  exampleName: string;
  values: RequestValues;
  generators: GeneratorTemplate[];
  updatedAt: string;
}

export interface RequestSnapshot {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: JsonValue;
}

export interface ResponseSnapshot {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyKind: "json" | "text" | "empty";
}

export interface RunRecord {
  id: string;
  startedAt: string;
  durationMs: number;
  curl: string;
  request: RequestSnapshot;
  response?: ResponseSnapshot;
  error?: string;
}

export interface RequestCard {
  id: string;
  name: string;
  operationKey: string;
  operationSnapshot: Pick<
    NormalizedOperation,
    "key" | "method" | "path" | "summary" | "description"
  >;
  values: RequestValues;
  generators: GeneratorTemplate[];
  localHeaders: HeaderEntry[];
  headerSetId?: string;
  collapsed: boolean;
  stale: boolean;
  history: RunRecord[];
}

export interface FieldReference {
  cardId: string;
  target: string;
}

export interface FieldLink {
  id: string;
  source: FieldReference;
  target: FieldReference;
}

export interface HeaderSetNode {
  id: string;
  name: string;
  headers: HeaderEntry[];
}

export type ScenarioColor = "teal" | "purple" | "amber" | "blue";

export interface ScenarioGroupNode {
  id: string;
  name: string;
  color: ScenarioColor;
}

export interface TextCardNode {
  id: string;
  title: string;
  text: string;
  color: ScenarioColor;
}

export interface CanvasArrow {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface CanvasNodeLayout {
  id: string;
  kind: "request" | "headers" | "group" | "note";
  entityId: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface CanvasDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  spec?: ResolvedSpec;
  specInputUrl: string;
  baseUrl: string;
  selectedServerUrl: string;
  templates: Record<string, OperationTemplate>;
  cards: Record<string, RequestCard>;
  headerSets: Record<string, HeaderSetNode>;
  scenarioGroups: Record<string, ScenarioGroupNode>;
  textCards: Record<string, TextCardNode>;
  fieldLinks: FieldLink[];
  arrows: CanvasArrow[];
  layouts: CanvasNodeLayout[];
}

export interface SpecResolveRequest {
  url: string;
  headers?: Record<string, string>;
}

export interface ExecuteRequest {
  baseUrl: string;
  method: HttpMethod;
  pathTemplate: string;
  path: Record<string, JsonValue>;
  query: Record<string, JsonValue>;
  headers: Record<string, string>;
  body: JsonValue;
  timeoutMs?: number;
}

export interface ExecuteResponse extends RunRecord {}

export interface ApiErrorPayload {
  error: string;
  status?: number;
  code?: "SPEC_AUTH_REQUIRED" | "SPEC_INVALID" | "FETCH_FAILED" | "BAD_REQUEST";
}

export function createHeaderEntry(name = "", value = ""): HeaderEntry {
  return {
    id: createId(),
    name,
    value,
    secret: isSecretHeader(name),
    enabled: true,
  };
}

export function isSecretHeader(name: string): boolean {
  return /authorization|api[-_]?key|token|secret|cookie/i.test(name);
}

export function emptyValues(): RequestValues {
  return { path: {}, query: {}, headers: [], body: null };
}
