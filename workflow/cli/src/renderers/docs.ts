import path from 'node:path';
import type { GeneratedFile, Param } from '../lib/types';
import type { LoadedCorpus } from '../lib/canonical';
import { readText } from '../lib/fsx';

/** Relative documentation path using POSIX separators. */
function apiDocPath(relDir: string): string {
  return `docs/${relDir.split(path.sep).join('/')}.md`;
}

/** Escape Markdown table delimiters and newlines. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Display an empty code list as an HTTP-only observation. */
function codesLabel(codes: number[]): string {
  return codes.length === 0 ? '—' : codes.join(', ');
}

/** Render one API documentation page. */
function renderApiPage(corpus: LoadedCorpus, relDir: string): string {
  const api = corpus.apis.find((a) => a.relDir === relDir);
  if (!api) throw new Error(`API not found: ${relDir}`);
  const def = api.definition;
  const lines: string[] = [];

  lines.push(`# ${def.name}`);
  lines.push('');
  lines.push(`- **api**: \`${def.api}\``);
  lines.push(`- **endpoint**: \`${def.endpoint.method} ${def.endpoint.path}\``);
  lines.push(`- **source**: \`${def.source}\``);
  lines.push(`- **tags**: ${def.tags && def.tags.length > 0 ? def.tags.map((t) => `\`${t}\``).join(', ') : '—'}`);
  lines.push(`- **auth**: \`${def.auth ?? 'none'}\``);
  lines.push('');

  // Request query and body parameters.
  lines.push('## Params');
  lines.push('');
  const paramSections: Array<[string, Record<string, Param> | undefined]> = [
    ['query', def.request?.query],
    ['body', def.request?.body],
  ];
  const paramRows: string[] = [];
  for (const [section, params] of paramSections) {
    for (const [name, param] of Object.entries(params ?? {})) {
      const required = param.required === true ? 'yes' : 'no';
      const fallback = param.default === undefined ? '—' : `\`${cell(JSON.stringify(param.default))}\``;
      paramRows.push(
        `| ${section} | \`${name}\` | ${param.type ?? 'string'} | ${required} | ${fallback} | ${cell(param.desc)} |`,
      );
    }
  }
  if (paramRows.length === 0) {
    lines.push('_No parameters._');
  } else {
    lines.push('| in | name | type | required | default | desc |');
    lines.push('|---|---|---|---|---|---|');
    lines.push(...paramRows);
  }
  lines.push('');

  // Observed request headers and cookies.
  const valueSections: Array<[string, Record<string, string> | undefined]> = [
    ['headers', def.request?.headers],
    ['cookies', def.request?.cookies],
  ];
  const valueRows: string[] = [];
  for (const [section, values] of valueSections) {
    for (const [name, value] of Object.entries(values ?? {})) {
      valueRows.push(`| ${section} | \`${name}\` | \`${cell(value)}\` |`);
    }
  }
  if (valueRows.length > 0) {
    lines.push('## Request headers / cookies');
    lines.push('');
    lines.push('| in | name | value |');
    lines.push('|---|---|---|');
    lines.push(...valueRows);
    lines.push('');
  }

  // Response variants.
  lines.push('## Responses');
  lines.push('');
  lines.push('| variant | status | codes | http | examples |');
  lines.push('|---|---|---|---|---|');
  for (const variant of def.responses) {
    const examples = variant.examples ?? [];
    const exampleList =
      examples.length === 0
        ? '—'
        : examples
            .map((name) => {
              const ex = api.examples.find((e) => e.name === name);
              const label = ex ? `${ex.data.http}${ex.data.code === null ? '' : ` / code ${ex.data.code}`}` : name;
              return `\`${name}\` (${label})`;
            })
            .join(', ');
    lines.push(
      `| \`${variant.variant}\` | ${cell(variant.status)} | ${codesLabel(variant.codes)} | ${variant.http.join(', ')} | ${exampleList} |`,
    );
  }
  lines.push('');

  // Observed response header values.
  const withHeaders = def.responses.filter((v) => v.headers && Object.keys(v.headers).length > 0);
  if (withHeaders.length > 0) {
    lines.push('## Response headers');
    lines.push('');
    lines.push('| variant | headers |');
    lines.push('|---|---|');
    for (const variant of withHeaders) {
      const pairs = Object.entries(variant.headers ?? {})
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, value]) => `\`${name}: ${cell(value)}\``)
        .join(', ');
      lines.push(`| \`${variant.variant}\` | ${pairs} |`);
    }
    lines.push('');
  }

  // Embed notes.md without rewriting it.
  if (api.notesFile) {
    lines.push('## Notes');
    lines.push('');
    lines.push(readText(api.notesFile).trimEnd());
    lines.push('');
  }

  return lines.join('\n');
}

/** Render canonical data as human-readable Markdown under dist/docs. */
export function renderDocs(corpus: LoadedCorpus): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Generate the collection overview and API index; preserve handwritten README files.
  const summary: string[] = [];
  summary.push(`# ${corpus.collection.name}`);
  summary.push('');
  summary.push(`Version: ${corpus.collection.version}`);
  summary.push('');
  summary.push('## APIs');
  summary.push('');
  summary.push('| api | name | endpoint | variants |');
  summary.push('|---|---|---|---|');
  for (const api of corpus.apis) {
    const def = api.definition;
    summary.push(
      `| [\`${def.api}\`](${api.relDir}.md) | ${cell(def.name)} | \`${def.endpoint.method} ${def.endpoint.path}\` | ${def.responses.length} |`,
    );
  }
  summary.push('');
  files.push({ path: 'docs/summary.md', content: summary.join('\n') });

  // Render one page per API.
  for (const api of corpus.apis) {
    files.push({ path: apiDocPath(api.relDir), content: renderApiPage(corpus, api.relDir) });
  }

  return files;
}
