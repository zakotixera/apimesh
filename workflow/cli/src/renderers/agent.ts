import { readText } from '../lib/fsx';
import { agentFile, apiHost, docsFile } from '../lib/api-layout';
import type { LoadedCorpus } from '../lib/canonical';
import type { GeneratedFile } from '../lib/types';
import { stableStringify } from '../lib/stable-json';
import { definitionPath, examplePath, linkFrom, origins, parameterDescription, recordingLabel } from './presentation';

const SCHEMA_FILES = ['collection.schema.json', 'definition.schema.json', 'example.schema.json', 'glossary.schema.json'];

/** Version 2 keeps discovery small; file references are repository-relative. */
export function renderAgent(corpus: LoadedCorpus): GeneratedFile[] {
  const details: GeneratedFile[] = [];
  const apis = [...corpus.apis].sort((a, b) => a.definition.api < b.definition.api ? -1 : a.definition.api > b.definition.api ? 1 : 0);
  const entries = apis.map((api) => {
    const def = api.definition;
    const request = Object.fromEntries((['query', 'body'] as const)
      .filter((section) => Object.keys(def.request?.[section] ?? {}).length > 0)
      .map((section) => [section, Object.fromEntries(Object.entries(def.request![section]!).map(([name, param]) => {
        const { desc, ...fields } = param;
        const description = parameterDescription(desc);
        return [name, { ...fields, ...(description ? { desc: description } : {}) }];
      }))]));
    const detailFile = agentFile(api);
    const entry = {
      api: def.api, name: def.name, method: def.endpoint.method, path: def.endpoint.path, ...(def.endpoint.url ? { url: def.endpoint.url } : {}),
      host: apiHost(api), origins: origins(api), tags: def.tags ?? [], ...(def.auth === undefined ? {} : { auth: def.auth }),
      detailFile: `dist/${detailFile}`, definitionFile: definitionPath(api), docsFile: `dist/${docsFile(api)}`,
      variants: def.responses.map((v) => ({ variant: v.variant, status: v.status, codes: v.codes, http: v.http, recordings: v.examples?.length ?? 0 })),
    };
    details.push({ path: detailFile, content: stableStringify({
      formatVersion: 2, pathBase: 'repository-root', ...entry, source: def.source,
      ...(Object.keys(request).length ? { request } : {}),
      ...(api.relNotesFile ? { notesFile: api.relNotesFile } : {}),
      variants: def.responses.map(({ headers: _headers, ...variant }) => ({ ...variant, examples: (variant.examples ?? []).map((name) => {
        const ex = api.examples.find((e) => e.name === name);
        return { file: ex ? examplePath(api, ex) : `apis/${api.relDir}/examples/${name}`,
          label: ex ? recordingLabel(ex, api.examples.indexOf(ex)) : name,
          origin: ex ? new URL(ex.data.request.url).origin : null, http: ex?.data.http ?? null, code: ex?.data.code ?? null };
      }) })),
    }) });
    return entry;
  });
  const index = { formatVersion: 2, pathBase: 'repository-root', collection: { name: corpus.collection.name, version: corpus.collection.version }, bases: corpus.collection.bases, apis: entries };
  const summary = [`# Agent summary — ${corpus.collection.name}`, '', `Version ${corpus.collection.version}; ${apis.length} endpoints.`, '',
    '[JSON index](index.json) · [Usage and placeholders](../docs/usage.md)', '',
    'Index format 2. JSON paths are relative to the repository root. Parameter `default` values are observations.', ''];
  for (const api of apis) {
    const def = api.definition;
    summary.push(`## ${def.name} (\`${def.api}\`)`, '', `\`${def.endpoint.method} ${def.endpoint.url ?? def.endpoint.path}\`${def.auth === undefined ? '' : ` · auth \`${def.auth}\``}`, '',
      `[Endpoint details](${linkFrom('agent/summary.md', `dist/${agentFile(api)}`)}) · [Human documentation](${linkFrom('agent/summary.md', `dist/${docsFile(api)}`)})`, '',
      ...def.responses.map((v) => `- \`${v.variant}\` — ${v.status} (codes ${v.codes.join(', ') || 'HTTP-only'}; HTTP ${v.http.join(', ')})`), '');
  }
  return [{ path: 'agent/index.json', content: stableStringify(index) }, { path: 'agent/summary.md', content: summary.join('\n') }, ...details,
    ...SCHEMA_FILES.map((name) => ({ path: `agent/schema/${name}`, content: readText(`${corpus.paths.schema}/${name}`) }))];
}
