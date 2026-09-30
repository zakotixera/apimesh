import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderAgent } from '../src/renderers/agent';
import { renderDocs } from '../src/renderers/docs';
import { renderPostman } from '../src/renderers/postman';
import { loadSchemas } from '../src/lib/schemas';
import { projectPaths } from '../src/lib/paths';
import { capturePostData } from '../src/lib/har';
import { corpus, example } from './fixtures';

const { captureFidelity } = require('../scripts/lib/capture-fidelity.cjs');
const project = projectPaths(path.resolve(import.meta.dirname, '../../..'));
const schemas = loadSchemas(project);

describe('definition ablations: absence, validity and consumer capability', () => {
  it.each(['nothing', 'auth', 'type', 'required'] as const)('removing %s cannot assert a different contract', (removed) => {
    const data = corpus([]);
    data.paths = project;
    const def = data.apis[0].definition;
    def.auth = 'required';
    def.request = { query: { id: { type: 'integer', required: true, desc: 'Observed identifier' } } };
    if (removed === 'auth') delete def.auth;
    if (removed === 'type') delete def.request.query!.id.type;
    if (removed === 'required') delete def.request.query!.id.required;
    const before = structuredClone(def);
    expect(schemas.definition(def)).toEqual([]);
    const doc = renderDocs(data).find((file) => file.path === 'docs/x.md')!.content;
    const agent = JSON.parse(renderAgent(data)[0].content).apis[0];
    expect(doc).toContain(`**auth**: \`${removed === 'auth' ? 'unknown' : 'required'}\``);
    expect(agent.auth).toBe(removed === 'auth' ? undefined : 'required');
    expect(agent.request).toEqual(def.request);
    expect(doc).toContain(`| query | \`id\` | ${removed === 'type' ? 'unknown' : 'integer'} | ${removed === 'required' ? 'unknown' : 'yes'} |`);
    expect(def).toEqual(before);
  });

  it('keeps explicit none/false distinct from absent evidence', () => {
    const data = corpus([]);
    data.paths = project;
    data.apis[0].definition.auth = 'none';
    data.apis[0].definition.request = { query: { id: { required: false, type: 'string', desc: 'Identifier' } } };
    const doc = renderDocs(data).find((file) => file.path === 'docs/x.md')!.content;
    expect(doc).toContain('**auth**: `none`');
    expect(doc).toContain('| query | `id` | string | no |');
    expect(JSON.parse(renderAgent(data)[0].content).apis[0].auth).toBe('none');
  });

  it('labels observed values and distinguishes unknown shapes from observed JSON null', () => {
    const data = corpus([]);
    const def = data.apis[0].definition;
    def.request = { query: { q: { default: 'recorded', desc: 'Observed query' } } };
    let doc = renderDocs(data).find((file) => file.path === 'docs/x.md')!.content;
    expect(doc).toContain('| observed value |');
    expect(doc).toContain('_Shape unknown._');
    def.responses[0].schema = { type: 'null' };
    doc = renderDocs(data).find((file) => file.path === 'docs/x.md')!.content;
    expect(doc).toContain('"type": "null"');
    expect(doc).not.toContain('_Shape unknown._');
  });

  it('detects changed JSON request bytes after metadata deletion even though both examples are schema-valid', () => {
    const original = example({ headers: { 'content-type': 'application/json' },
      ...capturePostData({ mimeType: 'application/json', text: '{ "id": 9007199254740993123 }' }) });
    original.response.body = '{"code":0}';
    original.response.bodyMeta = { representation: 'text', source: 'text', mimeType: 'application/json' };
    const expected = new Map([['0.json', original]]);
    const collection = (ex: typeof original) => JSON.parse(renderPostman(corpus([ex]))[0].content);
    expect(schemas.example(original)).toEqual([]);
    expect(captureFidelity(expected, collection(original)).mismatches).toBe(0);
    const ablated = structuredClone(original);
    delete ablated.request.bodyMeta;
    expect(schemas.example(ablated)).toEqual([]);
    expect(captureFidelity(expected, collection(ablated)).mismatches).toBe(1);
  });

  it.each(['missing', 'binary'] as const)('accepts %s capture evidence while the current exporter rejects its replay', (kind) => {
    const ex = example({ body: kind === 'missing' ? null : 'AAEC', bodyMeta: kind === 'missing'
      ? { representation: 'text', source: 'missing' }
      : { representation: 'base64', source: 'text', mimeType: 'application/octet-stream' } });
    expect(schemas.example(ex)).toEqual([]);
    expect(() => renderPostman(corpus([ex]))).toThrow(kind === 'missing' ? 'uncaptured request' : 'binary request');
  });

  it('does not require particular business codes, outcome names or hosts', () => {
    const ex = example();
    ex.http = ex.response.status = 418;
    ex.code = -71;
    ex.response.body = { code: -71 };
    ex.request.url = 'https://unrelated.example.invalid/x';
    const def = corpus([]).apis[0].definition;
    def.responses[0] = { variant: 'domain-specific-outcome', status: 'Evidence-backed meaning', codes: [-71], http: [418], schema: null };
    expect(schemas.example(ex)).toEqual([]);
    expect(schemas.definition(def)).toEqual([]);
  });
});
