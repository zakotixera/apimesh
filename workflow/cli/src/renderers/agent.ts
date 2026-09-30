import { readText } from '../lib/fsx';
import type { LoadedCorpus } from '../lib/canonical';
import type { GeneratedFile } from '../lib/types';
import { stableStringify } from '../lib/stable-json';
import { definitionPath, examplePath, origins, recordingLabel } from './presentation';

const SCHEMA_FILES = ['collection.schema.json', 'definition.schema.json', 'example.schema.json', 'glossary.schema.json'];

/** Version 2 keeps discovery small; file references are repository-relative. */
export function renderAgent(corpus: LoadedCorpus): GeneratedFile[] {
  const details: GeneratedFile[] = [];
  const apis = [...corpus.apis].sort((a, b) => a.definition.api < b.definition.api ? -1 : a.definition.api > b.definition.api ? 1 : 0);
  const entries = apis.map((api) => {
    const def = api.definition;
    const detailFile = `agent/endpoints/${def.api}.json`;
    const entry = {
      api: def.api, name: def.name, method: def.endpoint.method, path: def.endpoint.path,
      origins: origins(api), tags: def.tags ?? [], ...(def.auth === undefined ? {} : { auth: def.auth }),
      detailFile: `dist/${detailFile}`, definitionFile: definitionPath(api), docsFile: `dist/docs/${api.relDir}.md`,
      variants: def.responses.map((v) => ({ variant: v.variant, status: v.status, codes: v.codes, http: v.http, recordings: v.examples?.length ?? 0 })),
    };
    details.push({ path: detailFile, content: stableStringify({
      formatVersion: 2, pathBase: 'repository-root', ...entry, source: def.source,
      ...(def.request === undefined ? {} : { request: def.request }),
      ...(api.relNotesFile ? { notesFile: api.relNotesFile } : {}),
      variants: def.responses.map((variant) => ({ ...variant, examples: (variant.examples ?? []).map((name) => {
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
    'Index format 2: load the linked endpoint detail only when needed. JSON file references are relative to the repository root; unknown declarations remain omitted. A request parameter’s `default` is an observed value, not a server default.', ''];
  for (const api of apis) {
    const def = api.definition;
    summary.push(`## ${def.name} (\`${def.api}\`)`, '', `\`${def.endpoint.method} ${def.endpoint.path}\` · auth \`${def.auth ?? 'unknown'}\``, '',
      `[Endpoint details](endpoints/${def.api}.json) · [Human documentation](../docs/${api.relDir}.md)`, '',
      ...def.responses.map((v) => `- \`${v.variant}\` — ${v.status} (codes ${v.codes.join(', ') || 'HTTP-only'}; HTTP ${v.http.join(', ')})`), '');
  }
  return [{ path: 'agent/index.json', content: stableStringify(index) }, { path: 'agent/summary.md', content: summary.join('\n') }, ...details,
    ...SCHEMA_FILES.map((name) => ({ path: `agent/schema/${name}`, content: readText(`${corpus.paths.schema}/${name}`) }))];
}
