import type { BodyParam, Headers, RequestHttpMetadata, ResponseHttpMetadata } from './types';
import { type CapturedBody, isJsonMime, mediaType } from './body';

/** HAR 1.2 parsing and normalization. Security masking is applied separately. */

export interface HarHeader {
  name: string;
  value: string;
}

export interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: BodyParam[];
}

export interface HarContent {
  mimeType?: string;
  text?: string;
  encoding?: string;
}

export interface HarRequest {
  httpVersion?: string;
  method: string;
  url: string;
  headers?: HarHeader[];
  postData?: HarPostData;
}

export interface HarResponse {
  httpVersion?: string;
  status: number;
  headers?: HarHeader[];
  content?: HarContent;
}

export interface HarEntry {
  startedDateTime: string;
  time?: number;
  request: HarRequest;
  response: HarResponse;
  /** Optional DevTools capture-origin extension, such as web or app. */
  _origin?: string;
}

export interface HarLog {
  log: {
    version: string;
    creator?: { name?: string; version?: string };
    entries: HarEntry[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(path: string, detail: string): never {
  throw new Error(`Invalid HAR: ${path} ${detail}`);
}

function validateHeaders(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) invalid(path, 'must be an array');
  value.forEach((header, index) => {
    if (!isRecord(header) || typeof header.name !== 'string' || typeof header.value !== 'string') {
      invalid(`${path}[${index}]`, 'must contain string name and value');
    }
  });
}

function validatePostData(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isRecord(value)) invalid(path, 'must be an object');
  for (const key of ['mimeType', 'text'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') invalid(`${path}.${key}`, 'must be a string');
  }
  if (value.params !== undefined) {
    if (!Array.isArray(value.params)) invalid(`${path}.params`, 'must be an array');
    value.params.forEach((param, index) => {
      if (!isRecord(param) || typeof param.name !== 'string') invalid(`${path}.params[${index}]`, 'must contain a string name');
      for (const key of ['value', 'fileName', 'contentType'] as const) {
        if (param[key] !== undefined && typeof param[key] !== 'string') invalid(`${path}.params[${index}].${key}`, 'must be a string');
      }
    });
  }
}

function validateContent(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isRecord(value)) invalid(path, 'must be an object');
  for (const key of ['mimeType', 'text', 'encoding'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') invalid(`${path}.${key}`, 'must be a string');
  }
}

function validateEntry(value: unknown, index: number): void {
  const entryPath = `log.entries[${index}]`;
  if (!isRecord(value)) invalid(entryPath, 'must be an object');
  if (typeof value.startedDateTime !== 'string') invalid(`${entryPath}.startedDateTime`, 'must be a string');
  if (value.time !== undefined && (typeof value.time !== 'number' || !Number.isFinite(value.time))) {
    invalid(`${entryPath}.time`, 'must be a finite number');
  }
  if (value._origin !== undefined && typeof value._origin !== 'string') invalid(`${entryPath}._origin`, 'must be a string');

  if (!isRecord(value.request)) invalid(`${entryPath}.request`, 'must be an object');
  if (typeof value.request.method !== 'string') invalid(`${entryPath}.request.method`, 'must be a string');
  if (typeof value.request.url !== 'string') invalid(`${entryPath}.request.url`, 'must be a string');
  if (value.request.httpVersion !== undefined && typeof value.request.httpVersion !== 'string') {
    invalid(`${entryPath}.request.httpVersion`, 'must be a string');
  }
  validateHeaders(value.request.headers, `${entryPath}.request.headers`);
  validatePostData(value.request.postData, `${entryPath}.request.postData`);

  if (!isRecord(value.response)) invalid(`${entryPath}.response`, 'must be an object');
  if (typeof value.response.status !== 'number' || !Number.isInteger(value.response.status)) {
    invalid(`${entryPath}.response.status`, 'must be an integer');
  }
  if (value.response.httpVersion !== undefined && typeof value.response.httpVersion !== 'string') {
    invalid(`${entryPath}.response.httpVersion`, 'must be a string');
  }
  validateHeaders(value.response.headers, `${entryPath}.response.headers`);
  validateContent(value.response.content, `${entryPath}.response.content`);
}

export function parseHar(raw: unknown): HarLog {
  if (!isRecord(raw) || !isRecord(raw.log) || !Array.isArray(raw.log.entries)) {
    throw new Error('Invalid HAR: log.entries is missing');
  }
  raw.log.entries.forEach(validateEntry);
  return raw as unknown as HarLog;
}

/** Preserve recorded protocol labels (including h2/h3); omit unavailable values. */
export function requestHttpMeta(request: HarRequest): RequestHttpMetadata {
  return typeof request.httpVersion === 'string' && request.httpVersion.trim().length > 0
    ? { httpVersion: request.httpVersion } : {};
}

export function responseHttpMeta(entry: HarEntry): ResponseHttpMetadata {
  return {
    ...(typeof entry.response.httpVersion === 'string' && entry.response.httpVersion.trim().length > 0
      ? { httpVersion: entry.response.httpVersion } : {}),
    ...(typeof entry.time === 'number' && Number.isFinite(entry.time) && entry.time >= 0
      ? { entryTime: entry.time } : {}),
  };
}

/** Preserve repeated header values instead of overwriting earlier observations. */
export function headersToMap(headers: HarHeader[] | undefined): Headers {
  const out: Headers = Object.create(null);
  for (const h of headers ?? []) {
    if (h && typeof h.name === 'string') {
      const previous = out[h.name];
      const value = h.value ?? '';
      out[h.name] = previous === undefined ? value : [...(Array.isArray(previous) ? previous : [previous]), value];
    }
  }
  return out;
}

/** Legacy content accessor: decode base64 and parse JSON when possible. */
export function bodyFromContent(content: HarContent | undefined): unknown {
  if (!content || content.text === undefined || content.text === '') return null;
  let text = content.text;
  if (content.encoding === 'base64') {
    text = Buffer.from(text, 'base64').toString('utf8');
  }
  const mime = (content.mimeType ?? '').toLowerCase();
  const looksJson = mime.includes('json') || /^\s*[[{]/.test(text);
  if (looksJson) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/** Preserve request text or ordered HAR params; never invent missing file content. */
export function capturePostData(postData: HarPostData | undefined, fallbackMime?: string): CapturedBody {
  if (!postData) return { body: null };
  const mimeType = postData.mimeType || fallbackMime;
  if (postData.text !== undefined) {
    return { body: postData.text, bodyMeta: { mimeType, representation: 'text', source: 'text' } };
  }
  if (postData.params !== undefined) {
    const params = postData.params.map(({ name, value, fileName, contentType }) => ({
      name, ...(value !== undefined ? { value } : {}),
      ...(fileName !== undefined ? { fileName } : {}),
      ...(contentType !== undefined ? { contentType } : {}),
    }));
    return { body: params, bodyMeta: { mimeType, representation: 'params', source: 'params' } };
  }
  return { body: null, bodyMeta: { mimeType, representation: 'text', source: 'missing' } };
}

/** Retain MIME and binary encoding without rewriting captured text or numeric literals. */
export function captureContent(content: HarContent | undefined, fallbackMime?: string): CapturedBody {
  if (!content) return { body: null };
  const mimeType = content.mimeType || fallbackMime;
  if (content.text === undefined) {
    return { body: null, bodyMeta: { mimeType, representation: 'text', source: 'missing' } };
  }
  const type = mediaType(mimeType);
  const textual = type.startsWith('text/') || isJsonMime(type) || /(?:xml|javascript|x-www-form-urlencoded)/.test(type);
  if (content.encoding === 'base64' && !textual) {
    return { body: content.text, bodyMeta: { mimeType, representation: 'base64', source: 'text' } };
  }
  // Text HAR payloads are Unicode; base64 text must not be decoded with silent replacement.
  let text = content.text;
  if (content.encoding === 'base64') {
    const charset = /(?:^|;)\s*charset\s*=\s*"?([^;"\s]+)/i.exec(mimeType ?? '')?.[1] ?? 'utf-8';
    if (!/^utf-?8$/i.test(charset)) throw new Error(`Unsupported captured text charset: ${charset}`);
    try { text = new TextDecoder(charset, { fatal: true }).decode(Buffer.from(content.text, 'base64')); }
    catch { throw new Error(`Cannot decode captured text using charset ${charset}`); }
  }
  return { body: text, bodyMeta: { mimeType, representation: 'text', source: 'text' } };
}

/** Compatibility accessor; use capturePostData for metadata-aware exports. */
export function bodyFromPostData(postData: HarPostData | undefined): unknown {
  if (!postData || postData.text === undefined) return capturePostData(postData).body;
  const mime = (postData.mimeType ?? '').toLowerCase();
  if (mime.includes('json') || /^\s*[[{]/.test(postData.text)) {
    try {
      return JSON.parse(postData.text);
    } catch {
      return postData.text;
    }
  }
  return postData.text;
}

/** Read a finite numeric business code from code, then errno; otherwise return null. */
export function codeFromBody(body: unknown): number | null {
  // New captures preserve JSON text; legacy examples store parsed JSON objects.
  if (typeof body === 'string' && /^\s*\{/.test(body)) {
    try { return codeFromBody(JSON.parse(body)); } catch { return null; }
  }
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const rec = body as Record<string, unknown>;
    for (const key of ['code', 'errno'] as const) {
      const value = rec[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  return null;
}

/** Normalize a capture timestamp while retaining an existing timezone offset. */
export function normalizeCaptured(startedDateTime: string): string {
  if (typeof startedDateTime === 'string' && startedDateTime.length > 0) {
    const parsed = new Date(startedDateTime);
    if (!Number.isNaN(parsed.getTime())) {
      // Preserve timezone-bearing timestamps without rewriting their offset.
      if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(startedDateTime)) return startedDateTime;
      return parsed.toISOString();
    }
  }
  throw new Error(`Invalid capture timestamp: ${String(startedDateTime)}`);
}

/** Return the URL pathname for endpoint grouping. */
export function staticPathOf(url: string): string {
  const u = new URL(url);
  return u.pathname;
}
