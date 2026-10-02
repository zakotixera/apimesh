import type { BodyNode, GeneratedFile } from '../lib/types';
import { apiHost, docsFile } from '../lib/api-layout';
import type { LoadedApi, LoadedCorpus } from '../lib/canonical';
import { readText } from '../lib/fsx';
import { stableStringify } from '../lib/stable-json';
import { cell, definitionPath, examplePath, linkFrom, origins, parameterDescription, placeholders, recordingLabel } from './presentation';

function fence(text: string): string[] {
  const marker = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return [marker + 'json', text, marker];
}

function details(label: string, content: string[]): string[] {
  return ['<details>', `<summary>${cell(label)}</summary>`, '', ...content, '', '</details>', ''];
}

/** Include only columns with evidence; keep large values out of the overview. */
function renderParams(api: LoadedApi): string[] {
  const params = (['query', 'body'] as const).flatMap((section) =>
    Object.entries(api.definition.request?.[section] ?? {}).map(([name, param]) =>
      ({ section, name, ...param, desc: parameterDescription(param.desc) })));
  if (!params.length) return [];
  const showType = params.some((p) => p.type !== undefined);
  const showRequired = params.some((p) => p.required !== undefined);
  const showValue = params.some((p) => p.default !== undefined);
  const showDesc = params.some((p) => p.desc !== undefined);
  const columns = ['in', 'name', ...(showType ? ['type'] : []), ...(showRequired ? ['required'] : []),
    ...(showValue ? ['observed value'] : []), ...(showDesc ? ['description'] : [])];
  const values: Record<string, unknown> = {};
  const rows = params.map((param) => {
    const raw = param.default === undefined ? undefined : JSON.stringify(param.default);
    const large = raw !== undefined && raw.length > 80;
    if (large) values[`${param.section}.${param.name}`] = param.default;
    const value = raw === undefined ? '—' : large ? '[View full value](#observed-parameter-values)' : `\`${cell(raw)}\``;
    return `| ${[param.section, `\`${cell(param.name)}\``, ...(showType ? [param.type ?? '—'] : []),
      ...(showRequired ? [param.required === undefined ? '—' : param.required ? 'yes' : 'no'] : []),
      ...(showValue ? [value] : []), ...(showDesc ? [param.desc ? cell(param.desc) : '—'] : [])].join(' | ')} |`;
  });
  return ['## Parameters', '', `| ${columns.join(' | ')} |`, `|${columns.map(() => '---').join('|')}|`, ...rows, '',
    ...(Object.keys(values).length ? ['### Observed parameter values', '', ...details('Full values', fence(stableStringify(values).trimEnd()))] : [])];
}

/** A path/type table exposes the same type tree without JSON scaffolding. */
function shapeRows(node: BodyNode, at = '$'): string[] {
  const type = Array.isArray(node.type) ? node.type.join(' | ') : node.type;
  const rows = [`| \`${cell(at)}\` | ${cell(type)} |`];
  for (const [name, child] of Object.entries(node.properties ?? {})) {
    const suffix = /^[A-Za-z_$][\w$]*$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
    rows.push(...shapeRows(child, at + suffix));
  }
  if (node.items) rows.push(...shapeRows(node.items, `${at}[]`));
  return rows;
}

