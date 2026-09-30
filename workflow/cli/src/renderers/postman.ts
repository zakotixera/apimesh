import { createHash } from 'node:crypto';
import type { GeneratedFile } from '../lib/types';
import type { LoadedCorpus, LoadedExample } from '../lib/canonical';
import type { Collection, Definition, Example, ExampleResponse, Variant } from '../lib/types';
import { compareCodepoint } from '../lib/stable-json';
import { stableStringify } from '../lib/stable-json';
import { headerValue, isJsonMime, mediaType, requestBodyText, requestMime, responseHeaders } from '../lib/body';
import type { BodyParam } from '../lib/types';
import { examplePath, placeholders, recordingLabel } from './presentation';

export const POSTMAN_COLLECTION_FILE =
  'postman/endpoints.postman_collection.json';
export const POSTMAN_ENVIRONMENT_FILE =
  'postman/replay.postman_environment.json';

const POSTMAN_SCHEMA =
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const LOCAL_REPLAY_BASE_URL = 'http://127.0.0.1:4010';

/** Create a deterministic UUID-shaped identifier from a SHA-1 seed. */
function deterministicGuid(seed: string): string {
  const hex = createHash('sha1').update(seed, 'utf8').digest('hex').slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/** Common HTTP reason phrases; unknown statuses use an empty string. */
const REASON_PHRASES: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  206: 'Partial Content',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

interface PostmanHeader {
  key: string;
  value: string;
  type: string;
}

interface PostmanQueryItem {
  key: string;
  value: string;
}

interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query: PostmanQueryItem[];
}

interface PostmanBody {
  mode: string;
  raw?: string;
  options?: { raw: { language: string } };
  formdata?: Array<{ key: string; value: string; type: 'text'; contentType?: string }>;
}

interface PostmanRequest {
  description?: string;
  method: string;
  header: PostmanHeader[];
  url: PostmanUrl;
  body?: PostmanBody;
}

interface PostmanSavedResponse {
  name: string;
  originalRequest: PostmanRequest;
  status: string;
  code: number;
  header: PostmanHeader[];
  cookie: unknown[];
  body: string;
  _postman_previewlanguage: string;
}

interface PostmanEvent {
  listen: string;
  script: { type: string; exec: string[] };
}

interface PostmanRequestItem {
  name: string;
  request: PostmanRequest;
  response: PostmanSavedResponse[];
  event: PostmanEvent[];
}

interface PostmanFolder {
  name: string;
  item: PostmanRequestItem[];
}

/** Convert headers to Postman entries in deterministic key order. */
function toHeaders(headers: Record<string, string> | undefined): PostmanHeader[] {
  return Object.keys(headers ?? {})
    .sort(compareCodepoint)
    .map((key) => ({ key, value: (headers as Record<string, string>)[key], type: 'text' }));
}

/** Preserve captured query order and encoding in Postman URL entries. */
function parseQuery(search: string): PostmanQueryItem[] {
  if (search === '') return [];
  return search
    .replace(/^\?/, '')
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return { key: pair, value: '' };
      return { key: pair.slice(0, eq), value: pair.slice(eq + 1) };
    });
}

/** Replace the captured URL origin with the baseUrl variable. */
function toPostmanUrl(urlText: string, baseVariable: string): PostmanUrl {
  const url = new URL(urlText);
  return {
    raw: `{{${baseVariable}}}${url.pathname}${url.search}`,
    host: [`{{${baseVariable}}}`],
    path: url.pathname.split('/').filter((segment) => segment.length > 0),
    query: parseQuery(url.search),
  };
}

