import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { extractCommand } from '../src/extract';
import { driftCommand } from '../src/drift';
import * as paths from '../src/lib/paths';
import { temporaryDirectory, removeTemporaryDirectory } from './fixtures';

const directories: string[] = [];
afterEach(() => { vi.restoreAllMocks(); directories.splice(0).forEach(removeTemporaryDirectory); });
function fixture() {
  const dir = temporaryDirectory();
  directories.push(dir);
  const project = paths.projectPaths(dir);
  vi.spyOn(paths, 'resolvePaths').mockReturnValue(project);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  fs.writeFileSync(project.collectionFile, JSON.stringify({ name: 'test', version: '1.0.0', bases: { web: 'https://example.invalid' }, changelog: [] }));
  fs.writeFileSync(project.glossaryFile, JSON.stringify({ domains: [] }));
  const input = path.join(dir, 'input.har');
  fs.writeFileSync(input, JSON.stringify({ log: { version: '1.2', entries: [{
    startedDateTime: '2026-01-01T00:00:00Z',
    time: 12.75,
    request: { httpVersion: 'HTTP/1.1', method: 'POST', url: 'https://example.invalid/x', postData: {
      mimeType: 'application/x-www-form-urlencoded', text: 'password=synthetic-secret&q=1&q=2',
    } },
    response: { httpVersion: 'h2', status: 200, content: { mimeType: 'application/json', text: '{ "code": 0, "data": { "count": 2 } }' } },
  }] } }));
  return { dir, project, input };
}
describe('CLI commands with isolated fixtures', () => {
  it('selects sorted direct source HARs from the collection when no inputs are provided', async () => {
    const { project, input } = fixture();
    fs.mkdirSync(project.sources);
    for (const name of ['z.HAR', 'a.har']) fs.copyFileSync(input, path.join(project.sources, name));
    fs.mkdirSync(path.join(project.sources, 'nested.har'));
    fs.writeFileSync(path.join(project.sources, 'ignore.txt'), 'not a capture');
    await extractCommand().parseAsync([], { from: 'user' });
    const report = JSON.parse(fs.readFileSync(path.join(project.reports, 'extract-a.json'), 'utf8'));
    expect(report).toMatchObject({ inputs: ['a.har', 'z.HAR'], frames: 2, duplicates: 1 });
  });

  it('reports malformed HAR entries at the input boundary', async () => {
    const { input } = fixture();
    fs.writeFileSync(input, JSON.stringify({ log: { version: '1.2', entries: [null] } }));
    await expect(extractCommand().parseAsync([input], { from: 'user' }))
      .rejects.toThrow('Invalid HAR: log.entries[0] must be an object');
  });
  it('fails an empty automatic batch before changing existing drafts', async () => {
    const { project, input } = fixture();
    await extractCommand().parseAsync([input], { from: 'user' });
    const before = fs.readFileSync(path.join(project.extract, 'POST.x.yaml'));
    await expect(extractCommand().parseAsync([], { from: 'user' })).rejects.toThrow('No HAR inputs');
    expect(fs.readFileSync(path.join(project.extract, 'POST.x.yaml'))).toEqual(before);
  });
  it('keeps cookies only in raw headers alongside repeated query pairs and explicit empty fields', async () => {
    const { project, input } = fixture();
    const har = JSON.parse(fs.readFileSync(input, 'utf8'));
    const entry = har.log.entries[0];
    entry.request.method = 'GET';
    entry.request.url = 'https://example.invalid/x?q=one&q=two&empty=&token=secret';
    delete entry.request.postData;
    entry.request.headers = [{ name: 'Cookie', value: 'theme=dark; session=secret; value=a=b' }];
    entry.response.headers = [
      { name: 'Set-Cookie', value: 'sid=secret; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; HttpOnly' },
      { name: 'Set-Cookie', value: 'sid=other; Path=/other; Secure' },
    ];
    fs.writeFileSync(input, JSON.stringify(har));
    await extractCommand().parseAsync([input], { from: 'user' });
    const frame = parse(fs.readFileSync(path.join(project.extract, 'GET.x.yaml'), 'utf8')).endpoints[0].frames[0];
    expect(frame.request.body).toBeNull();
    expect(frame.request).not.toHaveProperty('bodyMeta');
    expect(frame.request.headers.Cookie).toBe('theme=dark; session=<redacted:token>; value=a=b');
    expect(frame.request).not.toHaveProperty('cookies');
    expect(frame.request.query).toEqual([
      { name: 'q', value: 'one' }, { name: 'q', value: 'two' }, { name: 'empty', value: '' }, { name: 'token', value: '<redacted:token>' },
    ]);
    expect(frame.response.headers['Set-Cookie']).toHaveLength(2);
    expect(frame.response).not.toHaveProperty('cookies');
    expect(frame.response.headers['Set-Cookie']).toEqual([
      'sid=<redacted:token>; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; HttpOnly',
      'sid=<redacted:token>; Path=/other; Secure',
    ]);
    expect(JSON.stringify(frame)).not.toContain('secret');
  });
  it('extracts sanitized metadata and repeats safely without deleting user files', async () => {
    const { project, input } = fixture();
    await extractCommand().parseAsync([input], { from: 'user' });
    fs.writeFileSync(path.join(project.extract, 'notes.txt'), 'handwritten');
    await extractCommand().parseAsync([input], { from: 'user' });
    const output = fs.readFileSync(path.join(project.extract, 'POST.x.yaml'), 'utf8');
    expect(output).not.toContain('synthetic-secret');
    const frame = parse(output).endpoints[0].frames[0];
    expect(frame.request.body).toBe('password=%3Credacted%3Asecret%3E&q=1&q=2');
    expect(frame.request.bodyMeta.mimeType).toBe('application/x-www-form-urlencoded');
    expect(frame.request.headers).toEqual({});
    expect(frame.request).not.toHaveProperty('cookies');
    expect(frame.request.query).toEqual([]);
    expect(frame.response.headers).toEqual({});
    expect(frame.response).not.toHaveProperty('cookies');
    expect(frame.request.httpMeta).toEqual({ httpVersion: 'HTTP/1.1' });
    expect(frame.response.httpMeta).toEqual({ httpVersion: 'h2', entryTime: 12.75 });
    expect(frame.response.body).toBe('{ "code": 0, "data": { "count": 2 } }');
    expect(frame.code).toBe(0);
    expect(fs.readFileSync(path.join(project.extract, 'notes.txt'), 'utf8')).toBe('handwritten');
  });
  it('deduplicates timing-only differences and retains the earliest capture metadata', async () => {
    const { project, input } = fixture();
    const har = JSON.parse(fs.readFileSync(input, 'utf8'));
    const earlier = structuredClone(har.log.entries[0]);
    earlier.startedDateTime = '2025-12-31T23:59:59Z';
    earlier.time = 0;
    har.log.entries.push(earlier);
    fs.writeFileSync(input, JSON.stringify(har));
    await extractCommand().parseAsync([input], { from: 'user' });
    const frames = parse(fs.readFileSync(path.join(project.extract, 'POST.x.yaml'), 'utf8')).endpoints[0].frames;
    expect(frames).toHaveLength(1);
    expect(frames[0].captured).toBe(earlier.startedDateTime);
    expect(frames[0].response.httpMeta.entryTime).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(project.reports, 'extract-input.json'), 'utf8')).duplicates).toBe(1);
  });

  it.each([undefined, -1])('omits unavailable transport values (time: %s)', async (time) => {
    const { project, input } = fixture();
    const har = JSON.parse(fs.readFileSync(input, 'utf8'));
    const entry = har.log.entries[0];
    delete entry.request.httpVersion;
    entry.response.httpVersion = '';
    entry.time = time;
    fs.writeFileSync(input, JSON.stringify(har));
    await extractCommand().parseAsync([input], { from: 'user' });
    const frame = parse(fs.readFileSync(path.join(project.extract, 'POST.x.yaml'), 'utf8')).endpoints[0].frames[0];
    expect(frame.request.httpMeta).toEqual({});
    expect(frame.response.httpMeta).toEqual({});
  });
  it('reports no drift for a captured JSON response matching the BodyNode schema', async () => {
    const { project, input } = fixture();
    const apiDir = path.join(project.apis, 'x');
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'definition.json'), JSON.stringify({
      api: 'x.test', name: 'Test', endpoint: { method: 'POST', path: '/x' }, source: 'test',
      responses: [{ variant: 'ok', status: 'ok', codes: [0], http: [200], schema: {
        type: 'object', properties: { code: { type: 'number' }, data: { type: 'object', properties: { count: { type: 'number' } } } },
      } }],
    }));
    await driftCommand().parseAsync([input], { from: 'user' });
    expect(JSON.parse(fs.readFileSync(path.join(project.reports, 'drift-input.json'), 'utf8')).changes).toEqual([]);
  });

  it('uses capture origin when matching legacy definitions with the same path', async () => {
    const { project, input } = fixture();
    const makeDefinition = (api: string, exampleName: string) => ({
      api, name: api, endpoint: { method: 'POST', path: '/x' }, source: 'test',
      responses: [{ variant: 'ok', status: 'ok', codes: [0], http: [200], schema: null, examples: [exampleName] }],
    });
    const recording = (url: string) => ({
      http: 200, code: 0, captured: '2026-01-01T00:00:00Z', account: 'anonymous',
      request: { method: 'POST', url, body: null }, response: { status: 200, body: { code: 0 } },
    });
    for (const [name, origin] of [['first', 'https://host-a.invalid'], ['second', 'https://host-b.invalid']] as const) {
      const dir = path.join(project.apis, name);
      fs.mkdirSync(path.join(dir, 'examples'), { recursive: true });
      const file = '200.code0.ok.json';
      fs.writeFileSync(path.join(dir, 'definition.json'), JSON.stringify(makeDefinition(`${name}.test`, file)));
      fs.writeFileSync(path.join(dir, 'examples', file), JSON.stringify(recording(`${origin}/x`)));
    }
    const har = JSON.parse(fs.readFileSync(input, 'utf8'));
    har.log.entries[0].request.url = 'https://host-b.invalid/x';
    har.log.entries[0].response.content.text = '{"code":0}';
    fs.writeFileSync(input, JSON.stringify(har));
    await driftCommand().parseAsync([input], { from: 'user' });
    expect(JSON.parse(fs.readFileSync(path.join(project.reports, 'drift-input.json'), 'utf8')).changes).toEqual([]);
  });

  it.each([
    ['recorded HTTP-only pair', 404, null, false, []],
    ['unobserved Cartesian pair', 404, 1004, false, ['breaking']],
    ['ambiguous semantic variants', 200, 1004, true, ['noise']],
  ])('handles %s without guessing a variant', async (_label, status, code, ambiguous, kinds) => {
    const { project, input } = fixture();
    const dir = path.join(project.apis, 'x');
    fs.mkdirSync(path.join(dir, 'examples'), { recursive: true });
    const variants = [{ variant: 'not-found', status: 'Missing item', http: [200, 404], codes: [1004],
      schema: { type: 'object' }, examples: ['200.code1004.not-found.json', '404.http-only.not-found.json'] }];
    const recording = (http: number, businessCode: number | null) => ({
      http, code: businessCode, captured: '2026-01-01T00:00:00Z', account: 'anonymous',
      request: { method: 'POST', url: 'https://example.invalid/x', body: null },
      response: { status: http, body: businessCode === null ? { message: 'missing' } : { code: businessCode } },
    });
    fs.writeFileSync(path.join(dir, 'examples/200.code1004.not-found.json'), JSON.stringify(recording(200, 1004)));
    fs.writeFileSync(path.join(dir, 'examples/404.http-only.not-found.json'), JSON.stringify(recording(404, null)));
    if (ambiguous) {
      variants.push({ variant: 'other', status: 'Other meaning', http: [200], codes: [1004], schema: { type: 'string' }, examples: ['200.code1004.other.json'] });
      fs.writeFileSync(path.join(dir, 'examples/200.code1004.other.json'), JSON.stringify(recording(200, 1004)));
    }
    fs.writeFileSync(path.join(dir, 'definition.json'), JSON.stringify({ api: 'x.test', name: 'Test',
      endpoint: { method: 'POST', path: '/x' }, source: 'synthetic', responses: variants }));
    const har = JSON.parse(fs.readFileSync(input, 'utf8'));
    har.log.entries[0].response = { status, content: { mimeType: 'application/json', text: JSON.stringify(code === null ? { message: 'missing' } : { code }) } };
    fs.writeFileSync(input, JSON.stringify(har));
    await driftCommand().parseAsync([input], { from: 'user' });
    const report = JSON.parse(fs.readFileSync(path.join(project.reports, 'drift-input.json'), 'utf8'));
    expect(report.changes.map((change: { kind: string }) => change.kind)).toEqual(kinds);
    if (ambiguous) expect(report.changes[0].summary).toContain('Ambiguous');
  });
});
