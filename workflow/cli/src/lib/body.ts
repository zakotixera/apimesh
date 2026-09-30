import type { BodyMetadata, BodyParam, ExampleRequest, ExampleResponse } from './types';

export function mediaType(mime: string | undefined): string {
  return (mime ?? '').split(';', 1)[0].trim().toLowerCase();
}

export function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

export function isJsonMime(mime: string | undefined): boolean {
  const type = mediaType(mime);
  return type === 'application/json' || type.endsWith('+json');
}

export function decodeFormComponent(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

/** Preserve parameter order, duplicate names and empty values without collapsing to an object. */
export function encodeFormParams(params: BodyParam[]): string {
  return params.map((p) => {
    if (p.value === undefined || p.fileName !== undefined) throw new Error('Form parameter content was not fully captured');
    return `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`;
  }).join('&');
}

/** Transform fully captured multipart text while preserving boundaries and part headers. */
export function mapMultipart(text: string, mime: string,
  transform: (name: string, value: string, part: Pick<BodyParam, 'fileName' | 'contentType'>) => string,
): string {
  const boundary = /(?:^|;)\s*boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(mime);
  if (!boundary) throw new Error('Cannot safely process multipart without a boundary');
  const delimiter = `--${boundary[1] ?? boundary[2]}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markers = [...text.matchAll(new RegExp(`(?:^|\\r\\n)${delimiter}(--)?(?:\\r\\n|$)`, 'g'))];
  const last = markers[markers.length - 1];
  if (!last || markers[0].index !== 0 || last[1] !== '--' || last.index! + last[0].length !== text.length ||
      markers.slice(0, -1).some((marker) => marker[1] === '--')) {
    throw new Error('Cannot safely process incomplete multipart content');
  }
  let result = '';
  let offset = 0;
  for (let i = 0; i < markers.length - 1; i += 1) {
    const start = markers[i].index! + markers[i][0].length;
    const end = markers[i + 1].index!;
    const chunk = text.slice(start, end);
    const split = chunk.indexOf('\r\n\r\n');
    if (split < 0) {
      throw new Error('Malformed multipart part');
    }
    const headers = chunk.slice(0, split);
    const disposition = /(?:^|\r\n)content-disposition:\s*form-data;([^\r\n]*)/i.exec(headers);
    const name = disposition && /(?:^|;)\s*name="([^"\r\n]*)"/i.exec(disposition[1]);
    if (!name || /(?:^|\r\n)content-transfer-encoding:/i.test(headers)) {
      throw new Error('Multipart field name is missing or transfer encoding is unsupported');
    }
    const fileName = /(?:^|;)\s*filename="([^"\r\n]*)"/i.exec(disposition![1])?.[1];
    const contentType = /(?:^|\r\n)content-type:\s*([^\r\n]*)/i.exec(headers)?.[1];
    const valueStart = start + split + 4;
    result += text.slice(offset, valueStart) + transform(name[1], text.slice(valueStart, end), { fileName, contentType });
    offset = end;
  }
  return result + text.slice(offset);
}

export function requestMime(request: ExampleRequest): string | undefined {
  return request.bodyMeta?.mimeType ?? headerValue(request.headers, 'content-type');
}

/** Fill a missing Content-Type from capture metadata without rewriting observed headers. */
export function responseHeaders(response: ExampleResponse): Record<string, string> {
  const headers = { ...response.headers };
  if (headerValue(headers, 'content-type') === undefined && response.bodyMeta?.mimeType) {
    headers['content-type'] = response.bodyMeta.mimeType;
  }
  return headers;
}

/** Outgoing request text. A text representation must never be JSON-stringified again. */
export function requestBodyText(request: ExampleRequest): string | undefined {
  const { body, bodyMeta } = request;
  if (bodyMeta?.source === 'missing') throw new Error('Cannot replay an uncaptured request body');
  if (bodyMeta?.representation === 'base64') throw new Error('Cannot replay a binary request body as text');
  if (bodyMeta?.representation === 'params') {
    if (mediaType(requestMime(request)) !== 'application/x-www-form-urlencoded') {
      throw new Error('This request body requires multipart formdata rendering');
    }
    return encodeFormParams(body as BodyParam[]);
  }
  if (bodyMeta?.representation === 'text') return body as string;
  if (bodyMeta?.representation === 'json') return JSON.stringify(body);
  if (body === null || body === undefined) return undefined;
  if (typeof body === 'string' && !isJsonMime(requestMime(request))) return body;
  return JSON.stringify(body);
}

export interface CapturedBody {
  body: unknown;
  bodyMeta?: BodyMetadata;
}

/** Parse only for analysis; never replace the stored capture with this derived value. */
export function bodyForAnalysis(captured: CapturedBody): unknown {
  if (typeof captured.body === 'string' && captured.bodyMeta?.representation === 'text' &&
      (isJsonMime(captured.bodyMeta.mimeType) || /^\s*[[{]/.test(captured.body))) {
    try { return JSON.parse(captured.body); } catch { /* Keep non-JSON text as observed. */ }
  }
  return captured.body;
}
