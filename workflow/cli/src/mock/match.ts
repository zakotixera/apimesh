import { headerValue, isJsonMime, mapMultipart, mediaType, requestBodyText, requestMime } from '../lib/body';
import { jsonSignature } from '../lib/json-text';
import type { BodyParam, ExampleRequest } from '../lib/types';

/** Ignore order between names, but preserve duplicate values and their order. */
export function querySignature(query: URLSearchParams): string {
  const keys = [...new Set(query.keys())].sort();
  return JSON.stringify(keys.map((key) => [key, query.getAll(key)]));
}

export function bodyMatches(request: ExampleRequest, text: string, receivedMime: string | undefined): boolean {
  const mime = requestMime(request);
  if (request.bodyMeta?.source === 'missing') return false;
  if (request.bodyMeta?.representation === 'params' && mediaType(mime) === 'multipart/form-data') {
    const params = request.body as BodyParam[];
    if (params.some((p) => p.fileName !== undefined || p.value === undefined)) return false;
    const actual: BodyParam[] = [];
    try { mapMultipart(text, receivedMime ?? '', (name, value, part) => { actual.push({ name, value, ...part }); return value; }); }
    catch { return false; }
    return actual.length === params.length && actual.every((part, i) => part.name === params[i].name &&
      part.value === params[i].value && part.fileName === undefined &&
      mediaType(part.contentType ?? 'text/plain') === mediaType(params[i].contentType ?? 'text/plain'));
  }
  let expected: string | undefined;
  try { expected = requestBodyText(request); } catch { return false; }
  if (expected === undefined) return text === '';
  if (isJsonMime(mime) || request.bodyMeta?.representation === 'json' ||
      (!mime && typeof request.body !== 'string')) {
    try { return jsonSignature(text) === jsonSignature(expected); }
    catch { return text === expected; }
  }
  if (mediaType(mime) === 'application/x-www-form-urlencoded') {
    return querySignature(new URLSearchParams(text)) === querySignature(new URLSearchParams(expected));
  }
  return text === expected;
}

/** Compare recorded semantic headers; browser/transport headers are not a contract. */
export function headersMatch(request: ExampleRequest, actual: Record<string, string>, authHeaders: string[]): boolean {
  const mime = requestMime(request);
  if (mime && mediaType(mime) !== mediaType(headerValue(actual, 'content-type'))) return false;
  const names = new Set(['cookie', 'authorization', 'proxy-authorization', 'x-api-key', 'x-csrf-token', 'x-xsrf-token', ...authHeaders]);
  for (const name of names) {
    const expected = headerValue(request.headers, name);
    if (headerValue(actual, name) !== expected) return false;
  }
  return true;
}
