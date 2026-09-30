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
  fs.writeFileSync(project.collectionFile, JSON.stringify({ name: 'test', version: '1', bases: { web: 'https://example.invalid' }, changelog: [] }));
  fs.writeFileSync(project.glossaryFile, JSON.stringify({ domains: [] }));
  const input = path.join(dir, 'input.har');
  fs.writeFileSync(input, JSON.stringify({ log: { version: '1.2', entries: [{
    startedDateTime: '2026-01-01T00:00:00Z',
    request: { method: 'POST', url: 'https://example.invalid/x', postData: {
      mimeType: 'application/x-www-form-urlencoded', text: 'password=synthetic-secret&q=1&q=2',
    } },
    response: { status: 200, content: { mimeType: 'application/json', text: '{ "code": 0, "data": { "count": 2 } }' } },
  }] } }));
  return { dir, project, input };
}
describe('CLI commands with isolated fixtures', () => {
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
    expect(frame.response.body).toBe('{ "code": 0, "data": { "count": 2 } }');
    expect(frame.code).toBe(0);
    expect(fs.readFileSync(path.join(project.extract, 'notes.txt'), 'utf8')).toBe('handwritten');
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
