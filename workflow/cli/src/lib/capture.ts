import { exists, readJson } from './fsx';
import {
  captureContent,
  capturePostData,
  codeFromBody,
  headersToMap,
  normalizeCaptured,
  parseHar,
  requestHttpMeta,
  responseHttpMeta,
  type HarEntry,
  type HarLog,
} from './har';
import { headerValue } from './body';
import { queryFromUrl } from './http-fields';
import { maskConfigFromCollection, type MaskConfig } from './mask';
import {
  defaultSecurityMaskerConfig,
  maskCapturedBody,
  maskHeadersSecure,
  maskUrlSecure,
  type SecurityMaskerConfig,
} from './security-masker';
import type { Collection, ExtractFrame, HttpMethod } from './types';

export const HTTP_METHODS: readonly HttpMethod[] = [
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
];

export function asHttpMethod(raw: string, url: string): HttpMethod {
  const method = raw.toUpperCase();
  if (!(HTTP_METHODS as readonly string[]).includes(method)) {
    throw new Error(`Unsupported HTTP method: ${raw} (URL: ${url})`);
  }
  return method as HttpMethod;
}

/** Resolve a capture origin by matching its host to collection.bases. */
export function detectOrigin(url: string, collection: Collection): string | undefined {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return undefined;
  }
  for (const [key, base] of Object.entries(collection.bases)) {
    try {
      if (new URL(base).host === host) return key;
    } catch {
      // Invalid collection bases are reported by canonical validation.
    }
  }
  return undefined;
}

export function readHar(file: string): HarLog {
  if (!exists(file)) throw new Error(`HAR file not found: ${file}`);
  let raw: unknown;
  try {
    raw = readJson(file);
  } catch (err) {
    throw new Error(`Cannot read HAR ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseHar(raw);
}

export interface CaptureFrameOptions {
  account?: string;
  forcedOrigin?: string;
}

/** Build the one sanitized capture representation shared by extract and drift. */
export function buildCaptureFrame(
  entry: HarEntry,
  collection: Collection,
  cfg: MaskConfig = maskConfigFromCollection(collection),
  sec: SecurityMaskerConfig = defaultSecurityMaskerConfig(),
  options: CaptureFrameOptions = {},
): ExtractFrame {
  const method = asHttpMethod(entry.request.method, entry.request.url);
  const status = entry.response.status;
  const responseHeaders = maskHeadersSecure(headersToMap(entry.response.headers), cfg, sec) ?? {};
  const requestHeaders = maskHeadersSecure(headersToMap(entry.request.headers), cfg, sec) ?? {};
  const url = maskUrlSecure(entry.request.url, cfg, sec);
  const response = maskCapturedBody(
    captureContent(entry.response.content, headerValue(responseHeaders, 'content-type')),
    cfg,
    sec,
  );
  const request = maskCapturedBody(
    capturePostData(entry.request.postData, headerValue(requestHeaders, 'content-type')),
    cfg,
    sec,
  );
  const origin = options.forcedOrigin ?? (
    typeof entry._origin === 'string' && entry._origin.length > 0
      ? entry._origin
      : detectOrigin(entry.request.url, collection)
  );
  return {
    http: status,
    code: codeFromBody(response.body),
    captured: normalizeCaptured(entry.startedDateTime),
    ...(origin !== undefined ? { origin } : {}),
    account: options.account ?? 'anonymous',
    request: {
      httpMeta: requestHttpMeta(entry.request),
      method,
      url,
      headers: requestHeaders,
      query: queryFromUrl(url),
      body: request.body,
      ...(request.bodyMeta ? { bodyMeta: request.bodyMeta } : {}),
    },
    response: {
      httpMeta: responseHttpMeta(entry),
      status,
      headers: responseHeaders,
      body: response.body,
      ...(response.bodyMeta ? { bodyMeta: response.bodyMeta } : {}),
    },
  };
}

/** Grouping always uses the static pathname, independent of query masking. */
export function pathnameOf(url: string, action: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    throw new Error(`Cannot ${action} an invalid URL: ${url}`);
  }
}