function renderApiPage(api: LoadedApi): string {
  const def = api.definition;
  const output = docsFile(api);
  const link = (target: string) => linkFrom(output, target);
  const hosts = origins(api);
  const lines = [`# ${def.name}`, '', `[API index](${link('dist/docs/summary.md')}) · [Usage](${link('dist/docs/usage.md')}) · [Canonical definition](${link(definitionPath(api))})`, '',
    `- **api**: \`${def.api}\``, `- **endpoint**: \`${def.endpoint.method} ${def.endpoint.url ?? def.endpoint.path}\``,
    ...(!def.endpoint.url && hosts.length ? [`- **origins**: ${hosts.map((host) => `\`${host}\``).join(', ')}`] : []),
    ...(def.auth !== undefined ? [`- **auth**: \`${def.auth}\``] : []),
    ...(def.tags?.length ? [`- **tags**: ${def.tags.map((tag) => `\`${tag}\``).join(', ')}`] : []), ''];
  if (api.notesFile) lines.push('## Notes', '', readText(api.notesFile).trimEnd(), '');
  lines.push(...renderParams(api));
  lines.push('## Responses', '', '| variant | meaning | business codes | HTTP | recordings |', '|---|---|---|---|---|');
  for (const variant of def.responses) {
    const count = variant.examples?.length ?? 0;
    lines.push(`| \`${variant.variant}\` | ${cell(variant.status)} | ${variant.codes.join(', ') || '—'} | ${variant.http.join(', ')} | ${count ? `[${count}](#recordings)` : '0'} |`);
  }
  lines.push('');
  for (const variant of def.responses) if (variant.schema !== null) {
    lines.push(...details(`${variant.variant} response fields`, ['| field | type |', '|---|---|', ...shapeRows(variant.schema)]));
  }
  if (api.examples.length) {
    lines.push('## Recordings', '');
    const multipleOrigins = hosts.length > 1;
    const rows = api.examples.map((ex, index) => {
      const variants = def.responses.filter((v) => v.examples?.includes(ex.name)).map((v) => v.variant).join(', ');
      return `| [${cell(recordingLabel(ex, index))}](${link(examplePath(api, ex))}) | ${cell(variants)} |${multipleOrigins ? ` ${new URL(ex.data.request.url).origin} |` : ''}`;
    });
    const table = [`| recording | outcome |${multipleOrigins ? ' origin |' : ''}`, `|---|---|${multipleOrigins ? '---|' : ''}`, ...rows];
    lines.push(...(rows.length > 3 ? details(`${rows.length} recordings`, table) : [...table, '']));
  }
  return lines.join('\n');
}

function renderUsage(corpus: LoadedCorpus): string {
  const used = [...new Set(corpus.apis.flatMap((api) => api.examples.flatMap((ex) => placeholders(ex.data.request))))].sort();
  return [`# Using ${corpus.collection.name}`, '', '[API index](summary.md) · [Agent index](../agent/index.json)', '',
    '## Local replay', '', 'From the repository root:', '', '```sh', 'cd workflow/cli', 'npm ci', 'npm run build', 'npm run apic -- serve', '```', '',
    'Import the [Postman collection](../postman/endpoints.postman_collection.json) and [replay environment](../postman/replay.postman_environment.json). Select the replay environment and send a recording. Keep its query, body and masked values unchanged.', '',
    'Default: `http://127.0.0.1:4010`. To change ports, use `serve --port 4011` and update `baseUrl`. Run `npm run apic -- test` to replay all recordings automatically.', '',
    '## Live requests', '',
    'Use a separate environment with `apicReplay=false`. Set the origin variables as needed and enable placeholders with your own values.', '',
    ...(used.length ? ['| placeholder | description |', '|---|---|', ...used.map((name) =>
      `| \`{{${cell(name)}}}\` | ${cell(corpus.collection.auth?.[name]?.doc ?? 'Replace for live requests.')} |`), ''] : []),
    '## Reference', '',
    'Parameter values and response types describe recordings. A dash means no declaration. Recording links contain the full capture; the canonical definition links to its source. Agent JSON paths are relative to the repository root.', ''].join('\n');
}

export function renderDocs(corpus: LoadedCorpus): GeneratedFile[] {
  const summary = [`# ${corpus.collection.name}`, '', `Version: ${corpus.collection.version} · ${corpus.apis.length} endpoints · ${corpus.apis.reduce((n, api) => n + api.examples.length, 0)} recordings`, '',
    '[Usage](usage.md) · [Agent index](../agent/index.json)', '',
    '| host | API | name | endpoint |', '|---|---|---|---|',
    ...corpus.apis.map((api) => `| ${cell(apiHost(api))} | [\`${api.definition.api}\`](${linkFrom('docs/summary.md', `dist/${docsFile(api)}`)}) | ${cell(api.definition.name)} | \`${api.definition.endpoint.method} ${api.definition.endpoint.url ?? api.definition.endpoint.path}\` |`), ''];
  return [{ path: 'docs/summary.md', content: summary.join('\n') }, { path: 'docs/usage.md', content: renderUsage(corpus) },
    ...corpus.apis.map((api) => ({ path: docsFile(api), content: renderApiPage(api) }))];
}
