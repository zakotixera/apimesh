import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateCommand } from '../src/validate';
import * as paths from '../src/lib/paths';
import { corpus, example, removeTemporaryDirectory, temporaryDirectory } from './fixtures';

const dirs: string[] = [];
const exitCode = process.exitCode;
afterEach(() => { vi.restoreAllMocks(); process.exitCode = exitCode; dirs.splice(0).forEach(removeTemporaryDirectory); });

describe('canonical request identity validation', () => {
  it.each([
    ['POST', 'https://example.invalid/x?item=1', []],
    ['GET', 'https://example.invalid/x', ['example-method-mismatch']],
    ['POST', 'https://example.invalid/wrong', ['example-url-mismatch']],
    ['POST', 'ftp://example.invalid/x', ['schema-example']],
    ['POST', 'invalid', ['schema-example']],
  ])('checks %s %s against its definition', async (method, url, errors) => {
    const root = temporaryDirectory(); dirs.push(root);
    const project = paths.projectPaths(root);
    const data = corpus([]);
    const def = data.apis[0].definition;
    def.endpoint.url = 'https://example.invalid/x';
    def.responses[0].schema = { type: 'object' };
    def.responses[0].examples = ['200.code0.ok.capture-1.json'];
    const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
    write(project.collectionFile, data.collection);
    write(project.glossaryFile, { domains: [{ slug: 'ok', meaning: 'Success' }] });
    write(path.join(project.apis, 'example.invalid/x/definition.json'), def);
    const ex = example();
    write(path.join(project.apis, 'example.invalid/x/examples/200.code0.ok.capture-1.json'), { ...ex, request: { ...ex.request, method, url } });
    vi.spyOn(paths, 'resolvePaths').mockReturnValue(project);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await validateCommand().parseAsync(['--strict'], { from: 'user' });
    const report = JSON.parse(fs.readFileSync(path.join(project.reports, 'validate.json'), 'utf8'));
    expect(report.issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining(errors));
    expect(report.ok).toBe(errors.length === 0);
    expect(process.exitCode).toBe(errors.length === 0 ? 0 : 1);
  });
});

