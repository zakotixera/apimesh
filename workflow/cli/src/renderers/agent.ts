import { readText } from '../lib/fsx';
import type { LoadedCorpus } from '../lib/canonical';
import type { GeneratedFile } from '../lib/types';
import { stableStringify } from '../lib/stable-json';

const SCHEMA_FILES = [
  'collection.schema.json',
  'definition.schema.json',
  'example.schema.json',
  'glossary.schema.json',
];

/** Render an agent index, compact summary and schema copies under dist/agent. */
export function renderAgent(corpus: LoadedCorpus): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const apis = [...corpus.apis].sort((a, b) =>
    a.definition.api < b.definition.api ? -1 : a.definition.api > b.definition.api ? 1 : 0,
  );

  const index = {
    collection: { name: corpus.collection.name, version: corpus.collection.version },
    bases: corpus.collection.bases,
    apis: apis.map((api) => {
      const def = api.definition;
      return {
        api: def.api,
        name: def.name,
        method: def.endpoint.method,
        path: def.endpoint.path,
        source: def.source,
        tags: def.tags ?? [],
        ...(def.auth === undefined ? {} : { auth: def.auth }),
        ...(def.request === undefined ? {} : { request: def.request }),
        variants: def.responses.map((variant) => ({
          variant: variant.variant,
          status: variant.status,
          codes: variant.codes,
          http: variant.http,
          headers: variant.headers ?? {},
          schema: variant.schema,
          examples: (variant.examples ?? []).map((name) => {
            const ex = api.examples.find((e) => e.name === name);
            return { file: name, http: ex?.data.http ?? null, code: ex?.data.code ?? null };
          }),
        })),
      };
    }),
  };
  files.push({ path: 'agent/index.json', content: stableStringify(index) });

  // Compact agent summary.
  const lines: string[] = [];
  lines.push(`# Agent summary - ${corpus.collection.name}`);
  lines.push('');
  lines.push(`Version ${corpus.collection.version}; ${apis.length} endpoints.`);
  lines.push('');
  for (const api of apis) {
    const def = api.definition;
    lines.push(`## ${def.name} (\`${def.api}\`)`);
    lines.push('');
    lines.push(
      `\`${def.endpoint.method} ${def.endpoint.path}\` · source \`${def.source}\` · auth \`${def.auth ?? 'unknown'}\``,
    );
    lines.push('');
    for (const variant of def.responses) {
      const codes = variant.codes.length === 0 ? 'null' : variant.codes.join(',');
      lines.push(
        `- \`${variant.variant}\` — ${variant.status}(codes ${codes}; http ${variant.http.join(',')})`,
      );
    }
    lines.push('');
  }
  files.push({ path: 'agent/summary.md', content: lines.join('\n') });

  // Copy schemas.
  for (const name of SCHEMA_FILES) {
    files.push({
      path: `agent/schema/${name}`,
      content: readText(`${corpus.paths.schema}/${name}`),
    });
  }

  return files;
}
