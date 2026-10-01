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

export function parseHar(raw: unknown): HarLog {
  const doc = raw as HarLog;
  if (!doc || typeof doc !== 'object' || !doc.log || !Array.isArray(doc.log.entries)) {
    throw new Error('Invalid HAR: log.entries is missing');
  }
  return doc;
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