/** Convert an example request, also reused by its saved response. */
function toRequest(ex: Example, baseVariable: string): PostmanRequest {
  const mime = requestMime(ex.request);
  const request: PostmanRequest = {
    method: ex.request.method,
    // Transport headers must describe the outgoing body, not the captured bytes.
    header: toHeaders(ex.request.headers).filter((h) => !h.key.startsWith(':') && !['content-length', 'host', 'transfer-encoding'].includes(h.key.toLowerCase())),
    url: toPostmanUrl(ex.request.url, baseVariable),
  };
  if (ex.request.bodyMeta?.representation === 'params' && mediaType(mime) === 'multipart/form-data') {
    const params = ex.request.body as BodyParam[];
    request.body = { mode: 'formdata', formdata: params.map((param) => {
      if (param.fileName !== undefined || param.value === undefined) {
        throw new Error(`Cannot export uncaptured multipart file content: ${param.name}`);
      }
      return { key: param.name, value: param.value, type: 'text', contentType: param.contentType };
    }) };
    // Postman generates the boundary for params-only captures.
    request.header = request.header.filter((h) => h.key.toLowerCase() !== 'content-type');
  } else {
    const text = requestBodyText(ex.request);
    if (text !== undefined) {
      request.body = { mode: 'raw', raw: text };
      if (isJsonMime(mime) || ex.request.bodyMeta?.representation === 'json' ||
          (!mime && typeof ex.request.body !== 'string')) {
        request.body.options = { raw: { language: 'json' } };
      }
    }
    if (mime && !request.header.some((h) => h.key.toLowerCase() === 'content-type')) {
      request.header.push({ key: 'Content-Type', value: mime, type: 'text' });
    }
  }
  return request;
}

/** Render saved response text according to its stored representation. */
function stringifyResponseBody(response: ExampleResponse): string {
  const { body, bodyMeta } = response;
  if (bodyMeta?.source === 'missing') throw new Error('Cannot export an uncaptured response body');
  if (bodyMeta?.representation === 'json') return JSON.stringify(body, null, 2);
  if (body === null || body === undefined) return '';
  if (typeof body === 'object') return JSON.stringify(body, null, 2);
  return String(body);
}

/** Assert the selected recording, HTTP status and business code. */
function buildTestExec(http: number, code: number | null, recording: string): string[] {
  const codeLiteral = code === null ? 'null' : String(code);
  return [
    'if (pm.environment.get("apicReplay") === "true") {',
    `  pm.test("matched recording", function () { pm.expect(pm.response.headers.get("x-apic-replay-match")).to.eql(${JSON.stringify(recording)}); });`,
    '}',
    `pm.test("HTTP ${http}", function () { pm.response.to.have.status(${http}); });`,
    `pm.test("business code ${codeLiteral}", function () {`,
    '  var body = null;',
    '  try { body = pm.response.json(); } catch (e) { body = null; }',
    '  var code = null;',
    "  if (body && typeof body === 'object') {",
    "    if (typeof body.code === 'number') code = body.code;",
    "    else if (typeof body.errno === 'number') code = body.errno;",
    '  }',
    `  pm.expect(code).to.eql(${codeLiteral});`,
    '});',
  ];
}

/** Render an example as a selectable request with saved response and assertions. */
function toRequestItem(
  ex: LoadedExample,
  definition: Definition,
  variant: Variant,
  baseVariable: string,
  label: string,
  sourcePath: string,
): PostmanRequestItem {
  const request = toRequest(ex.data, baseVariable);
  request.description = `${variant.status}\n\nCaptured origin: ${new URL(ex.data.request.url).origin}\n\nCanonical recording: ${sourcePath}\n\nSelect the local replay environment for recorded behavior. Masked placeholders stay unchanged during replay; for live use, supply your own values in a separate environment. Requiredness and authentication requirements are not inferred from this capture.`;
  const recording = encodeURIComponent(`${definition.api}:${ex.name}`);
  const savedHeaders = responseHeaders(ex.data.response);
  const savedMime = headerValue(savedHeaders, 'content-type');
  const preview = isJsonMime(savedMime) || ex.data.response.bodyMeta?.representation === 'json' ? 'json' :
    mediaType(savedMime).includes('xml') ? 'xml' : mediaType(savedMime) === 'text/html' ? 'html' : 'text';
  return {
    name: `${variant.variant} · ${label}`,
    request,
    response: [
      {
        name: ex.name,
        originalRequest: request,
        status: REASON_PHRASES[ex.data.response.status] ?? '',
        code: ex.data.response.status,
        // HAR body text has already been decoded; saved responses must describe that text.
        header: toHeaders(savedHeaders).filter((h) => !h.key.startsWith(':') && !['content-length', 'content-encoding', 'transfer-encoding'].includes(h.key.toLowerCase())),
        cookie: [],
        body: stringifyResponseBody(ex.data.response),
        _postman_previewlanguage: preview,
      },
    ],
    event: [
      {
        listen: 'prerequest',
        script: { type: 'text/javascript', exec: [
          'if (pm.environment.get("apicReplay") === "true") {',
          `  pm.variables.set(${JSON.stringify(baseVariable)}, pm.environment.get("baseUrl"));`,
          `  pm.request.headers.upsert({ key: "x-apic-replay-example", value: ${JSON.stringify(recording)} });`,
          '} else {',
          '  pm.request.headers.remove("x-apic-replay-example");',
          '}',
        ] },
      },
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: buildTestExec(ex.data.response.status, ex.data.code, recording),
        },
      },
    ],
  };
}