describe('canonical structural and observation validation', () => {
  async function validate(change: (files: Record<string, any>) => void) {
    const root = temporaryDirectory(); dirs.push(root);
    const project = paths.projectPaths(root);
    const data = corpus([]);
    const def = data.apis[0].definition;
    def.endpoint.url = 'https://example.invalid/x';
    def.responses[0].schema = { type: 'object', properties: {
      code: { type: 'number' }, data: { type: ['string', 'null'] },
    } };
    def.responses[0].examples = ['200.code0.ok.json'];
    const files: Record<string, any> = {
      'collection.json': data.collection,
      'glossary.json': { domains: [{ slug: 'ok', meaning: 'Success' }] },
      'apis/example.invalid/x/definition.json': def,
      'apis/example.invalid/x/examples/200.code0.ok.json': example(),
    };
    change(files);
    for (const [name, value] of Object.entries(files)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value));
    }
    vi.spyOn(paths, 'resolvePaths').mockReturnValue(project);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await validateCommand().parseAsync(['--strict'], { from: 'user' });
    return JSON.parse(fs.readFileSync(path.join(project.reports, 'validate.json'), 'utf8'));
  }

  it('checks the declared endpoint origin as well as its path', async () => {
    const report = await validate((files) => {
      files['apis/example.invalid/x/definition.json'].endpoint.url = 'https://other.invalid/x';
    });
    expect(report.issues.map((issue: { code: string }) => issue.code)).toContain('example-endpoint-url-mismatch');
  });

  it('accepts identical endpoint paths on separate hosts', async () => {
    const report = await validate((files) => {
      const def = structuredClone(files['apis/example.invalid/x/definition.json']);
      def.api = 'other.test';
      def.endpoint.url = 'https://other.invalid/x';
      files['apis/other.invalid/x/definition.json'] = def;
      files['apis/other.invalid/x/examples/200.code0.ok.json'] = example({ url: def.endpoint.url });
    });
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('reports an unparseable host without aborting validation', async () => {
    const report = await validate((files) => {
      files['apis/example.invalid/x/definition.json'].endpoint.url = 'https://256.256.256.256/x';
    });
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'endpoint-url-invalid' }));
  });

  it('rejects a directory naming the wrong host', async () => {
    const report = await validate((files) => {
      for (const name of Object.keys(files).filter((name) => name.startsWith('apis/'))) {
        files[name.replace('example.invalid', 'wrong.invalid')] = files[name];
        delete files[name];
      }
    });
    expect(report.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'path-mismatch' }));
  });

  it('reports a migration warning for legacy endpoint directories', async () => {
    const report = await validate((files) => {
      for (const name of Object.keys(files).filter((name) => name.startsWith('apis/'))) {
        files[name.replace('example.invalid/', '')] = files[name];
        delete files[name];
      }
    });
    expect(report.errors).toBe(0);
    expect(report.issues).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'legacy-api-directory',
      message: expect.stringContaining('apis/example.invalid/x/') }));
  });

  it('compares repeated response header values structurally', async () => {
    const report = await validate((files) => {
      files['apis/example.invalid/x/definition.json'].responses[0].headers = { 'set-cookie': ['a=1', 'b=2'] };
      files['apis/example.invalid/x/examples/200.code0.ok.json'].response.headers = { 'Set-Cookie': ['a=1', 'b=2'] };
    });
    expect(report.ok).toBe(true);
  });

  it.each([null, false, 0, '', [], { responses: [null] }, { request: { query: { q: null } } }])(
    'reports malformed definitions without throwing: %j', async (value) => {
      const report = await validate((files) => {
        files['apis/example.invalid/x/definition.json'] = value && !Array.isArray(value) && typeof value === 'object'
          ? { ...files['apis/example.invalid/x/definition.json'], ...value } : value;
      });
      expect(report.ok).toBe(false);
      expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'schema-definition' })]));
    },
  );

  it('reports invalid documents independently even when their owning definition is invalid', async () => {
    const report = await validate((files) => {
      for (const name of Object.keys(files)) files[name] = null;
    });
    expect(report.issues.map((issue: { code: string }) => issue.code).sort()).toEqual([
      'schema-collection', 'schema-definition', 'schema-example', 'schema-glossary',
    ]);
  });

  it('rejects duplicate semantic slugs even with disjoint observations', async () => {
    const report = await validate((files) => {
      files['apis/example.invalid/x/definition.json'].responses.push({ variant: 'ok', status: 'Another observation',
        codes: [], http: [204], schema: null, examples: [] });
    });
    expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'variant-slug-duplicate' })]));
  });

  it.each([false, true])('rejects a contradictory response type (JSON text: %s)', async (text) => {
    const report = await validate((files) => {
      const response = files['apis/example.invalid/x/examples/200.code0.ok.json'].response;
      response.body.data = 123;
      if (text) {
        response.body = JSON.stringify(response.body);
        response.bodyMeta = { representation: 'text', source: 'text', mimeType: 'application/json' };
      }
    });
    expect(report.issues).toEqual([expect.objectContaining({ code: 'example-body-type', path: 'response.body["data"]' })]);
  });

  it('checks nested array elements', async () => {
    const report = await validate((files) => {
      files['apis/example.invalid/x/definition.json'].responses[0].schema.properties.data = {
        type: 'array', items: { type: 'object', properties: { id: { type: 'number' } } },
      };
      files['apis/example.invalid/x/examples/200.code0.ok.json'].response.body.data = [{ id: 1 }, { id: 'wrong' }];
    });
    expect(report.issues).toEqual([expect.objectContaining({ code: 'example-body-type', path: 'response.body["data"][]["id"]' })]);
  });

  it.each([{ code: 0 }, { code: 0, data: null }, { code: 0, data: 'value', extra: 1 }])(
    'allows absent fields, declared unions, and additional observed fields: %j', async (body) => {
      const report = await validate((files) => { files['apis/example.invalid/x/examples/200.code0.ok.json'].response.body = body; });
      expect(report.ok).toBe(true);
    },
  );
});
