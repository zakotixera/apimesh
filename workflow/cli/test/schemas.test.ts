import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectPaths } from '../src/lib/paths';
import { loadSchemas } from '../src/lib/schemas';
import { corpus, example } from './fixtures';
import { captureContent, capturePostData } from '../src/lib/har';

// Exercise the shared schema contract without loading any application corpus.
const schemas = loadSchemas(projectPaths(path.resolve(import.meta.dirname, '../../..')));

describe('canonical JSON schemas', () => {
  it('accepts aligned capture fields and absolute endpoint URLs', () => {
    const ex = example({ query: [{ name: 'q', value: '' }, { name: 'q', value: '2' }] });
    ex.response.headers = { 'set-cookie': ['a=1; Path=/', 'b=2; Secure'] };
    expect(schemas.example(ex)).toEqual([]);
    const def = corpus([]).apis[0].definition;
    def.endpoint.url = 'https://example.invalid/x';
    def.request = { query: { q: { type: 'string', default: 'observed' } } };
    expect(schemas.definition(def)).toEqual([]);
    expect(schemas.definition({ ...def, request: { ...def.request, cookies: {} } }).length).toBeGreaterThan(0);
    expect(schemas.example({ ...ex, response: { ...ex.response, cookies: [] } }).length).toBeGreaterThan(0);
    def.endpoint.url += '?q=1';
    expect(schemas.definition(def).length).toBeGreaterThan(0);
    expect(schemas.example({ ...ex, request: { ...ex.request, cookies: [] } }).length).toBeGreaterThan(0);
    expect(schemas.example({ ...ex, response: { ...ex.response, headers: { bad: [] } } }).length).toBeGreaterThan(0);
  });
  it('accepts the collection starters', () => {
    const templates = path.resolve(import.meta.dirname, '../../templates');
    const collection = JSON.parse(fs.readFileSync(path.join(templates, 'collection.json'), 'utf8'));
    const glossary = JSON.parse(fs.readFileSync(path.join(templates, 'glossary.json'), 'utf8'));
    expect(schemas.collection(collection)).toEqual([]);
    expect(schemas.glossary(glossary)).toEqual([]);
    expect(collection.bases).toEqual({});
    expect(collection.auth).toBeUndefined();
    expect(glossary.domains).toEqual([]);
  });

  it('accepts legacy examples and captured JSON, text, binary, missing and parameter bodies', () => {
    expect(schemas.example(example())).toEqual([]);
    expect(schemas.example(example({ url: 'https://example.invalid/x?token=<redacted:token>&session={{SESSION_ID}}' }))).toEqual([]);
    for (const content of [
      { mimeType: 'application/json', text: '{"code":0,"id":9007199254740993123}' },
      { mimeType: 'text/plain', text: '' },
      { mimeType: 'image/png', encoding: 'base64', text: 'AAEC' },
      { mimeType: 'application/json' },
    ]) {
      const ex = example();
      ex.response = { status: 200, ...captureContent(content) };
      expect(schemas.example(ex)).toEqual([]);
    }
    expect(schemas.example(example(capturePostData({ mimeType: 'multipart/form-data', params: [
      { name: 'q', value: 'one' }, { name: 'q', value: 'two' }, { name: 'file', fileName: 'missing.txt' },
    ] })))).toEqual([]);
    const jsonNull = example();
    jsonNull.response = { status: 200, body: null, bodyMeta: { representation: 'json', source: 'text' } };
    expect(schemas.example(jsonNull)).toEqual([]);
  });

  it.each([
    { body: {}, bodyMeta: { representation: 'text', source: 'text' } },
    { body: 'invented', bodyMeta: { representation: 'text', source: 'missing' } },
    { body: [], bodyMeta: { representation: 'params', source: 'text' } },
    { body: [{ value: 'missing name' }], bodyMeta: { representation: 'params', source: 'params' } },
    { body: '***', bodyMeta: { representation: 'base64', source: 'text' } },
    { body: null, bodyMeta: { representation: 'json', source: 'missing' } },
    { body: 'text', bodyMeta: { representation: 'text', source: 'text', raw: 'duplicate' } },
  ])('rejects inconsistent capture metadata: %j', (capture) => {
    const ex = example();
    expect(schemas.example({ ...ex, request: { ...ex.request, ...capture } }).length).toBeGreaterThan(0);
  });

  it('rejects params-only responses', () => {
    const ex = example();
    expect(schemas.example({ ...ex, response: { status: 200, body: [], bodyMeta: { representation: 'params', source: 'params' } } }).length).toBeGreaterThan(0);
  });

  it.each(['HTTP/1.1', 'HTTP/2.0', 'h2', 'h3'])('accepts captured transport metadata (%s)', (httpVersion) => {
    const ex = example({ httpMeta: { httpVersion } });
    ex.response.httpMeta = { httpVersion, entryTime: 12.75 };
    expect(schemas.example(ex)).toEqual([]);
    ex.response.httpMeta.entryTime = 0;
    expect(schemas.example(ex)).toEqual([]);
    ex.request.httpMeta = {};
    ex.response.httpMeta = {};
    expect(schemas.example(ex)).toEqual([]);
  });

  it.each([
    ['request', { httpVersion: 2 }],
    ['response', { httpVersion: '' }],
    ['request', { httpVersion: '   ' }],
    ['request', { entryTime: 10 }],
    ['response', { entryTime: -1 }],
    ['response', { entryTime: '2026-01-01T00:00:00Z' }],
    ['response', { unexpected: true }],
    ['request', null],
  ])('rejects invalid %s httpMeta: %j', (side, httpMeta) => {
    const ex = example();
    const key = side as 'request' | 'response';
    expect(schemas.example({ ...ex, [key]: { ...ex[key], httpMeta } }).length).toBeGreaterThan(0);
  });

  it('allows stable recording suffixes alongside legacy names but rejects path traversal', () => {
    const definition = corpus([]).apis[0].definition;
    definition.responses[0].examples = ['200.code0.ok.json', '200.code0.ok.capture-2.json'];
    expect(schemas.definition(definition)).toEqual([]);
    definition.responses[0].examples = ['../200.code0.ok.json'];
    expect(schemas.definition(definition).length).toBeGreaterThan(0);
  });
  it('accepts a synthetic endpoint definition', () => {
    expect(schemas.definition(corpus([]).apis[0].definition)).toEqual([]);
  });

  it('rejects an unknown key on a variant', () => {
    const definition = corpus([]).apis[0].definition;
    definition.responses[0] = { ...definition.responses[0], bogus: 1 } as typeof definition.responses[0];
    expect(schemas.definition(definition).length).toBeGreaterThan(0);
  });

  it.each([
    { type: 'string', properties: {} },
    { type: 'object', items: null },
    { type: ['string', 'null'], items: { type: 'number' } },
  ])('rejects inapplicable body shape keywords: %j', (shape) => {
    const def = corpus([]).apis[0].definition;
    expect(schemas.definition({ ...def, responses: [{ ...def.responses[0], schema: shape }] }).length).toBeGreaterThan(0);
  });

  it('supports recursive object/array unions without requiring an observed child shape', () => {
    const def = corpus([]).apis[0].definition;
    def.responses[0].schema = { type: ['object', 'array', 'null'], properties: { value: { type: 'string' } }, items: null };
    expect(schemas.definition(def)).toEqual([]);
    def.responses[0].schema = { type: 'object' };
    expect(schemas.definition(def)).toEqual([]);
  });

  it('rejects duplicate example references and endpoint query strings', () => {
    const def = corpus([]).apis[0].definition;
    def.responses[0].examples = ['200.code0.ok.json', '200.code0.ok.json'];
    expect(schemas.definition(def).length).toBeGreaterThan(0);
    def.responses[0].examples = [];
    def.endpoint.path = '/x?q=1';
    expect(schemas.definition(def).length).toBeGreaterThan(0);
  });

  it.each([99, 600])('rejects invalid glossary HTTP hints: %s', (http) => {
    expect(schemas.glossary({ domains: [{ slug: 'observed', meaning: 'Observed outcome', 'http-shapes': [http] }] }).length).toBeGreaterThan(0);
  });
});
