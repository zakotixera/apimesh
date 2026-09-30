import type { GeneratedFile, Param } from '../lib/types';
import type { LoadedApi, LoadedCorpus, LoadedExample } from '../lib/canonical';
import { readText } from '../lib/fsx';
import { stableStringify } from '../lib/stable-json';
import { requestBodyText, requestMime } from '../lib/body';
import { cell, definitionPath, examplePath, linkFrom, origins, placeholders, recordingLabel } from './presentation';

function fence(text: string, language = 'json'): string[] {
  const marker = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return [marker + language, text, marker];
}

function details(label: string, content: string[]): string[] {
  return ['<details>', `<summary>${cell(label)}</summary>`, '', ...content, '', '</details>', ''];
}

/** Render complete observed values separately from the parameter overview. */
function renderParams(api: LoadedApi): string[] {
  const rows: string[] = [];
  const values: Record<string, unknown> = {};
  for (const section of ['query', 'body'] as const) {
    for (const [name, param] of Object.entries(api.definition.request?.[section] ?? {}) as [string, Param][]) {
      const required = param.required === undefined ? 'unknown' : param.required ? 'yes' : 'no';
      const raw = param.default === undefined ? undefined : JSON.stringify(param.default);
      const value = raw === undefined ? '—' : raw.length > 80 ? '[View full value](#observed-parameter-values)' : `\`${cell(raw)}\``;
      if (raw !== undefined) values[`${section}.${name}`] = param.default;
      const desc = /^Observed (?:query|request body) value; requiredness is unknown\.$/.test(param.desc) ? 'Meaning not established.' : param.desc;
      rows.push(`| ${section} | \`${cell(name)}\` | ${param.type ?? 'unknown'} | ${required} | ${value} | ${cell(desc)} |`);
    }
  }
  return ['## Params', '', 'Values are observations, not server defaults. Unknown types, meanings and requiredness remain unverified.', '',
    ...(rows.length ? ['| in | name | type | required | observed value | description |', '|---|---|---|---|---|---|', ...rows] : ['_No parameters documented._']), '',
    ...(Object.keys(values).length ? ['### Observed parameter values', '', ...details('Full observed parameter values', fence(stableStringify(values).trimEnd()))] : [])];
}

/** Keep captured body text intact, including large numeric literals. */
function requestRecipe(ex: LoadedExample): string[] {
  const request = ex.data.request;
  let body: string | undefined;
  try { body = requestBodyText(request); }
  catch (error) { return [`A text recipe is unavailable: ${cell((error as Error).message)}. Use the linked canonical recording to inspect its body representation.`]; }
  const headers = Object.entries(request.headers ?? {}).filter(([key]) => !key.startsWith(':') && !['host', 'content-length', 'transfer-encoding'].includes(key.toLowerCase()));
  const mime = requestMime(request);
  if (mime && !headers.some(([key]) => key.toLowerCase() === 'content-type')) headers.push(['Content-Type', mime]);
  const text = [`${request.method} ${request.url} HTTP/1.1`, ...headers.map(([key, value]) => `${key}: ${value}`), '', ...(body === undefined ? [] : [body])].join('\n');
  return fence(text, 'http');
}

function renderApiPage(api: LoadedApi): string {
  const def = api.definition;
  const output = `docs/${api.relDir}.md`;
  const link = (target: string) => linkFrom(output, target);
  const lines = [`# ${def.name}`, '', `[API index](${link('dist/docs/summary.md')}) · [Usage and placeholders](${link('dist/docs/usage.md')}) · [Canonical definition](${link(definitionPath(api))})`, '',
    `- **api**: \`${def.api}\``, `- **endpoint**: \`${def.endpoint.method} ${def.endpoint.path}\``,
    `- **origins**: ${origins(api).map((origin) => `\`${origin}\``).join(', ') || 'unknown'}`,
    `- **source**: \`${cell(def.source)}\``, `- **auth**: \`${def.auth ?? 'unknown'}\``,
    ...(def.tags?.length ? [`- **tags**: ${def.tags.map((tag) => `\`${tag}\``).join(', ')}`] : []), ''];
  if (api.notesFile) lines.push('## Usage notes', '', readText(api.notesFile).trimEnd(), '');
  lines.push(...renderParams(api));
  lines.push('## Recorded requests', '', 'These recipes include captured headers and masked values; their presence does not prove that the service requires them. Keep placeholders unchanged for local replay. For live use, follow the [setup guide](' + link('dist/docs/usage.md') + ').', '');
  const recordingRows = api.examples.map((ex, index) => {
    const variants = def.responses.filter((v) => v.examples?.includes(ex.name)).map((v) => v.variant).join(', ');
    return `| [${cell(recordingLabel(ex, index))}](${link(examplePath(api, ex))}) | ${cell(variants)} | ${new URL(ex.data.request.url).origin} |`;
  });
  const recordingTable = ['| recording | outcome | origin |', '|---|---|---|', ...recordingRows];
  if (recordingRows.length > 3) lines.push(...details(`Browse all ${recordingRows.length} recordings`, recordingTable));
  else if (recordingRows.length) lines.push(...recordingTable, '');
  else lines.push('_No recordings available._', '');
  if (api.examples[0]) lines.push(...details(`Complete request recipe — ${recordingLabel(api.examples[0], 0)}`, requestRecipe(api.examples[0])));
  for (const section of ['headers', 'cookies'] as const) {
    const values = def.request?.[section];
    if (values && Object.keys(values).length) lines.push(...details(`Documented request ${section}`, fence(stableStringify(values).trimEnd())));
  }
  lines.push('## Responses', '', '| variant | meaning | business codes | HTTP | recordings |', '|---|---|---|---|---|');
  for (const variant of def.responses) lines.push(`| \`${variant.variant}\` | ${cell(variant.status)} | ${variant.codes.join(', ') || 'HTTP-only'} | ${variant.http.join(', ')} | [${variant.examples?.length ?? 0} ${(variant.examples?.length ?? 0) === 1 ? 'recording' : 'recordings'}](#recorded-requests) |`);
  lines.push('', '## Observed response shapes', '', 'Shapes describe recorded types; they do not establish field requiredness. Expand an outcome to inspect its complete shape.', '');
  for (const variant of def.responses) {
    lines.push(`### ${variant.variant}`, '');
    lines.push(...(variant.schema === null ? ['_Shape unknown._', ''] : details(`Full ${variant.variant} response shape`, fence(stableStringify(variant.schema).trimEnd()))));
    if (variant.headers && Object.keys(variant.headers).length) lines.push(...details(`Captured ${variant.variant} response headers`, ['These are capture metadata, including transport headers; they are not request requirements.', '', ...fence(stableStringify(variant.headers).trimEnd())]));
  }
  lines.push(`[Back to API index](${link('dist/docs/summary.md')})`, '');
  return lines.join('\n');
}

