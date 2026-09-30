/** TypeScript projections of canonical data, with optional CLI capture metadata. Canonical formats are defined in repository schemas; validation lives in validate.ts and lib/schemas.ts. */

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type AuthLevel = 'none' | 'optional' | 'required';

export type ParamType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object';

/** Structured endpoint identity; a combined method/path string is not supported. */
export interface Endpoint {
  method: HttpMethod;
  path: string;
}

/** Parameter location is implied by its enclosing request section. */
export interface Param {
  type?: ParamType;
  required?: boolean;
  /** A value observed in one capture, not an API-guaranteed default. */
  default?: unknown;
  desc: string;
}

/** Query/body sections describe parameters; headers/cookies retain observed values. */
export interface RequestSpec {
  query?: Record<string, Param>;
  body?: Record<string, Param>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

/** Supported response body node types. */
export type BodyNodeType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null';

/** A response type-tree node, without example values or descriptions. */
export interface BodyNode {
  /** A single observed type or a union of observed types. */
  type: BodyNodeType | BodyNodeType[];
  /** Object property names mapped to child nodes. */
  properties?: Record<string, BodyNode>;
  /** Array item schema; null means the captured array had no known item shape. */
  items?: BodyNode | null;
}

/** Authoritative response variants, keyed by variant slug. */
export interface Variant {
  variant: string;
  status: string;
  codes: number[];
  http: number[];
  /** Observed public response headers; defaults to an empty object. */
  headers?: Record<string, string>;
  /** Response body type tree; null means no trustworthy shape is available. */
  schema: BodyNode | null;
  examples?: string[];
}

/** apis/<path>/definition.json */
export interface Definition {
  api: string;
  name: string;
  endpoint: Endpoint;
  source: string;
  tags?: string[];
  auth?: AuthLevel;
  request?: RequestSpec;
  responses: Variant[];
}

/** Capture metadata only; body data is stored once. Legacy examples may omit this. */
export interface BodyMetadata {
  mimeType?: string;
  representation: 'text' | 'json' | 'params' | 'base64';
  source: 'text' | 'params' | 'missing';
}

export interface BodyParam {
  name: string;
  value?: string;
  fileName?: string;
  contentType?: string;
}

/** example.request */
export interface ExampleRequest {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body: unknown;
  bodyMeta?: BodyMetadata;
}

/** example.response */
export interface ExampleResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
  bodyMeta?: BodyMetadata;
}

/** apis/<path>/examples/<http>.<code|http-only>.<slug>.json */
export interface Example {
  http: number;
  /** The body code, falling back to errno; null denotes an HTTP-only observation. */
  code: number | null;
  captured: string;
  origin?: string;
  account: string;
  request: ExampleRequest;
  response: ExampleResponse;
}

export interface AuthProfile {
  kind: 'cookie' | 'header';
  name: string;
  doc: string;
}

export interface CollectionEntry {
  version: string;
  date: string;
  notes: string;
}

/** collection.json */
export interface Collection {
  name: string;
  version: string;
  bases: Record<string, string>;
  auth?: Record<string, AuthProfile>;
  changelog: CollectionEntry[];
}

export interface GlossaryDomain {
  slug: string;
  meaning: string;
  'known-codes'?: number[];
  'http-shapes'?: number[];
}

/** glossary.json */
export interface Glossary {
  domains: GlossaryDomain[];
}

/** YAML extraction drafts consumed by classification. Each endpoint has its own file. */
export interface ExtractFrame {
  http: number;
  /** Business code from code or errno; null denotes an HTTP-only frame. */
  code: number | null;
  captured: string;
  origin?: string;
  account: string;
  request: ExampleRequest;
  response: ExampleResponse;
}

export interface ExtractEndpoint {
  method: HttpMethod;
  path: string;
  frames: ExtractFrame[];
}

export interface ExtractDoc {
  version: 1;
  generated_from: string[];
  endpoints: ExtractEndpoint[];
}

/* ------------------------------------------------------------------ */
/** Disposable workflow reports are not a frozen format; keep serialization deterministic for reproducible diagnostics. */
/* ------------------------------------------------------------------ */

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  /** Optional repository-relative file path. */
  file?: string;
  /** Logical location, such as responses[1].examples[0]. */
  path?: string;
}

export interface ValidationReport {
  command: 'validate';
  ok: boolean;
  errors: number;
  warnings: number;
  issues: Issue[];
}

export interface ExtractReport {
  command: 'extract';
  inputs: string[];
  endpoints: Array<{
    method: HttpMethod;
    path: string;
    frames: number;
    duplicates: number;
    output: string;
  }>;
  frames: number;
  duplicates: number;
}

/** A renderer output path relative to dist, such as docs/summary.md. */
export interface GeneratedFile {
  path: string;
  content: string;
}

export interface DriftChange {
  api: string;
  kind: 'breaking' | 'non-breaking' | 'noise';
  summary: string;
  detail: string;
}

export interface DriftReport {
  command: 'drift';
  baseline: string[];
  changes: DriftChange[];
  breaking: number;
  nonBreaking: number;
  noise: number;
}