/** Render canonical examples into Postman Collection v2.1 and environment files. */
export function renderPostman(corpus: LoadedCorpus): GeneratedFile[] {
  const collection: Collection = corpus.collection;
  const recordedOrigins = [...new Set(corpus.apis.flatMap((api) => api.examples.map((ex) => new URL(ex.data.request.url).origin)))].sort(compareCodepoint);
  const usedNames = new Set(['baseUrl', 'apicReplay', ...corpus.apis.flatMap((api) => api.examples.flatMap((ex) => placeholders(ex.data.request)))]);
  const baseVariables = new Map<string, string>();
  for (const origin of recordedOrigins) {
    const label = Object.keys(collection.bases).sort(compareCodepoint).find((key) => {
      try { return new URL(collection.bases[key]).origin === origin; } catch { return false; }
    });
    const stem = `baseUrl_${encodeURIComponent(label ?? new URL(origin).host)}`;
    let key = stem;
    for (let suffix = 2; usedNames.has(key); suffix += 1) key = `${stem}_${suffix}`;
    usedNames.add(key);
    baseVariables.set(origin, key);
  }

  const folders: PostmanFolder[] = [...corpus.apis]
    .sort((a, b) => compareCodepoint(a.definition.api, b.definition.api))
    .map((api) => {
      const variantByExample = new Map<string, Variant>();
      for (const variant of api.definition.responses) {
        for (const exampleName of variant.examples ?? []) {
          variantByExample.set(exampleName, variant);
        }
      }
      const items = api.examples
        .filter((ex) => variantByExample.has(ex.name))
        .map((ex, index) => toRequestItem(ex, api.definition, variantByExample.get(ex.name) as Variant,
          baseVariables.get(new URL(ex.data.request.url).origin)!, recordingLabel(ex, index), examplePath(api, ex)))
        .sort((a, b) => compareCodepoint(a.name, b.name));
      return { name: `${api.definition.name} (${api.definition.api})`, item: items };
    });

  const postmanCollection = {
    info: {
      _postman_id: deterministicGuid(collection.name),
      name: collection.name,
      schema: POSTMAN_SCHEMA,
      description: 'Recorded requests with per-origin base URLs. For local replay, run npm run apic -- serve from workflow/cli and select the imported local replay environment. For live use, use a separate environment with apicReplay disabled and supply your own masked values. See ../docs/usage.md for setup and placeholder guidance.',
    },
    item: folders,
    variable: [...baseVariables].map(([origin, key]) => ({ key, value: origin, type: 'string' })),
  };

  const environment = {
    id: deterministicGuid(`${collection.name}:env`),
    name: `${collection.name} · local replay`,
    values: [
      {
        key: 'baseUrl',
        value: LOCAL_REPLAY_BASE_URL,
        enabled: true,
        type: 'default',
      },
      { key: 'apicReplay', value: 'true', enabled: true, type: 'default' },
      ...[...new Set(corpus.apis.flatMap((api) => api.examples.flatMap((ex) => placeholders(ex.data.request))))]
        .filter((key) => !['baseUrl', 'apicReplay'].includes(key)).sort(compareCodepoint)
        .map((key) => ({ key, value: '', enabled: false, disabled: true, type: 'secret' })),
    ],
    _postman_variable_scope: 'environment',
  };

  return [
    { path: POSTMAN_COLLECTION_FILE, content: stableStringify(postmanCollection) },
    { path: POSTMAN_ENVIRONMENT_FILE, content: stableStringify(environment) },
  ];
}