function renderUsage(corpus: LoadedCorpus): string {
  const output = 'docs/usage.md';
  const used = new Map<string, Set<string>>();
  for (const api of corpus.apis) for (const ex of api.examples) for (const name of placeholders(ex.data.request)) {
    const endpoints = used.get(name) ?? new Set<string>();
    endpoints.add(api.relDir);
    used.set(name, endpoints);
  }
  return [`# Using ${corpus.collection.name}`, '', '[API index](summary.md)', '',
    '## Local replay', '', 'From the repository root:', '', '```sh', 'cd workflow/cli', 'npm ci', 'npm run build', 'npm run apic -- serve', '```', '',
    'Import the [Postman collection](../postman/endpoints.postman_collection.json) and [local replay environment](../postman/replay.postman_environment.json). Select that environment and send a recorded request. The server stays available until Ctrl+C.', '',
    'If port 4010 is occupied, run `npm run apic -- serve --port 4011` and set the replay environment’s `baseUrl` to `http://127.0.0.1:4011`. `apicReplay=true` routes each request to this local server and selects its recording, including recordings with identical inputs.', '',
    'Keep the request body, query and masked placeholders unchanged for replay. Placeholder entries in the supplied environment are disabled so their recorded literal values remain intact. A mismatch response explains how to recover.', '',
    'For an automated check of every recording, run `npm run apic -- test`. This starts and stops its own temporary server.', '',
    '## Live requests', '',
    'Create a separate Postman environment with `apicReplay` absent or set to `false`. Each request uses its own origin variable from the collection; the endpoint pages list the observed hosts. Override individual origin variables when needed.', '',
    'Copy the disabled placeholder entries into your live environment, supply your own values, then enable them. A placeholder is a masking marker, not a documented authentication requirement. Recorded identifiers and tokens may be session-specific; these examples do not establish live availability or a complete purchase flow.', '',
    '## Request placeholders', '', 'Only placeholders present in outgoing requests are listed. Response-only masked fields do not need setup.', '',
    ...[...used].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).flatMap(([name, endpoints]) => [
      `### ${cell(name)}`, '', `Placeholder: \`{{${cell(name)}}}\``, '',
      cell(corpus.collection.auth?.[name]?.doc ?? 'Masked recorded value; obtain a replacement from your own session for live use.'), '',
      ...details(`Used by ${endpoints.size} ${endpoints.size === 1 ? 'endpoint' : 'endpoints'}`, [...endpoints].sort().map((dir) => {
        const api = corpus.apis.find((entry) => entry.relDir === dir)!;
        return `- [${cell(api.definition.name)}](${linkFrom(output, `dist/docs/${dir}.md`)})`;
      })),
    ]),
    '## Reading the evidence', '',
    'Parameter values are observations, not server defaults. Unknown authentication, types and requiredness remain unknown. Recording links resolve to canonical JSON, containing request/response bodies and capture metadata. Expand request recipes, full parameter values and response shapes only when needed.', '',
    'The [agent index](../agent/index.json) lists endpoints and points to individual detail files. Its format version is 2; file references in JSON are relative to the repository root. Request definitions and full response shapes live in those detail files.', ''].join('\n');
}

/** Render a compact overview with optional evidence details and resolvable links. */
export function renderDocs(corpus: LoadedCorpus): GeneratedFile[] {
  const summary = [`# ${corpus.collection.name}`, '', `Version: ${corpus.collection.version} · ${corpus.apis.length} endpoints · ${corpus.apis.reduce((n, api) => n + api.examples.length, 0)} recordings`, '',
    '[Start here: replay, live setup and placeholders](usage.md) · [Agent index](../agent/index.json)', '',
    '| API | name | endpoint | observed origins |', '|---|---|---|---|',
    ...corpus.apis.map((api) => `| [\`${api.definition.api}\`](${api.relDir}.md) | ${cell(api.definition.name)} | \`${api.definition.endpoint.method} ${api.definition.endpoint.path}\` | ${origins(api).join(', ') || 'unknown'} |`), ''];
  return [{ path: 'docs/summary.md', content: summary.join('\n') }, { path: 'docs/usage.md', content: renderUsage(corpus) },
    ...corpus.apis.map((api) => ({ path: `docs/${api.relDir}.md`, content: renderApiPage(api) }))];
}
