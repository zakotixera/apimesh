import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderDocs } from '../src/renderers/docs';
import { renderAgent } from '../src/renderers/agent';
import { projectPaths } from '../src/lib/paths';
import { corpus, example } from './fixtures';

function fixture() {
  const data = corpus([example({ body: '{ "id": 9007199254740993123, "token": "{{token}}" }', bodyMeta: { representation: 'text', source: 'text', mimeType: 'application/json' } })]);
  data.paths = projectPaths(path.resolve(import.meta.dirname, '../../..'));
  data.apis[0].relDir = 'nested/path/x';
  data.apis[0].definition.request = { body: { payload: { desc: 'Nested value', default: { long: 'x'.repeat(200) } } } };
  data.apis[0].definition.responses[0].schema = { type: 'object', properties: { id: { type: 'number' } } };
  return data;
}

describe('artifact navigation and progressive disclosure', () => {
  it('omits boilerplate, unknown columns and capture headers while retaining useful descriptions', () => {
    const data = fixture();
    const def = data.apis[0].definition;
    def.request = { query: {
      q: { default: 'one', desc: 'Observed q value; requiredness is unknown.' },
      cursor: { default: 'next', desc: 'Pagination cursor; requiredness is unknown.' },
      empty: {},
    }, headers: { Cookie: 'session={{SESSION_ID}}' } };
    def.responses[0].headers = { 'x-trace-id': 'capture-only' };
    const page = renderDocs(data).find((f) => f.path === 'docs/nested/path/x.md')!.content;
    expect(page).toContain('Pagination cursor');
    expect(page).not.toMatch(/requiredness|unknown|Observed q value|session=|capture-only|recipe/);
    expect(page).not.toContain('| required |');
    expect(page).not.toContain('**auth**');
    expect(page).not.toContain('Full values');
    const files = renderAgent(data);
    const detail = JSON.parse(files.find((f) => f.path.startsWith('agent/endpoints/'))!.content);
    expect(detail.request.query.q).toEqual({ default: 'one' });
    expect(detail.request.query.cursor.desc).toBe('Pagination cursor');
    expect(detail.request.headers).toBeUndefined();
    expect(detail.variants[0].headers).toBeUndefined();
    expect(def.request.query!.q.desc).toContain('requiredness');
  });
  it('resolves evidence links without duplicating raw requests', () => {
    const data = fixture();
    const files = renderDocs(data);
    const page = files.find((f) => f.path === 'docs/nested/path/x.md')!;
    const links = [...page.content.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).filter((p) => !p.startsWith('#'));
    const targets = links.map((p) => path.posix.normalize(path.posix.join('dist', path.posix.dirname(page.path), p)));
    expect(targets).toContain('dist/docs/summary.md');
    expect(targets).toContain('dist/docs/usage.md');
    expect(targets).toContain('apis/nested/path/x/definition.json');
    expect(targets).toContain('apis/nested/path/x/examples/0.json');
    expect(page.content).not.toContain(data.apis[0].examples[0].data.request.body);
    expect(page.content).not.toContain('content-type: application/json');
    expect(page.content).not.toContain('recipe');
    expect(page.content).toContain('**origins**: `https://example.invalid`');
    expect(page.content).toContain('[View full value](#observed-parameter-values)');
    expect(page.content).toContain('<summary>ok response fields</summary>');
    expect(page.content).toContain('x'.repeat(200));
  });
  it('keeps schemas and request details out of discovery but reachable in endpoint files', () => {
    const data = fixture();
    const before = structuredClone(data.apis[0].definition);
    const files = renderAgent(data);
    const index = JSON.parse(files[0].content);
    expect(index.formatVersion).toBe(2);
    expect(index.pathBase).toBe('repository-root');
    const entry = index.apis[0];
    expect(entry.request).toBeUndefined();
    expect(entry.variants[0].schema).toBeUndefined();
    const detail = JSON.parse(files.find((f) => `dist/${f.path}` === entry.detailFile)!.content);
    expect(detail.request).toEqual(before.request);
    expect(detail.variants[0].schema).toEqual(before.responses[0].schema);
    expect(detail.variants[0].examples[0].file).toBe('apis/nested/path/x/examples/0.json');
    expect(data.apis[0].definition).toEqual(before);
  });
});
